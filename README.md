# The Daily Web - News Management & Publishing Portal

A web application for news management, editing, and publishing, built with Node.js, Express (MVC), MongoDB (Mongoose), EJS, and vanilla JavaScript on the client.

---

## 🚀 Quick Start

### Option A - Docker (app + MongoDB)

```bash
docker compose up -d --build
```

This builds the Express container on port `3000`, starts MongoDB on `27017` with a persistent volume, and mounts your local `./src` and `./public` folders for live updates. Open **http://localhost:3000**.

```bash
docker compose logs -f app   # view logs
docker compose down          # stop
```

Docker uses the secrets from your shell environment (`JWT_SECRET`, `SESSION_SECRET`, `OPENWEATHER_API_KEY`) and falls back to placeholder values for development.

### Option B - Local Node.js

1. Start MongoDB (`docker compose up -d mongodb`) or use a local installation.
2. `npm install`
3. `cp .env.example .env` and fill in the values (see [Environment variables](#environment-variables)).
4. `npm run dev` (or `npm start`)

No MongoDB at all? Set `USE_MEMORY_DB=true` in `.env`. The server then starts a temporary in-memory database filled with the demo data. Everything is lost when the server stops, and it is refused in production.

### Demo data

```bash
npm run seed
```

Wipes the database and creates 520 articles in every status, 6 users, comments, and a historical view curve for the Impact Analytics graph. It refuses to run when `NODE_ENV=production`.

Demo users (password `password123`): `sarah_editor`, `yossi_editor`, `dan_reporter`, `michal_reporter`, `ron_reporter`, `noa_reporter`.

### Creating editors

Public sign-up only creates **reporters**. Editor accounts are created either from the command line:

```bash
npm run create-editor -- <username> <password> "<full name>"
```

or by a logged-in editor through `POST /api/auth/users` (body: `username`, `password`, `fullName`, `role`).

### Tests

```bash
npm test
```

Every test file starts its own temporary in-memory MongoDB, so tests never touch your real database.

---

## ⚙️ Environment variables

| Variable | Purpose |
| --- | --- |
| `PORT` | Server port (default `3000`) |
| `MONGODB_URI` | MongoDB connection string |
| `SESSION_SECRET` | Signs the session cookie. **Required in production** |
| `JWT_SECRET` | Signs login tokens. **Required in production** |
| `OPENWEATHER_API_KEY` | OpenWeatherMap key for the weather widget. Without it, placeholder data is shown |
| `WEATHER_CITY` | City for the weather widget (default `Tel Aviv,IL`) |
| `USE_MEMORY_DB` | `true` = temporary in-memory database with demo data (development only) |

---

## 📁 Project Structure (MVC)

```text
the-daily-web/
├── Dockerfile, docker-compose.yml, .dockerignore
├── package.json
├── .env.example
├── public/                      # Static client: HTML, vanilla JS, images
│   ├── index.html               # Public home page (feed, search, filters, infinite scroll)
│   ├── login.html               # Login / reporter sign-up
│   ├── reporter.html            # Reporter dashboard (own articles, editor with auto-save)
│   ├── editor.html              # Editor dashboard (review, diff view, approve / return)
│   ├── analytics.html           # Impact Analytics graph (Chart.js) and comments demo
│   ├── js/common.js             # Shared client helpers (escapeHtml, token, logout)
│   └── images/                  # Default article image
├── src/
│   ├── app.js                   # Express setup, middleware, routes
│   ├── server.js                # Entry point
│   ├── config/
│   │   ├── db.js                # MongoDB connection (optional in-memory dev mode)
│   │   ├── session.js           # express-session + connect-mongo (login survives restarts)
│   │   └── secrets.js           # Reads JWT/session secrets, required in production
│   ├── constants/               # Article statuses, categories, default image
│   ├── models/                  # User, Article, Comment, ViewStat (Mongoose)
│   ├── middleware/              # auth (roles), commentRateLimiter, errorHandler, requestLogger
│   ├── controllers/             # article, auth, comment, analytics, weather
│   ├── services/                # weatherService (OpenWeatherMap + 15 minute cache)
│   ├── routes/                  # REST routes per controller
│   ├── utils/                   # pagination, status filter, text cleaning, HTML sanitizer
│   ├── scripts/                 # seed.js (demo data), createEditor.js
│   └── views/article.ejs        # Server-rendered article page (SEO)
└── tests/                       # node:test suites (+ helpers/testEnv.js)
```

---

## 💡 Features & Business Logic

### Users, roles & security
- Roles: **Guest** (not logged in), **Reporter**, **Editor**. Roles are enforced on the server (`requireRole`, `requireReporter`, `requireEditor`); reporters can only touch their own articles.
- Passwords are hashed with `bcrypt`.
- Logins are kept in a server session stored in MongoDB (`connect-mongo`), so they survive a server restart. The dashboards authenticate with a signed token, and the server accepts the session cookie as well.
- Public sign-up always creates a reporter. Editors are created by another editor or with `npm run create-editor`.
- Article HTML is sanitized on save (small allowlist of tags, safe links only), and the dashboards escape all text they render.
- Centralized error handling, with errors in `logs/error.log`, HTTP requests in `logs/access.log`, and operational events in `logs/operations.log`.

### Article lifecycle
- **State machine:** `draft` (בהכנה) → `pending_approval` (ממתינה לאישור עורך) → `published` (פורסמה), or `revision_requested` (הוחזרה לתיקונים) with **mandatory editor feedback**. Illegal transitions are blocked on the server.
- **Auto-save:** `POST /api/articles/autosave` and `PUT /api/articles/:id/autosave` save work continuously in the background.
- **Editing a published article:** changes go to an isolated `draftVersion`. The public keeps seeing the approved version until an editor approves the update, which is recorded in `revisionsHistory` for the analytics timeline.
- **Editor tools:** filter all articles by status, side-by-side diff of the live version against the proposed one, approve, return with notes, direct edit, delete.

### Public site
- Home page feed with infinite scroll (20 articles per request via `fetch`), search by title, filter by category and viewed / not viewed, sort by date or popularity.
- Server-rendered article page (`/article/:id`, EJS) for search engines.
- Weather widget in the sidebar. `GET /api/weather` calls OpenWeatherMap at most once every 15 minutes.

### Comments, anti-spam & analytics
- Comments are posted with AJAX and appear without a page reload. Commenter IPs are never sent to the browser.
- **Rate limit:** a guest cannot post more than 3 comments per minute from the same device/IP. It is checked against MongoDB, so a server restart does not reset it. Blocked requests get `429` with `Retry-After`.
- **Views** are counted in hourly buckets with atomic `$inc` upserts, which keeps heavy traffic cheap.
- **Impact Analytics** (`public/analytics.html`) shows views over time with Chart.js, marks the publication and update times, and compares average hourly views before and after the last update.

---

## 🎓 Demo Guide

1. `npm run seed`, then `npm start`.
2. Home page (`/`): scroll for infinite loading, try the search, category filter, and popularity sort.
3. Log in at `/login.html` as `dan_reporter` (reporter dashboard) and `sarah_editor` (editor dashboard). Create an article, watch the auto-save indicator, and submit it for approval.
4. As the editor, review the submission, return it with notes, then approve it. Edit a published article and use the diff view.
5. Open `/analytics.html` and select the showcase article (*"…(מהדורה #151)"*) to see the views surge after each update.
6. Post comments without reloading the page. The 4th comment within a minute is blocked with a countdown.
7. Stop the server (`Ctrl+C`) and start it again. You stay logged in and the spam block is still active.
