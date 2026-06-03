// src/server.js
// Qup Terminal backend — auth + DB + PTY-over-WebSocket.
//
//   - REST: /auth (register/login/refresh/me)
//   - WS /term?token=<accessJWT> : authenticated terminal session
//   - spawns a shell (PTY) per connection and pipes it both ways
//
// Still TODO before public exposure (next steps):
//   - Docker-per-session sandbox (currently the shell runs as THIS process user)
//   - SSH-out to user hosts
//   - rate limiting / concurrent-session caps
//
// ⚠️  Until the sandbox lands, keep this on localhost / trusted networks.

import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";
import { WebSocketServer } from "ws";

import { connectDb } from "./lib/db.js";
import { verifyToken } from "./lib/tokens.js";
import authRoutes from "./routes/auth.js";
import hostsRoutes from "./routes/hosts.js";
import adminRoutes from "./routes/admin.js";
import lessonsRoutes from "./routes/lessons.js";
import legalRoutes from "./routes/legal.js";
import { Session } from "./models/Session.js";
import { Host } from "./models/Host.js";
import { User } from "./models/User.js";
import { decrypt } from "./lib/crypto.js";
import { openSshSession } from "./lib/ssh.js";
import { authLimiter, apiLimiter } from "./middleware/rateLimit.js";
import {
  spawnSandbox,
  killContainer,
  SESSION_TIMEOUT_MS,
} from "./lib/sandbox.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "127.0.0.1";
// Max concurrent terminal sessions per user (resource-exhaustion guard).
const MAX_SESSIONS_PER_USER = Number(process.env.MAX_SESSIONS_PER_USER || 5);


// ── Message protocol ─────────────────────────────────────────────────────────
// client → server: JSON control { type:"resize"|"ping" } else raw keystrokes
// server → client: raw bytes are output; JSON for { type:"exit"|"error"|"pong" }

const app = express();
// Behind a reverse proxy (Caddy/nginx) in production, so per-IP rate limiting
// uses the real client IP from X-Forwarded-For.
app.set("trust proxy", 1);
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/health", (req, res) => res.json({ ok: true }));
app.use("/", legalRoutes);
app.use("/auth", authLimiter, authRoutes);
app.use("/hosts", apiLimiter, hostsRoutes);
app.use("/admin", apiLimiter, adminRoutes);
app.use("/lessons", apiLimiter, lessonsRoutes);

const server = http.createServer(app);

// WS only on /term, and only with a valid access token (?token=…).
const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname !== "/term") {
    socket.destroy();
    return;
  }
  const token = url.searchParams.get("token");
  if (!token) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }
  let payload;
  try {
    payload = verifyToken(token);
    if (payload.kind !== "access") throw new Error("wrong kind");
  } catch {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }
  // Authenticated — carry the user id (and optional hostId) into the connection.
  req.userId = payload.sub;
  req.hostId = url.searchParams.get("hostId") || null;
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
});

