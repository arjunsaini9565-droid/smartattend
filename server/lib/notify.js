'use strict';
const { q, getSetting } = require('./db');
const stats = require('./stats');

function notify(userId, type, title, message) {
  // avoid spamming: skip if an identical unread notification already exists
  const dup = q.get('SELECT id FROM notifications WHERE user_id=? AND title=? AND message=? AND is_read=0', userId, title, message);
  if (!dup) q.run('INSERT INTO notifications(user_id,type,title,message) VALUES(?,?,?,?)', userId, type, title, message);
}
function notifyRole(role, type, title, message) {
  for (const u of q.all("SELECT id FROM users WHERE role=? AND active=1", role)) notify(u.id, type, title, message);
}

// After a session closes or a correction is made, warn students who are now below the threshold in that subject.
function checkLowAttendance(studentIds, classId) {
  const threshold = getSetting('threshold', 75);
  const cls = q.get('SELECT sub.name AS subject FROM classes c JOIN subjects sub ON sub.id=c.subject_id WHERE c.id=?', classId);
  if (!cls) return;
  for (const sid of studentIds) {
    const t = stats.totals({ classId, studentId: sid });
    if (t.total && t.pct < threshold) {
      const user = q.get('SELECT user_id FROM students WHERE id=?', sid);
      notify(user.user_id, 'warning', `Low attendance: ${cls.subject}`,
        `Your attendance in ${cls.subject} is ${t.pct}%, below the required ${threshold}%. Attend upcoming classes to recover.`);
    }
  }
}

module.exports = { notify, notifyRole, checkLowAttendance };
