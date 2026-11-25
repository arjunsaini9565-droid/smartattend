'use strict';
// Attendance sessions, AI recognition, manual marking and the audit trail.
const { get, post, put, HttpError, validate } = require('../lib/http');
const { q, tx, getSetting, localDate } = require('../lib/db');
const face = require('../lib/face');
const { requireClass, requireSession, rosterOf, ownedClassIds } = require('../lib/access');
const { checkLowAttendance, notify } = require('../lib/notify');

const STAFF = ['admin', 'teacher'];

function sessionView(session, cls) {
  const roster = rosterOf(cls);
  const recs = new Map(q.all('SELECT * FROM attendance WHERE session_id=?', session.id).map((r) => [r.student_id, r]));
  const students = roster.map((s) => {
    const r = recs.get(s.id);
    return { student_id: s.id, name: s.name, roll_no: s.roll_no, face_enrolled: s.face_samples > 0,
      status: r?.status ?? null, marked_at: r?.marked_at ?? null, method: r?.method ?? null, confidence: r?.confidence ?? null };
  });
  const count = (st) => students.filter((s) => s.status === st).length;
  return {
    session: { ...session, subject: cls.subject, subject_code: cls.subject_code, course_code: cls.course_code, semester: cls.semester, class_id: cls.id },
    students,
    summary: { total: students.length, present: count('present'), late: count('late'), absent: count('absent'), pending: students.filter((s) => !s.status).length,
      enrolled: students.filter((s) => s.face_enrolled).length },
  };
}

post('/api/classes/:id/sessions/start', STAFF, ({ user, params, body }) => {
  const cls = requireClass(user, params.id);
  const existing = q.get("SELECT * FROM sessions WHERE class_id=? AND status='active'", cls.id);
  if (existing) return { ...sessionView(existing, cls), resumed: true };
  const v = validate(body, { late_after: { type: 'int', min: 1, max: 120, default: getSetting('lateAfter', 10), label: 'Late after (minutes)' } });
  const now = new Date();
  const id = Number(q.run('INSERT INTO sessions(class_id,date,started_at,status,late_after,started_by) VALUES(?,?,?,?,?,?)', cls.id, localDate(now), now.toISOString(), 'active', v.late_after, user.id).lastInsertRowid);
  return sessionView(q.get('SELECT * FROM sessions WHERE id=?', id), cls);
});

get('/api/classes/:id/sessions', STAFF, ({ user, params, query }) => {
  const cls = requireClass(user, params.id);
  const items = q.all(`SELECT s.*, (SELECT COUNT(*) FROM attendance WHERE session_id=s.id AND status='present') AS present,
    (SELECT COUNT(*) FROM attendance WHERE session_id=s.id AND status='late') AS late,
    (SELECT COUNT(*) FROM attendance WHERE session_id=s.id AND status='absent') AS absent
    FROM sessions s WHERE s.class_id=? ORDER BY s.started_at DESC LIMIT ?`, cls.id, Math.min(Number(query.limit) || 30, 200));
  return { items };
});

get('/api/sessions/:id', STAFF, ({ user, params }) => { const { session, cls } = requireSession(user, params.id); return sessionView(session, cls); });

post('/api/sessions/:id/stop', STAFF, ({ user, params }) => {
  const { session, cls } = requireSession(user, params.id);
  if (session.status !== 'active') throw new HttpError(409, 'This session is already closed');
  const now = new Date().toISOString(); const absentees = [];
  tx(() => {
    for (const s of rosterOf(cls)) {
      if (!q.get('SELECT 1 FROM attendance WHERE session_id=? AND student_id=?', session.id, s.id)) {
        q.run('INSERT INTO attendance(session_id,student_id,status,marked_at,method) VALUES(?,?,?,?,?)', session.id, s.id, 'absent', now, 'auto'); absentees.push(s.id);
      }
    }
    q.run("UPDATE sessions SET status='closed', ended_at=? WHERE id=?", now, session.id);
  });
  checkLowAttendance(q.all('SELECT student_id FROM attendance WHERE session_id=?', session.id).map((r) => r.student_id), cls.id);
  return sessionView(q.get('SELECT * FROM sessions WHERE id=?', session.id), cls);
});

// Live feed: lightweight polling endpoint (only changes since a timestamp)
get('/api/sessions/:id/live', STAFF, ({ user, params }) => { const { session, cls } = requireSession(user, params.id); return sessionView(session, cls); });

