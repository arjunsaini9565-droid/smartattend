'use strict';
const { q } = require('./db');
const { HttpError } = require('./http');

const teacherRow = (user) => q.get('SELECT id FROM teachers WHERE user_id=?', user.id);
const studentRow = (user) => q.get('SELECT * FROM students WHERE user_id=?', user.id);

// Class ids a teacher owns (admin: null = unrestricted)
function ownedClassIds(user) {
  if (user.role === 'admin') return null;
  const t = teacherRow(user);
  return t ? q.all('SELECT id FROM classes WHERE teacher_id=?', t.id).map((r) => r.id) : [];
}
function requireClass(user, classId) {
  const cls = q.get(`SELECT c.*, sub.name AS subject, sub.code AS subject_code, co.name AS course_name, co.code AS course_code
    FROM classes c JOIN subjects sub ON sub.id=c.subject_id JOIN courses co ON co.id=c.course_id WHERE c.id=?`, classId);
  if (!cls) throw new HttpError(404, 'Class not found');
  if (user.role !== 'admin') {
    const t = teacherRow(user);
    if (!t || t.id !== cls.teacher_id) throw new HttpError(403, 'You are not assigned to this class');
  }
  return cls;
}
function requireSession(user, sessionId) {
  const s = q.get('SELECT * FROM sessions WHERE id=?', sessionId);
  if (!s) throw new HttpError(404, 'Session not found');
  return { session: s, cls: requireClass(user, s.class_id) };
}
// Students who belong to a class (same course + semester)
const rosterOf = (cls) => q.all(`SELECT st.id, st.roll_no, st.face_data, st.face_updated_at, st.face_samples, u.name
  FROM students st JOIN users u ON u.id=st.user_id WHERE st.course_id=? AND st.semester=? AND u.active=1 ORDER BY st.roll_no`, cls.course_id, cls.semester);

module.exports = { teacherRow, studentRow, ownedClassIds, requireClass, requireSession, rosterOf };
