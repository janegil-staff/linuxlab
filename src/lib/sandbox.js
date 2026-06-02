// src/lib/sandbox.js
// Builds the locked-down `docker run` invocation for a session and spawns it as
// a PTY. The security posture (even with network enabled): unprivileged,
// non-root, capped CPU/memory/PIDs, read-only root FS with a small writable
// home+tmp, no privilege escalation, and --rm so the container is destroyed on
// exit. A compromised session is bounded to its own throwaway container.

import pty from "node-pty";
import crypto from "node:crypto";

const IMAGE = process.env.SANDBOX_IMAGE || "qup-terminal-sandbox:latest";
const MEMORY = process.env.SANDBOX_MEMORY || "512m";
const CPUS = process.env.SANDBOX_CPUS || "1";
const PIDS = process.env.SANDBOX_PIDS || "256";
const TMPFS_SIZE = process.env.SANDBOX_TMPFS || "64m";
const HOME_SIZE = process.env.SANDBOX_HOME_SIZE || "256m";
// "none" = no network; "bridge" = default network (internet). Set via env.
const NETWORK = process.env.SANDBOX_NETWORK || "bridge";
// Hard wall-clock cap per session (ms). 0 disables.
export const SESSION_TIMEOUT_MS = Number(
  process.env.SANDBOX_TIMEOUT_MS || 60 * 60 * 1000 // 1 hour
);

export function makeContainerName() {
  return `qupterm_${crypto.randomBytes(6).toString("hex")}`;
}

// Build the docker run argument list. Kept as an array (no shell parsing).
export function buildDockerArgs({ name, cols, rows }) {
  const args = [
    "run",
    "-i",
    "--rm",
    "--name",
    name,
    // Interactive TTY sized to the client.
    "--tty",
    // Isolation / hardening:
    "--network",
    NETWORK,
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges",
    "--read-only", // root FS read-only…
    // …but give writable, size-limited tmpfs for the places that need it:
    "--tmpfs",
    `/tmp:rw,size=${TMPFS_SIZE},mode=1777`,
    "--tmpfs",
    `/home/sandbox:rw,size=${HOME_SIZE},mode=0755,uid=1000,gid=1000`,
    // Resource caps:
    "--memory",
    MEMORY,
    "--memory-swap",
    MEMORY, // disallow swap beyond memory
    "--cpus",
    CPUS,
    "--pids-limit",
    PIDS,
    // Initial terminal size via env (xterm honours these on start).
    "--env",
    `COLUMNS=${cols || 80}`,
    "--env",
    `LINES=${rows || 24}`,
    IMAGE,
    "/bin/bash",
  ];
  return args;
}

// Spawn a sandbox PTY. Returns { shell, name }. Throws if docker isn't usable.
export function spawnSandbox({ cols = 80, rows = 24 } = {}) {
  const name = makeContainerName();
  const args = buildDockerArgs({ name, cols, rows });
  const shell = pty.spawn("docker", args, {
    name: "xterm-color",
    cols,
    rows,
    cwd: process.env.HOME || process.cwd(),
    env: process.env,
  });
  return { shell, name };
}

// Best-effort hard kill of a container by name (used on timeout/cleanup).
export function killContainer(name) {
  if (!name) return;
  try {
    const k = pty.spawn("docker", ["kill", name], { cols: 80, rows: 24 });
    // Let it run and exit on its own; we don't need the output.
    setTimeout(() => {
      try {
        k.kill();
      } catch {
        /* ignore */
      }
    }, 5000);
  } catch {
    /* docker gone or already removed */
  }
}
