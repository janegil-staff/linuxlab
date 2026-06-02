// src/routes/lessons.js
// Linux-learning endpoints: list the curriculum (+ user progress), and verify a
// lesson by running its check command inside the learner's active sandbox
// container. Completion is recorded per user on pass.

import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { Session } from "../models/Session.js";
import { User } from "../models/User.js";
import { LESSONS, getLesson, verifyInContainer } from "../lib/lessons.js";

const router = express.Router();
router.use(requireAuth);

// GET /lessons?offset=0&limit=20 — paginated curriculum + user progress
router.get("/", async (req, res) => {
  const user = await User.findById(req.userId).select("completedLessons");
  const completed = user?.completedLessons || [];

  const total = LESSONS.length;
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

  const page = LESSONS.slice(offset, offset + limit).map((l) => ({
    id: l.id,
    title: l.title,
    explanation: l.explanation,
    task: l.task,
    hint: l.hint,
    done: completed.includes(l.id),
  }));

  res.json({
    lessons: page,
    total,
    offset,
    limit,
    hasMore: offset + limit < total,
    completedCount: completed.filter((id) =>
      LESSONS.some((l) => l.id === id)
    ).length,
  });
});

// POST /lessons/:id/verify — check work; record completion on pass
router.post("/:id/verify", async (req, res) => {
  const lesson = getLesson(req.params.id);
  if (!lesson) return res.status(404).json({ error: "unknown lesson" });

  const session = await Session.findOne({
    userId: req.userId,
    kind: "sandbox",
    status: "active",
  }).sort({ startedAt: -1 });

  if (!session || !session.containerId) {
    return res.status(409).json({
      error: "no_active_session",
      message: "Open a terminal session first, then check your work.",
    });
  }

  const result = await verifyInContainer(session.containerId, lesson);
  if (result.passed) {
    await User.updateOne(
      { _id: req.userId },
      { $addToSet: { completedLessons: lesson.id } }
    );
  }
  res.json({ passed: result.passed });
});

export default router;
