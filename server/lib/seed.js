'use strict';
// Sample data so the app is usable immediately. Face data is NOT seeded:
// enroll a photo from Admin > Students to try facial recognition.
const { db, q, tx, setSetting, localDate } = require('./db');
const { hashPassword } = require('./security');

function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const PASSWORDS = { admin: 'Admin@123', teacher: 'Teacher@123', student: 'Student@123' };

function seed() {
  const rand = mulberry32(2026);
  tx(() => {
    setSetting('threshold', 75);
    setSetting('lateAfter', 10);
    setSetting('institution', 'SmartAttend University');

    const dept = {}; const course = {}; const subject = {};
    for (const [code, name] of [['CSE', 'Computer Science & Engineering'], ['ECE', 'Electronics & Communication'], ['MGT', 'Management Studies']])
      dept[code] = Number(q.run('INSERT INTO departments(name,code) VALUES(?,?)', name, code).lastInsertRowid);
    for (const [code, name, d, sem] of [['BTCSE', 'B.Tech Computer Science', 'CSE', 8], ['BTECE', 'B.Tech Electronics', 'ECE', 8], ['BBA', 'Bachelor of Business Administration', 'MGT', 6]])
      course[code] = Number(q.run('INSERT INTO courses(name,code,department_id,semesters) VALUES(?,?,?,?)', name, code, dept[d], sem).lastInsertRowid);
    const subjects = [
      ['CS301', 'Data Structures', 'BTCSE', 3], ['CS302', 'Database Management Systems', 'BTCSE', 3], ['CS303', 'Operating Systems', 'BTCSE', 3], ['MA301', 'Discrete Mathematics', 'BTCSE', 3],
      ['EC301', 'Signals and Systems', 'BTECE', 3], ['EC302', 'Analog Circuits', 'BTECE', 3], ['EC303', 'Digital Electronics', 'BTECE', 3],
      ['BB201', 'Business Economics', 'BBA', 2], ['BB202', 'Financial Accounting', 'BBA', 2], ['BB203', 'Principles of Marketing', 'BBA', 2],
    ];
    for (const [code, name, c, sem] of subjects)
      subject[code] = Number(q.run('INSERT INTO subjects(name,code,course_id,semester) VALUES(?,?,?,?)', name, code, course[c], sem).lastInsertRowid);

    const addUser = (name, email, role, active = 1) =>
      Number(q.run('INSERT INTO users(name,email,password_hash,role,active) VALUES(?,?,?,?,?)', name, email, hashPassword(PASSWORDS[role]), role, active).lastInsertRowid);

    addUser('System Administrator', 'admin@smartattend.edu', 'admin');

    const teacherDefs = [
      ['Dr. Ananya Sharma', 'ananya.sharma', 'T-1001', 'CSE'], ['Prof. Rakesh Verma', 'rakesh.verma', 'T-1002', 'CSE'],
      ['Dr. Meera Nair', 'meera.nair', 'T-1003', 'ECE'], ['Prof. Sanjay Gupta', 'sanjay.gupta', 'T-1004', 'ECE'], ['Dr. Kavita Joshi', 'kavita.joshi', 'T-1005', 'MGT'],
    ];
    const teacher = [];
    for (const [name, handle, emp, d] of teacherDefs) {
      const uid = addUser(name, `${handle}@smartattend.edu`, 'teacher');
      teacher.push(Number(q.run('INSERT INTO teachers(user_id,employee_id,department_id) VALUES(?,?,?)', uid, emp, dept[d]).lastInsertRowid));
    }
    // A pending teacher registration to demonstrate the approval flow
    const pend = addUser('Neha Kapoor', 'neha.kapoor@smartattend.edu', 'teacher', 0);
    q.run('INSERT INTO teachers(user_id,employee_id,department_id) VALUES(?,?,?)', pend, 'T-1006', dept.CSE);

    const classDefs = [
      ['CS301', 0, 'BTCSE', 3, 'Mon/Wed/Fri 09:00'], ['CS302', 0, 'BTCSE', 3, 'Tue/Thu 10:00'], ['CS303', 1, 'BTCSE', 3, 'Mon/Wed 11:00'], ['MA301', 1, 'BTCSE', 3, 'Tue/Fri 12:00'],
      ['EC301', 2, 'BTECE', 3, 'Mon/Thu 09:00'], ['EC302', 2, 'BTECE', 3, 'Tue/Fri 10:00'], ['EC303', 3, 'BTECE', 3, 'Wed/Thu 11:00'],
      ['BB201', 4, 'BBA', 2, 'Mon/Wed 10:00'], ['BB202', 4, 'BBA', 2, 'Tue/Thu 11:00'], ['BB203', 4, 'BBA', 2, 'Fri 09:00'],
    ];
    const classes = classDefs.map(([sub, t, c, sem, sched]) => ({
      id: Number(q.run('INSERT INTO classes(subject_id,teacher_id,course_id,semester,section,schedule) VALUES(?,?,?,?,?,?)', subject[sub], teacher[t], course[c], sem, 'A', sched).lastInsertRowid),
      course: c, sem, teacherIdx: t,
    }));

    const studentDefs = {
      BTCSE: ['Aarav Mehta', 'Diya Patel', 'Rohan Singh', 'Ishita Agarwal', 'Kabir Khanna', 'Saanvi Reddy', 'Vihaan Joshi', 'Anika Bose', 'Arjun Malhotra', 'Myra Kapoor', 'Reyansh Das', 'Tara Iyer'],
      BTECE: ['Aditya Rao', 'Kiara Menon', 'Dev Chauhan', 'Navya Sinha', 'Yash Tiwari', 'Pooja Nambiar', 'Harsh Vora', 'Simran Kaur'],
      BBA: ['Rhea Banerjee', 'Karan Oberoi', 'Aisha Khan', 'Manav Saxon', 'Zoya Ansari'],
    };
    const prefix = { BTCSE: 'CS', BTECE: 'EC', BBA: 'BB' };
    const semOf = { BTCSE: 3, BTECE: 3, BBA: 2 };
    const students = []; // {id, course, p}
    let n = 0;
    for (const [c, names] of Object.entries(studentDefs)) {
      names.forEach((name, i) => {
        n++;
        const handle = name.toLowerCase().replace(/[^a-z ]/g, '').replace(' ', '.');
        const uid = addUser(name, `${handle}@student.smartattend.edu`, 'student');
        const id = Number(q.run('INSERT INTO students(user_id,roll_no,course_id,semester,section) VALUES(?,?,?,?,?)', uid, `${prefix[c]}24${String(i + 1).padStart(3, '0')}`, course[c], semOf[c], 'A').lastInsertRowid);
        // every 4th student is a low-attendance case so analytics have something to flag
        const p = n % 4 === 0 ? 0.52 + rand() * 0.2 : 0.82 + rand() * 0.17;
        students.push({ id, course: c, p });
      });
    }

    // ~8 weeks of history on weekdays before today
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const dayPattern = [[1, 3, 5], [2, 4], [1, 3], [2, 5], [1, 4], [2, 5], [3, 4], [1, 3], [2, 4], [5]];
    classes.forEach((cl, ci) => {
      const days = dayPattern[ci];
      const hour = 9 + (ci % 4);
      for (let back = 1; back <= 56; back++) {
        const d = new Date(today); d.setDate(today.getDate() - back);
        if (!days.includes(d.getDay())) continue;
        const start = new Date(d); start.setHours(hour, 0, 0, 0);
        const end = new Date(start.getTime() + 55 * 60000);
        const sid = Number(q.run('INSERT INTO sessions(class_id,date,started_at,ended_at,status,late_after,started_by) VALUES(?,?,?,?,?,?,1)',
          cl.id, localDate(d), start.toISOString(), end.toISOString(), 'closed', 10).lastInsertRowid);
        for (const s of students.filter((x) => x.course === cl.course)) {
          const r = rand();
          let status = 'absent'; let at = end; let method = 'auto'; let conf = null;
          if (r < s.p) {
            const late = rand() < 0.1;
            status = late ? 'late' : 'present';
            at = new Date(start.getTime() + (late ? 12 + rand() * 20 : 1 + rand() * 8) * 60000);
            method = rand() < 0.85 ? 'face' : 'manual';
            conf = method === 'face' ? Math.round((0.72 + rand() * 0.25) * 100) / 100 : null;
          }
          q.run('INSERT INTO attendance(session_id,student_id,status,marked_at,method,confidence) VALUES(?,?,?,?,?,?)', sid, s.id, status, at.toISOString(), method, conf);
        }
      }
    });
    const adminId = q.get("SELECT id FROM users WHERE role='admin'").id;
    q.run("INSERT INTO notifications(user_id,type,title,message) VALUES(?,?,?,?)", adminId, 'info', 'Welcome to SmartAttend AI',
      'Sample data has been loaded. Enroll a student photo (Admin > Students) to try facial recognition.');
    q.run("INSERT INTO notifications(user_id,type,title,message) VALUES(?,?,?,?)", adminId, 'warning', 'Teacher approval pending',
      'Neha Kapoor registered as a teacher and is waiting for approval (Admin > Teachers).');
  });
}

function seedIfEmpty() {
  if (q.get('SELECT COUNT(*) AS c FROM users').c === 0) { seed(); return true; }
  return false;
}

function reset() {
  tx(() => {
    for (const t of ['audit_log', 'attendance', 'sessions', 'classes', 'students', 'teachers', 'notifications', 'users', 'subjects', 'courses', 'departments', 'settings'])
      db.exec(`DELETE FROM ${t}`);
  });
  seed();
}

module.exports = { seedIfEmpty, reset, PASSWORDS };

if (require.main === module) {
  if (process.argv.includes('--reset')) { reset(); console.log('Database reset and re-seeded.'); }
  else console.log(seedIfEmpty() ? 'Database seeded.' : 'Database already has data (use --reset to wipe and re-seed).');
}
