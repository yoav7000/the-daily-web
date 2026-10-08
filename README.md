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

### Creating accounts

There is **no public sign-up**. Accounts (reporters and editors) are created by an editor in the management page (`/admin.html`, tab "משתמשים"), or through the user management API (see below). The very first editor can be created from the command line:

```bash
npm run create-editor -- <username> <password> "<full name>"
```

### Tests

```bash
npm test
```

Every test file starts its own temporary in-memory MongoDB, so tests never touch your real database. The suite covers:

- **The server:** every API route, roles and permissions, the article workflow, comments and the spam limit, analytics, password storage (it reads the raw MongoDB documents), user management and login throttling.
- **The front-end** (`tests/frontendChecks.test.js`): every page parses, every button handler exists, every shared helper a page calls is loaded, every link and every API address a page uses really exists, and the removed developer tooling is gone.
- **Regressions from the manual QA** (`tests/qaRegression.test.js`): exact dashboard counters, paging without repeated or skipped articles, the viewed filter, clean deletes, error pages and the favicon.

---

## ⚙️ Environment variables

| Variable | Purpose |
| --- | --- |
| `PORT` | Server port (default `3000`) |
| `MONGODB_URI` | MongoDB connection string |
| `SESSION_SECRET` | Signs the session cookie. **Required in production** |
| `JWT_SECRET` | Signs login tokens. **Required in production** |
| `OPENWEATHER_API_KEY` | OpenWeatherMap key for the weather widget (new free keys can take up to 2 hours to activate). Without a working key the widget shows sample data and says so |
| `TRUST_PROXY` | Number of reverse proxies in front of the server (e.g. `1`). Needed behind nginx or a load balancer so the comment limit sees the real visitor IP. Leave unset otherwise |
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
│   ├── login.html               # Staff login (no sign-up)
│   ├── portal.html              # Staff portal: links to the desks the user may open
│   ├── reporter.html            # Reporter dashboard (own articles, editor with auto-save)
│   ├── editor.html              # Editor dashboard (review, diff view, approve / return)
│   ├── analytics.html           # Impact Analytics graph (Chart.js)
│   ├── admin.html               # Editors: manage users, comments and view statistics (full CRUD)
│   ├── js/common.js             # Shared client helpers (escapeHtml, token, logout)
│   ├── js/comments.js           # Comment list helpers (add a comment without reloading the list)
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
│   ├── controllers/             # article, auth, user, comment, analytics, weather
│   ├── services/                # weatherService (OpenWeatherMap + 15 minute cache)
│   ├── routes/                  # REST routes per controller
│   ├── utils/                   # pagination, search filter, status filter, text cleaning, HTML sanitizer
│   ├── scripts/                 # seed.js (demo data), createEditor.js
│   └── views/article.ejs        # Server-rendered article page (SEO)
└── tests/                       # node:test suites (+ helpers/testEnv.js)
```

---

## 📊 Core Features & Business Logic: Comments, Anti-Spam, Analytics & Seeder

### Users, roles & security
- Roles: **Guest** (not logged in), **Reporter**, **Editor**. Roles are enforced on the server (`requireRole`, `requireReporter`, `requireEditor`); reporters can only touch their own articles.
- **Passwords are stored only as bcrypt hashes** and every rule about them runs on the server, never in the browser. The model hashes on every way of writing a user (`save`, `insertMany`, `updateOne` / `findOneAndUpdate`), a password must be 6 to 72 characters, and API responses never contain a password or hash. `tests/passwordStorage.test.js` reads the raw MongoDB documents to prove it, including users made by the seeder and by `npm run create-editor`.
- Logins are kept in a server session stored in MongoDB (`connect-mongo`), so they survive a server restart. The dashboards authenticate with a signed token, and the server accepts the session cookie as well.
- No public sign-up: only an editor can create accounts. The login page only follows `?redirect=` to paths on this site.
- **Login throttling:** after 10 wrong passwords for the same username from the same address (or 50 from one address) logins are refused for 15 minutes with a `429`. Tune it with `LOGIN_MAX_ATTEMPTS` and `LOGIN_WINDOW_MINUTES`.
- The server does not advertise its framework and sends basic protective headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`).
- **User management (editors only, also in `/admin.html`):** `GET /api/users?search=&role=` (list and search by part of the name), `GET /api/users/:id`, `POST /api/users`, `PUT /api/users/:id` (name, role, active flag, password), `DELETE /api/users/:id` (also reachable under `/api/auth/users`). The last active editor cannot be removed, and a user who wrote articles is deactivated instead of deleted.
- Article HTML is sanitized on save (small allowlist of tags, safe links only), and the dashboards escape all text they render.
- Centralized error handling, with errors in `logs/error.log`, HTTP requests in `logs/access.log`, and operational events in `logs/operations.log`.

