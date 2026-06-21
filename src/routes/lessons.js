// src/routes/lessons.js
// Linux-learning endpoints: list the curriculum (+ user progress), and verify a
// lesson by running its check command inside the learner's active sandbox
// container. Completion is recorded per user on pass.

import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { Session } from "../models/Session.js";
import { User } from "../models/User.js";
import { LESSONS, getLesson, verifyInContainer, UNITS } from "../lib/lessons.js";

const router = express.Router();
router.use(requireAuth);

// GET /lessons?offset=0&limit=20 — paginated curriculum + user progress + units
router.get("/", async (req, res) => {
  const user = await User.findById(req.userId).select("completedLessons");
  const completed = user?.completedLessons || [];

  const total = LESSONS.length;
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

  const page = LESSONS.slice(offset, offset + limit).map((l) => ({
    id: l.id,
    unit: l.unit || null,
    title: l.title,
    explanation: l.explanation,
    task: l.task,
    hint: l.hint,
    done: completed.includes(l.id),
  }));

  // Per-unit progress (over the whole bank, not just this page).
  const units = UNITS.map((u) => {
    const inUnit = LESSONS.filter((l) => l.unit === u.id);
    return {
      id: u.id,
      title: u.title,
      order: u.order,
      total: inUnit.length,
      done: inUnit.filter((l) => completed.includes(l.id)).length,
    };
  });

  res.json({
    lessons: page,
    units,
    total,
    offset,
    limit,
    hasMore: offset + limit < total,
    completedCount: completed.filter((id) =>
      LESSONS.some((l) => l.id === id)
    ).length,
  });
});

// POST /lessons/:id/verify — check work; record completion on pass.
//
// Always responds 200 with a JSON body the app can act on:
//   { passed: true }                              → correct
//   { passed: false }                             → ran the check, wrong answer
//   { passed: false, reason: "no_session" }       → no live sandbox to check in
//   { passed: false, reason: "sandbox_closed" }   → the sandbox has ended
// The app shows a helpful "open the terminal and run the command" nudge for the
// reason cases, instead of treating them as a hard error.
router.post("/:id/verify", async (req, res) => {
  const lesson = getLesson(req.params.id);
  if (!lesson) return res.status(404).json({ error: "unknown lesson" });

  // Most recent active sandbox session for this user.
  const session = await Session.findOne({
    userId: req.userId,
    kind: "sandbox",
    status: "active",
  }).sort({ startedAt: -1 });

  if (!session || !session.containerId) {
    return res.json({
      passed: false,
      reason: "no_session",
      message: "Open the terminal, run the command, then check your work.",
    });
  }

  let result;
  try {
    result = await verifyInContainer(session.containerId, lesson);
  } catch (e) {
    // verifyInContainer is written not to throw, but stay defensive so a check
    // failure never surfaces to the app as a 500.
    console.error("verify threw:", e?.message || e);
    result = { passed: false, output: "verify-error" };
  }

  // The sandbox VM was gone/unreachable (e.g. the practice session closed
  // before the user tapped check). Tell the app to reopen, don't error.
  if (
    !result.passed &&
    typeof result.output === "string" &&
    (result.output.startsWith("sandbox-unreachable") ||
      result.output === "no-sandbox-id" ||
      result.output === "e2b-sdk-unavailable")
  ) {
    return res.json({
      passed: false,
      reason: "sandbox_closed",
      message:
        "Your practice session has closed. Open the terminal again, run the command, then check.",
    });
  }

  if (result.passed) {
    await User.updateOne(
      { _id: req.userId },
      { $addToSet: { completedLessons: lesson.id } }
    );
  }

  res.json({ passed: result.passed });
});

export default router;