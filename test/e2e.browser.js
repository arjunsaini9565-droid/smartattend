'use strict';
// Browser end-to-end test (Playwright + Chromium with a fake webcam).
// Run: node test/e2e.browser.js   (needs `npm run build` first, and playwright installed)
// If the face-api CDN is unreachable (offline CI), a small stub of the face-api interface is used so the
// camera / enrollment / recognition wiring can still be verified. Set REAL_FACEAPI=1 to use the real library.
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
const { createRequire } = require('node:module');
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = createRequire('/opt/npm-tools/node_modules/')('playwright')); }

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'smartattend-e2e-'));
const { server } = require('../server/index.js'); const { seedIfEmpty } = require('../server/lib/seed.js');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'smartattend-shots'); fs.mkdirSync(SHOTS, { recursive: true });

const rng = (seed) => { let a = seed; return () => { a = (a * 1664525 + 1013904223) % 4294967296; return a / 4294967296 - 0.5; }; };
const person = (seed) => { const r = rng(seed); return Array.from({ length: 128 }, () => r() * 0.35); };
const noisy = (d, seed) => { const r = rng(seed); return d.map((x) => x + r() * 0.02); };

// Minimal stand-in for window.faceapi, driven by window.__desc and a blinking eye aspect ratio.
const STUB = `
(function(){
  const pts = () => { const ear = (Date.now() % 2500) < 350 ? 0.12 : 0.30, h = ear * 5, p = [];
    for (let i = 0; i < 68; i++) p.push({ x: i, y: 0 });
    for (const s of [36, 42]) { p[s] = {x:0,y:0}; p[s+3] = {x:10,y:0}; p[s+1] = {x:3,y:-h}; p[s+5] = {x:3,y:h}; p[s+2] = {x:7,y:-h}; p[s+4] = {x:7,y:h}; }
    return p; };
  const run = (wantDesc) => (window.__noFace ? [] : [{ detection: { box: { x: 120, y: 80, width: 200, height: 240 } }, landmarks: { positions: pts() }, descriptor: new Float32Array(window.__desc || new Array(128).fill(0)) }]);
  const chain = () => { let d = false; const o = { withFaceLandmarks: () => o, withFaceDescriptors: () => { d = true; return o; }, then: (a, b) => Promise.resolve(run(d)).then(a, b) }; return o; };
  const net = { loadFromUri: async () => {} };
  window.faceapi = { tf: { setBackend: async () => {}, ready: async () => {} }, nets: { tinyFaceDetector: net, faceLandmark68Net: net, faceRecognitionNet: net }, TinyFaceDetectorOptions: function () {}, detectAllFaces: () => chain() };
})();`;

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failures++; };

