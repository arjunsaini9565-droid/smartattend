'use strict';
// Dashboards, analytics, student attendance views, notifications, reports and exports.
const { get, post, put, del, HttpError, validate } = require('../lib/http');
const { q, getSetting, setSetting, localDate } = require('../lib/db');
const stats = require('../lib/stats');
const exporter = require('../lib/export');
const { ownedClassIds, studentRow, teacherRow } = require('../lib/access');
const { notify } = require('../lib/notify');

const STAFF = ['admin', 'teacher'];
const iso = /^\d{4}-\d{2}-\d{2}$/;

// Build a stats filter from the query string, restricted to what the caller may see.
function scopeFilter(user, query) {
  const f = { classIds: ownedClassIds(user) };
  if (query.class_id) {
    const id = Number(query.class_id);
    if (f.classIds && !f.classIds.includes(id)) throw new HttpError(403, 'You are not assigned to this class');
    f.classId = id;
  }
  if (query.course_id) f.courseId = Number(query.course_id);
  if (query.dept_id) f.deptId = Number(query.dept_id);
  if (query.student_id) f.studentId = Number(query.student_id);
  if (query.from) { if (!iso.test(query.from)) throw new HttpError(422, 'Invalid "from" date'); f.from = query.from; }
  if (query.to) { if (!iso.test(query.to)) throw new HttpError(422, 'Invalid "to" date'); f.to = query.to; }
  if (f.from && f.to && f.from > f.to) throw new HttpError(422, 'The start date must be before the end date');
  if (query.status) { if (!['present', 'late', 'absent'].includes(query.status)) throw new HttpError(422, 'Invalid status'); f.status = query.status; }
  if (query.q) f.search = String(query.q).slice(0, 60);
  return f;
}
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return localDate(d); };

// ---------- admin overview ----------
get('/api/admin/stats', ['admin'], () => {
  const c = (sql) => q.get(sql).n;
  const overall = stats.totals({});
  const f30 = { from: daysAgo(30) };
  return {
    counts: {
      students: c("SELECT COUNT(*) AS n FROM students"), teachers: c("SELECT COUNT(*) AS n FROM teachers t JOIN users u ON u.id=t.user_id WHERE u.active=1"),
      pendingTeachers: c("SELECT COUNT(*) AS n FROM teachers t JOIN users u ON u.id=t.user_id WHERE u.active=0"),
      classes: c('SELECT COUNT(*) AS n FROM classes'), departments: c('SELECT COUNT(*) AS n FROM departments'), courses: c('SELECT COUNT(*) AS n FROM courses'),
      subjects: c('SELECT COUNT(*) AS n FROM subjects'), records: c('SELECT COUNT(*) AS n FROM attendance'), sessions: c("SELECT COUNT(*) AS n FROM sessions WHERE status='closed'"),
      activeSessions: c("SELECT COUNT(*) AS n FROM sessions WHERE status='active'"), faceEnrolled: c('SELECT COUNT(*) AS n FROM students WHERE face_samples>0'),
    },
    overall, threshold: getSetting('threshold', 75),
    daily: stats.series({ from: daysAgo(14) }, 'daily'), weekly: stats.series({ from: daysAgo(70) }, 'weekly'),
    byClass: stats.byClass(f30), lowCount: stats.lowAttendance({}).length,
    recentSessions: q.all(`SELECT s.id, s.date, s.status, s.started_at, sub.name AS subject, tu.name AS teacher,
      (SELECT COUNT(*) FROM attendance WHERE session_id=s.id AND status<>'absent') AS attended, (SELECT COUNT(*) FROM attendance WHERE session_id=s.id) AS total
      FROM sessions s JOIN classes c ON c.id=s.class_id JOIN subjects sub ON sub.id=c.subject_id JOIN teachers t ON t.id=c.teacher_id JOIN users tu ON tu.id=t.user_id
      ORDER BY s.started_at DESC LIMIT 8`),
  };
});

// ---------- analytics (admin: everything, teacher: own classes) ----------
get('/api/analytics', STAFF, ({ user, query }) => {
  const f = scopeFilter(user, query);
  const threshold = getSetting('threshold', 75);
  const from = f.from || daysAgo(90);
  const ff = { ...f, from };
  const perStudent = stats.perStudent(ff);
  const buckets = [{ label: '< 50%', min: 0, max: 50 }, { label: '50-64%', min: 50, max: 65 }, { label: '65-74%', min: 65, max: 75 }, { label: '75-89%', min: 75, max: 90 }, { label: '90-100%', min: 90, max: 101 }]
    .map((b) => ({ label: b.label, count: perStudent.filter((s) => s.pct !== null && s.pct >= b.min && s.pct < b.max).length }));
  return {
    threshold, from, summary: stats.totals(ff),
    daily: stats.series({ ...f, from: f.from || daysAgo(30) }, 'daily'), weekly: stats.series({ ...f, from: f.from || daysAgo(84) }, 'weekly'), monthly: stats.series(ff, 'monthly'),
    byClass: stats.byClass(ff), distribution: buckets,
    low: perStudent.filter((s) => s.pct !== null && s.pct < threshold).sort((a, b) => a.pct - b.pct),
    students: perStudent.length,
  };
});

