import React, { useState } from 'react';
import { api } from '../../api';
import { PageHeader, Card, Loadable, Badge, Empty, Modal, Field, useToast, Icon, DataTable } from '../../ui';
import { useAsync, navigate, fmtDate, fmtTime } from '../../util';

export default function MyClasses() {
  const toast = useToast(); const state = useAsync(() => api.get('/classes'), []);
  const [starting, setStarting] = useState(null); const [late, setLate] = useState(10); const [lateErr, setLateErr] = useState(''); const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState(null);
  const settings = useAsync(() => api.get('/settings'), []);

  async function start() {
    const n = Number(late); if (!Number.isInteger(n) || n < 1 || n > 120) return setLateErr('Enter minutes from 1 to 120');
    setBusy(true);
    try { const r = await api.post(`/classes/${starting.id}/sessions/start`, { late_after: n }); toast.success(r.resumed ? 'Resumed the active session' : 'Attendance session started'); navigate(`/session/${r.session.id}`); } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  }
  async function openHistory(c) { try { setHistory({ cls: c, items: (await api.get(`/classes/${c.id}/sessions`)).items }); } catch (e) { toast.error(e.message); } }

  return (
    <>
      <PageHeader title="My classes" subtitle="Start an attendance session for any class you teach" />
      <Loadable state={state}>{(d) => (d.items.length === 0 ? <Card><Empty icon="book" title="No classes assigned yet">Ask an administrator to assign classes to you.</Empty></Card> : (
        <div className="grid cards">{d.items.map((c) => (
          <Card key={c.id} className="class-card">
            <div className="class-top"><div><h3>{c.subject}</h3><p className="muted-text">{c.subject_code} - {c.course_code} Sem {c.semester}{c.section ? ` (${c.section})` : ''}</p></div>{c.active_session_id ? <Badge kind="present">Live</Badge> : null}</div>
            <ul className="meta"><li><Icon name="clock" size={15} />{c.schedule || 'No schedule set'}</li><li><Icon name="cap" size={15} />{c.student_count} students</li><li><Icon name="calendar" size={15} />{c.sessions_held} sessions held</li></ul>
            <div className="row-actions">
              {c.active_session_id ? <button className="btn btn-primary" onClick={() => navigate(`/session/${c.active_session_id}`)}><Icon name="camera" />Continue session</button>
                : <button className="btn btn-primary" onClick={() => { setLate(settings.data?.lateAfter ?? 10); setLateErr(''); setStarting(c); }}><Icon name="play" size={16} />Start attendance</button>}
              <button className="btn btn-ghost" onClick={() => openHistory(c)}>Past sessions</button>
            </div>
          </Card>))}</div>))}</Loadable>
      {starting && (
        <Modal title={`Start attendance - ${starting.subject}`} onClose={() => setStarting(null)} size="sm" footer={<><button className="btn btn-ghost" onClick={() => setStarting(null)}>Cancel</button><button className="btn btn-primary" onClick={start} disabled={busy}>{busy ? 'Starting...' : 'Start session'}</button></>}>
          <p className="muted-text">{starting.student_count} students are enrolled. Students arriving after the cut-off are marked late.</p>
          <Field label="Mark as late after (minutes)" error={lateErr}><input className="input" type="number" min="1" max="120" value={late} onChange={(e) => { setLate(e.target.value); setLateErr(''); }} /></Field>
        </Modal>
      )}
      {history && (
        <Modal title={`Past sessions - ${history.cls.subject}`} onClose={() => setHistory(null)} size="lg">
          <DataTable rows={history.items} empty="No sessions yet" onRowClick={(r) => navigate(`/session/${r.id}`)} cols={[
            { h: 'Date', render: (r) => fmtDate(r.date) }, { h: 'Started', render: (r) => fmtTime(r.started_at) }, { h: 'Present', key: 'present' }, { h: 'Late', key: 'late' }, { h: 'Absent', key: 'absent' },
            { h: 'Status', render: (r) => (r.status === 'active' ? <Badge kind="present">Live</Badge> : <Badge>Closed</Badge>) }]} />
        </Modal>
      )}
    </>
  );
}
