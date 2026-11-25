import React, { useState } from 'react';
import { api } from '../../api';
import { PageHeader, Card, DataTable, StatusBadge, Pagination, Field, Loadable } from '../../ui';
import { useAsync, fmtDate, fmtTime, todayStr, cap } from '../../util';

export default function StudentHistory() {
  const [f, setF] = useState({ from: todayStr(-60), to: todayStr(), status: '', class_id: '' }); const [page, setPage] = useState(1);
  const range = f.from && f.to && f.from > f.to ? 'The start date must be before the end date' : '';
  const state = useAsync(() => (range ? Promise.reject(new Error(range)) : api.get('/me/attendance', { ...f, page, limit: 20 })), [f.from, f.to, f.status, f.class_id, page, range]);
  const base = useAsync(() => api.get('/me/attendance', { limit: 1 }), []);
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setPage(1); };
  return (
    <>
      <PageHeader title="Attendance history" subtitle="Filter your daily records by date, subject and status" />
      <Card><div className="filters">
        <Field label="From"><input className="input" type="date" value={f.from} max={f.to || undefined} onChange={set('from')} /></Field>
        <Field label="To" error={range}><input className="input" type="date" value={f.to} min={f.from || undefined} onChange={set('to')} /></Field>
        <Field label="Subject"><select className="input" value={f.class_id} onChange={set('class_id')}><option value="">All subjects</option>{(base.data?.subjects || []).map((s) => <option key={s.class_id} value={s.class_id}>{s.subject}</option>)}</select></Field>
        <Field label="Status"><select className="input" value={f.status} onChange={set('status')}><option value="">All</option><option value="present">Present</option><option value="late">Late</option><option value="absent">Absent</option></select></Field>
      </div></Card>
      <Card pad={false}>
        {state.error ? <div className="callout danger">{state.error.message}</div> : (
          <>
            <DataTable loading={state.loading} rows={state.data?.history} empty="No records for these filters" cols={[
              { h: 'Date', render: (r) => fmtDate(r.date) }, { h: 'Subject', render: (r) => <strong>{r.subject}</strong> }, { h: 'Status', render: (r) => <StatusBadge status={r.status} /> },
              { h: 'Time', render: (r) => (r.status === 'absent' ? '-' : fmtTime(r.marked_at)) }, { h: 'Method', hideSm: true, render: (r) => (r.status === 'absent' ? '-' : cap(r.method)) }]} />
            <div className="table-foot"><span className="muted-text">{state.data ? `${state.data.historyTotal} records` : ''}</span><Pagination page={page} pages={state.data?.pages || 1} onPage={setPage} /></div>
          </>)}
      </Card>
    </>
  );
}
