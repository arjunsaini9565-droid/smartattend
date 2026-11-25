import React from 'react';
import { api } from '../../api';
import { useAuth } from '../../App';
import { AttendanceView } from '../StudentDetail';
import { Badge, Icon } from '../../ui';
import { navigate } from '../../util';

export default function StudentDashboard() {
  const { user } = useAuth();
  return (
    <>
      {user.student && !user.student.face_enrolled && (
        <div className="callout warn"><Icon name="camera" /><div><strong>Your face is not enrolled yet</strong><div>Ask your teacher or administrator to enroll your photo so the camera can mark you present automatically.</div></div></div>
      )}
      <AttendanceView load={(p) => api.get('/me/attendance', p)} title={`Hello, ${user.name.split(' ')[0]}`}
        subtitle={user.student ? `${user.student.roll_no} - ${user.student.course_name}, Semester ${user.student.semester}` : ''}
        historyLink={<>{user.student?.face_enrolled && <Badge kind="present"><Icon name="check" size={12} /> Face enrolled</Badge>}<button className="btn btn-soft" onClick={() => navigate('/history')}>Full history</button></>} />
    </>
  );
}
