#[cfg(target_os = "linux")]
use std::process::{Command, Stdio};
#[cfg(target_os = "linux")]
use std::time::{Duration, Instant};

pub async fn open_thread(uri: String) -> Result<bool, String> {
    let valid = uri.len() <= 16 * 1024
        && uri
            .strip_prefix("t3code://threads/")
            .and_then(|path| path.split_once('/'))
            .is_some_and(|(environment, thread)| {
                valid_segment(environment) && valid_segment(thread)
            });
    if !valid {
        return Err("Invalid T3 Code thread link".into());
    }
    let (sender, result) = async_channel::bounded(1);
    std::thread::Builder::new()
        .name("deepbot-t3-link".into())
        .spawn(move || {
            let _ = sender.send_blocking(dispatch(&uri));
        })
        .map_err(|error| error.to_string())?;
    result.recv().await.map_err(|error| error.to_string())?
}

fn valid_segment(segment: &str) -> bool {
    !segment.is_empty()
        && segment != "."
        && segment != ".."
        && segment
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"-._~!()*'%".contains(&byte))
}

#[cfg(target_os = "linux")]
fn dispatch(uri: &str) -> Result<bool, String> {
    // GtkUriLauncher can show an application picker for a registered custom scheme.
    let mut launcher = Command::new("gio")
        .args(["open", uri])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| error.to_string())?;
    let deadline = Instant::now() + Duration::from_secs(5);
    loop {
        if let Some(status) = launcher.try_wait().map_err(|error| error.to_string())? {
            return Ok(status.success());
        }
        if Instant::now() >= deadline {
            let _ = launcher.kill();
            let _ = launcher.wait();
            return Err("The desktop launcher did not respond".into());
        }
        std::thread::sleep(Duration::from_millis(25));
    }
}

#[cfg(not(target_os = "linux"))]
fn dispatch(_uri: &str) -> Result<bool, String> {
    Ok(false)
}
