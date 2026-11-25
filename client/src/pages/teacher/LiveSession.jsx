import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api, download } from '../../api';
import { PageHeader, Card, Loadable, DataTable, StatusBadge, Badge, SearchInput, Modal, Field, StatCard, Spinner, useToast, useConfirm, Icon } from '../../ui';
import { loadFaceModels, startCamera, stopCamera, createRecognizer } from '../../face';
import { useAsync, fmtDate, fmtTime, navigate, cap } from '../../util';

export default function LiveSession({ id }) {
  const toast = useToast(); const confirm = useConfirm();
  const state = useAsync(() => api.get(`/sessions/${id}`), [id]);
  const data = state.data; const active = data?.session.status === 'active';

  // poll for real-time updates while the session is live
  useEffect(() => { if (!active) return undefined; const t = setInterval(() => state.reload(true), 3000); return () => clearInterval(t); }, [active, state.reload]); // eslint-disable-line

  const [events, setEvents] = useState([]); const [q, setQ] = useState(''); const [filter, setFilter] = useState('all'); const [manual, setManual] = useState(null);
  const pushEvent = useCallback((e) => setEvents((l) => [{ ...e, at: new Date().toISOString(), key: Math.random() }, ...l].slice(0, 30)), []);
  const onResult = useCallback((e) => {
    pushEvent(e);
    if (e.result === 'marked') { toast.success(e.message); state.reload(true); }
    if (e.result === 'error') toast.error(e.message);
  }, [pushEvent, toast, state.reload]); // eslint-disable-line

  async function stop() {
    const pending = data.summary.pending;
    if (!(await confirm({ title: 'Stop attendance session?', message: pending ? `${pending} student(s) have not been marked and will be recorded as absent. You can still correct them afterwards.` : 'The session will be closed.', confirmLabel: 'Stop session', danger: true }))) return;
    try { await api.post(`/sessions/${id}/stop`); toast.success('Session closed'); state.reload(true); } catch (e) { toast.error(e.message); }
  }
  async function exportSession(format) {
    try { await download('/reports/attendance', { class_id: data.session.class_id, from: data.session.date, to: data.session.date, view: 'detail', format }); toast.success('Report downloaded'); } catch (e) { toast.error(e.message); }
  }

  return (
    <Loadable state={state}>{(d) => {
      const s = d.summary; const sess = d.session;
      const rows = d.students.filter((x) => (filter === 'all' || (filter === 'pending' ? !x.status : x.status === filter)) && (!q || x.name.toLowerCase().includes(q.toLowerCase()) || x.roll_no.toLowerCase().includes(q.toLowerCase())));
      return (
        <>
          <PageHeader title={`${sess.subject}`} subtitle={`${sess.subject_code} - ${sess.course_code} Sem ${sess.semester} - ${fmtDate(sess.date)}, started ${fmtTime(sess.started_at)} - late after ${sess.late_after} min`}
            actions={<>
              <Badge kind={active ? 'present' : 'neutral'}>{active ? 'Live' : 'Closed'}</Badge>
              {!active && <><button className="btn btn-sm btn-soft" onClick={() => exportSession('pdf')}><Icon name="download" size={15} />PDF</button><button className="btn btn-sm btn-soft" onClick={() => exportSession('xlsx')}><Icon name="download" size={15} />Excel</button></>}
              {active && <button className="btn btn-danger" onClick={stop}><Icon name="stop" size={16} />Stop session</button>}
              <button className="btn btn-ghost" onClick={() => navigate('/classes')}>Back</button></>} />
          <div className="grid stats">
            <StatCard icon="cap" label="Students" value={s.total} sub={`${s.enrolled} with face enrolled`} /><StatCard icon="check" label="Present" value={s.present} tone="green" />
            <StatCard icon="clock" label="Late" value={s.late} tone="amber" /><StatCard icon={active ? 'scan' : 'x'} label={active ? 'Waiting' : 'Absent'} value={active ? s.pending : s.absent} tone={active ? 'cyan' : 'red'} />
          </div>
          <div className={active ? 'grid session-grid' : ''}>
            {active && <CameraPanel sessionId={id} onResult={onResult} events={events} enrolled={s.enrolled} />}
            <Card title="Roster" pad={false} actions={<div className="row-actions"><select className="input input-sm" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter roster"><option value="all">All</option><option value="present">Present</option><option value="late">Late</option><option value="absent">Absent</option><option value="pending">Pending</option></select></div>}>
              <div className="toolbar"><SearchInput value={q} onChange={setQ} placeholder="Search name or roll number" /></div>
              <DataTable rows={rows} rowKey="student_id" empty="No students match" cols={[
                { h: 'Roll no', key: 'roll_no' }, { h: 'Student', render: (r) => <div><strong>{r.name}</strong>{!r.face_enrolled && <small className="block warn-text">No face enrolled</small>}</div> },
                { h: 'Status', render: (r) => <StatusBadge status={r.status} /> }, { h: 'Time', render: (r) => (r.marked_at && r.status !== 'absent' ? fmtTime(r.marked_at) : '-') },
                { h: 'Method', hideSm: true, render: (r) => (r.method && r.status !== 'absent' ? <span className="muted-text">{cap(r.method)}{r.confidence ? ` ${Math.round(r.confidence * 100)}%` : ''}</span> : '-') },
                { h: '', align: 'right', render: (r) => <button className="btn btn-sm btn-ghost" onClick={() => setManual(r)}><Icon name="edit" size={14} />{r.status ? 'Correct' : 'Mark'}</button> }]} />
            </Card>
          </div>
          {manual && <ManualModal session={sess} student={manual} onClose={() => setManual(null)} onSaved={() => { setManual(null); state.reload(true); }} />}
        </>
      );
    }}</Loadable>
  );
}

function ManualModal({ session, student, onClose, onSaved }) {
  const toast = useToast(); const [status, setStatus] = useState(student.status === 'present' ? 'late' : 'present'); const [reason, setReason] = useState(''); const [err, setErr] = useState({}); const [busy, setBusy] = useState(false);
  const needsReason = !!student.status || session.status === 'closed';
  async function save(e) {
    e.preventDefault(); const errs = {};
    if (status === student.status) errs.status = `Already marked ${status}`; if (needsReason && reason.trim().length < 3) errs.reason = 'Please give a reason (min 3 characters)';
    setErr(errs); if (Object.keys(errs).length) return;
    setBusy(true);
    try { await api.put(`/sessions/${session.id}/attendance/${student.student_id}`, { status, reason }); toast.success(`${student.name} marked ${status}`); onSaved(); } catch (e2) { setErr(e2.fields || { reason: e2.message }); toast.error(e2.message); } finally { setBusy(false); }
  }
  return (
    <Modal title={`${student.status ? 'Correct' : 'Mark'} attendance`} onClose={onClose} size="sm" footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button type="submit" form="manual-form" className="btn btn-primary" disabled={busy}>{busy ? 'Saving...' : 'Save'}</button></>}>
      <form id="manual-form" onSubmit={save} noValidate className="stack">
        <div><strong>{student.name}</strong><div className="muted-text">{student.roll_no}{student.status && <> - currently <StatusBadge status={student.status} /></>}</div></div>
        <Field label="Status" error={err.status}><select className="input" value={status} onChange={(e) => setStatus(e.target.value)}><option value="present">Present</option><option value="late">Late</option><option value="absent">Absent</option></select></Field>
        <Field label={`Reason${needsReason ? '' : ' (optional)'}`} error={err.reason} help={needsReason ? 'Recorded in the audit trail' : undefined} required={needsReason}><textarea className="input" rows={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Camera could not detect the student" /></Field>
      </form>
    </Modal>
  );
}

function CameraPanel({ sessionId, onResult, events, enrolled }) {
  const videoRef = useRef(null); const canvasRef = useRef(null); const streamRef = useRef(null); const recRef = useRef(null);
  const [phase, setPhase] = useState('idle'); // idle | loading | running | error
  const [msg, setMsg] = useState(''); const [fps, setFps] = useState(0);
  const resultRef = useRef(onResult); resultRef.current = onResult;
  const identify = useCallback((descriptor, liveness) => api.post(`/sessions/${sessionId}/recognize`, { descriptor, liveness }), [sessionId]);

  async function start() {
    setPhase('loading'); setMsg('Loading face recognition engine...');
    try {
      await loadFaceModels(setMsg); setMsg('Starting camera...');
      streamRef.current = await startCamera(videoRef.current);
      recRef.current = createRecognizer({ video: videoRef.current, canvas: canvasRef.current, identify, onEvent: (e) => resultRef.current(e), onFps: setFps });
      recRef.current.start(); setPhase('running');
    } catch (e) { stopCamera(streamRef.current, videoRef.current); setMsg(e.message); setPhase('error'); }
  }
  function stop() { recRef.current?.stop(); stopCamera(streamRef.current, videoRef.current); streamRef.current = null; setPhase('idle'); }
  useEffect(() => () => { recRef.current?.stop(); stopCamera(streamRef.current, videoRef.current); }, []);

  return (
    <Card title="AI face recognition" actions={phase === 'running' && <Badge kind="present">{fps} fps</Badge>}>
      <div className="camera-stage"><video ref={videoRef} playsInline muted className="mirror" /><canvas ref={canvasRef} className="overlay mirror" />
        {phase !== 'running' && <div className="camera-placeholder">{phase === 'loading' ? <Spinner label={msg} /> : <><Icon name="camera" size={34} /><span>Camera is off</span></>}</div>}</div>
      {phase === 'error' && <div className="callout danger" role="alert"><Icon name="alert" /><div><strong>Camera or AI could not start</strong><div>{msg}</div></div></div>}
      {enrolled === 0 && <div className="callout warn"><Icon name="info" />No student in this class has a face enrolled yet. Enroll faces from the Students page, or mark attendance manually.</div>}
      <div className="row-actions">{phase === 'running' ? <button className="btn btn-ghost" onClick={stop}><Icon name="stop" size={16} />Stop camera</button> : <button className="btn btn-primary" onClick={start} disabled={phase === 'loading'}><Icon name="camera" />{phase === 'error' ? 'Try again' : 'Start camera'}</button>}</div>
      <p className="muted-text small">Each student looks at the camera and blinks once. Blink detection blocks printed photos; duplicate scans are ignored.</p>
      <div className="feed" aria-live="polite"><h4>Recognition feed</h4>
        {events.length === 0 ? <p className="muted-text small">Results appear here.</p> : events.map((e) => (
          <div key={e.key} className={`feed-item ${e.result}`}>
            <Icon name={e.result === 'marked' ? 'check' : e.result === 'duplicate' ? 'info' : 'alert'} size={16} />
            <div><strong>{e.student ? `${e.student.name} (${e.student.roll_no})` : e.result === 'unknown' ? 'Unknown face' : e.result === 'spoof' ? 'Liveness check failed' : 'Error'}</strong>
              <div className="muted-text small">{e.result === 'marked' ? `${cap(e.status)} - ${fmtDate(e.date)}, ${fmtTime(e.marked_at)} - match ${Math.round(e.score * 100)}%` : e.message}</div></div>
            <small>{fmtTime(e.at)}</small></div>))}
      </div>
    </Card>
  );
}
