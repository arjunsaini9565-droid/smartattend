import React, { useEffect, useState } from 'react';
import { api } from '../../api';
import { PageHeader, Card, Field, Loadable, useToast, Icon } from '../../ui';
import { useAsync } from '../../util';

export default function AdminSettings() {
  const toast = useToast(); const state = useAsync(() => api.get('/settings'), []);
  const [f, setF] = useState(null); const [errors, setErrors] = useState({}); const [busy, setBusy] = useState(false);
  const [b, setB] = useState({ audience: 'all', title: '', message: '' }); const [be, setBe] = useState({}); const [bb, setBb] = useState(false);
  useEffect(() => { if (state.data) setF({ threshold: state.data.threshold, lateAfter: state.data.lateAfter, institution: state.data.institution }); }, [state.data]);

  async function save(e) {
    e.preventDefault(); const errs = {};
    const t = Number(f.threshold); const l = Number(f.lateAfter);
    if (!Number.isInteger(t) || t < 1 || t > 100) errs.threshold = 'Enter a whole number from 1 to 100';
    if (!Number.isInteger(l) || l < 1 || l > 120) errs.lateAfter = 'Enter minutes from 1 to 120';
    if (String(f.institution).trim().length < 2) errs.institution = 'Institution name is required';
    setErrors(errs); if (Object.keys(errs).length) return;
    setBusy(true);
    try { await api.put('/settings', { threshold: t, lateAfter: l, institution: f.institution }); toast.success('Settings saved'); state.reload(true); } catch (err) { setErrors(err.fields || {}); toast.error(err.message); } finally { setBusy(false); }
  }
  async function broadcast(e) {
    e.preventDefault(); const errs = {};
    if (b.title.trim().length < 3) errs.title = 'Title must be at least 3 characters'; if (b.message.trim().length < 3) errs.message = 'Message must be at least 3 characters';
    setBe(errs); if (Object.keys(errs).length) return;
    setBb(true);
    try { const r = await api.post('/notifications/broadcast', b); toast.success(`Announcement sent to ${r.sent} user(s)`); setB({ ...b, title: '', message: '' }); } catch (err) { setBe(err.fields || {}); toast.error(err.message); } finally { setBb(false); }
  }
  return (
    <>
      <PageHeader title="Settings" subtitle="Attendance rules and announcements" />
      <Loadable state={state}>{() => f && (
        <div className="grid two">
          <Card title="Attendance rules">
            <form onSubmit={save} noValidate className="stack">
              <Field label="Institution name" error={errors.institution}><input className="input" value={f.institution} onChange={(e) => setF({ ...f, institution: e.target.value })} /></Field>
              <Field label="Minimum attendance (%)" error={errors.threshold} help="Students below this are flagged and alerted"><input className="input" type="number" min="1" max="100" value={f.threshold} onChange={(e) => setF({ ...f, threshold: e.target.value })} /></Field>
              <Field label="Mark as late after (minutes)" error={errors.lateAfter} help="Default for new sessions; teachers can change it when starting one"><input className="input" type="number" min="1" max="120" value={f.lateAfter} onChange={(e) => setF({ ...f, lateAfter: e.target.value })} /></Field>
              <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving...' : 'Save settings'}</button>
            </form>
          </Card>
          <Card title="Send announcement">
            <form onSubmit={broadcast} noValidate className="stack">
              <Field label="Audience"><select className="input" value={b.audience} onChange={(e) => setB({ ...b, audience: e.target.value })}><option value="all">Everyone</option><option value="students">Students</option><option value="teachers">Teachers</option></select></Field>
              <Field label="Title" error={be.title}><input className="input" maxLength={80} value={b.title} onChange={(e) => setB({ ...b, title: e.target.value })} /></Field>
              <Field label="Message" error={be.message}><textarea className="input" rows={4} maxLength={400} value={b.message} onChange={(e) => setB({ ...b, message: e.target.value })} /></Field>
              <button className="btn btn-primary" disabled={bb}><Icon name="bell" />{bb ? 'Sending...' : 'Send notification'}</button>
            </form>
          </Card>
        </div>
      )}</Loadable>
    </>
  );
}