// ---- AI recognition ----
post('/api/sessions/:id/recognize', STAFF, ({ user, params, body }) => {
  const { session, cls } = requireSession(user, params.id);
  if (session.status !== 'active') throw new HttpError(409, 'This attendance session is not active');
  if (!face.validDescriptor(body.descriptor)) throw new HttpError(422, 'Face data is invalid');
  const liveErr = face.livenessProblem(body.liveness);
  if (liveErr) return { result: 'spoof', message: `Liveness check failed: ${liveErr}. Please blink naturally while facing the camera.` };

  const roster = rosterOf(cls);
  const m = face.match(body.descriptor, face.gallery(roster));
  if (m.status === 'empty') return { result: 'unknown', message: 'No students in this class have a face enrolled yet.' };
  if (m.status === 'unknown') return { result: 'unknown', message: 'Face not recognized for this class.' };
  if (m.status === 'ambiguous') return { result: 'unknown', message: 'Face is ambiguous. Please look straight at the camera.' };

  const student = roster.find((s) => s.id === m.studentId);
  const score = Math.round((1 - m.distance) * 100) / 100;
  const prior = q.get('SELECT * FROM attendance WHERE session_id=? AND student_id=?', session.id, student.id);
  const base = { student: { id: student.id, name: student.name, roll_no: student.roll_no }, score };
  if (prior) return { result: 'duplicate', ...base, status: prior.status, marked_at: prior.marked_at, message: `${student.name} is already marked ${prior.status}.` };

  const now = new Date(); const minutes = (now - new Date(session.started_at)) / 60000;
  const status = minutes > session.late_after ? 'late' : 'present';
  try {
    q.run('INSERT INTO attendance(session_id,student_id,status,marked_at,method,confidence) VALUES(?,?,?,?,?,?)', session.id, student.id, status, now.toISOString(), 'face', score);
  } catch (e) { // lost a race with another request: report as duplicate (UNIQUE constraint prevents double entry)
    const again = q.get('SELECT * FROM attendance WHERE session_id=? AND student_id=?', session.id, student.id);
    if (again) return { result: 'duplicate', ...base, status: again.status, marked_at: again.marked_at, message: `${student.name} is already marked ${again.status}.` };
    throw e;
  }
  return { result: 'marked', ...base, status, marked_at: now.toISOString(), date: session.date, message: `${student.name} marked ${status}.` };
});

// ---- manual marking / correction with audit trail ----
put('/api/sessions/:id/attendance/:studentId', STAFF, ({ user, params, body }) => {
  const { session, cls } = requireSession(user, params.id);
  const v = validate(body, { status: { type: 'enum', values: ['present', 'late', 'absent'], required: true, label: 'Status' }, reason: { max: 300, label: 'Reason' } });
  const student = rosterOf(cls).find((s) => s.id === Number(params.studentId));
  if (!student) throw new HttpError(404, 'Student is not part of this class');
  const prior = q.get('SELECT * FROM attendance WHERE session_id=? AND student_id=?', session.id, student.id);
  if (prior && prior.status === v.status) throw new HttpError(409, `${student.name} is already marked ${v.status}`);
  const correcting = session.status === 'closed' || !!prior;
  if (correcting && (!v.reason || v.reason.length < 3)) throw new HttpError(422, 'A reason is required to correct attendance', { reason: 'Please give a reason (min 3 characters)' });
  const now = new Date().toISOString();
  tx(() => {
    if (prior) q.run("UPDATE attendance SET status=?, marked_at=?, method='manual', confidence=NULL WHERE id=?", v.status, now, prior.id);
    else q.run("INSERT INTO attendance(session_id,student_id,status,marked_at,method) VALUES(?,?,?,?,'manual')", session.id, student.id, v.status, now);
    q.run('INSERT INTO audit_log(session_id,student_id,old_status,new_status,changed_by,reason) VALUES(?,?,?,?,?,?)', session.id, student.id, prior?.status ?? null, v.status, user.id, v.reason || 'Marked manually');
  });
  if (session.status === 'closed') {
    checkLowAttendance([student.id], cls.id);
    const su = q.get('SELECT user_id FROM students WHERE id=?', student.id);
    notify(su.user_id, 'info', 'Attendance updated', `Your attendance for ${cls.subject} on ${session.date} was changed to ${v.status}.`);
  }
  return { ok: true, student_id: student.id, status: v.status, marked_at: now };
});

// ---- audit trail ----
get('/api/audit', STAFF, ({ user, query }) => {
  const own = ownedClassIds(user); const w = []; const p = [];
  if (own) { if (!own.length) return { items: [] }; w.push(`s.class_id IN (${own.map(() => '?').join(',')})`); p.push(...own); }
  if (query.class_id) { w.push('s.class_id=?'); p.push(Number(query.class_id)); }
  if (query.session_id) { w.push('al.session_id=?'); p.push(Number(query.session_id)); }
  const items = q.all(`SELECT al.id, al.session_id, s.date, sub.name AS subject, su.name AS student_name, st.roll_no, al.old_status, al.new_status,
    cu.name AS changed_by, al.reason, al.changed_at FROM audit_log al JOIN sessions s ON s.id=al.session_id JOIN classes c ON c.id=s.class_id
    JOIN subjects sub ON sub.id=c.subject_id JOIN students st ON st.id=al.student_id JOIN users su ON su.id=st.user_id LEFT JOIN users cu ON cu.id=al.changed_by
    ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY al.id DESC LIMIT ?`, ...p, Math.min(Number(query.limit) || 100, 500));
  return { items };
});
