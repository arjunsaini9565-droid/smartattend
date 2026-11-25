import React, { useState } from 'react';
import { api, download } from '../api';
import { useAuth } from '../App';
import { PageHeader, Card, Tabs, DataTable, SearchInput, Pagination, StatusBadge, Badge, StatCard, Loadable, Field, useToast, Icon, Spinner } from '../ui';
import { LineChart, BarChart, CountBars, Donut, PctList, Legend } from '../charts';
import { useAsync, useDebounced, shortLabel, fmtDate, fmtTime, todayStr, navigate, cap } from '../util';

export default function Reports() {
  const { user } = useAuth(); const toast = useToast();
  const [tab, setTab] = useState('analytics'); const [granularity, setGranularity] = useState('daily');
  const [f, setF] = useState({ class_id: '', from: todayStr(-60), to: todayStr(), status: '', q: '' }); const [dl, setDl] = useState('');
  const [page, setPage] = useState(1); const dq = useDebounced(f.q);
  const classes = useAsync(() => api.get('/classes'), []);
  const range = f.from && f.to && f.from > f.to ? 'The start date must be before the end date' : '';
  const params = { class_id: f.class_id, from: f.from, to: f.to, status: f.status, q: dq };
  const analytics = useAsync(() => (range ? Promise.reject(new Error(range)) : api.get('/analytics', params)), [f.class_id, f.from, f.to, dq, range]);
  const records = useAsync(() => (range || tab !== 'records' ? Promise.resolve(null) : api.get('/reports/attendance', { ...params, view: 'detail', format: 'json' })), [f.class_id, f.from, f.to, f.status, dq, tab, range]);

  async function exportAs(format, view) {
    if (range) return toast.error(range);
    setDl(`${view}-${format}`);
    try { const n = await download('/reports/attendance', { ...params, view, format }); toast.success(`Downloaded ${n}`); } catch (e) { toast.error(e.message); } finally { setDl(''); }
  }
  const quick = (days) => setF({ ...f, from: todayStr(-days), to: todayStr() });
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setPage(1); };

  const filters = (
    <div className="filters">
      <Field label="Class"><select className="input" value={f.class_id} onChange={set('class_id')}><option value="">All classes</option>{(classes.data?.items || []).map((c) => <option key={c.id} value={c.id}>{c.subject} - {c.course_code} S{c.semester}</option>)}</select></Field>
      <Field label="From" error={range && ' '}><input className="input" type="date" value={f.from} max={f.to || undefined} onChange={set('from')} /></Field>
      <Field label="To" error={range}><input className="input" type="date" value={f.to} min={f.from || undefined} onChange={set('to')} /></Field>
      <Field label="Student"><SearchInput value={f.q} onChange={(v) => { setF({ ...f, q: v }); setPage(1); }} placeholder="Name or roll no" /></Field>
      <div className="quick"><button className="chip" onClick={() => quick(7)}>7 days</button><button className="chip" onClick={() => quick(30)}>30 days</button><button className="chip" onClick={() => quick(90)}>90 days</button></div>
    </div>
  );
  const exportBar = (view) => (
    <div className="row-actions">
      {['pdf', 'xlsx', 'csv'].map((fmt) => <button key={fmt} className="btn btn-sm btn-soft" disabled={!!dl} onClick={() => exportAs(fmt, view)}><Icon name="download" size={15} />{dl === `${view}-${fmt}` ? 'Preparing...' : fmt.toUpperCase()}</button>)}
    </div>
  );

  return (
    <>
      <PageHeader title="Reports & analytics" subtitle={user.role === 'admin' ? 'Institution-wide attendance insights' : 'Attendance insights for your classes'} />
      <Card className="filter-card">{filters}</Card>
      <Tabs value={tab} onChange={(t) => { setTab(t); setPage(1); }} tabs={[{ value: 'analytics', label: 'Analytics', icon: 'chart' }, { value: 'low', label: 'Below threshold', icon: 'alert' }, { value: 'records', label: 'Attendance records', icon: 'list' }]} />
      {tab !== 'records' && <Loadable state={analytics}>{(d) => {
        const s = d.summary; const labels = d[granularity].map((x) => shortLabel(x.label, granularity));
        if (tab === 'low') return (
          <Card title={`Students below ${d.threshold}% (${d.low.length})`} actions={<button className="btn btn-sm btn-soft" disabled={!!dl} onClick={() => exportAs('xlsx', 'summary')}><Icon name="download" size={15} />Export summary</button>} pad={false}>
            <DataTable rows={d.low} rowKey="student_id" empty="No students are below the attendance threshold for this selection." onRowClick={(r) => navigate(`/student/${r.student_id}`)} cols={[
              { h: 'Roll no', key: 'roll_no' }, { h: 'Student', render: (r) => <strong>{r.name}</strong> }, { h: 'Course', hideSm: true, render: (r) => `${r.course} S${r.semester}` },
              { h: 'Attended', render: (r) => `${r.attended}/${r.total}` }, { h: 'Attendance', render: (r) => <Badge kind="absent">{r.pct}%</Badge> }]} />
          </Card>);
        return (
          <>
            <div className="grid stats">
              <StatCard icon="trending" label="Attendance" value={s.pct == null ? '-' : `${s.pct}%`} sub={`${s.total.toLocaleString()} records`} tone={s.pct != null && s.pct < d.threshold ? 'red' : 'green'} />
              <StatCard icon="check" label="Present" value={s.present.toLocaleString()} tone="green" /><StatCard icon="clock" label="Late" value={s.late.toLocaleString()} tone="amber" />
              <StatCard icon="x" label="Absent" value={s.absent.toLocaleString()} tone="red" /><StatCard icon="alert" label={`Below ${d.threshold}%`} value={d.low.length} sub={`of ${d.students} students`} tone="red" />
            </div>
            <div className="grid two">
              <Card title="Attendance trend" actions={<Tabs value={granularity} onChange={setGranularity} tabs={[{ value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' }]} />}>
                <LineChart labels={labels} threshold={d.threshold} series={[{ name: 'Attendance', color: 'var(--primary)', values: d[granularity].map((x) => x.pct), area: true }]} />
                {granularity === 'weekly' && <p className="muted-text small">Weeks start on Monday.</p>}
              </Card>
              <Card title="Present / late / absent">
                <div className="donut-row"><Donut size={170} center={s.total.toLocaleString()} sub="records" segments={[{ label: 'Present', value: s.present, color: 'var(--success)' }, { label: 'Late', value: s.late, color: 'var(--warning)' }, { label: 'Absent', value: s.absent, color: 'var(--danger)' }]} />
                  <Legend items={[{ label: `Present ${s.present}`, color: 'var(--success)' }, { label: `Late ${s.late}`, color: 'var(--warning)' }, { label: `Absent ${s.absent}`, color: 'var(--danger)' }]} /></div>
              </Card>
            </div>
            <div className="grid two">
              <Card title="By subject"><BarChart labels={d.byClass.map((c) => c.code)} values={d.byClass.map((c) => c.pct)} threshold={d.threshold} tooltipExtra={() => ''} /></Card>
              <Card title="Student distribution"><CountBars items={d.distribution.map((b, i) => ({ ...b, color: i < 3 ? 'var(--danger)' : i === 3 ? 'var(--warning)' : 'var(--success)' }))} /></Card>
            </div>
            <Card title="Summary export" actions={exportBar('summary')}><p className="muted-text">Download one row per student with present, late, absent and attendance %, flagged against the {d.threshold}% minimum. Uses the filters above.</p></Card>
          </>
        );
      }}</Loadable>}
      {tab === 'records' && (
        <Card pad={false} title="Attendance records" actions={exportBar('detail')}>
          <div className="toolbar"><select className="input" value={f.status} onChange={set('status')} aria-label="Filter by status"><option value="">All statuses</option><option value="present">Present</option><option value="late">Late</option><option value="absent">Absent</option></select></div>
          {records.loading && !records.data ? <Spinner /> : records.error ? <div className="callout danger"><Icon name="alert" />{records.error.message}</div> : (
            <>
              <DataTable rows={(records.data?.rows || []).slice((page - 1) * 20, page * 20)} empty="No attendance records for these filters" cols={[
                { h: 'Date', render: (r) => fmtDate(r.date) }, { h: 'Time', render: (r) => r.time }, { h: 'Roll no', key: 'roll_no' }, { h: 'Student', render: (r) => <strong>{r.student_name}</strong> },
                { h: 'Subject', key: 'subject', hideSm: true }, { h: 'Status', render: (r) => <StatusBadge status={r.status} /> }, { h: 'Method', hideSm: true, render: (r) => cap(r.method) + (r.match ? ` (${r.match}%)` : '') }]} />
              <div className="table-foot"><span className="muted-text">{records.data ? `${records.data.rows.length}${records.data.truncated ? '+' : ''} records` : ''}</span><Pagination page={page} pages={Math.max(1, Math.ceil((records.data?.rows.length || 0) / 20))} onPage={setPage} /></div>
            </>
          )}
        </Card>
      )}
    </>
  );
}
