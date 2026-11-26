//! The Node sidecar process and its stdio.
//!
//! Installed apps resolve the Agent and Node relative to their executable.
//! The development fallback uses the checkout and Node from PATH.

use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::thread;

struct Sidecar {
    child: Child,
    stdin: ChildStdin,
    reader: thread::JoinHandle<()>,
}

static SIDECAR: Mutex<Option<Sidecar>> = Mutex::new(None);
static LINES: OnceLock<(async_channel::Sender<String>, async_channel::Receiver<String>)> = OnceLock::new();

fn lines() -> &'static (async_channel::Sender<String>, async_channel::Receiver<String>) {
    LINES.get_or_init(async_channel::unbounded)
}

fn installed_runtime() -> Option<(PathBuf, PathBuf)> {
    let exe = std::env::current_exe().ok()?;
    let bin = exe.parent()?;
    let resources = if cfg!(target_os = "macos") {
        bin.parent()?.join("Resources")
    } else {
        bin.to_path_buf()
    };
    let runtime = resources.join("deepbot-runtime");
    if !runtime.is_dir() {
        return None;
    }
    let node = if cfg!(target_os = "macos") {
        bin.join("node")
    } else {
        runtime.join(if cfg!(windows) { "node.exe" } else { "node" })
    };
    Some((runtime.join("agent"), node))
}

pub fn start() -> Result<(), String> {
    let mut guard = SIDECAR.lock().map_err(|e| e.to_string())?;
    if let Some(sidecar) = guard.as_mut()
        && sidecar.child.try_wait().map_err(|e| e.to_string())?.is_none()
    {
        return Ok(());
    }
    if let Some(previous) = guard.take() {
        // Finish the old EOF notification before a new connection can publish ready.
        let _ = previous.reader.join();
        while lines().1.try_recv().is_ok() {}
    }

    let (agent, default_node, default_cwd) = if let Some((agent, node)) = installed_runtime() {
        (agent.clone(), node, agent)
    } else {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
        (root.join("packages/agent"), PathBuf::from("node"), root)
    };
    let setting = |key, default| std::env::var_os(key).map(PathBuf::from).unwrap_or(default);
    let script = setting("DEEPBOT_AGENT", agent.join("src/main.ts"));
    let node = setting("DEEPBOT_NODE", default_node);
    let cwd = setting("DEEPBOT_AGENT_CWD", default_cwd);
    let mut command = Command::new(&node);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    let mut child = command
        .arg(&script)
        .current_dir(cwd)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
        .map_err(|e| format!("could not start `{} {}`: {e}", node.display(), script.display()))?;

    let stdin = child.stdin.take().ok_or("sidecar has no stdin")?;
    let stdout = child.stdout.take().ok_or("sidecar has no stdout")?;
    let sender = lines().0.clone();
    let reader = thread::Builder::new()
        .name("deepbot-agent-stdout".into())
        .spawn(move || {
            for line in BufReader::new(stdout).lines() {
                let Ok(line) = line else { break };
                if sender.send_blocking(line).is_err() {
                    break;
                }
            }
            // A channel sender is retained globally, so EOF must be an explicit protocol event.
            // Without this the UI's next() hangs forever after a sidecar crash.
            let _ = sender.send_blocking(
                "{\"type\":\"fatal\",\"seq\":0,\"message\":\"后台进程已退出，请重新连接\"}".into(),
            );
        })
        .map_err(|e| e.to_string())?;

    *guard = Some(Sidecar { child, stdin, reader });
    Ok(())
}

pub fn send(line: &str) -> Result<(), String> {
    let mut guard = SIDECAR.lock().map_err(|e| e.to_string())?;
    let sidecar = guard.as_mut().ok_or("agent not started")?;
    writeln!(sidecar.stdin, "{line}")
        .and_then(|()| sidecar.stdin.flush())
        .map_err(|e| format!("agent stdin: {e}"))
}

pub async fn next() -> Option<String> {
    lines().1.recv().await.ok()
}
