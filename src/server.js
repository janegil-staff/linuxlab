// src/server.js
// Qup Terminal backend — auth + DB + PTY-over-WebSocket.
//
//   - REST: /auth (register/login/refresh/me)
//   - WS /term?token=<accessJWT>[&hostId=<id>] : authenticated terminal session
//       • with hostId  → SSH shell on the user's OWN host (lib/ssh.js)
//       • without      → disposable E2B practice sandbox (lib/sandbox.js)
//
// DEPLOY NOTE (App Platform): runs as a normal stateless API + WS service. The
// old Docker-per-session sandbox is gone; the practice sandbox is now an E2B
// microVM (remote API, no local Docker), so this works on App Platform. Both
// SSH and sandbox sessions use the SAME shell wrapper shape, so the WS bridge
// below treats them identically.

import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
dotenv.config();
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
import { spawnSandbox, killContainer } from "./lib/sandbox.js";
import { ensurePtyHistoryFlush } from "./lib/lessons.js";
import { authLimiter, apiLimiter } from "./middleware/rateLimit.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT || 3000;
// Bind 0.0.0.0 on App Platform (and anywhere containerised): the platform's
// health check and ingress reach the process over the network, so 127.0.0.1
// would refuse them and the instance would be marked unhealthy. Override with
// HOST only for local-only runs.
const HOST = process.env.HOST || "0.0.0.0";
// Max concurrent terminal sessions per user (resource-exhaustion guard).
const MAX_SESSIONS_PER_USER = Number(process.env.MAX_SESSIONS_PER_USER || 5);
// Hard wall-clock cap per session (ms). 0 disables. (Previously lived in
// sandbox.js; re-homed here so SSH sessions keep the cap.)
const SESSION_TIMEOUT_MS = Number(
  process.env.SESSION_TIMEOUT_MS || 60 * 60 * 1000, // 1 hour
);

// ── Message protocol ─────────────────────────────────────────────────────────
// client → server: JSON control { type:"resize"|"ping" } else raw keystrokes
// server → client: raw bytes are output; JSON for { type:"exit"|"error"|"pong" }

const app = express();
// Behind the App Platform / proxy ingress, so per-IP rate limiting uses the
// real client IP from X-Forwarded-For.
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

  console.log(`[+] ${isSsh ? "ssh" : "sandbox"} session opened (user ${userId})`);

  // Reject banned users immediately (their token may still be valid).
  try {
    const u = await User.findById(userId).select("banned");
    if (u && u.banned) {
      ws.send(
        JSON.stringify({ type: "error", message: "Account suspended." }),
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
        }),
      );
      ws.close();
      return;
    }
  } catch (e) {
    console.error("session count failed:", e.message);
    // Fail closed on the cap check — safer to refuse than to allow unbounded.
    ws.send(
      JSON.stringify({ type: "error", message: "Could not start session." }),
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
  // For sandbox sessions, the E2B sandbox id (stored on the Session row) lets
  // admin/cleanup kill the VM out-of-band. SSH sessions leave this null.
  let sandboxId = null;

  if (isSsh) {
    // ── SSH to the user's own server ─────────────────────────────────────────
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
          }),
        );
        ws.close();
      }
      // Mark the just-created session row ended so it doesn't linger "active".
      if (sessionDoc) {
        sessionDoc.status = "error";
        sessionDoc.endedAt = new Date();
        sessionDoc.save().catch(() => {});
      }
      return;
    }
  } else {
    // ── Disposable E2B practice sandbox ──────────────────────────────────────
    try {
      const res = await spawnSandbox({ cols: 80, rows: 24 });
      shell = res.shell;
      sandboxId = shell._sandboxId || null;
      if (sessionDoc && sandboxId) {
        // Reuse the existing containerId field to store the E2B sandbox id.
        sessionDoc.containerId = sandboxId;
        sessionDoc.save().catch(() => {});
      }
      console.log(`[+] sandbox ${res.name} (e2b ${sandboxId}) user ${userId}`);

      // Flush interactive history to ~/.bash_history after every command, so
      // the lesson verifier (which greps that file from a SEPARATE non-login
      // shell via commands.run) can see traceless commands like pwd / ls / cd.
      // Without this, the PTY keeps history in memory and those checks fail
      // even on correct answers. Idempotent; safe to send once at startup.
      try {
        shell.write(ensurePtyHistoryFlush() + "\n");
      } catch (e) {
        console.error("history-flush setup failed:", e.message);
      }
    } catch (err) {
      console.error("sandbox spawn failed:", err.message);
      if (ws.readyState === ws.OPEN) {
        ws.send(
          JSON.stringify({
            type: "error",
            message:
              "Could not start the practice sandbox. Please try again in a moment.",
          }),
        );
        ws.close();
      }
      if (sessionDoc) {
        sessionDoc.status = "error";
        sessionDoc.endedAt = new Date();
        sessionDoc.save().catch(() => {});
      }
      return;
    }
  }

  // Hard wall-clock timeout.
  let timeoutHandle = null;
  if (SESSION_TIMEOUT_MS > 0) {
    timeoutHandle = setTimeout(() => {
      console.log(`[!] session timeout (user ${userId})`);
      if (ws.readyState === ws.OPEN) {
        ws.send(
          JSON.stringify({
            type: "error",
            message: "Session timed out and was closed.",
          }),
        );
        ws.close();
      }
      if (sandboxId) killContainer(sandboxId);
    }, SESSION_TIMEOUT_MS);
  }

  // shell → client: stream output as raw bytes (SSH or sandbox).
  shell.onData((data) => {
    if (ws.readyState === ws.OPEN) ws.send(data);
  });

  // shell exit → tell the client, then close.
  shell.onExit(({ exitCode }) => {
    console.log(`[-] shell exited (code ${exitCode})`);
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type: "exit", code: exitCode }));
      ws.close();
    }
    cleanup("ended", exitCode);
  });

  // client → shell: control JSON or raw keystrokes (SSH or sandbox).
  ws.on("message", (raw, isBinary) => {
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
    // For sandbox sessions, also destroy the E2B VM so nothing lingers/bills.
    if (sandboxId) killContainer(sandboxId);
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
  // Any session still "active" in the DB after a restart is orphaned (its SSH
  // conn died with the old process). Mark them ended so the per-user
  // concurrent cap isn't blocked by ghosts.
  try {
    const r = await Session.updateMany(
      { status: "active" },
      { $set: { status: "ended", endedAt: new Date() } },
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
    console.log(`  WS    : ws://${HOST}:${PORT}/term?token=<accessJWT>&hostId=<id>`);
    console.log(
      `  Auth  : ON   Sandbox: E2B   Max sessions/user: ${MAX_SESSIONS_PER_USER}`,
    );
  });
}

start().catch((e) => {
  console.error("startup failed:", e.message);
  process.exit(1);
});