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
│   ├── test.html                # Interactive visual testing workbench (auto-save & review)
│   ├── js/common.js             # Shared client helpers (escapeHtml, token, logout)
│   └── images/                  # Default article image and SVG assets
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

## 📊 Core Features & Business Logic: Comments, Anti-Spam, Analytics & Seeder

1. **Comments Model & Real-Time AJAX Submission:**
   - **Model (`src/models/Comment.js`)**: Full CRUD Mongoose model supporting articles, author names, content, and client IP identifiers.
   - **Instant Rendering**: Client submits comments via `fetch()` (AJAX) and immediately prepends them to the DOM without full page reload.
   - **Full CRUD & Text Search**: Supports listing, text search (`$text` on `content` and `authorName`), single fetch, updating, and moderator/editor deletion.

2. **Anti-Spam Rate Limiter (`src/middleware/commentRateLimiter.js`):**
   - **Policy**: Enforces that guest users cannot post more than **3 comments per minute from the same device/IP**.
   - **Server Restart Resilience**: Evaluates recent activity directly against MongoDB (`Comment.countDocuments`) indexed with `{ clientIp: 1, createdAt: -1 }`. If the server restarts, rate-limiting state is fully preserved!
   - **Standardized Response**: Blocked requests receive `HTTP 429 Too Many Requests` with a descriptive message in Hebrew and a `Retry-After` header indicating remaining wait time.

3. **High-Throughput Scalable View Analytics (`src/models/ViewStat.js` & `src/controllers/analyticsController.js`):**
   - **Design Rationale**: Under heavy concurrent traffic (thousands of simultaneous readers), inserting separate documents per view creates excessive I/O overhead.
   - **Time-Bucket Aggregation**: Views are aggregated into hourly time buckets (e.g. `2026-09-30-11`) using atomic MongoDB updates:
     `ViewStat.updateOne({ article, timeBucket }, { $inc: { viewCount: 1 } }, { upsert: true })`.
   - **Automatic Tracking**: Every request to `GET /api/articles/public/:id` automatically triggers internal atomic view tracking.
   - **Full CRUD**: Supports manual creation, listing with text search, individual inspection, updates, and deletion.

4. **Editor Impact Analytics Dashboard (`public/analytics.html`):**
   - **Interactive Chart.js Graph**: Visualizes article views over time using responsive canvas rendering.
   - **Milestone Correlation**: Clearly marks the initial publication timestamp and subsequent editor approval/revision dates on the timeline.
   - **Pre- vs. Post-Update Comparison**: Automatically computes average hourly viewership before and after each revision, calculating the exact percentage growth (`% Growth`).
   - Accessible directly at: **`http://localhost:3000/analytics.html`**.

5. **Automated Database Seeder (`npm run seed`):**
   - Populates the database with over **520 realistic articles** spanning all categories (`חדשות`, `פוליטיקה`, `כלכלה`, `טכנולוגיה`, `ספורט`, `תרבות`, `בריאות`, `דעות`).
   - Categorized by state: ~370 Published, ~60 Drafts, ~50 Pending Approval, and ~40 Returned for Revisions with authentic editorial feedback.
   - Seeds 6 users (editors and reporters) with secure bcrypt passwords (`password123`).
   - Seeds 25 multi-revision articles with realistic historical view curves for immediate presentation of the Impact Analytics graph.
   - Seeds hundreds of diverse reader comments.

---

## 🎓 Oral Defense Demonstration Guide (מדריך להדגמה בפני המרצה)

1. **Seed the Database:**
   ```bash
   npm run seed
   ```
2. **Start the Application:**
   ```bash
   npm start
   ```
3. **Open the Dashboards & Workbenches:**
   - **Main News Portal:** `http://localhost:3000/`
   - **Staff Login:** `http://localhost:3000/login.html`
   - **Reporter Workspace:** `http://localhost:3000/reporter.html`
   - **Editor-in-Chief CMS:** `http://localhost:3000/editor.html`
   - **Article Workflow Workbench:** `http://localhost:3000/test.html`
   - **Impact Analytics & Comments Lab:** `http://localhost:3000/analytics.html`
4. **Demonstrate Impact Analytics:**
   - Select the showcase article (*"דעה: החוסן הכלכלי של ישראל מול אתגרי השעה (מהדורה #151)"*).
   - Point out the metrics cards showing pre-update vs. post-update views and percentage growth.
   - Show the Chart.js curve highlighting the surge in readership following editorial updates.
5. **Demonstrate Real-Time AJAX Comments:**
   - Add a comment in the form and show that it appears instantly without reloading the page.
6. **Demonstrate Anti-Spam (3 comments/min limit):**
   - Click the *"בצע בדיקת הצפת ספאם"* button: show that 3 comments pass and the 4th is immediately blocked with HTTP 429 and a countdown timer.
7. **Demonstrate Server Restart Resilience:**
   - Stop the server (`Ctrl+C`), start it again (`npm start`), and show that the spam block remains active!
