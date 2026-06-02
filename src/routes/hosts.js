// src/routes/hosts.js
// CRUD for a user's saved SSH targets. The credential (password or private key)
// is encrypted at rest with AES-256-GCM (lib/crypto) and never returned to the
// client. All routes require auth and are scoped to req.userId.

import express from "express";
import { Host } from "../models/Host.js";
import { encrypt } from "../lib/crypto.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();
router.use(requireAuth);

// Shape returned to the client — never includes the secret.
function publicHost(h) {
  return {
    id: h._id,
    label: h.label,
    host: h.host,
    port: h.port,
    username: h.username,
    authType: h.authType,
    lastUsedAt: h.lastUsedAt,
  };
}

// GET /hosts — list this user's hosts
router.get("/", async (req, res) => {
  const hosts = await Host.find({ userId: req.userId }).sort({ updatedAt: -1 });
  res.json({ hosts: hosts.map(publicHost) });
});

// POST /hosts { label, host, port?, username, authType, secret }
router.post("/", async (req, res) => {
  const { label, host, port, username, authType, secret } = req.body || {};
  if (!label || !host || !username || !secret) {
    return res
      .status(400)
      .json({ error: "label, host, username and secret are required" });
  }
  if (authType && !["password", "key"].includes(authType)) {
    return res.status(400).json({ error: "authType must be password or key" });
  }
  const doc = await Host.create({
    userId: req.userId,
    label,
    host,
    port: port || 22,
    username,
    authType: authType || "password",
    secretEnc: encrypt(secret),
  });
  res.status(201).json({ host: publicHost(doc) });
});

// DELETE /hosts/:id
router.delete("/:id", async (req, res) => {
  const doc = await Host.findOneAndDelete({
    _id: req.params.id,
    userId: req.userId,
  });
  if (!doc) return res.status(404).json({ error: "not found" });
  res.json({ ok: true });
});

export default router;
