'use strict';
// Shared attendance statistics. Only CLOSED sessions count toward percentages,
// so a class that is still in progress never skews anyone's numbers.
// "Attended" = present + late.
const { q, getSetting } = require('./db');

const BASE = `
FROM attendance a
JOIN sessions s ON s.id = a.session_id AND s.status = 'closed'
JOIN classes c ON c.id = s.class_id
JOIN subjects sub ON sub.id = c.subject_id
JOIN courses co ON co.id = c.course_id
JOIN students st ON st.id = a.student_id
JOIN users u ON u.id = st.user_id`;

// f: { classIds, classId, courseId, deptId, studentId, from, to, status, search }
function where(f = {}) {
  const w = []; const p = [];
  if (f.classIds) { if (!f.classIds.length) w.push('0'); else { w.push(`c.id IN (${f.classIds.map(() => '?').join(',')})`); p.push(...f.classIds); } }
  if (f.classId) { w.push('c.id = ?'); p.push(f.classId); }
  if (f.courseId) { w.push('c.course_id = ?'); p.push(f.courseId); }
  if (f.deptId) { w.push('co.department_id = ?'); p.push(f.deptId); }
  if (f.studentId) { w.push('a.student_id = ?'); p.push(f.studentId); }
  if (f.from) { w.push('s.date >= ?'); p.push(f.from); }
  if (f.to) { w.push('s.date <= ?'); p.push(f.to); }
  if (f.status) { w.push('a.status = ?'); p.push(f.status); }
  if (f.search) { w.push('(u.name LIKE ? OR st.roll_no LIKE ?)'); p.push(`%${f.search}%`, `%${f.search}%`); }
  return { sql: w.length ? ' WHERE ' + w.join(' AND ') : '', params: p };
}

const pct = (att, total) => (total ? Math.round((att / total) * 1000) / 10 : null);
const COUNTS = `SUM(a.status='present') AS present, SUM(a.status='late') AS late, SUM(a.status='absent') AS absent, COUNT(*) AS total`;

function totals(f) {
  const { sql, params } = where(f);
  const r = q.get(`SELECT ${COUNTS} ${BASE}${sql}`, ...params);
  const present = r.present || 0; const late = r.late || 0; const absent = r.absent || 0;
  return { present, late, absent, total: r.total || 0, pct: pct(present + late, r.total) };
}

function series(f, granularity) {
  const { sql, params } = where(f);
  const key = granularity === 'monthly' ? 'substr(s.date,1,7)' : granularity === 'weekly' ? "date(s.date,'weekday 0','-6 days')" : 's.date';
  const rows = q.all(`SELECT ${key} AS label, ${COUNTS} ${BASE}${sql} GROUP BY label ORDER BY label`, ...params);
  return rows.map((r) => ({ label: r.label, present: r.present, late: r.late, absent: r.absent, total: r.total, pct: pct(r.present + r.late, r.total) }));
}

function byClass(f) {
  const { sql, params } = where(f);
  return q.all(`SELECT c.id AS class_id, sub.name AS subject, sub.code AS code, co.code AS course, c.semester, ${COUNTS} ${BASE}${sql} GROUP BY c.id ORDER BY sub.name`, ...params)
    .map((r) => ({ ...r, present: r.present, pct: pct(r.present + r.late, r.total) }));
}

function perStudent(f) {
  const { sql, params } = where(f);
  return q.all(`SELECT st.id AS student_id, st.roll_no, u.name, co.code AS course, st.semester, ${COUNTS} ${BASE}${sql} GROUP BY st.id ORDER BY u.name`, ...params)
    .map((r) => ({ ...r, attended: r.present + r.late, pct: pct(r.present + r.late, r.total) }));
}

function subjectWise(studentId) {
  const { sql, params } = where({ studentId });
  return q.all(`SELECT c.id AS class_id, sub.name AS subject, sub.code AS code, tu.name AS teacher, ${COUNTS}
    ${BASE} JOIN teachers t ON t.id = c.teacher_id JOIN users tu ON tu.id = t.user_id${sql} GROUP BY c.id ORDER BY sub.name`, ...params)
    .map((r) => ({ ...r, attended: r.present + r.late, pct: pct(r.present + r.late, r.total) }));
}

function history(f, limit = 500, offset = 0) {
  const { sql, params } = where(f);
  const rows = q.all(`SELECT a.id, s.id AS session_id, s.date, s.started_at, a.marked_at, a.status, a.method, a.confidence,
      sub.name AS subject, sub.code AS code, c.id AS class_id, st.id AS student_id, st.roll_no, u.name AS student_name, co.code AS course
    ${BASE}${sql} ORDER BY s.date DESC, s.started_at DESC, u.name LIMIT ? OFFSET ?`, ...params, limit, offset);
  const total = q.get(`SELECT COUNT(*) AS n ${BASE}${sql}`, ...params).n;
  return { rows, total };
}

function lowAttendance(f, threshold = getSetting('threshold', 75)) {
  return perStudent(f).filter((s) => s.pct !== null && s.pct < threshold).sort((a, b) => a.pct - b.pct);
}

module.exports = { where, pct, totals, series, byClass, perStudent, subjectWise, history, lowAttendance, BASE };
