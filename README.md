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

No MongoDB at all? Set `USE_MEMORY_DB=true` in `.env`. The server then starts its own MongoDB and fills it with the demo data on the first run. Its files are kept in `data/local-db` (not committed), so articles, drafts and logins survive a server restart. Delete that folder to start again from fresh demo data, or set `MEMORY_DB_PERSIST=false` for a throwaway database. It is refused in production.

### Demo data

```bash
npm run seed
```

Wipes the database and creates 520 articles in every status (including published articles whose update waits for the editor or was sent back for fixes), 6 users, comments, and a historical view curve for the Impact Analytics graph. It refuses to run when `NODE_ENV=production`.

Demo users (password `password123`): `sarah_editor`, `yossi_editor`, `dan_reporter`, `michal_reporter`, `ron_reporter`, `noa_reporter`.

### Creating accounts

There is **no public sign-up**. Accounts (reporters and editors) are created by an editor in the management page (`/admin.html`, tab "משתמשים"), or through the user management API (see below). The very first editor can be created from the command line:

```bash
npm run create-editor -- <username> <password> "<full name>"
```

### Tests

```bash
npm test          # server + static front-end checks (fast, needs nothing but Node)
npm run test:ui   # the real-browser "button checker" and the requirement flows (needs Chrome, Edge or Chromium)
npm run test:all  # both
```

Every test file starts its own temporary in-memory MongoDB, so tests never touch your real database. The suite covers:

- **The server:** every API route, roles and permissions, the article workflow, comments and the spam limit, analytics, password storage (it reads the raw MongoDB documents), user management and login throttling.
- **The front-end, static** (`tests/frontendChecks.test.js`): every page parses, every `data-action` button has a handler, every shared helper a page calls is loaded, every link and every API address a page uses really exists, every icon exists, all pages are built from the same design system, permissions are never decided from data the visitor can edit, and **no external UI framework or library is used** (only the technologies of the course; Chart.js and Google Fonts are the only external resources).
- **Regressions from the manual QA** (`tests/qaRegression.test.js`): exact dashboard counters, paging without repeated or skipped articles, the viewed filter, clean deletes, error pages and the favicon.
- **The browser tests** (`tests/ui/`, `npm run test:ui`) drive a real Chrome/Edge with real clicks and typing, against the app filled with the demo data (520 articles). No extra package is needed: `tests/ui/browser.js` talks to the installed browser through the Chrome DevTools Protocol with Node's built-in WebSocket. Set `CHROME_PATH` to use another browser; without one the browser tests are skipped with a message.
  - `siteCrawler.test.js` is the **button checker**. It opens every page at the size of a computer, a tablet and a phone (plus dark theme and the smallest phone), uses every field, presses every kind of button (including the ones inside dialogs) and clicks every link. After each step it checks that: there is no script error, failed request or native pop-up; a dialog fits the screen and closes with Escape; **nothing is cut off or sticks out of the screen, nothing lies on top of a button so that a click would miss it**, buttons are big enough for a finger, and every control has an accessible name.
  - `userFlows.test.js` checks the requirements of the assignment through the real screens: infinite scroll (20 more articles by themselves), search / section / seen-not-seen / sorting without a page reload, the article page and instant comments (no more than 3 a minute), login by role and permissions, writing with continuous auto-save, submitting, review (returning with a mandatory note, approving, editing a published article without changing what the readers see, the difference view), deleting, the Impact Analytics graph and its update markers, and full CRUD in the management page.

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
| `USE_MEMORY_DB` | `true` = the server starts its own MongoDB with demo data, kept in `data/local-db` (development only) |
| `MEMORY_DB_PERSIST` | `false` = with `USE_MEMORY_DB`, keep nothing on disk (everything is lost when the server stops) |

---

## 📁 Project Structure (MVC)