### Article lifecycle
- **State machine:** `draft` (בהכנה) → `pending_approval` (ממתינה לאישור עורך) → `published` (פורסמה), or `revision_requested` (הוחזרה לתיקונים) with **mandatory editor feedback**. Illegal transitions are blocked on the server.
- **Auto-save:** `POST /api/articles/autosave` and `PUT /api/articles/:id/autosave` save work continuously in the background.
- **Editing a published article:** changes go to an isolated `draftVersion`. The public keeps seeing the approved version until an editor approves the update, which is recorded in `revisionsHistory` for the analytics timeline.
- **Locked while under review:** once an article (or the update of a published article) is waiting for the editor, the server refuses further edits until the editor approves it or returns it for revisions.
- **Dashboards at any size:** the editor desk and the reporter desk get exact counters from the database (`GET /api/articles/editor/stats`, `GET /api/articles/my-stats`), and the editor list loads one page at a time with the filters applied by the server, so thousands of articles stay fast.
- **Editor tools:** filter all articles by status, side-by-side diff of the live version against the proposed one, approve, return with notes, direct edit, delete.

### Public site
- Home page feed with infinite scroll (20 articles per request via `fetch`), search by title or summary (any part of a word matches), filter by category and viewed / not viewed, sort by date or popularity. All of it is done by the server over the whole archive: the browser only sends what it remembers having read (`viewed=read|unread&viewedIds=...`). Section links such as `/?category=ספורט` open that section. Every article opens its own page.
- Paging is stable: articles published at the same moment are ordered by id, so scrolling never repeats or skips one.
- Mistyped or deleted links get a styled "not found" page (API calls still answer with JSON), and every page has a favicon.
- Server-rendered article page (`/article/:id`, EJS) for search engines.
- Weather widget in the sidebar. `GET /api/weather` calls OpenWeatherMap at most once every 15 minutes, however many visitors there are. If the service is unavailable, the last real reading is shown (or labelled sample data).

### Comments, anti-spam & analytics
- Comments are posted with AJAX and the new comment appears at the top of the list without a page reload. Commenter IPs are never sent to the browser.
- **Rate limit:** a guest cannot post more than 3 comments per minute from the same IP. The IP comes from the connection itself (headers such as `X-Forwarded-For` are ignored unless `TRUST_PROXY` is set), requests from one IP are handled one after another so a burst cannot slip through, and the count is checked against MongoDB so a server restart does not reset it. Blocked requests get `429` with `Retry-After`.
- **Views** are counted in hourly buckets with atomic `$inc` upserts, which keeps heavy traffic cheap.
- **Impact Analytics** (`public/analytics.html`) shows views over time with Chart.js. Hours without views appear as 0. The publication and every editor-approved update are drawn on the graph as labelled vertical lines, with the period after the last update shaded, and a card compares the average views per hour before and after that update.

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
3. **Open the pages:**
   - **Main news site:** `http://localhost:3000/`
   - **Staff login:** `http://localhost:3000/login.html` (demo users are listed above)
   - **Reporter desk:** `http://localhost:3000/reporter.html`
   - **Editor desk:** `http://localhost:3000/editor.html`
   - **Impact Analytics:** `http://localhost:3000/analytics.html`
   - **Data management (editors):** `http://localhost:3000/admin.html`
4. **Demonstrate Impact Analytics:**
   - Select the showcase article (*"דעה: החוסן הכלכלי של ישראל מול אתגרי השעה (מהדורה #151)"*).
   - Point out the metrics cards showing pre-update vs. post-update views and percentage growth.
   - Show the Chart.js curve highlighting the surge in readership following editorial updates.
5. **Demonstrate Real-Time AJAX Comments:**
   - Open any article page, add a comment, and show that it appears at the top instantly without reloading the page.
6. **Demonstrate Anti-Spam (3 comments/min limit):**
   - Post 4 comments in a row on an article page: the first 3 pass and the 4th is blocked with HTTP 429 and a countdown timer.
7. **Demonstrate Server Restart Resilience:**
   - Stop the server (`Ctrl+C`), start it again (`npm start`), and show that the spam block remains active!
