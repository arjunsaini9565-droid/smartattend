# SmartAttend AI - Automated Attendance Management System

Face-recognition attendance for colleges and universities. Teachers start a session, students look at the camera and blink once, and attendance is recorded automatically - with duplicate prevention, anti-spoofing, manual correction with an audit trail, analytics, reports and role-based dashboards for **Admin**, **Teacher** and **Student**.

## Quick start (about 1 minute)

Requirements: **Node.js 22.13 or newer**. There are **no npm dependencies to install** to run the app.

```bash
cd smartattend
npm start            # http://localhost:3000  (sample data is created on first run)
```

Open http://localhost:3000 (camera access works on `localhost` or `https://` only).

| Role    | Email                                  | Password      |
|---------|----------------------------------------|---------------|
| Admin   | admin@smartattend.edu                  | Admin@123     |
| Teacher | ananya.sharma@smartattend.edu          | Teacher@123   |
| Student | aarav.mehta@student.smartattend.edu    | Student@123   |

Sample data: 3 departments, 3 courses, 10 subjects/classes, 5 teachers (+1 pending approval), 25 students and ~8 weeks of attendance history, including students deliberately below 75%.

### Try face recognition
1. Sign in as **Admin** (or a Teacher) > **Students** > **Enroll face** next to a student. Upload 1-3 clear front-facing photos, or use the camera tab.
2. Sign out, sign in as that student's **Teacher** > **My Classes** > **Start attendance** > **Start camera**.
3. The student looks at the camera and blinks once. They appear in the feed and roster as Present (or Late after the cut-off) with name, roll number, date and time.

The first time the camera page loads, face-api.js and its models (~6 MB) are downloaded from a CDN. For offline / campus-LAN use run **`npm run vendor:face`** once (needs internet) and the server will serve them locally.

## Features
- **Auth**: register (students instantly; teachers need admin approval), sign in/out, change password, login throttling, scrypt password hashing, signed role-based tokens.
- **AI attendance**: live camera, face detection + 128-d embeddings (face-api.js), server-side matching against the class roster only, ambiguity rejection, unknown-face handling, one record per student per session (database-enforced), late detection, blink-based liveness (anti-spoofing), camera permission/device error messages.
- **Face enrollment** by photo upload or camera; a face already enrolled for another student is refused. Face data is **AES-256-GCM encrypted** at rest; raw photos are never stored (only a small encrypted thumbnail).
- **Admin**: totals, add/edit/delete students and teachers, approve teachers, departments/courses/subjects/class assignments, settings (75% threshold, late cut-off), announcements, reports.
- **Teacher**: assigned classes, start/stop sessions, real-time roster, manual marking, corrections that require a reason and are written to an **audit trail**, PDF / Excel / CSV export.
- **Student**: overall %, subject-wise %, daily history with filters, present/late/absent, alerts under 75% (with "classes needed to recover") and notifications.
- **Analytics**: daily / weekly / monthly trends, per-subject bars, distribution, below-threshold list, date and class filters, search by name or roll number.
- Light/dark mode, responsive (desktop / tablet / phone), notifications bell, validation and clear success/error messages everywhere.

## Tech stack (and what differs from the brief)
| Brief | This build | Why |
|---|---|---|
| React.js | **React 19** (bundled with esbuild into `server/public`) | as requested |
| Node + Express | **Node.js built-in `http`** with a small router (`server/lib/http.js`) | zero dependencies, runs anywhere |
| MongoDB / Firebase | **SQLite** (`node:sqlite`, file `data/smartattend.db`) | no database server to install; all queries are in `server/` and easy to port |
| Chart.js / Recharts | **Custom SVG charts** (`client/src/charts.jsx`) | no dependency, theme-aware |
| face-api.js | **face-api.js** (`@vladmandic/face-api`, TinyFaceDetector + 68 landmarks + ResNet descriptors) | as requested |

## Project layout
```
server/index.js            HTTP server, auth middleware, static files
server/lib/                db, security (scrypt, JWT, AES-GCM), face matching, stats, exports (CSV/XLSX/PDF), seed
server/routes/             auth, academics, people (students/teachers/face), attendance, reports
client/src/                React app (pages/, ui.jsx, charts.jsx, face.js, styles.css)
scripts/build.js           bundles the client;  scripts/fetch-face-assets.js  downloads face models for offline use
test/api.test.js           backend tests (npm test);  test/e2e.browser.js  Playwright browser test
```

## Commands
```
npm start              run the server           npm run seed:reset   wipe and re-seed sample data
npm run dev            run with auto-restart    npm test             API tests
npm run build          rebuild the client (needs: npm i  - esbuild, react, react-dom)
npm run vendor:face    download face models for offline use
```
Environment variables: `PORT`, `HOST`, `DATA_DIR`, `FACE_THRESHOLD` (default 0.5, lower = stricter), `REQUIRE_LIVENESS=false` (disable blink check), `SSL_KEY` + `SSL_CERT` (serve HTTPS so cameras work from other devices on your network), `JWT_SECRET` / `FACE_KEY` (64 hex chars; auto-generated into `data/` if unset).

## Security notes and limits - please read before real deployment
- **Anti-spoofing is basic**: it requires a natural blink, which defeats printed photos and most static images, but **not** video replays or masks. For high-stakes use add a dedicated liveness model/hardware and have a teacher supervise.
- Face recognition accuracy depends on lighting, camera and enrollment quality (enroll 2-3 photos). Always keep the manual option for edge cases.
- Biometric data is regulated in many places (e.g. GDPR, India's DPDP Act). Get student consent, define retention, and protect `data/` (it holds the database and the encryption key `face.key`; back both up together).
- Put the app behind HTTPS in production and change the demo passwords. Face keys in `data/*.key` are generated on first run.