```text
the-daily-web/
├── Dockerfile, docker-compose.yml, .dockerignore
├── package.json
├── .env.example
├── public/                      # Static client: HTML, CSS, vanilla JS, images (no framework)
│   ├── index.html               # Public home page (lead story, feed, search, filters, infinite scroll, weather)
│   ├── login.html               # Staff login (no sign-up)
│   ├── portal.html              # Workspace home: what needs attention, links to the desks the user may open
│   ├── reporter.html            # Reporter desk (own articles, writing studio with auto-save)
│   ├── editor.html              # Editor desk (review, difference view, approve / return / direct edit / delete)
│   ├── analytics.html           # Impact Analytics graph (Chart.js)
│   ├── admin.html               # Editors: manage users, comments and view statistics (full CRUD)
│   ├── css/base.css             # Design tokens (colours, type, space; light + dark theme), reset, typography
│   ├── css/components.css       # Buttons, forms, cards, tables, dialogs, toasts, menus, tabs ...
│   ├── css/layout.css           # The two page frames: public header/footer and the staff sidebar
│   ├── css/pages.css            # Layouts of the individual pages
│   ├── js/theme.js              # Light / dark theme (remembered, applied before the first paint)
│   ├── js/icons.js              # Icon set as one SVG sprite (Lucide, ISC licence)
│   ├── js/common.js             # Shared helpers: api() for every server call, login state, formatting, weather
│   ├── js/ui.js                 # UI toolkit: data-action buttons, dialogs, confirm, toasts, menus, tabs
│   ├── js/shell.js              # Builds the page frame (public header + footer, or the staff sidebar)
│   ├── js/comments.js           # Comment list helpers (add a comment without reloading the list)
│   └── images/                  # Default article image and SVG assets
├── src/
│   ├── app.js                   # Express setup, middleware, routes
│   ├── server.js                # Entry point
│   ├── config/
│   │   ├── db.js                # MongoDB connection (optional built-in dev database)
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
│   └── views/                   # article.ejs (server-rendered article page, SEO) and error.ejs
└── tests/                       # node:test suites (+ helpers/testEnv.js)
    └── ui/                      # real-browser tests: browser.js (driver), audit.js, siteCrawler, userFlows
```

---

## 🎨 The interface

One design system for every page: the same colours, type, spacing, buttons, dialogs and icons, in a light and a dark theme (the choice is remembered; the system setting is the default). It is plain HTML, CSS (Flexbox and Grid, written with logical properties so it is right-to-left by design) and vanilla JavaScript: **no UI framework or library**.

- **Two page frames, built by `js/shell.js`:** readers get a header with the sections, a search box and the account menu; staff get a workspace sidebar (a drawer on phones) that shows only what their role may open.
- **No browser pop-ups:** questions ("delete this article?") are our own dialogs with focus kept inside, Escape to close and focus returned to the button that opened them; messages are toasts that never cover a button.
- **Every button is a `data-action`:** a button without a handler is reported in the console and fails the tests, so a dead button cannot hide.
- **Responsive:** computer, tablet and phone. Tables become cards on phones; the writing studio and the review screen become full-screen sheets.
- **Accessible:** semantic HTML5 landmarks, labelled fields, visible focus, keyboard use of dialogs / menus / tabs, reduced-motion support.
- **Permissions are decided by the server.** The browser only keeps a copy of the user's name for display; the role in the menus comes from the server's answer on every page load, and every API call is checked by the server again.

### Third-party assets (all free and permitted for this use)

| Asset | Used for | Licence |
| --- | --- | --- |
| [Lucide](https://lucide.dev) icons (embedded in `js/icons.js`) | Icons | ISC |
| [Heebo](https://fonts.google.com/specimen/Heebo), [Frank Ruhl Libre](https://fonts.google.com/specimen/Frank+Ruhl+Libre) via Google Fonts | Typefaces (fall back to system fonts when offline) | SIL Open Font License |
| [Chart.js](https://www.chartjs.org) 4.4.3 from jsDelivr | The Impact Analytics graph (allowed by the assignment) | MIT |
| [Unsplash](https://unsplash.com) photos used by the demo data | Article pictures | Unsplash License |

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
