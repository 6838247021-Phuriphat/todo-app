import express from "express";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db, initDb } from "./db.js";

export const app = express();

app.use(express.json());
app.use(cookieParser());

const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) throw new Error("Missing SESSION_SECRET");

function sign(value) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(value).digest("hex");
}

function makeSession(userId) {
  const payload = `${userId}.${Date.now()}`;
  return `${payload}.${sign(payload)}`;
}

function getUserId(req) {
  const raw = req.cookies.session;
  if (!raw) return null;

  const parts = raw.split(".");
  if (parts.length !== 3) return null;

  const [userId, timestamp, signature] = parts;
  const payload = `${userId}.${timestamp}`;

  if (!/^\d+$/.test(userId) || !/^\d+$/.test(timestamp)) return null;
  if (Date.now() - Number(timestamp) > 1000 * 60 * 60 * 24 * 7) return null;

  const expected = sign(payload);
  if (signature.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;

  return Number(userId);
}

function requireAuth(req, res, next) {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: "Not logged in" });
  req.userId = userId;
  next();
}

app.get("/api/health", async (_req, res) => {
  await initDb();
  res.json({ ok: true });
});

app.post("/api/register", async (req, res) => {
  const username = String(req.body.username ?? "").trim();
  const password = String(req.body.password ?? "");

  if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
    return res.status(400).json({ error: "Username must be 3-30 letters, numbers or _." });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters." });
  }

  await initDb();
  const hash = await bcrypt.hash(password, 12);

  try {
    const result = await db.execute({
      sql: "INSERT INTO users (username, password_hash) VALUES (?, ?)",
      args: [username, hash]
    });

    const userId = Number(result.lastInsertRowid);
    res.cookie("session", makeSession(userId), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000
    });
    res.status(201).json({ username });
  } catch (err) {
    if (String(err.message).includes("UNIQUE")) {
      return res.status(409).json({ error: "Username already exists." });
    }
    throw err;
  }
});

app.post("/api/login", async (req, res) => {
  const username = String(req.body.username ?? "").trim();
  const password = String(req.body.password ?? "");

  await initDb();
  const result = await db.execute({
    sql: "SELECT id, username, password_hash FROM users WHERE username = ?",
    args: [username]
  });

  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: "Invalid username or password." });
  }

  res.cookie("session", makeSession(Number(user.id)), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
  res.json({ username: user.username });
});

app.post("/api/logout", (req, res) => {
  res.clearCookie("session");
  res.json({ ok: true });
});

app.get("/api/me", requireAuth, async (req, res) => {
  await initDb();
  const result = await db.execute({
    sql: "SELECT username FROM users WHERE id = ?",
    args: [req.userId]
  });
  if (!result.rows[0]) return res.status(401).json({ error: "User not found" });
  res.json({ username: result.rows[0].username });
});

app.get("/api/tasks", requireAuth, async (req, res) => {
  await initDb();
  const result = await db.execute({
    sql: "SELECT id, title, completed FROM tasks WHERE user_id = ? ORDER BY id DESC",
    args: [req.userId]
  });
  res.json(result.rows.map(t => ({
    id: Number(t.id),
    title: t.title,
    completed: Boolean(t.completed)
  })));
});

app.post("/api/tasks", requireAuth, async (req, res) => {
  const title = String(req.body.title ?? "").trim();
  if (!title || title.length > 200) {
    return res.status(400).json({ error: "Task title must be 1-200 characters." });
  }

  await initDb();
  const result = await db.execute({
    sql: "INSERT INTO tasks (user_id, title) VALUES (?, ?)",
    args: [req.userId, title]
  });

  res.status(201).json({
    id: Number(result.lastInsertRowid),
    title,
    completed: false
  });
});

app.patch("/api/tasks/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid task id." });

  const completed = Boolean(req.body.completed);
  await initDb();

  const result = await db.execute({
    sql: "UPDATE tasks SET completed = ? WHERE id = ? AND user_id = ?",
    args: [completed ? 1 : 0, id, req.userId]
  });

  if (result.rowsAffected === 0) return res.status(404).json({ error: "Task not found." });
  res.json({ id, completed });
});

app.delete("/api/tasks/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid task id." });

  await initDb();
  const result = await db.execute({
    sql: "DELETE FROM tasks WHERE id = ? AND user_id = ?",
    args: [id, req.userId]
  });

  if (result.rowsAffected === 0) return res.status(404).json({ error: "Task not found." });
  res.status(204).end();
});

// Serve frontend locally. Vercel serves the root files as static assets.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "..")));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error." });
});