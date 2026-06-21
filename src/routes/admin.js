// src/routes/admin.js
// Abuse-response tooling for an admin user: see who's registered, see active
// sessions, ban a user (blocks login + new sessions), and mark a running
// session ended. This is the "kill switch" providers expect you to have.
//
// SANDBOX_REMOVED_V1 — the Docker sandbox is gone (App Platform migration), so
// there are no containers to kill. Admin "kill" actions now mark the Session
// row `ended` in the DB. NOTE: a live SSH stream is held in the WebSocket
// process; marking the row ended does NOT by itself sever an in-flight shell.
// Real-time enforcement today is: (a) `banned` blocks login + new sessions and
// is checked when a WS opens, and (b) the per-session wall-clock timeout
// (SESSION_TIMEOUT_MS) closes long-running shells. A future cross-process
// "kill now" signal (e.g. pub/sub to the WS layer) can re-add instant teardown.

import express from "express";
import { User } from "../models/User.js";
import { Session } from "../models/Session.js";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/admin.js";

const router = express.Router();
router.use(requireAuth, requireAdmin);

// GET /admin/users
router.get("/users", async (req, res) => {
  const users = await User.find()
    .select("email role banned bannedReason emailVerified createdAt lastLoginAt")
    .sort({ createdAt: -1 })
    .limit(500);
  res.json({ users });
});

// GET /admin/sessions/active
router.get("/sessions/active", async (req, res) => {
  const sessions = await Session.find({ status: "active" })
    .select("userId kind hostId startedAt cols rows")
    .sort({ startedAt: -1 });
  res.json({ sessions });
});

// POST /admin/users/:id/ban { reason? }
router.post("/users/:id/ban", async (req, res) => {
  const u = await User.findByIdAndUpdate(
    req.params.id,
    { banned: true, bannedReason: req.body?.reason || null },
    { new: true }
  ).select("email banned bannedReason");
  if (!u) return res.status(404).json({ error: "not found" });

  // Mark any active sessions ended. The banned flag also blocks new WS opens;
  // existing shells time out (or drop when the user disconnects).
  const active = await Session.find({ userId: req.params.id, status: "active" });
  for (const s of active) {
    s.status = "ended";
    s.endedAt = new Date();
    await s.save().catch(() => {});
  }
  res.json({ user: u, endedSessions: active.length });
});

// POST /admin/users/:id/unban
router.post("/users/:id/unban", async (req, res) => {
  const u = await User.findByIdAndUpdate(
    req.params.id,
    { banned: false, bannedReason: null },
    { new: true }
  ).select("email banned");
  if (!u) return res.status(404).json({ error: "not found" });
  res.json({ user: u });
});

// POST /admin/sessions/:id/kill — mark one session ended.
// (No container to destroy; see SANDBOX_REMOVED_V1 note above.)
router.post("/sessions/:id/kill", async (req, res) => {
  const s = await Session.findById(req.params.id);
  if (!s) return res.status(404).json({ error: "not found" });
  s.status = "ended";
  s.endedAt = new Date();
  await s.save().catch(() => {});
  res.json({ ok: true });
});

export default router;