# Full-Stack To-Do List

A full-stack to-do app with:

- username/password registration and login
- password hashing with bcrypt
- signed HTTP-only session cookie
- SQLite-compatible database through Turso/libSQL
- per-user task isolation
- add / complete / delete tasks
- local tests
- Vercel deployment

## 1. Requirements

Install Node.js 20+.

Create a Turso database (SQLite-compatible) and obtain:

- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`

Create `.env` from `.env.example` and fill those values plus a long random `SESSION_SECRET`.

Never commit `.env`, database files, tokens, or passwords.

## 2. Run locally

```bash
npm install
npm test
npm run dev
```

Open http://localhost:3000.

Create two users in separate browser sessions and verify that each user sees only their own tasks.

## 3. GitHub

Create a new **Public** repository. Do not initialize it with another README if you are pushing this folder.

```bash
git init
git add .
git commit -m "Build full-stack todo app"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/full-stack-todo.git
git push -u origin main
```

Before pushing, check:

```bash
git status
```

Make sure `.env` is not listed.

## 4. Vercel

Import the GitHub repository into Vercel.

Add these Environment Variables in Vercel:

- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`
- `SESSION_SECRET`

Deploy.

After deployment, open the Vercel URL and test registration/login/task isolation.

## Security checklist

- Passwords are never stored as plain text.
- `.env` is ignored by Git.
- Database files are ignored by Git.
- Session cookie is HTTP-only.
- Task queries always include `user_id`, so one user cannot read/update/delete another user's task through the normal API.
- Do not put API keys, tokens, passwords, or personal data in the public repository.

## Architecture

Browser
  -> Express API
  -> authentication/session cookie
  -> Turso/libSQL (SQLite-compatible)

The assignment says SQLite is acceptable for the demo. Turso keeps the SQLite-compatible database persistent when the app runs on Vercel, where a local server filesystem should not be treated as a permanent database.
