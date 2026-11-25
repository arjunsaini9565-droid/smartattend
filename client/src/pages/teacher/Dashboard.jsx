import React from 'react';
import { api } from '../../api';
import { useAuth } from '../../App';
import { PageHeader, StatCard, Card, Loadable, DataTable, Badge, Icon } from '../../ui';
import { LineChart, PctList } from '../../charts';
import { useAsync, shortLabel, navigate } from '../../util';

export default function TeacherDashboard() {
  const { user } = useAuth(); const state = useAsync(() => api.get('/teacher/overview'), []);
  return (
    <>
      <PageHeader title={`Welcome, ${user.name.split(' ').slice(-1)[0]}`} subtitle={user.teacher?.department_name ? `${user.teacher.department_name} - ${user.teacher.employee_id}` : 'Teacher dashboard'}
        actions={<button className="btn btn-primary" onClick={() => navigate('/classes')}><Icon name="camera" />Take attendance</button>} />
      <Loadable state={state}>{(d) => (
        <>
          {d.activeSessions.map((s) => (
            <div key={s.id} className="callout success"><Icon name="camera" /><div><strong>Live session: {s.subject}</strong><div>Attendance is currently being taken.</div></div><button className="btn btn-sm btn-primary" onClick={() => navigate(`/session/${s.id}`)}>Open</button></div>
          ))}
          <div className="grid stats">
            <StatCard icon="book" label="My classes" value={d.classes} /><StatCard icon="cap" label="Students" value={d.students} tone="indigo" />
            <StatCard icon="calendar" label="Sessions today" value={d.sessionsToday} tone="cyan" /><StatCard icon="trending" label="Attendance (30 days)" value={d.overall.pct == null ? '-' : `${d.overall.pct}%`} tone={d.overall.pct != null && d.overall.pct < d.threshold ? 'red' : 'green'} />
          </div>
          <div className="grid two">
            <Card title="Daily attendance (14 days)"><LineChart labels={d.daily.map((x) => shortLabel(x.label))} series={[{ name: 'Attendance', color: 'var(--primary)', values: d.daily.map((x) => x.pct), area: true }]} threshold={d.threshold} /></Card>
            <Card title="By class"><PctList threshold={d.threshold} items={d.byClass.map((c) => ({ key: c.class_id, label: c.subject, sub: `${c.course} S${c.semester}`, value: c.pct }))} /></Card>
          </div>
          <Card title={`Students needing attention (below ${d.threshold}%)`} pad={false}>
            <DataTable rows={d.low} rowKey="student_id" empty="Great news - nobody is below the threshold." onRowClick={(r) => navigate(`/student/${r.student_id}`)} cols={[
              { h: 'Roll no', key: 'roll_no' }, { h: 'Student', render: (r) => <strong>{r.name}</strong> }, { h: 'Attended', render: (r) => `${r.attended}/${r.total}` }, { h: 'Attendance', render: (r) => <Badge kind="absent">{r.pct}%</Badge> }]} />
          </Card>
        </>
      )}</Loadable>
    </>
  );
}
