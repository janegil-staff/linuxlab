// src/lib/sandbox.js
// Disposable practice sandbox backed by E2B (https://e2b.dev) instead of a
// local Docker container. Each session gets its own Firecracker microVM with a
// real bash PTY; it's destroyed when the session ends. This replaces the old
// `docker run` approach so the backend runs as a normal stateless service on
// App Platform (no Docker daemon, no privileged containers).
//
// spawnSandbox() returns the SAME wrapper shape as lib/ssh.js
// ({ write, resize, kill, onData, onExit }) plus { name }, so server.js treats
// an E2B sandbox exactly like an SSH session — one code path for both.
//
// Requires env: E2B_API_KEY. Optional: SANDBOX_TEMPLATE (a custom E2B template
// id with your lesson tooling preinstalled; defaults to E2B's base image).

import dotenv from "dotenv";
dotenv.config();
import { Sandbox } from "e2b";
import crypto from "node:crypto";

const TEMPLATE = process.env.SANDBOX_TEMPLATE || undefined; // undefined = base
// Hard wall-clock cap per session (ms). Mirrors the old export so server.js can
// keep importing SESSION_TIMEOUT_MS from here unchanged.
export const SESSION_TIMEOUT_MS = Number(
  process.env.SANDBOX_TIMEOUT_MS || 60 * 60 * 1000, // 1 hour
);
// E2B sandbox lifetime (ms). The sandbox VM is auto-killed after this even if
// our process dies, so orphaned sandboxes can't run forever and rack up cost.
const SANDBOX_LIFETIME_MS = Number(
  process.env.SANDBOX_LIFETIME_MS || SESSION_TIMEOUT_MS,
);

export function makeContainerName() {
  return `qupterm_${crypto.randomBytes(6).toString("hex")}`;
}

// Spawn an E2B sandbox + interactive bash PTY. Returns a Promise resolving to
// { shell, name } where `shell` is the PTY wrapper. ASYNC (unlike the old
// docker spawn) because creating the VM is a network call — server.js already
// awaits openSshSession the same way, so this fits the existing flow.
export async function spawnSandbox({ cols = 80, rows = 24 } = {}) {
  const name = makeContainerName();

  // Create the microVM. Keep it alive long enough for a full session.
  const sandbox = await Sandbox.create(TEMPLATE, {
    timeoutMs: SANDBOX_LIFETIME_MS,
  });

  const dataCbs = [];
  const exitCbs = [];
  let exited = false;

  // Start the interactive PTY. onData streams raw bytes (Uint8Array) → fan out
  // to our listeners as-is (server.js forwards bytes straight to the WS).
  const pty = await sandbox.pty.create({
    cols,
    rows,
    timeoutMs: 0, // keep the PTY open indefinitely; we enforce our own timeout
    onData: (data) => {
      for (const cb of dataCbs) cb(data);
    },
  });
  const pid = pty.pid;

  // When the PTY process finishes, notify exit listeners and tear down the VM.
  // pty handles expose wait() (resolves when the PTY exits).
  pty
    .wait()
    .then(() => fireExit(0))
    .catch(() => fireExit(1));

  function fireExit(code) {
    if (exited) return;
    exited = true;
    for (const cb of exitCbs) cb({ exitCode: code });
    // Best-effort: kill the whole sandbox VM so nothing lingers/bills.
    sandbox.kill().catch(() => {});
  }

  const shell = {
    write: (data) => {
      // data may be a string (text frame) or Buffer (binary frame); E2B wants
      // a Uint8Array.
      try {
        const bytes =
          typeof data === "string"
            ? new TextEncoder().encode(data)
            : new Uint8Array(data);
        sandbox.pty.sendInput(pid, bytes).catch(() => {});
      } catch {
        /* sandbox gone */
      }
    },
    resize: (c, r) => {
      try {
        sandbox.pty.resize(pid, { cols: c, rows: r }).catch(() => {});
      } catch {
        /* ignore */
      }
    },
    kill: () => {
      try {
        sandbox.pty.kill(pid).catch(() => {});
      } catch {
        /* ignore */
      }
      // Also destroy the VM (don't wait).
      sandbox.kill().catch(() => {});
      fireExit(0);
    },
    onData: (cb) => dataCbs.push(cb),
    onExit: (cb) => exitCbs.push(cb),
    // Expose the underlying sandbox id for logging/cleanup if needed.
    _sandboxId: sandbox.sandboxId,
  };

  return { shell, name };
}

// Best-effort kill of a sandbox by its E2B id (used on timeout/cleanup).
// Kept for API-compatibility with the old killContainer(name); now takes the
// sandbox id stored on the session. Safe no-op if id is missing/already gone.
export async function killContainer(sandboxId) {
  if (!sandboxId) return;
  try {
    await Sandbox.kill(sandboxId);
  } catch {
    /* already gone */
  }
}