// ---------- teacher home ----------
get('/api/teacher/overview', ['teacher'], ({ user }) => {
  const ids = ownedClassIds(user); const t = teacherRow(user);
  const today = localDate();
  return {
    classes: ids.length,
    students: ids.length ? q.get(`SELECT COUNT(DISTINCT st.id) AS n FROM students st JOIN classes c ON c.course_id=st.course_id AND c.semester=st.semester WHERE c.teacher_id=?`, t.id).n : 0,
    sessionsToday: ids.length ? q.get(`SELECT COUNT(*) AS n FROM sessions WHERE date=? AND class_id IN (${ids.map(() => '?').join(',')})`, today, ...ids).n : 0,
    activeSessions: ids.length ? q.all(`SELECT s.id, s.class_id, sub.name AS subject FROM sessions s JOIN classes c ON c.id=s.class_id JOIN subjects sub ON sub.id=c.subject_id WHERE s.status='active' AND s.class_id IN (${ids.map(() => '?').join(',')})`, ...ids) : [],
    overall: stats.totals({ classIds: ids, from: daysAgo(30) }), threshold: getSetting('threshold', 75),
    daily: stats.series({ classIds: ids, from: daysAgo(14) }, 'daily'), byClass: stats.byClass({ classIds: ids }),
    low: stats.lowAttendance({ classIds: ids }).slice(0, 8),
  };
});

// ---------- student views ----------
function studentSummary(student, query = {}) {
  const threshold = getSetting('threshold', 75);
  const f = { studentId: student.id };
  const subjects = stats.subjectWise(student.id).map((s) => ({ ...s, below: s.pct !== null && s.pct < threshold,
    // sessions that must still be attended (all remaining) to climb back to the threshold: ceil((t*total - 100*attended) / (100 - t))
    needed: s.pct !== null && s.pct < threshold ? Math.ceil((threshold * s.total - 100 * s.attended) / (100 - threshold)) : 0 }));
  const hf = { ...f, from: query.from || undefined, to: query.to || undefined, status: query.status || undefined, classId: Number(query.class_id) || undefined };
  const limit = Math.min(Number(query.limit) || 25, 200); const page = Math.max(Number(query.page) || 1, 1);
  const h = stats.history(hf, limit, (page - 1) * limit);
  return {
    student, threshold, overall: stats.totals(f), subjects,
    alerts: subjects.filter((s) => s.below).map((s) => ({ class_id: s.class_id, subject: s.subject, pct: s.pct, needed: s.needed })),
    weekly: stats.series({ ...f, from: daysAgo(84) }, 'weekly'), monthly: stats.series({ ...f, from: daysAgo(180) }, 'monthly'), daily: stats.series({ ...f, from: daysAgo(30) }, 'daily'),
    history: h.rows, historyTotal: h.total, page, pages: Math.max(1, Math.ceil(h.total / limit)),
  };
}
get('/api/me/attendance', ['student'], ({ user, query }) => {
  const s = studentRow(user); if (!s) throw new HttpError(404, 'Student profile not found');
  const info = q.get(`SELECT st.id, st.roll_no, u.name, co.name AS course_name, st.semester FROM students st JOIN users u ON u.id=st.user_id JOIN courses co ON co.id=st.course_id WHERE st.id=?`, s.id);
  return studentSummary(info, query);
});
get('/api/students/:id/attendance', STAFF, ({ user, params, query }) => {
  const info = q.get(`SELECT st.id, st.roll_no, u.name, co.name AS course_name, st.semester, st.course_id FROM students st JOIN users u ON u.id=st.user_id JOIN courses co ON co.id=st.course_id WHERE st.id=?`, params.id);
  if (!info) throw new HttpError(404, 'Student not found');
  if (user.role === 'teacher' && !q.get('SELECT 1 FROM classes WHERE teacher_id=? AND course_id=? AND semester=?', teacherRow(user)?.id ?? -1, info.course_id, info.semester)) throw new HttpError(403, 'This student is not in any of your classes');
  return studentSummary(info, query);
});

// ---------- reports / exports ----------
const DETAIL_COLS = [
  { key: 'date', label: 'Date', width: 12 }, { key: 'time', label: 'Time', width: 10 }, { key: 'roll_no', label: 'Roll No', width: 12 }, { key: 'student_name', label: 'Student', width: 24 },
  { key: 'subject', label: 'Subject', width: 28 }, { key: 'status', label: 'Status', width: 10 }, { key: 'method', label: 'Method', width: 10 }, { key: 'match', label: 'Match %', width: 10 },
];
const SUMMARY_COLS = [
  { key: 'roll_no', label: 'Roll No', width: 12 }, { key: 'name', label: 'Student', width: 26 }, { key: 'course', label: 'Course', width: 10 }, { key: 'present', label: 'Present', width: 9 },
  { key: 'late', label: 'Late', width: 8 }, { key: 'absent', label: 'Absent', width: 9 }, { key: 'total', label: 'Total', width: 8 }, { key: 'pct', label: 'Attendance %', width: 13 }, { key: 'flag', label: 'Status', width: 14 },
];
const fmtTime = (iso) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

