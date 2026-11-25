'use strict';
// Departments, courses, subjects and classes (a class = subject + teacher + course/semester).
const { get, post, put, del, HttpError, validate } = require('../lib/http');
const { q } = require('../lib/db');
const { teacherRow, studentRow } = require('../lib/access');

const ANY = ['*']; const ADMIN = ['admin'];
const codePat = /^[A-Za-z0-9-]+$/;

// Public lists used by the registration form
get('/api/public/meta', null, () => ({
  departments: q.all('SELECT id,name,code FROM departments ORDER BY name'),
  courses: q.all('SELECT id,name,code,department_id,semesters FROM courses ORDER BY name'),
}));

// ---- departments ----
get('/api/departments', ANY, () => ({ items: q.all(`SELECT d.*, (SELECT COUNT(*) FROM courses WHERE department_id=d.id) AS courses,
  (SELECT COUNT(*) FROM teachers WHERE department_id=d.id) AS teachers FROM departments d ORDER BY d.name`) }));
const deptRules = { name: { required: true, min: 2, max: 80, label: 'Department name' }, code: { required: true, max: 10, label: 'Code', pattern: codePat, message: 'Code may only contain letters, digits and -' } };
post('/api/departments', ADMIN, ({ body }) => { const v = validate(body, deptRules); v.code = v.code.toUpperCase();
  return { id: Number(q.run('INSERT INTO departments(name,code) VALUES(?,?)', v.name, v.code).lastInsertRowid) }; });
put('/api/departments/:id', ADMIN, ({ params, body }) => { const v = validate(body, deptRules);
  if (!q.run('UPDATE departments SET name=?, code=? WHERE id=?', v.name, v.code.toUpperCase(), params.id).changes) throw new HttpError(404, 'Department not found'); return { ok: true }; });
del('/api/departments/:id', ADMIN, ({ params }) => { if (!q.run('DELETE FROM departments WHERE id=?', params.id).changes) throw new HttpError(404, 'Department not found'); return { ok: true }; });

// ---- courses ----
get('/api/courses', ANY, () => ({ items: q.all(`SELECT co.*, d.name AS department_name, (SELECT COUNT(*) FROM students WHERE course_id=co.id) AS students,
  (SELECT COUNT(*) FROM subjects WHERE course_id=co.id) AS subjects FROM courses co JOIN departments d ON d.id=co.department_id ORDER BY co.name`) }));
const courseRules = { name: { required: true, min: 2, max: 80, label: 'Course name' }, code: { required: true, max: 12, label: 'Code', pattern: codePat, message: 'Code may only contain letters, digits and -' },
  department_id: { type: 'int', required: true, label: 'Department' }, semesters: { type: 'int', min: 1, max: 12, default: 8, label: 'Semesters' } };
post('/api/courses', ADMIN, ({ body }) => { const v = validate(body, courseRules);
  return { id: Number(q.run('INSERT INTO courses(name,code,department_id,semesters) VALUES(?,?,?,?)', v.name, v.code.toUpperCase(), v.department_id, v.semesters).lastInsertRowid) }; });
put('/api/courses/:id', ADMIN, ({ params, body }) => { const v = validate(body, courseRules);
  if (!q.run('UPDATE courses SET name=?, code=?, department_id=?, semesters=? WHERE id=?', v.name, v.code.toUpperCase(), v.department_id, v.semesters, params.id).changes) throw new HttpError(404, 'Course not found'); return { ok: true }; });
del('/api/courses/:id', ADMIN, ({ params }) => { if (!q.run('DELETE FROM courses WHERE id=?', params.id).changes) throw new HttpError(404, 'Course not found'); return { ok: true }; });

// ---- subjects ----
get('/api/subjects', ANY, ({ query }) => {
  const cid = Number(query.course_id) || null;
  return { items: q.all(`SELECT s.*, co.name AS course_name, co.code AS course_code FROM subjects s JOIN courses co ON co.id=s.course_id
    ${cid ? 'WHERE s.course_id=?' : ''} ORDER BY co.name, s.semester, s.name`, ...(cid ? [cid] : [])) };
});
const subjRules = { name: { required: true, min: 2, max: 80, label: 'Subject name' }, code: { required: true, max: 12, label: 'Code', pattern: codePat, message: 'Code may only contain letters, digits and -' },
  course_id: { type: 'int', required: true, label: 'Course' }, semester: { type: 'int', required: true, min: 1, max: 12, label: 'Semester' } };
