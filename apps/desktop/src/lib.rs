//! DeepBot desktop: what `App.tsx` imports from `deepbot/native`. Their
//! TypeScript declarations are generated from these types into
//! `.nsh/types/deepbot/native.d.ts`.
//!
//! The agent itself (Pi Durable) runs in a Node sidecar, `packages/agent`,
//! because NSH's TSX runs on QuickJS, not Node. [`Agent`] spawns it and passes
//! JSON lines both ways; `App.tsx` parses them (see `packages/agent/src/protocol.ts`).

mod sidecar;

use nsh_core::prelude::*;

/// The crate's UI set (`nsh.json` `"rust"`).
#[native_module("deepbot/native")]
fn native(registry: &mut Registry) {
    registry.module::<Agent>();
}

/// The agent sidecar: a Node process running Pi Durable, spoken to in JSON lines.
#[module]
pub struct Agent;

#[module]
impl Agent {
    /// Starts the sidecar if it is not running. Errors with why it could not start.
    pub fn start() -> Result<(), String> {
        sidecar::start()
    }

    /// Sends one JSON line (a `HostMessage`) to the sidecar.
    pub fn send(line: String) -> Result<(), String> {
        sidecar::send(&line)
    }

    /// The next JSON line (an `AgentMessage`) from the sidecar; null once it has exited.
    pub async fn next() -> Option<String> {
        sidecar::next().await
    }
}
