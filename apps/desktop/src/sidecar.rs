//! The Node sidecar process and its stdio.
//!
//! Which script runs: `$DEEPBOT_AGENT` if set, else `packages/agent/src/main.ts`
//! of this checkout (development). `$DEEPBOT_NODE` overrides the `node` binary.
//! Installed launchers can set `$DEEPBOT_AGENT_CWD` to run outside the checkout.

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

fn script() -> PathBuf {
    std::env::var_os("DEEPBOT_AGENT").map(PathBuf::from).unwrap_or_else(|| {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../packages/agent/src/main.ts")
    })
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

    let script = script();
    let node = std::env::var("DEEPBOT_NODE").unwrap_or_else(|_| "node".to_owned());
    let cwd = std::env::var_os("DEEPBOT_AGENT_CWD")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../.."));
    let mut child = Command::new(&node)
        .arg(&script)
        .current_dir(cwd)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
        .map_err(|e| format!("could not start `{node} {}`: {e}", script.display()))?;

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
