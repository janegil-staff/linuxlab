# Sandbox (Docker per session)

Each terminal session now runs inside its own disposable, locked-down Docker
container instead of a shell on the host. This is the security gate that makes
the backend safe to expose.

## One-time: build the image

```bash
docker build -t qup-terminal-sandbox:latest ./sandbox
```

(First build pulls Debian + installs python/node/build tools, so it takes a few
minutes. Rebuild only when you change sandbox/Dockerfile.)

Requires Docker installed and the daemon running. Check:
```bash
docker --version && docker ps
```

## How isolation works

Every session container runs with:

- `--rm` — destroyed the moment the session ends (disposable)
- `--cap-drop=ALL` — no Linux capabilities
- `--security-opt=no-new-privileges` — no privilege escalation
- `--read-only` root filesystem — image can't be tampered with…
- …with size-limited writable `tmpfs` for `/tmp` and `/home/sandbox` only
- `--memory` / `--memory-swap` / `--cpus` / `--pids-limit` — resource caps
- runs as the non-root `sandbox` user
- a hard per-session wall-clock timeout (kills runaway containers)

Network is **on** (`SANDBOX_NETWORK=bridge`) so users can `apt`/`pip`/`npm`
install. Even so, a compromised session is bounded to its own throwaway,
unprivileged container — it can't touch the host or other sessions. Set
`SANDBOX_NETWORK=none` to remove internet access entirely.

## Tuning

All limits are env vars (see `.env.example`): `SANDBOX_MEMORY`, `SANDBOX_CPUS`,
`SANDBOX_PIDS`, `SANDBOX_TMPFS`, `SANDBOX_HOME_SIZE`, `SANDBOX_NETWORK`,
`SANDBOX_TIMEOUT_MS`.

## Verifying it works

Start the backend, open a session from the app, then:
```bash
whoami        # → sandbox  (not root, not your host user)
hostname      # → a random container id
ls /          # root is read-only; try `touch /test` → permission denied
touch ~/ok    # home is writable
```
From another terminal on the host you can watch containers come and go:
```bash
watch docker ps
```

## Notes / next

- macOS: Docker Desktop must be running. On a Linux droplet, install Docker
  Engine; the same flags apply.
- The `docker run` is spawned via node-pty, so the same Node-version / spawn
  caveats apply to the host node process.
- Next step: SSH-out (an `ssh` session kind that proxies to the user's own
  servers via ssh2, using the encrypted Host credentials).
