// src/lib/ssh.js
// Opens an SSH connection to a user's own server via ssh2 and starts an
// interactive shell. Exposes a small PTY-like wrapper (write/resize/kill/onData/
// onExit) so server.js can treat it the same way it treats a sandbox PTY.
//
// SSH runs HERE on the backend — never on the phone. The phone only speaks
// WebSocket; this module bridges that to a real SSH shell.

import { Client } from "ssh2";

// Connect + open a shell. Returns a promise resolving to a session wrapper.
// opts: { host, port, username, authType, secret, cols, rows }
//   authType "password" → secret is the password
//   authType "key"      → secret is the private key (PEM)
export function openSshSession(opts) {
  const {
    host,
    port = 22,
    username,
    authType,
    secret,
    cols = 80,
    rows = 24,
  } = opts;

  return new Promise((resolve, reject) => {
    const conn = new Client();
    let settled = false;

    const connectConfig = {
      host,
      port,
      username,
      readyTimeout: 15000,
      keepaliveInterval: 20000,
      // For a real product you'd verify host keys (hostVerifier). For now we
      // accept on first use; document this clearly to users.
    };
    if (authType === "key") connectConfig.privateKey = secret;
    else connectConfig.password = secret;

    conn.on("ready", () => {
      conn.shell({ term: "xterm-color", cols, rows }, (err, stream) => {
        if (err) {
          if (!settled) {
            settled = true;
            conn.end();
            reject(err);
          }
          return;
        }

        const dataCbs = [];
        const exitCbs = [];

        stream.on("data", (d) => {
          const s = d.toString("utf8");
          dataCbs.forEach((cb) => cb(s));
        });
        stream.stderr.on("data", (d) => {
          const s = d.toString("utf8");
          dataCbs.forEach((cb) => cb(s));
        });
        stream.on("close", () => {
          exitCbs.forEach((cb) => cb({ exitCode: 0 }));
          conn.end();
        });

        const wrapper = {
          write: (data) => {
            try {
              stream.write(data);
            } catch {
              /* stream closed */
            }
          },
          resize: (c, r) => {
            try {
              stream.setWindow(r, c, 0, 0);
            } catch {
              /* ignore */
            }
          },
          kill: () => {
            try {
              stream.end();
            } catch {
              /* ignore */
            }
            try {
              conn.end();
            } catch {
              /* ignore */
            }
          },
          onData: (cb) => dataCbs.push(cb),
          onExit: (cb) => exitCbs.push(cb),
        };

        if (!settled) {
          settled = true;
          resolve(wrapper);
        }
      });
    });

    conn.on("error", (err) => {
      if (!settled) {
        settled = true;
        reject(err);
      }
    });
  });
}