(async () => {
  seedIfEmpty();
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 860 }, permissions: ['camera'], deviceScaleFactor: 1 });
  if (!process.env.REAL_FACEAPI) await ctx.route(/cdn\.jsdelivr\.net.*face-api\.js/, (r) => r.fulfill({ contentType: 'text/javascript', body: STUB }));
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  const shot = (n) => page.screenshot({ path: path.join(SHOTS, `${n}.png`) });
  const login = async (email, pw) => { await page.goto(base); await page.fill('input[type=email]', email); await page.fill('input[type=password]', pw); await page.click('button:has-text("Sign in") >> nth=-1'); await page.waitForSelector('.sidebar'); };
  const logout = async () => { await page.click('.sidebar-foot button:has-text("Sign out")'); await page.waitForSelector('.auth-card'); };

  // ---- auth page + validation ----
  await page.goto(base); await page.waitForSelector('.auth-card'); await shot('01-login');
  await page.click('button:has-text("Sign in") >> nth=-1'); ok(await page.locator('.field-error').count() >= 2, 'empty login shows validation errors');
  await page.fill('input[type=email]', 'admin@smartattend.edu'); await page.fill('input[type=password]', 'wrong-pass1'); await page.click('button:has-text("Sign in") >> nth=-1');
  await page.waitForSelector('.callout.danger'); ok(/Incorrect email or password/.test(await page.textContent('.callout.danger')), 'wrong password shows a clear error');
  await page.click('.tab:has-text("Register")'); await page.click('button:has-text("Create account")'); ok(await page.locator('.field-error').count() >= 4, 'registration validates required fields');
  await shot('02-register');
  await page.fill('input[autocomplete=name]', 'Priya Das'); await page.fill('input[autocomplete=email]', 'priya.das@student.smartattend.edu');
  await page.fill('input[placeholder="e.g. CS24015"]', 'CS24015'); await page.fill('input[type=number]', '3'); await page.selectOption('select >> nth=0', { label: 'B.Tech Computer Science (BTCSE)' });
  const pws = page.locator('input[autocomplete=new-password]'); await pws.nth(0).fill('Passw0rd1'); await pws.nth(1).fill('Passw0rd2'); await page.click('button:has-text("Create account")');
  ok(/do not match/.test(await page.textContent('.auth-card')), 'password mismatch caught');
  await pws.nth(1).fill('Passw0rd1'); await page.click('button:has-text("Create account")'); await page.waitForSelector('.toast-success'); ok(true, 'student self-registration succeeds');

  // ---- admin ----
  await page.click('.tab:has-text("Sign in")'); await page.waitForTimeout(200);
  await login('admin@smartattend.edu', 'Admin@123'); await page.waitForSelector('.stat'); await page.waitForSelector('svg[aria-label="Line chart"]'); await shot('03-admin-dashboard');
  ok((await page.textContent('.grid.stats')).includes('Total students'), 'admin dashboard shows totals');
  for (const [href, text] of [['/students', 'Students'], ['/teachers', 'Teachers'], ['/academics', 'Academics'], ['/reports', 'Reports'], ['/settings', 'Settings']]) {
    await page.click(`.nav-link[href="#${href}"]`); const shown = await page.waitForFunction((t) => document.querySelector('h1')?.textContent.includes(t), text, { timeout: 5000 }).then(() => true, () => false); ok(shown, `admin page ${href} renders`);
  }
  await page.click('.nav-link[href="#/academics"]'); await page.click('.tab:has-text("Class assignments")'); await page.waitForSelector('.table'); await shot('04-academics');
  await page.click('.nav-link[href="#/students"]'); await page.waitForSelector('.table tbody tr');
  await page.fill('.search input', 'CS24001'); await page.waitForTimeout(600); ok((await page.locator('.table tbody tr').count()) === 1, 'search by roll number filters students');
  // add student validation
  await page.click('.nav-link[href="#/students"]'); await page.click('button:has-text("Add student")'); await page.click('.modal button[type=submit]'); ok(await page.locator('.modal .field-error').count() >= 4, 'student form validates');
  await page.click('.modal button:has-text("Cancel")');

  // ---- face enrollment through the UI (upload a photo) ----
  const sharp = createRequire('/opt/npm-tools/node_modules/')('sharp'); const photo = path.join(process.env.DATA_DIR, 'face.png');
  await sharp({ create: { width: 480, height: 480, channels: 3, background: { r: 200, g: 160, b: 130 } } }).png().toFile(photo);
  const aarav = person(11); await page.evaluate((d) => { window.__desc = d; }, aarav);
  await page.fill('.search input', 'CS24001'); await page.waitForTimeout(600);
  await page.click('button:has-text("Enroll face")'); await page.waitForSelector('.dropzone'); await page.setInputFiles('.dropzone input', photo); await page.waitForSelector('.sample');
  await shot('05-enroll'); await page.click('.modal button:has-text("Save 1 sample")'); await page.waitForSelector('.toast-success'); ok(true, 'face enrolled via photo upload');
  await page.waitForTimeout(500); ok((await page.textContent('.table tbody')).includes('1 sample'), 'student row shows enrolled status');
  // the same face for another student must be rejected
  await page.fill('.search input', 'CS24002'); await page.waitForTimeout(600); await page.click('button:has-text("Enroll face")'); await page.waitForSelector('.dropzone'); await page.setInputFiles('.dropzone input', photo); await page.waitForSelector('.sample');
  await page.click('.modal button:has-text("Save 1 sample")'); await page.waitForSelector('.modal .callout.warn[role=alert]'); ok(/already enrolled/.test(await page.textContent('.modal .callout.warn')), 'duplicate face enrollment is blocked');
  await page.click('.modal button:has-text("Cancel")');
  // a no-face photo gives a friendly error
  await page.evaluate(() => { window.__noFace = true; }); await page.click('button:has-text("Enroll face")'); await page.waitForSelector('.dropzone'); await page.setInputFiles('.dropzone input', photo);
  await page.waitForSelector('.callout.warn[role=alert]'); ok(/No face found/.test(await page.textContent('.modal')), 'photo without a face shows a clear error'); await page.click('.modal button:has-text("Cancel")');
  await page.evaluate(() => { window.__noFace = false; });
  await logout();

  // ---- teacher live camera session ----
  await login('ananya.sharma@smartattend.edu', 'Teacher@123'); await page.waitForSelector('.stat'); await shot('06-teacher-dashboard');
  await page.click('.nav-link[href="#/classes"]'); await page.waitForSelector('.class-card'); await shot('07-classes');
  await page.click('.class-card:has-text("Data Structures") button:has-text("Start attendance")'); await page.click('.modal button:has-text("Start session")'); await page.waitForSelector('.camera-stage');
  await page.evaluate((d) => { window.__desc = d; }, noisy(aarav, 5));
  await page.click('button:has-text("Start camera")'); await page.waitForSelector('.feed-item.marked', { timeout: 20000 }); ok(true, 'camera started and a registered face was recognised');
  const feed = await page.textContent('.feed'); ok(/Aarav Mehta \(CS24001\)/.test(feed), 'feed shows name and roll number'); ok(/Present - \d+ \w+ \d{4}, \d{2}:\d{2}/.test(feed), 'feed shows date and time');
  await page.waitForTimeout(3500); await shot('08-live-session');
  ok(await page.locator('.feed-item.duplicate').count() >= 1 || (await page.locator('.feed-item.marked').count()) === 1, 'a second scan does not create a duplicate entry');
  const rowText = await page.textContent('.table tbody tr:has-text("CS24001")'); ok(/Present/.test(rowText) && /Face/.test(rowText), 'roster updates in real time with face method');
  await page.evaluate(() => { window.__noFace = true; }); await page.waitForTimeout(2200); await page.evaluate((d) => { window.__desc = d; window.__noFace = false; }, person(999)); await page.waitForSelector('.feed-item.unknown', { timeout: 20000 }); ok(true, 'unknown face is flagged and not marked');
  // manual attendance + correction with audit reason
  await page.click('tr:has-text("CS24003") button:has-text("Mark")'); await page.selectOption('.modal select', 'present'); await page.click('.modal button[type=submit]'); await page.waitForSelector('.toast-success'); ok(true, 'teacher marks a student manually');
  await page.click('tr:has-text("CS24003") button:has-text("Correct")'); await page.selectOption('.modal select', 'late'); await page.click('.modal button[type=submit]'); ok(/reason/i.test(await page.textContent('.modal .field-error')), 'corrections require a reason');
  await page.fill('.modal textarea', 'Arrived after the bell'); await page.click('.modal button[type=submit]'); await page.waitForSelector('.toast-success');
  await page.click('button:has-text("Stop camera")'); await page.click('button:has-text("Stop session")'); await page.click('.modal button:has-text("Stop session")'); await page.waitForSelector('.badge:has-text("Closed")'); ok(true, 'session stopped; absentees recorded'); await shot('09-session-closed');
  const dl = page.waitForEvent('download'); await page.click('button:has-text("PDF")'); const d1 = await dl; ok(/\.pdf$/.test(d1.suggestedFilename()), 'PDF report downloads');
  const dl2 = page.waitForEvent('download'); await page.click('button:has-text("Excel")'); ok(/\.xlsx$/.test((await dl2).suggestedFilename()), 'Excel report downloads');
  await page.click('.nav-link[href="#/audit"]'); await page.waitForSelector('h1:has-text("Audit trail")'); await page.waitForSelector('.table tbody tr'); ok((await page.textContent('.table')).includes('Arrived after the bell'), 'audit trail lists the correction'); await shot('10-audit');
  await page.click('.nav-link[href="#/reports"]'); await page.waitForSelector('svg[aria-label="Line chart"]'); await shot('11-reports');
  await page.click('.tab:has-text("Below threshold")'); await page.waitForSelector('.table'); await shot('12-below-threshold');
  await page.click('.tab:has-text("Attendance records")'); await page.waitForSelector('.table'); ok(true, 'records tab renders');
  const dl3 = page.waitForEvent('download'); await page.click('button:has-text("XLSX")'); ok(/\.xlsx$/.test((await dl3).suggestedFilename()), 'records export to Excel');
  await logout();

  // ---- student ----
  await login('ishita.agarwal@student.smartattend.edu', 'Student@123'); await page.waitForSelector('svg[aria-label^="Overall"]'); await shot('13-student-dashboard');
  const body = await page.textContent('.content'); ok(/Low attendance in/.test(body) || /Below requirement/.test(body), 'student below 75% sees an alert');
  ok(await page.locator('.pct-row').count() === 4, 'subject-wise attendance shown');
  await page.click('.nav-link[href="#/history"]'); await page.waitForSelector('.table'); await page.selectOption('select >> nth=1', 'absent'); await page.waitForTimeout(500); ok(!(await page.textContent('.table tbody')).includes('Present'), 'history filters by status');
  await page.fill('input[type=date] >> nth=0', '2026-12-30'); await page.waitForSelector('.field-error'); ok(true, 'invalid date range reported');
  await page.click('.nav-link[href="#/profile"]'); await page.fill('input[autocomplete=current-password]', 'Student@123'); const np = page.locator('input[autocomplete=new-password]'); await np.nth(0).fill('short'); await np.nth(1).fill('short'); await page.click('button:has-text("Update password")'); ok(await page.locator('.field-error').count() >= 1, 'weak new password rejected');
  await np.nth(0).fill('Newpass123'); await np.nth(1).fill('Newpass123'); await page.click('button:has-text("Update password")'); await page.waitForSelector('.toast-success'); ok(true, 'password change works');
  await page.click('.bell-wrap button'); await page.waitForSelector('.bell-menu'); await shot('14-notifications');
  // dark mode + mobile
  await page.click('button[aria-label="Switch to dark mode"]'); await page.click('.nav-link[href="#/"]'); await page.waitForSelector('svg[aria-label^="Overall"]'); await shot('15-student-dark');
  ok((await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark', 'dark mode toggles');
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(300); await shot('16-mobile-student');
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no horizontal scroll on mobile');
  await page.click('.menu-btn'); await page.waitForTimeout(300); await shot('17-mobile-menu'); await page.click('.scrim', { position: { x: 350, y: 500 } }); await page.click('.menu-btn'); await page.waitForTimeout(300); await logout();
  ok(!!(await page.locator('.auth-card').count()), 'sign out returns to login');

  // ---- camera permission error handling ----
  const ctx2 = await browser.newContext({ viewport: { width: 1360, height: 860 } }); if (!process.env.REAL_FACEAPI) await ctx2.route(/cdn\.jsdelivr\.net.*face-api\.js/, (r) => r.fulfill({ contentType: 'text/javascript', body: STUB }));
  await ctx2.addInitScript(() => { navigator.mediaDevices.getUserMedia = () => Promise.reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' })); });
  const p2 = await ctx2.newPage(); await p2.goto(base); await p2.fill('input[type=email]', 'ananya.sharma@smartattend.edu'); await p2.fill('input[type=password]', 'Teacher@123'); await p2.click('button:has-text("Sign in") >> nth=-1'); await p2.waitForSelector('.sidebar');
  await p2.click('.nav-link[href="#/classes"]'); await p2.click('.class-card:has-text("Data Structures") button:has-text("Start attendance")'); await p2.click('.modal button:has-text("Start session")'); await p2.waitForSelector('.camera-stage'); await p2.click('button:has-text("Start camera")'); await p2.waitForSelector('.callout.danger[role=alert]');
  ok(/permission was denied/i.test(await p2.textContent('.callout.danger')), 'camera permission denial shows a helpful message'); await p2.screenshot({ path: path.join(SHOTS, '18-camera-denied.png') });

  ok(errors.length === 0, `no browser console/page errors${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
  await browser.close(); server.close();
  console.log(`\n${failures ? failures + ' check(s) FAILED' : 'All browser checks passed'}. Screenshots: ${SHOTS}`); process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('E2E crashed:', e); process.exit(2); });
