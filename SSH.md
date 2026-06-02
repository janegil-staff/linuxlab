# SSH-out (connect to your own servers)

Besides the disposable sandbox, a session can be an **SSH connection to the
user's own server**. SSH runs here on the backend (ssh2) — never on the phone.
The phone still only speaks WebSocket.

## How it works

1. User saves a host via `POST /hosts` (label, host, port, username, authType,
   secret). The secret (password or private key) is encrypted at rest with
   AES-256-GCM and never returned by the API.
2. To start an SSH session, the app opens
   `ws://HOST:3000/term?token=<jwt>&hostId=<id>`.
3. The backend looks up the host (scoped to that user), decrypts the secret,
   opens an ssh2 shell, and pipes it to the WebSocket exactly like a sandbox
   session.

No `hostId` → sandbox session (Docker). With `hostId` → SSH session.

## Hosts API (all require Bearer auth)

| Method | Path          | Body                                                   |
|--------|---------------|--------------------------------------------------------|
| GET    | `/hosts`      | —                                                      |
| POST   | `/hosts`      | `{ label, host, port?, username, authType, secret }`   |
| DELETE | `/hosts/:id`  | —                                                      |

`authType` is `"password"` or `"key"` (secret = the PEM private key).

## Security notes

- Credentials encrypted at rest (verified: plaintext never in the stored blob,
  never in API responses).
- **Host-key verification is not yet enforced** (accept-on-first-use). For a
  real product, add an ssh2 `hostVerifier` and pin known host keys. Documented
  as a known gap.
- Always run the backend behind TLS in production so the secret is encrypted
  in transit when first saved.
