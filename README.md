# Qup Terminal — backend (auth + DB)

Multi-user terminal backend. REST auth + MongoDB + JWT-authenticated
PTY-over-WebSocket. **Sandbox and SSH-out are the next steps** — until the
sandbox lands the shell runs as the server's own user, so keep this on
localhost / a trusted network.

## Setup

```bash
npm install                 # postinstall fixes node-pty's spawn-helper perms
cp .env.example .env        # then fill in the values
```

Fill `.env`:
- `MONGODB_URI` — local Mongo or Atlas
- `JWT_SECRET` — `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`
- `APP_ENCRYPTION_KEY` — `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
- `SHELL_BIN` — `/bin/zsh` on macOS

Run (Node 20+ can load the env file directly):

```bash
node --env-file=.env src/server.js
```

You need MongoDB running. Quick local option: `brew install mongodb-community`
and `brew services start mongodb-community`, or use a free Atlas cluster.

## REST API

| Method | Path             | Body                   | Returns                               |
|--------|------------------|------------------------|---------------------------------------|
| POST   | `/auth/register` | `{ email, password }`  | `{ accessToken, refreshToken, user }` |
| POST   | `/auth/login`    | `{ email, password }`  | `{ accessToken, refreshToken, user }` |
| POST   | `/auth/refresh`  | `{ refreshToken }`     | `{ accessToken, refreshToken }`       |
| GET    | `/auth/me`       | (Bearer access token)  | `{ user }`                            |
| GET    | `/health`        | —                      | `{ ok: true }`                        |

## Terminal socket

```
ws://HOST:3000/term?token=<accessToken>
```

The token is verified at the upgrade; no token or a bad/expired one means 401
and no shell. Each connection records a Session (metadata only, never the
transcript).

## Quick manual test

```bash
curl -s localhost:3000/auth/register -H 'content-type: application/json' \
  -d '{"email":"me@example.com","password":"hunter2hunter2"}'
```

## What's next

- Docker-per-session sandbox (required before public exposure)
- SSH-out: /hosts CRUD (encrypted creds) + an ssh session kind via ssh2
- Rate limiting + concurrent-session caps

## Files added this step

```
src/lib/db.js            Mongoose connection
src/lib/tokens.js        JWT sign/verify (access + refresh)
src/lib/crypto.js        AES-256-GCM for secrets at rest
src/middleware/auth.js   requireAuth (Bearer)
src/routes/auth.js       register/login/refresh/me
src/models/User.js       accounts
src/models/Host.js       saved SSH targets (encrypted creds) — used next step
src/models/Session.js    session metadata
```
