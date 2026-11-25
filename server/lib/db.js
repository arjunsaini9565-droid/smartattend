'use strict';
// SQLite persistence via Node's built-in node:sqlite (no native modules needed).
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { DATA_DIR } = require('./security');

const file = process.env.DB_FILE || path.join(DATA_DIR, 'smartattend.db');
const db = new DatabaseSync(file);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS departments (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, code TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS courses (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, code TEXT NOT NULL UNIQUE,
  department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE RESTRICT, semesters INTEGER NOT NULL DEFAULT 8);
CREATE TABLE IF NOT EXISTS subjects (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, code TEXT NOT NULL UNIQUE,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE RESTRICT, semester INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','teacher','student')), active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')), last_login TEXT);
CREATE TABLE IF NOT EXISTS teachers (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL UNIQUE, department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL, phone TEXT);
CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  roll_no TEXT NOT NULL UNIQUE, course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
  semester INTEGER NOT NULL DEFAULT 1, section TEXT, phone TEXT,
  face_data TEXT,            -- AES-256-GCM encrypted JSON array of 128-d descriptors
  photo TEXT,                -- AES-256-GCM encrypted thumbnail (data URL)
  face_samples INTEGER NOT NULL DEFAULT 0, face_updated_at TEXT);
CREATE TABLE IF NOT EXISTS classes (
  id INTEGER PRIMARY KEY, subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE RESTRICT,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE, semester INTEGER NOT NULL,
  section TEXT, schedule TEXT, UNIQUE(subject_id, teacher_id, course_id, semester, section));
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY, class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  date TEXT NOT NULL, started_at TEXT NOT NULL, ended_at TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed')),
  late_after INTEGER NOT NULL DEFAULT 10, started_by INTEGER REFERENCES users(id));
CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY, session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('present','late','absent')),
  marked_at TEXT NOT NULL, method TEXT NOT NULL CHECK (method IN ('face','manual','auto')), confidence REAL,
  UNIQUE(session_id, student_id));
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY, session_id INTEGER NOT NULL, student_id INTEGER NOT NULL,
  old_status TEXT, new_status TEXT NOT NULL, changed_by INTEGER REFERENCES users(id),
  reason TEXT, changed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')));
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'info', title TEXT NOT NULL, message TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')));
CREATE INDEX IF NOT EXISTS idx_att_student ON attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_att_session ON attendance(session_id);
CREATE INDEX IF NOT EXISTS idx_sess_class ON sessions(class_id, date);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, is_read);
`);

const q = {
  all: (sql, ...p) => db.prepare(sql).all(...p),
  get: (sql, ...p) => db.prepare(sql).get(...p),
  run: (sql, ...p) => db.prepare(sql).run(...p),
};
function tx(fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}
function getSetting(key, fallback) {
  const r = q.get('SELECT value FROM settings WHERE key = ?', key);
  return r ? JSON.parse(r.value) : fallback;
}
function setSetting(key, value) {
  q.run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', key, JSON.stringify(value));
}

// Local-date helpers (server local time defines "today")
const pad = (n) => String(n).padStart(2, '0');
const localDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

module.exports = { db, q, tx, getSetting, setSetting, localDate };
