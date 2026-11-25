import React, { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../App';
import { PageHeader, Card, Field, Avatar, Badge, useToast, Icon } from '../ui';
import { cap, fmtDateTime } from '../util';

export default function Profile() {
  const { user, setUser } = useAuth(); const toast = useToast();
  const phone0 = user.student?.phone || user.teacher?.phone || '';
  const [p, setP] = useState({ name: user.name, phone: phone0 }); const [pe, setPe] = useState({}); const [pb, setPb] = useState(false);
  const [w, setW] = useState({ current: '', next: '', confirm: '' }); const [we, setWe] = useState({}); const [wb, setWb] = useState(false);

  async function saveProfile(e) {
    e.preventDefault(); const errs = {};
    if (p.name.trim().length < 2) errs.name = 'Enter your full name'; if (p.phone && !/^[0-9+() -]*$/.test(p.phone)) errs.phone = 'Digits, spaces, + ( ) - only';
    setPe(errs); if (Object.keys(errs).length) return;
    setPb(true);
    try { const r = await api.put('/auth/profile', p); setUser(r.user); toast.success('Profile updated'); } catch (err) { setPe(err.fields || {}); toast.error(err.message); } finally { setPb(false); }
  }
  async function changePw(e) {
    e.preventDefault(); const errs = {};
    if (!w.current) errs.current = 'Enter your current password';
    if (w.next.length < 8 || !/[A-Za-z]/.test(w.next) || !/\d/.test(w.next)) errs.next = '8+ characters with letters and numbers';
    else if (w.next === w.current) errs.next = 'New password must differ from the current one';
    if (w.confirm !== w.next) errs.confirm = 'Passwords do not match';
    setWe(errs); if (Object.keys(errs).length) return;
    setWb(true);
    try { await api.post('/auth/change-password', { current: w.current, next: w.next }); toast.success('Password changed'); setW({ current: '', next: '', confirm: '' }); } catch (err) { setWe(err.fields || {}); toast.error(err.message); } finally { setWb(false); }
  }
  return (
    <>
      <PageHeader title="Account" subtitle="Your profile and password" />
      <div className="grid two">
        <Card title="Profile">
          <div className="profile-head"><Avatar name={user.name} size={56} /><div><strong>{user.name}</strong><div className="muted-text">{user.email}</div><Badge kind="primary">{cap(user.role)}</Badge></div></div>
          <dl className="kv">
            {user.student && <><dt>Roll number</dt><dd>{user.student.roll_no}</dd><dt>Course</dt><dd>{user.student.course_name} - Sem {user.student.semester}</dd><dt>Face enrollment</dt><dd>{user.student.face_enrolled ? 'Enrolled' : 'Not enrolled'}</dd></>}
            {user.teacher && <><dt>Employee ID</dt><dd>{user.teacher.employee_id}</dd><dt>Department</dt><dd>{user.teacher.department_name || '-'}</dd></>}
            <dt>Last sign-in</dt><dd>{fmtDateTime(user.last_login)}</dd>
          </dl>
          {user.role !== 'admin' && (
            <form onSubmit={saveProfile} noValidate className="stack">
              <Field label="Full name" error={pe.name}><input className="input" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} /></Field>
              <Field label="Phone" error={pe.phone}><input className="input" value={p.phone} maxLength={20} onChange={(e) => setP({ ...p, phone: e.target.value })} /></Field>
              <button className="btn btn-primary" disabled={pb}>{pb ? 'Saving...' : 'Save profile'}</button>
            </form>)}
        </Card>
        <Card title="Change password">
          <form onSubmit={changePw} noValidate className="stack">
            <Field label="Current password" error={we.current}><input className="input" type="password" autoComplete="current-password" value={w.current} onChange={(e) => setW({ ...w, current: e.target.value })} /></Field>
            <Field label="New password" error={we.next} help="8+ characters with letters and numbers"><input className="input" type="password" autoComplete="new-password" value={w.next} onChange={(e) => setW({ ...w, next: e.target.value })} /></Field>
            <Field label="Confirm new password" error={we.confirm}><input className="input" type="password" autoComplete="new-password" value={w.confirm} onChange={(e) => setW({ ...w, confirm: e.target.value })} /></Field>
            <button className="btn btn-primary" disabled={wb}><Icon name="key" size={16} />{wb ? 'Updating...' : 'Update password'}</button>
          </form>
        </Card>
      </div>
    </>
  );
}
