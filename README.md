# The Daily Web - News Management & Publishing Portal

A modern web application for news management, editing, and publishing based on MVC architecture and standard server/client technologies.

---

## 🚀 Installation & Getting Started

### Prerequisites:
- **Node.js** (v18 or newer)
- **Docker Desktop** (for running MongoDB in an isolated container)

### 1. Start the Database (MongoDB via Docker):
```bash
docker compose up -d
```
This starts a MongoDB container on default port `27017` with persistent volume storage (`mongo_data`).

### 2. Install Dependencies:
```bash
npm install
```

### 3. Environment Configuration:
Copy the `.env.example` file to `.env`:
```bash
cp .env.example .env
```

### 4. Run the Application:
- **Development Mode (with auto-reload):**
  ```bash
  npm run dev
  ```
- **Standard Mode:**
  ```bash
  npm start
  ```
The server will be available at: `http://localhost:3000`

### 5. Run Automated Tests:
```bash
npm test
```

---

## 📁 Project Structure (MVC Pattern)

```text
the-daily-web/
├── docker-compose.yml          # MongoDB container service configuration
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
│   │   ├── errorHandler.js    # Centralized error handler and logging to error.log
│   │   └── requestLogger.js   # Operational event logging to operations.log
│   ├── controllers/
│   │   ├── articleController.js # Core article logic, auto-save, draft versioning, and editor approvals
│   │   └── authController.js    # Registration, login, and token generation
│   └── routes/
│       ├── articleRoutes.js   # RESTful routes for articles (reporters, editors, public)
│       └── authRoutes.js      # Authentication endpoints
└── tests/
    ├── articleWorkflow.test.js # Unit and state-machine test suite
    └── articleApi.test.js      # End-to-end RESTful API integration tests
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
