import express from "express";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db, initDb } from "./db.js";

export const app = express();

// Middleware
app.use(express.json({ limit: "20kb" }));
app.use(cookieParser());

// Session secret
const SESSION_SECRET = process.env.SESSION_SECRET;

if (!SESSION_SECRET) {
  throw new Error("Missing SESSION_SECRET");
}

// Create signature
function sign(value) {
  return crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(value)
    .digest("hex");
}

// Create session
function makeSession(userId) {
  const payload = `${userId}.${Date.now()}`;
  return `${payload}.${sign(payload)}`;
}

// Get user from session
function getUserId(req) {
  const raw = req.cookies?.session;

  if (!raw) return null;

  const parts = raw.split(".");

  if (parts.length !== 3) return null;

  const [userId, timestamp, signature] = parts;

  if (!/^\d+$/.test(userId)) return null;
  if (!/^\d+$/.test(timestamp)) return null;

  const age = Date.now() - Number(timestamp);

  if (age < 0 || age > 7 * 24 * 60 * 60 * 1000) {
    return null;
  }

  const expected = sign(`${userId}.${timestamp}`);

  if (signature.length !== expected.length) {
    return null;
  }

  if (
    !crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
    )
  ) {
    return null;
  }

  return Number(userId);
}

// Authentication middleware
function requireAuth(req, res, next) {
  const userId = getUserId(req);

  if (!userId) {
    return res.status(401).json({
      error: "Not logged in"
    });
  }

  req.userId = userId;
  next();
}

// Set login cookie
function setSession(res, userId) {
  res.cookie("session", makeSession(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure:
      process.env.NODE_ENV === "production" ||
      Boolean(process.env.VERCEL),
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/"
  });
}

// ==============================
// HEALTH CHECK
// ==============================

app.get("/api/health", async (_req, res) => {
  await initDb();

  res.json({
    ok: true
  });
});

// ==============================
// REGISTER
// ==============================

app.post("/api/register", async (req, res) => {
  const username = String(req.body?.username ?? "").trim();
  const password = String(req.body?.password ?? "");

  if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
    return res.status(400).json({
      error: "Username must be 3-30 letters, numbers or underscores."
    });
  }

  if (password.length < 8) {
    return res.status(400).json({
      error: "Password must be at least 8 characters."
    });
  }

  await initDb();

  const passwordHash = await bcrypt.hash(password, 12);

  try {
    const result = await db.execute({
      sql: `
        INSERT INTO users (username, password_hash)
        VALUES (?, ?)
      `,
      args: [username, passwordHash]
    });

    const userId = Number(result.lastInsertRowid);

    setSession(res, userId);

    return res.status(201).json({
      username
    });

  } catch (error) {
    if (String(error.message).includes("UNIQUE")) {
      return res.status(409).json({
        error: "Username already exists."
      });
    }

    throw error;
  }
});

// ==============================
// LOGIN
// ==============================

app.post("/api/login", async (req, res) => {
  const username = String(req.body?.username ?? "").trim();
  const password = String(req.body?.password ?? "");

  await initDb();

  const result = await db.execute({
    sql: `
      SELECT id, username, password_hash
      FROM users
      WHERE username = ?
    `,
    args: [username]
  });

  const user = result.rows[0];

  if (
    !user ||
    !(await bcrypt.compare(password, user.password_hash))
  ) {
    return res.status(401).json({
      error: "Invalid username or password."
    });
  }

  setSession(res, Number(user.id));

  res.json({
    username: user.username
  });
});

// ==============================
// LOGOUT
// ==============================

app.post("/api/logout", (_req, res) => {
  res.clearCookie("session", {
    httpOnly: true,
    sameSite: "lax",
    secure:
      process.env.NODE_ENV === "production" ||
      Boolean(process.env.VERCEL),
    path: "/"
  });

  res.json({
    ok: true
  });
});

// ==============================
// CURRENT USER
// ==============================

app.get("/api/me", requireAuth, async (req, res) => {
  await initDb();

  const result = await db.execute({
    sql: `
      SELECT username
      FROM users
      WHERE id = ?
    `,
    args: [req.userId]
  });

  if (!result.rows[0]) {
    return res.status(401).json({
      error: "User not found"
    });
  }

  res.json({
    username: result.rows[0].username
  });
});

// ==============================
// GET TASKS
// ==============================

app.get("/api/tasks", requireAuth, async (req, res) => {
  await initDb();

  const result = await db.execute({
    sql: `
      SELECT id, title, completed
      FROM tasks
      WHERE user_id = ?
      ORDER BY id DESC
    `,
    args: [req.userId]
  });

  res.json(
    result.rows.map((task) => ({
      id: Number(task.id),
      title: task.title,
      completed: Boolean(task.completed)
    }))
  );
});

// ==============================
// ADD TASK
// ==============================

app.post("/api/tasks", requireAuth, async (req, res) => {
  const title = String(req.body?.title ?? "").trim();

  if (!title || title.length > 200) {
    return res.status(400).json({
      error: "Task title must be 1-200 characters."
    });
  }

  await initDb();

  const result = await db.execute({
    sql: `
      INSERT INTO tasks (user_id, title)
      VALUES (?, ?)
    `,
    args: [req.userId, title]
  });

  res.status(201).json({
    id: Number(result.lastInsertRowid),
    title,
    completed: false
  });
});

// ==============================
// UPDATE TASK
// ==============================

app.patch("/api/tasks/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({
      error: "Invalid task id."
    });
  }

  const completed = req.body?.completed === true;

  await initDb();

  const result = await db.execute({
    sql: `
      UPDATE tasks
      SET completed = ?
      WHERE id = ? AND user_id = ?
    `,
    args: [
      completed ? 1 : 0,
      id,
      req.userId
    ]
  });

  if (result.rowsAffected === 0) {
    return res.status(404).json({
      error: "Task not found."
    });
  }

  res.json({
    id,
    completed
  });
});

// ==============================
// DELETE TASK
// ==============================

app.delete("/api/tasks/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({
      error: "Invalid task id."
    });
  }

  await initDb();

  const result = await db.execute({
    sql: `
      DELETE FROM tasks
      WHERE id = ? AND user_id = ?
    `,
    args: [id, req.userId]
  });

  if (result.rowsAffected === 0) {
    return res.status(404).json({
      error: "Task not found."
    });
  }

  res.status(204).end();
});

// ==============================
// SERVE FRONTEND LOCALLY
// ==============================

// Vercel serves public files separately.
// Express serves public files only during local development.

if (!process.env.VERCEL) {
  const currentDir = path.dirname(
    fileURLToPath(import.meta.url)
  );

  app.use(
    express.static(
      path.join(currentDir, "../public")
    )
  );

  app.get("/", (_req, res) => {
    res.sendFile(
      path.join(currentDir, "../public/index.html")
    );
  });
}

// ==============================
// ERROR HANDLER
// ==============================

app.use((err, _req, res, _next) => {
  console.error("Server Error:", err);

  res.status(500).json({
    error: "Internal server error."
  });
});