'use strict';
// Students, teachers, face enrollment and admin password resets.
const { get, post, put, del, HttpError, validate } = require('../lib/http');
const { q, tx } = require('../lib/db');
const sec = require('../lib/security');
const face = require('../lib/face');
const { teacherRow, studentRow } = require('../lib/access');
const { notify } = require('../lib/notify');

const ADMIN = ['admin']; const STAFF = ['admin', 'teacher'];
const phoneRule = { max: 20, pattern: /^[0-9+() -]*$/, message: 'Phone may only contain digits, spaces, + ( ) -' };
const nameRule = { required: true, min: 2, max: 80, label: 'Full name', pattern: /^[\p{L} .'-]+$/u, message: "Full name may only contain letters, spaces and . ' -" };
const fail = (fields, status = 422) => { throw new HttpError(status, 'Please correct the highlighted fields', fields); };

const STUDENT_SQL = `SELECT st.id, st.user_id, u.name, u.email, u.active, st.roll_no, st.course_id, co.name AS course_name, co.code AS course_code,
  st.semester, st.section, st.phone, st.face_samples, (st.face_samples > 0) AS face_enrolled, st.face_updated_at
  FROM students st JOIN users u ON u.id=st.user_id JOIN courses co ON co.id=st.course_id`;

// ---------- students ----------
get('/api/students', STAFF, ({ user, query }) => {
  const w = []; const p = [];
  if (user.role === 'teacher') {
    w.push('EXISTS (SELECT 1 FROM classes c WHERE c.teacher_id=? AND c.course_id=st.course_id AND c.semester=st.semester)');
    p.push(teacherRow(user)?.id ?? -1);
  }
  if (query.q) { w.push('(u.name LIKE ? OR st.roll_no LIKE ? OR u.email LIKE ?)'); p.push(`%${query.q}%`, `%${query.q}%`, `%${query.q}%`); }
  if (query.course_id) { w.push('st.course_id=?'); p.push(Number(query.course_id)); }
  if (query.semester) { w.push('st.semester=?'); p.push(Number(query.semester)); }
  if (query.face === 'enrolled') w.push('st.face_samples > 0'); else if (query.face === 'missing') w.push('st.face_samples = 0');
  const where = w.length ? ' WHERE ' + w.join(' AND ') : '';
  const limit = Math.min(Number(query.limit) || 25, 200); const offset = (Math.max(Number(query.page) || 1, 1) - 1) * limit;
  const total = q.get(`SELECT COUNT(*) AS n FROM students st JOIN users u ON u.id=st.user_id${where}`, ...p).n;
  const items = q.all(`${STUDENT_SQL}${where} ORDER BY st.roll_no LIMIT ? OFFSET ?`, ...p, limit, offset).map((r) => ({ ...r, face_enrolled: !!r.face_enrolled }));
  return { items, total, page: Math.floor(offset / limit) + 1, pages: Math.max(1, Math.ceil(total / limit)) };
});

const studentRules = {
  name: nameRule, email: { type: 'email', required: true, label: 'Email' },
  roll_no: { required: true, max: 20, label: 'Roll number', pattern: /^[A-Za-z0-9/-]+$/, message: 'Roll number may only contain letters, digits, - and /' },
  course_id: { type: 'int', required: true, label: 'Course' }, semester: { type: 'int', required: true, min: 1, max: 12, label: 'Semester' },
  section: { max: 5, default: 'A' }, phone: phoneRule,
};
post('/api/students', ADMIN, ({ body }) => {
  const v = validate(body, studentRules);
  const pw = body.password || 'Student@123'; const err = sec.passwordProblem(pw); if (err) fail({ password: err });
  if (q.get('SELECT 1 FROM users WHERE email=?', v.email)) fail({ email: 'Email already registered' }, 409);
  if (q.get('SELECT 1 FROM students WHERE roll_no=?', v.roll_no)) fail({ roll_no: 'Roll number already exists' }, 409);
  if (!q.get('SELECT 1 FROM courses WHERE id=?', v.course_id)) fail({ course_id: 'Select a valid course' });
  return tx(() => {
    const uid = Number(q.run('INSERT INTO users(name,email,password_hash,role,active) VALUES(?,?,?,?,1)', v.name, v.email, sec.hashPassword(pw), 'student').lastInsertRowid);
    const id = Number(q.run('INSERT INTO students(user_id,roll_no,course_id,semester,section,phone) VALUES(?,?,?,?,?,?)', uid, v.roll_no, v.course_id, v.semester, v.section || 'A', v.phone).lastInsertRowid);
    return { id };
  });
});
put('/api/students/:id', ADMIN, ({ params, body }) => {
  const v = validate(body, studentRules);
  const st = q.get('SELECT * FROM students WHERE id=?', params.id); if (!st) throw new HttpError(404, 'Student not found');
  if (q.get('SELECT 1 FROM users WHERE email=? AND id<>?', v.email, st.user_id)) fail({ email: 'Email already registered' }, 409);
  if (q.get('SELECT 1 FROM students WHERE roll_no=? AND id<>?', v.roll_no, st.id)) fail({ roll_no: 'Roll number already exists' }, 409);
  if (body.password) { const err = sec.passwordProblem(body.password); if (err) fail({ password: err }); }
  tx(() => {
    q.run('UPDATE users SET name=?, email=? WHERE id=?', v.name, v.email, st.user_id);
    q.run('UPDATE students SET roll_no=?, course_id=?, semester=?, section=?, phone=? WHERE id=?', v.roll_no, v.course_id, v.semester, v.section || 'A', v.phone, st.id);
    if (body.password) q.run('UPDATE users SET password_hash=? WHERE id=?', sec.hashPassword(body.password), st.user_id);
  });
  return { ok: true };
});
del('/api/students/:id', ADMIN, ({ params }) => {
  const st = q.get('SELECT user_id FROM students WHERE id=?', params.id); if (!st) throw new HttpError(404, 'Student not found');
  face.forget(Number(params.id)); q.run('DELETE FROM users WHERE id=?', st.user_id); return { ok: true };
});

// ---------- face enrollment ----------
function canEnroll(user, studentId) {
  const st = q.get('SELECT * FROM students WHERE id=?', studentId); if (!st) throw new HttpError(404, 'Student not found');
  if (user.role === 'teacher') {
    const t = teacherRow(user);
    if (!q.get('SELECT 1 FROM classes WHERE teacher_id=? AND course_id=? AND semester=?', t?.id ?? -1, st.course_id, st.semester)) throw new HttpError(403, 'This student is not in any of your classes');
  }
  return st;
}
post('/api/students/:id/face', STAFF, ({ user, params, body }) => {
  const st = canEnroll(user, params.id);
  const list = Array.isArray(body.descriptors) ? body.descriptors : [];
  if (!list.length || list.length > 5) fail({ descriptors: 'Provide between 1 and 5 face samples' });
  if (!list.every(face.validDescriptor)) fail({ descriptors: 'Face data is invalid' });
  let photo = body.photo;
  if (photo && (typeof photo !== 'string' || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(photo) || photo.length > 120000)) fail({ photo: 'Photo must be a small JPEG/PNG data URL' });
  // 'append' keeps earlier samples (max 5 total, newest wins); default replaces
  let all = list;
  if (body.mode === 'append' && st.face_data) all = [...(sec.decryptJSON(st.face_data) || []), ...list].slice(-5);
  // Refuse a face that already belongs to a different student (prevents proxy / duplicate enrollment)
  for (const other of q.all('SELECT id, face_data, face_updated_at FROM students WHERE id<>? AND face_samples>0', st.id)) {
    const g = face.gallery([{ ...other }])[0];
    const m = face.match(list[0], [g]);
    if (m.status === 'match' || m.status === 'ambiguous') {
      const who = q.get('SELECT u.name, s.roll_no FROM students s JOIN users u ON u.id=s.user_id WHERE s.id=?', other.id);
      throw new HttpError(409, `This face is already enrolled for ${who.name} (${who.roll_no}). Check you selected the right student.`);
    }
  }
  const stamp = new Date().toISOString();
  q.run('UPDATE students SET face_data=?, photo=COALESCE(?,photo), face_samples=?, face_updated_at=? WHERE id=?', sec.encryptJSON(all), photo ? sec.encryptJSON(photo) : null, all.length, stamp, st.id);
  face.forget(st.id);
  notify(st.user_id, 'success', 'Face enrolled', 'Your face has been registered. You can now be marked present automatically.');
  return { ok: true, samples: all.length };
});
del('/api/students/:id/face', STAFF, ({ user, params }) => {
  const st = canEnroll(user, params.id);
  q.run('UPDATE students SET face_data=NULL, photo=NULL, face_samples=0, face_updated_at=NULL WHERE id=?', st.id); face.forget(st.id);
  return { ok: true };
});
get('/api/students/:id/photo', ['*'], ({ user, params }) => {
  const st = q.get('SELECT * FROM students WHERE id=?', params.id); if (!st) throw new HttpError(404, 'Student not found');
  if (user.role === 'student' && st.user_id !== user.id) throw new HttpError(403, 'Not allowed');
  if (user.role === 'teacher') canEnroll(user, params.id);
  return { photo: st.photo ? sec.decryptJSON(st.photo) : null };
});

// ---------- teachers ----------
const TEACHER_SQL = `SELECT t.id, t.user_id, u.name, u.email, u.active, t.employee_id, t.department_id, d.name AS department_name, t.phone,
  (SELECT COUNT(*) FROM classes WHERE teacher_id=t.id) AS classes
  FROM teachers t JOIN users u ON u.id=t.user_id LEFT JOIN departments d ON d.id=t.department_id`;
get('/api/teachers', ['admin', 'teacher'], ({ query }) => {
  const w = []; const p = [];
  if (query.q) { w.push('(u.name LIKE ? OR t.employee_id LIKE ? OR u.email LIKE ?)'); p.push(`%${query.q}%`, `%${query.q}%`, `%${query.q}%`); }
  return { items: q.all(`${TEACHER_SQL}${w.length ? ' WHERE ' + w.join(' AND ') : ''} ORDER BY u.active, u.name`, ...p).map((r) => ({ ...r, active: !!r.active })) };
});
const teacherRules = { name: nameRule, email: { type: 'email', required: true, label: 'Email' },
  employee_id: { required: true, max: 20, label: 'Employee ID', pattern: /^[A-Za-z0-9/-]+$/ }, department_id: { type: 'int', required: true, label: 'Department' }, phone: phoneRule };
post('/api/teachers', ADMIN, ({ body }) => {
  const v = validate(body, teacherRules);
  const pw = body.password || 'Teacher@123'; const err = sec.passwordProblem(pw); if (err) fail({ password: err });
  if (q.get('SELECT 1 FROM users WHERE email=?', v.email)) fail({ email: 'Email already registered' }, 409);
  if (q.get('SELECT 1 FROM teachers WHERE employee_id=?', v.employee_id)) fail({ employee_id: 'Employee ID already exists' }, 409);
  return tx(() => {
    const uid = Number(q.run('INSERT INTO users(name,email,password_hash,role,active) VALUES(?,?,?,?,1)', v.name, v.email, sec.hashPassword(pw), 'teacher').lastInsertRowid);
    return { id: Number(q.run('INSERT INTO teachers(user_id,employee_id,department_id,phone) VALUES(?,?,?,?)', uid, v.employee_id, v.department_id, v.phone).lastInsertRowid) };
  });
});
put('/api/teachers/:id', ADMIN, ({ params, body }) => {
  const v = validate(body, teacherRules);
  const t = q.get('SELECT * FROM teachers WHERE id=?', params.id); if (!t) throw new HttpError(404, 'Teacher not found');
  if (q.get('SELECT 1 FROM users WHERE email=? AND id<>?', v.email, t.user_id)) fail({ email: 'Email already registered' }, 409);
  if (q.get('SELECT 1 FROM teachers WHERE employee_id=? AND id<>?', v.employee_id, t.id)) fail({ employee_id: 'Employee ID already exists' }, 409);
  if (body.password) { const err = sec.passwordProblem(body.password); if (err) fail({ password: err }); }
  tx(() => {
    q.run('UPDATE users SET name=?, email=? WHERE id=?', v.name, v.email, t.user_id);
    q.run('UPDATE teachers SET employee_id=?, department_id=?, phone=? WHERE id=?', v.employee_id, v.department_id, v.phone, t.id);
    if (body.password) q.run('UPDATE users SET password_hash=? WHERE id=?', sec.hashPassword(body.password), t.user_id);
  });
  return { ok: true };
});
put('/api/teachers/:id/approval', ADMIN, ({ params, body }) => {
  const t = q.get('SELECT * FROM teachers WHERE id=?', params.id); if (!t) throw new HttpError(404, 'Teacher not found');
  const active = body.active ? 1 : 0; q.run('UPDATE users SET active=? WHERE id=?', active, t.user_id);
  if (active) notify(t.user_id, 'success', 'Account approved', 'Your teacher account is active. Welcome to SmartAttend AI!');
  return { ok: true, active: !!active };
});
del('/api/teachers/:id', ADMIN, ({ params }) => {
  const t = q.get('SELECT * FROM teachers WHERE id=?', params.id); if (!t) throw new HttpError(404, 'Teacher not found');
  if (q.get('SELECT 1 FROM classes WHERE teacher_id=?', t.id)) throw new HttpError(409, 'This teacher is assigned to classes. Reassign or delete those classes first.');
  q.run('DELETE FROM users WHERE id=?', t.user_id); return { ok: true };
});

module.exports = { studentRow };
