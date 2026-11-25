import React from 'react';
import { api } from '../../api';
import { PageHeader, StatCard, Card, Loadable, Badge, DataTable } from '../../ui';
import { LineChart, Donut, PctList, Legend } from '../../charts';
import { useAsync, shortLabel, fmtDate, fmtTime, navigate, statusColor } from '../../util';

export default function AdminDashboard() {
  const state = useAsync(() => api.get('/admin/stats'), []);
  return (
    <>
      <PageHeader title="Admin dashboard" subtitle="Institution-wide attendance at a glance" actions={<button className="btn btn-primary" onClick={() => navigate('/reports')}>View reports</button>} />
      <Loadable state={state}>{(d) => {
        const c = d.counts; const o = d.overall;
        return (
          <>
            <div className="grid stats">
              <StatCard icon="cap" label="Total students" value={c.students} sub={`${c.faceEnrolled} with face enrolled`} />
              <StatCard icon="users" label="Teachers" value={c.teachers} sub={c.pendingTeachers ? `${c.pendingTeachers} awaiting approval` : 'All approved'} tone="indigo" />
              <StatCard icon="book" label="Classes" value={c.classes} sub={`${c.courses} courses, ${c.subjects} subjects`} tone="cyan" />
              <StatCard icon="list" label="Attendance records" value={c.records.toLocaleString()} sub={`${c.sessions} sessions held`} tone="green" />
              <StatCard icon="trending" label="Overall attendance" value={o.pct == null ? '-' : `${o.pct}%`} sub={`${d.lowCount} students below ${d.threshold}%`} tone={o.pct != null && o.pct < d.threshold ? 'red' : 'green'} />
              <StatCard icon="camera" label="Live sessions" value={c.activeSessions} sub="Attendance being taken now" tone="amber" />
            </div>
            <div className="grid two">
              <Card title="Daily attendance (last 14 days)"><LineChart labels={d.daily.map((x) => shortLabel(x.label))} series={[{ name: 'Attendance', color: 'var(--primary)', values: d.daily.map((x) => x.pct), area: true }]} threshold={d.threshold} /></Card>
              <Card title="Attendance mix">
                <div className="donut-row">
                  <Donut size={170} center={o.total.toLocaleString()} sub="records" segments={[{ label: 'Present', value: o.present, color: 'var(--success)' }, { label: 'Late', value: o.late, color: 'var(--warning)' }, { label: 'Absent', value: o.absent, color: 'var(--danger)' }]} />
                  <div><Legend items={[{ label: `Present ${o.present}`, color: 'var(--success)' }, { label: `Late ${o.late}`, color: 'var(--warning)' }, { label: `Absent ${o.absent}`, color: 'var(--danger)' }]} /></div>
                </div>
              </Card>
            </div>
            <div className="grid two">
              <Card title="Attendance by class (last 30 days)"><PctList threshold={d.threshold} items={d.byClass.map((x) => ({ key: x.class_id, label: x.subject, sub: `${x.course} - Sem ${x.semester}`, value: x.pct }))} /></Card>
              <Card title="Recent sessions" pad={false}>
                <DataTable rows={d.recentSessions} cols={[
                  { h: 'Subject', render: (r) => <strong>{r.subject}</strong> }, { h: 'Teacher', key: 'teacher', hideSm: true },
                  { h: 'Date', render: (r) => `${fmtDate(r.date)} ${fmtTime(r.started_at)}` },
                  { h: 'Attended', render: (r) => (r.status === 'active' ? <Badge kind="present">Live</Badge> : <span style={{ color: statusColor(r.total ? (r.attended / r.total) * 100 : null, d.threshold) }}>{r.attended}/{r.total}</span>) },
                ]} />
              </Card>
            </div>
          </>
        );
      }}</Loadable>
    </>
  );
}
