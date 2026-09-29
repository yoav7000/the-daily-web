# The Daily Web - News Management & Publishing Portal

A modern web application for news management, editing, and publishing based on MVC architecture and standard server/client technologies.

---

## 🚀 Quick Start (Docker - Recommended)

### Prerequisites:
- **Docker Desktop**

### 1. Launch Everything (App + MongoDB):
```bash
docker compose up -d --build
```
This single command:
1. Builds and starts the Express application container on port `3000`.
2. Starts the MongoDB container on port `27017` with persistent volume storage.
3. Automatically mounts your local `./src`, `./views`, and `./public` folders for live hot updates.

Access the application at: **`http://localhost:3000`**  
Access the interactive test lab at: **`http://localhost:3000/test.html`**

### 2. View Logs & Status:
```bash
docker compose logs -f app
```

### 3. Stop Containers:
```bash
docker compose down
```

---

## 💻 Alternative: Local Node.js Development

If you prefer running Node.js directly on your host machine:

1. **Start only the MongoDB container:**
   ```bash
   docker compose up -d mongodb
   ```
2. **Install dependencies:**
   ```bash
   npm install
   ```
3. **Configure environment:**
   ```bash
   cp .env.example .env
   ```
4. **Run the server:**
   ```bash
   npm run dev
   ```
5. **Run tests:**
   ```bash
   npm test
   ```

---

## 📁 Project Structure (MVC Pattern)

```text
the-daily-web/
├── Dockerfile                 # Node.js Alpine container definition
├── docker-compose.yml          # Multi-container setup (Express App + MongoDB)
├── .dockerignore              # Prevents unnecessary files from container builds
├── package.json               # Project manifest and allowed dependencies
├── .gitignore                 # Excludes secrets (.env), logs, and node_modules
├── .env.example               # Environment variable template
├── README.md                  # Project documentation
├── public/
│   └── test.html              # Interactive visual testing workbench
├── src/
│   ├── app.js                 # Express application initialization & middleware setup
│   ├── server.js              # Server entrypoint and MongoDB connection
│   ├── config/
│   │   └── db.js              # Mongoose connection with event listeners and retry logic
│   ├── constants/
│   │   └── articleConstants.js# Article statuses (Draft, Pending Approval, Published, Revision Requested)
│   ├── models/
│   │   ├── User.js            # User model (Reporter, Editor, Guest roles) with bcrypt password hashing
│   │   ├── Article.js         # Article model with 4-state lifecycle, draft subdocument, and revisions history
│   │   ├── Comment.js         # Comment model with anti-spam indexing (3 comments/min limit)
│   │   └── ViewStat.js        # View statistics model for Impact Analytics graph
│   ├── middleware/
│   │   ├── auth.js            # JWT auth & server restart persistence, role-based access control
│   │   ├── commentRateLimiter.js # Anti-spam middleware: blocks >3 comments/min with restart persistence
│   │   ├── errorHandler.js    # Centralized error handler and logging to error.log
│   │   └── requestLogger.js   # Operational event logging to operations.log
│   ├── controllers/
│   │   ├── articleController.js   # Core article logic, auto-save, draft versioning, and editor approvals
│   │   ├── authController.js      # Registration, login, and token generation
│   │   ├── commentController.js   # Full CRUD for comments, text search, and pagination
│   │   └── analyticsController.js # Scalable time-bucketed view tracking & Impact Analytics
│   ├── routes/
│   │   ├── articleRoutes.js   # RESTful routes for articles (reporters, editors, public)
│   │   ├── authRoutes.js      # Authentication endpoints
│   │   ├── commentRoutes.js   # Public & moderated comments endpoints
│   │   └── analyticsRoutes.js # View recording, impact data, and CRUD statistics
│   └── scripts/
│       └── seed.js            # Database seeder (520 articles, 6 users, comments & analytics history)
└── tests/
    ├── articleWorkflow.test.js    # Unit and state-machine test suite
    ├── articleApi.test.js         # End-to-end RESTful API integration tests
    └── commentsAnalytics.test.js  # Comments, rate-limiting, and analytics integration tests
```

---

## 💡 Core Features & Business Logic (Team Member 2: Article Lifecycle & Workflows)

1. **Article State Machine:**
   - **"In Preparation" (`draft`)**: Initial state when created by a reporter.
   - **"Pending Approval" (`pending_approval`)**: Submitted by the reporter for editorial review.
   - **"Published" (`published`)**: Approved by an editor and visible to public readers.
   - **"Returned for Revisions" (`revision_requested`)**: Returned by an editor with **mandatory feedback notes**. The reporter can revise and resubmit.
   - Illegal state transitions are strictly blocked at the server level.

2. **Continuous Auto-Save:**
   - Dedicated endpoints (`PUT /api/articles/:id/autosave` and `POST /api/articles/autosave`) save work continuously to MongoDB in the background.
   - Closing the browser, refreshing the page, or switching computers does not cause any data loss.

3. **Editing Already-Published Articles:**
   - When editing an existing published article, edits are stored in an isolated `draftVersion` subdocument.
   - **The public audience continues seeing the latest approved version** without interruption during drafting and review.
   - Editors can view a side-by-side comparison (diff) between the currently published content and the proposed revision.
   - Only upon editor approval does the revision overwrite the public content, recording a timestamp in `revisionsHistory` for the **Impact Analytics** timeline.

4. **Security, Persistence & Logging:**
   - Server-side role enforcement (reporters can only edit their own articles; editors can review, edit, approve, return, or delete).
   - Passwords hashed using `bcrypt` (never plaintext, irreversible).
   - Authentication survives server restarts without requiring re-login.
   - Error logs (`logs/error.log`) and operational logs (`logs/operations.log`).

---

## 📊 Core Features & Business Logic (Team Member 5: Comments, Anti-Spam, Analytics & Seeder)

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
3. **Open the Test Labs:**
   - **Article Workflow Lab (Member 2):** `http://localhost:3000/test.html`
   - **Impact Analytics & Comments Lab (Member 5):** `http://localhost:3000/analytics.html`
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
