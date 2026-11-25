import React from 'react';
import { api } from '../api';
import { PageHeader, Card, Loadable, StatCard, Badge, DataTable, StatusBadge, Pagination, Icon } from '../ui';
import { Ring, LineChart, PctList } from '../charts';
import { useAsync, shortLabel, fmtDate, fmtTime, navigate, cap } from '../util';
import { useState } from 'react';

// Shared attendance view used by the student's own dashboard and by staff viewing a student.
export function AttendanceView({ load, title, subtitle, historyLink }) {
  const [page, setPage] = useState(1); const [status, setStatus] = useState(''); const [cls, setCls] = useState('');
  const state = useAsync(() => load({ page, status, class_id: cls, limit: 12 }), [page, status, cls]);
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} actions={historyLink} />
      <Loadable state={state}>{(d) => (
        <>
          {d.alerts.map((a) => (
            <div key={a.class_id} className="callout danger" role="alert"><Icon name="alert" /><div><strong>Low attendance in {a.subject}: {a.pct}%</strong>
              <div>Below the required {d.threshold}%. Attend the next {a.needed} class{a.needed === 1 ? '' : 'es'} in a row to get back on track.</div></div></div>
          ))}
          <div className="grid hero-grid">
            <Card className="ring-card"><Ring value={d.overall.pct} threshold={d.threshold} size={150} label="Overall" />
              <div><h3>{d.overall.pct == null ? 'No classes yet' : d.overall.pct >= d.threshold ? 'You are on track' : 'Below requirement'}</h3><p className="muted-text">{d.overall.present + d.overall.late} of {d.overall.total} classes attended. Minimum required: {d.threshold}%.</p></div></Card>
            <StatCard icon="check" label="Present" value={d.overall.present} tone="green" /><StatCard icon="clock" label="Late" value={d.overall.late} tone="amber" /><StatCard icon="x" label="Absent" value={d.overall.absent} tone="red" />
          </div>
          <div className="grid two">
            <Card title="Subject-wise attendance"><PctList threshold={d.threshold} items={d.subjects.map((s) => ({ key: s.class_id, label: s.subject, sub: `${s.attended}/${s.total} classes`, value: s.pct }))} /></Card>
            <Card title="Weekly trend"><LineChart labels={d.weekly.map((x) => shortLabel(x.label))} threshold={d.threshold} series={[{ name: 'Attendance', color: 'var(--primary)', values: d.weekly.map((x) => x.pct), area: true }]} /></Card>
          </div>
          <Card title="Daily attendance history" pad={false} actions={<div className="row-actions">
            <select className="input input-sm" value={cls} onChange={(e) => { setCls(e.target.value); setPage(1); }} aria-label="Subject"><option value="">All subjects</option>{d.subjects.map((s) => <option key={s.class_id} value={s.class_id}>{s.subject}</option>)}</select>
            <select className="input input-sm" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Status"><option value="">All statuses</option><option value="present">Present</option><option value="late">Late</option><option value="absent">Absent</option></select></div>}>
            <DataTable rows={d.history} empty="No attendance records yet" cols={[
              { h: 'Date', render: (r) => fmtDate(r.date) }, { h: 'Subject', render: (r) => <strong>{r.subject}</strong> }, { h: 'Status', render: (r) => <StatusBadge status={r.status} /> },
              { h: 'Time', render: (r) => (r.status === 'absent' ? '-' : fmtTime(r.marked_at)) }, { h: 'Method', hideSm: true, render: (r) => (r.status === 'absent' ? '-' : cap(r.method)) }]} />
            <div className="table-foot"><span className="muted-text">{d.historyTotal} records</span><Pagination page={page} pages={d.pages} onPage={setPage} /></div>
          </Card>
        </>
      )}</Loadable>
    </>
  );
}

export default function StudentDetail({ id }) {
  return <AttendanceView key={id} load={(p) => api.get(`/students/${id}/attendance`, p)} title="Student attendance" subtitle="Detailed attendance for this student" historyLink={<button className="btn btn-ghost" onClick={() => window.history.back()}>Back</button>} />;
}