post('/api/subjects', ADMIN, ({ body }) => { const v = validate(body, subjRules);
  return { id: Number(q.run('INSERT INTO subjects(name,code,course_id,semester) VALUES(?,?,?,?)', v.name, v.code.toUpperCase(), v.course_id, v.semester).lastInsertRowid) }; });
put('/api/subjects/:id', ADMIN, ({ params, body }) => { const v = validate(body, subjRules);
  if (!q.run('UPDATE subjects SET name=?, code=?, course_id=?, semester=? WHERE id=?', v.name, v.code.toUpperCase(), v.course_id, v.semester, params.id).changes) throw new HttpError(404, 'Subject not found'); return { ok: true }; });
del('/api/subjects/:id', ADMIN, ({ params }) => { if (!q.run('DELETE FROM subjects WHERE id=?', params.id).changes) throw new HttpError(404, 'Subject not found'); return { ok: true }; });

// ---- classes ----
const CLASS_SQL = `SELECT c.id, c.subject_id, c.teacher_id, c.course_id, c.semester, c.section, c.schedule,
  sub.name AS subject, sub.code AS subject_code, co.name AS course_name, co.code AS course_code, tu.name AS teacher_name,
  (SELECT COUNT(*) FROM students st JOIN users su ON su.id=st.user_id WHERE st.course_id=c.course_id AND st.semester=c.semester AND su.active=1) AS student_count,
  (SELECT COUNT(*) FROM sessions WHERE class_id=c.id AND status='closed') AS sessions_held,
  (SELECT id FROM sessions WHERE class_id=c.id AND status='active' LIMIT 1) AS active_session_id
  FROM classes c JOIN subjects sub ON sub.id=c.subject_id JOIN courses co ON co.id=c.course_id
  JOIN teachers t ON t.id=c.teacher_id JOIN users tu ON tu.id=t.user_id`;
get('/api/classes', ANY, ({ user }) => {
  if (user.role === 'admin') return { items: q.all(`${CLASS_SQL} ORDER BY co.name, c.semester, sub.name`) };
  if (user.role === 'teacher') { const t = teacherRow(user); return { items: t ? q.all(`${CLASS_SQL} WHERE c.teacher_id=? ORDER BY sub.name`, t.id) : [] }; }
  const s = studentRow(user);
  return { items: s ? q.all(`${CLASS_SQL} WHERE c.course_id=? AND c.semester=? ORDER BY sub.name`, s.course_id, s.semester) : [] };
});
const classRules = { subject_id: { type: 'int', required: true, label: 'Subject' }, teacher_id: { type: 'int', required: true, label: 'Teacher' },
  course_id: { type: 'int', required: true, label: 'Course' }, semester: { type: 'int', required: true, min: 1, max: 12, label: 'Semester' }, section: { max: 5, default: 'A' }, schedule: { max: 60 } };
function checkClass(v) {
  const sub = q.get('SELECT course_id FROM subjects WHERE id=?', v.subject_id);
  if (!sub) throw new HttpError(422, 'Please correct the highlighted fields', { subject_id: 'Select a valid subject' });
  if (sub.course_id !== v.course_id) throw new HttpError(422, 'Please correct the highlighted fields', { subject_id: 'Subject does not belong to the selected course' });
  const t = q.get('SELECT u.active FROM teachers t JOIN users u ON u.id=t.user_id WHERE t.id=?', v.teacher_id);
  if (!t) throw new HttpError(422, 'Please correct the highlighted fields', { teacher_id: 'Select a valid teacher' });
}
post('/api/classes', ADMIN, ({ body }) => { const v = validate(body, classRules); checkClass(v);
  return { id: Number(q.run('INSERT INTO classes(subject_id,teacher_id,course_id,semester,section,schedule) VALUES(?,?,?,?,?,?)', v.subject_id, v.teacher_id, v.course_id, v.semester, v.section || 'A', v.schedule).lastInsertRowid) }; });
put('/api/classes/:id', ADMIN, ({ params, body }) => { const v = validate(body, classRules); checkClass(v);
  if (!q.run('UPDATE classes SET subject_id=?, teacher_id=?, course_id=?, semester=?, section=?, schedule=? WHERE id=?', v.subject_id, v.teacher_id, v.course_id, v.semester, v.section || 'A', v.schedule, params.id).changes) throw new HttpError(404, 'Class not found'); return { ok: true }; });
del('/api/classes/:id', ADMIN, ({ params }) => { if (!q.run('DELETE FROM classes WHERE id=?', params.id).changes) throw new HttpError(404, 'Class not found'); return { ok: true }; });

module.exports = { CLASS_SQL };