get('/api/reports/attendance', STAFF, ({ user, query }) => {
  const f = scopeFilter(user, query);
  const view = query.view === 'summary' ? 'summary' : 'detail';
  const format = ['json', 'csv', 'xlsx', 'pdf'].includes(query.format) ? query.format : 'json';
  const threshold = getSetting('threshold', 75);
  let columns; let rows;
  if (view === 'summary') {
    columns = SUMMARY_COLS;
    rows = stats.perStudent(f).map((s) => ({ ...s, flag: s.pct !== null && s.pct < threshold ? 'Below ' + threshold + '%' : 'OK' }));
    if (query.below === '1') rows = rows.filter((r) => r.flag !== 'OK');
  } else {
    columns = DETAIL_COLS;
    rows = stats.history(f, format === 'json' ? 1000 : 50000, 0).rows.map((r) => ({ ...r, time: fmtTime(r.marked_at), match: r.confidence ? Math.round(r.confidence * 100) : '' }));
  }
  if (format === 'json') return { view, columns, rows, truncated: view === 'detail' && rows.length >= 1000, threshold };

  const instName = getSetting('institution', 'SmartAttend');
  const parts = [];
  const cls = f.classId ? q.get('SELECT sub.name FROM classes c JOIN subjects sub ON sub.id=c.subject_id WHERE c.id=?', f.classId) : null;
  if (cls) parts.push(cls.name);
  if (f.from || f.to) parts.push(`${f.from || '...'} to ${f.to || '...'}`);
  if (f.status) parts.push(`status: ${f.status}`);
  const title = `${view === 'summary' ? 'Attendance Summary' : 'Attendance Detail'} Report`;
  const subtitle = `${instName}${parts.length ? '  |  ' + parts.join('  |  ') : ''}  |  ${rows.length} record(s)`;
  const stamp = localDate();
  if (format === 'csv') return { __raw: true, type: 'text/csv; charset=utf-8', filename: `attendance-${view}-${stamp}.csv`, body: Buffer.from(exporter.csv(columns, rows), 'utf8') };
  if (format === 'xlsx') return { __raw: true, type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', filename: `attendance-${view}-${stamp}.xlsx`, body: exporter.xlsx('Attendance', columns, rows, `${title} - ${subtitle}`) };
  return { __raw: true, type: 'application/pdf', filename: `attendance-${view}-${stamp}.pdf`, body: exporter.pdf(title, subtitle, columns, rows) };
});

// ---------- notifications ----------
get('/api/notifications', ['*'], ({ user }) => ({
  items: q.all('SELECT id,type,title,message,is_read,created_at FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 60', user.id).map((n) => ({ ...n, is_read: !!n.is_read })),
  unread: q.get('SELECT COUNT(*) AS n FROM notifications WHERE user_id=? AND is_read=0', user.id).n,
}));
post('/api/notifications/read', ['*'], ({ user, body }) => {
  if (Array.isArray(body.ids) && body.ids.length) for (const id of body.ids.slice(0, 100)) q.run('UPDATE notifications SET is_read=1 WHERE id=? AND user_id=?', Number(id), user.id);
  else q.run('UPDATE notifications SET is_read=1 WHERE user_id=?', user.id);
  return { ok: true };
});
del('/api/notifications/:id', ['*'], ({ user, params }) => { q.run('DELETE FROM notifications WHERE id=? AND user_id=?', params.id, user.id); return { ok: true }; });
post('/api/notifications/broadcast', ['admin'], ({ body }) => {
  const v = validate(body, { audience: { type: 'enum', values: ['all', 'students', 'teachers'], required: true, label: 'Audience' }, title: { required: true, min: 3, max: 80, label: 'Title' }, message: { required: true, min: 3, max: 400, label: 'Message' } });
  const roles = v.audience === 'all' ? ['student', 'teacher'] : [v.audience.slice(0, -1)];
  let n = 0;
  for (const u of q.all(`SELECT id FROM users WHERE active=1 AND role IN (${roles.map(() => '?').join(',')})`, ...roles)) { notify(u.id, 'info', v.title, v.message); n++; }
  return { ok: true, sent: n };
});

// ---------- settings ----------
get('/api/settings', ['*'], () => ({ threshold: getSetting('threshold', 75), lateAfter: getSetting('lateAfter', 10), institution: getSetting('institution', 'SmartAttend University') }));
put('/api/settings', ['admin'], ({ body }) => {
  const v = validate(body, { threshold: { type: 'int', min: 1, max: 100, required: true, label: 'Attendance threshold' }, lateAfter: { type: 'int', min: 1, max: 120, required: true, label: 'Late after (minutes)' }, institution: { required: true, min: 2, max: 80, label: 'Institution name' } });
  setSetting('threshold', v.threshold); setSetting('lateAfter', v.lateAfter); setSetting('institution', v.institution); return { ok: true };
});