wss.on("connection", async (ws, req) => {
  const userId = req.userId;
  const hostId = req.hostId;
  const isSsh = !!hostId;
  console.log(
    `[+] ${isSsh ? "ssh" : "sandbox"} session opened (user ${userId})`
  );

  // Reject banned users immediately (their token may still be valid).
  try {
    const u = await User.findById(userId).select("banned");
    if (u && u.banned) {
      ws.send(
        JSON.stringify({ type: "error", message: "Account suspended." })
      );
      ws.close();
      return;
    }
  } catch {
    /* if the check fails, fall through to the session-cap guard */
  }

  // Concurrent-session cap: refuse if the user already has the max active.
  try {
    const active = await Session.countDocuments({ userId, status: "active" });
    if (active >= MAX_SESSIONS_PER_USER) {
      ws.send(
        JSON.stringify({
          type: "error",
          message: `Session limit reached (${MAX_SESSIONS_PER_USER}). Close another session first.`,
        })
      );
      ws.close();
      return;
    }
  } catch (e) {
    console.error("session count failed:", e.message);
    // Fail closed on the cap check — safer to refuse than to allow unbounded.
    ws.send(
      JSON.stringify({ type: "error", message: "Could not start session." })
    );
    ws.close();
    return;
  }

  // Record a Session row (metadata only — never the transcript).
  let sessionDoc = null;
  try {
    sessionDoc = await Session.create({
      userId,
      kind: isSsh ? "ssh" : "sandbox",
      hostId: isSsh ? hostId : undefined,
      status: "active",
      cols: 80,
      rows: 24,
    });
  } catch (e) {
    console.error("session record failed:", e.message);
  }

  let shell;
  let containerName = null;

  if (isSsh) {
    // ── SSH to the user's own server ───────────────────────────────────────
    try {
      const host = await Host.findOne({ _id: hostId, userId });
      if (!host) throw new Error("host not found");
      const secret = decrypt(host.secretEnc);
      shell = await openSshSession({
        host: host.host,
        port: host.port,
        username: host.username,
        authType: host.authType,
        secret,
        cols: 80,
        rows: 24,
        knownHostKey: host.knownHostKey || null,
        onHostKey: (fp) => {
          // First connection to this host: pin the fingerprint.
          if (!host.knownHostKey) {
            host.knownHostKey = fp;
            host.save().catch(() => {});
          }
        },
      });
      host.lastUsedAt = new Date();
      host.save().catch(() => {});
      console.log(`[+] ssh → ${host.username}@${host.host}:${host.port}`);
    } catch (err) {
      console.error("ssh connect failed:", err.message);
      if (ws.readyState === ws.OPEN) {
        ws.send(
          JSON.stringify({
            type: "error",
            message: `SSH connection failed: ${err.message}`,
          })
        );
        ws.close();
      }
      return;
    }
  } else {
    // ── Disposable, locked-down Docker container ───────────────────────────
    try {
      const res = spawnSandbox({ cols: 80, rows: 24 });
      shell = res.shell;
      containerName = res.name;
      if (sessionDoc) {
        sessionDoc.containerId = containerName;
        sessionDoc.save().catch(() => {});
      }
      console.log(`[+] sandbox container ${containerName} (user ${userId})`);
    } catch (err) {
      console.error("sandbox spawn failed:", err.message);
      if (ws.readyState === ws.OPEN) {
        ws.send(
          JSON.stringify({
            type: "error",
            message: `Failed to start session: ${err.message}`,
          })
        );
        ws.close();
      }
      return;
    }
  }

  // Hard wall-clock timeout for both kinds.
  let timeoutHandle = null;
  if (SESSION_TIMEOUT_MS > 0) {
    timeoutHandle = setTimeout(() => {
      console.log(`[!] session timeout (user ${userId})`);
      if (ws.readyState === ws.OPEN) {
        ws.send(
          JSON.stringify({
            type: "error",
            message: "Session timed out and was closed.",
          })
        );
        ws.close();
      }
      if (containerName) killContainer(containerName);
    }, SESSION_TIMEOUT_MS);
  }

  // PTY → client: stream output as raw bytes.
  shell.onData((data) => {
    if (ws.readyState === ws.OPEN) ws.send(data);
  });

  // PTY exit → tell the client, then close.
  shell.onExit(({ exitCode }) => {
    console.log(`[-] shell exited (code ${exitCode})`);
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type: "exit", code: exitCode }));
      ws.close();
    }
    cleanup("ended", exitCode);
  });

  // client → PTY: control JSON or raw keystrokes.
  ws.on("message", (raw, isBinary) => {
    // Try to parse a control message first (only for text frames).
    if (!isBinary) {
      const text = raw.toString();
      if (text.length && text[0] === "{") {
        let msg;
        try {
          msg = JSON.parse(text);
        } catch {
          msg = null;
        }
        if (msg && msg.type) {
          switch (msg.type) {
            case "resize":
              if (
                Number.isInteger(msg.cols) &&
                Number.isInteger(msg.rows) &&
                msg.cols > 0 &&
                msg.rows > 0
              ) {
                shell.resize(msg.cols, msg.rows);
              }
              return;
            case "ping":
              if (ws.readyState === ws.OPEN)
                ws.send(JSON.stringify({ type: "pong" }));
              return;
            default:
              return; // unknown control message: ignore
          }
        }
      }
      // Not a control message → treat as keystrokes.
      shell.write(text);
      return;
    }
    // Binary frame → raw keystrokes.
    shell.write(raw);
  });

  const cleanup = async (status, exitCode) => {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
      timeoutHandle = null;
    }
    try {
      shell.kill();
    } catch {
      /* already gone */
    }
    // --rm usually removes the container on exit, but force-kill defensively in
    // case the client vanished while the shell was mid-command.
    killContainer(containerName);
    if (sessionDoc) {
      try {
        sessionDoc.status = status || "ended";
        sessionDoc.endedAt = new Date();
        if (typeof exitCode === "number") sessionDoc.exitCode = exitCode;
        await sessionDoc.save();
      } catch {
        /* ignore */
      }
    }
  };

  ws.on("close", () => {
    console.log(`[-] terminal session closed (user ${userId})`);
    cleanup("ended");
  });
  ws.on("error", (err) => {
    console.error("ws error:", err.message);
    cleanup("error");
  });
});

async function start() {
  await connectDb();
  // Any session still "active" in the DB after a restart is orphaned (its
  // container/SSH conn died with the old process). Mark them ended so the
  // per-user concurrent cap isn't blocked by ghosts.
  try {
    const r = await Session.updateMany(
      { status: "active" },
      { $set: { status: "ended", endedAt: new Date() } }
    );
    if (r.modifiedCount) {
      console.log(`[startup] cleared ${r.modifiedCount} orphaned session(s)`);
    }
  } catch (e) {
    console.error("orphan sweep failed:", e.message);
  }
  server.listen(PORT, HOST, () => {
    console.log(`Qup Terminal backend`);
    console.log(`  HTTP  : http://${HOST}:${PORT}  (/auth, /health)`);
    console.log(`  WS    : ws://${HOST}:${PORT}/term?token=<accessJWT>`);
    console.log(
      `  Auth  : ON   Sandbox: ON   Max sessions/user: ${MAX_SESSIONS_PER_USER}`
    );
  });
}

start().catch((e) => {
  console.error("startup failed:", e.message);
  process.exit(1);
});
