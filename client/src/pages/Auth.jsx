import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { Icon, Field, Tabs, useToast } from '../ui';

const DEMO = [
  { label: 'Admin', email: 'admin@smartattend.edu', password: 'Admin@123' },
  { label: 'Teacher', email: 'ananya.sharma@smartattend.edu', password: 'Teacher@123' },
  { label: 'Student', email: 'aarav.mehta@student.smartattend.edu', password: 'Student@123' },
];
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const pwProblem = (p) => (p.length < 8 ? 'Use at least 8 characters' : !/[A-Za-z]/.test(p) || !/\d/.test(p) ? 'Include both letters and numbers' : null);

function PasswordInput({ value, onChange, autoComplete, placeholder = 'Password' }) {
  const [show, setShow] = useState(false);
  return (
    <div className="pw-wrap">
      <input className="input" type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} placeholder={placeholder} />
      <button type="button" className="icon-btn pw-toggle" aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow(!show)}><Icon name="eye" size={16} /></button>
    </div>
  );
}

function Login({ onAuth }) {
  const [f, setF] = useState({ email: '', password: '' }); const [errors, setErrors] = useState({}); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function submit(e) {
    e.preventDefault(); const errs = {};
    if (!emailRe.test(f.email.trim())) errs.email = 'Enter a valid email address'; if (!f.password) errs.password = 'Enter your password';
    setErrors(errs); setError(''); if (Object.keys(errs).length) return;
    setBusy(true);
    try { onAuth(await api.post('/auth/login', { email: f.email.trim(), password: f.password })); }
    catch (err) { setError(err.message); setErrors(err.fields || {}); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} noValidate className="auth-form">
      {error && <div className="callout danger" role="alert"><Icon name="alert" />{error}</div>}
      <Field label="Email" error={errors.email}><input className="input" type="email" autoComplete="username" value={f.email} placeholder="you@college.edu" onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
      <Field label="Password" error={errors.password}><PasswordInput value={f.password} onChange={(v) => setF({ ...f, password: v })} autoComplete="current-password" /></Field>
      <button className="btn btn-primary btn-lg btn-block" disabled={busy}>{busy ? 'Signing in...' : 'Sign in'}</button>
      <div className="demo-box">
        <small>Demo accounts (sample data) - click to fill:</small>
        <div className="demo-chips">{DEMO.map((d) => <button type="button" key={d.label} className="chip" onClick={() => { setF({ email: d.email, password: d.password }); setErrors({}); setError(''); }}>{d.label}</button>)}</div>
      </div>
    </form>
  );
}

function Register({ onDone }) {
  const [meta, setMeta] = useState({ departments: [], courses: [] }); const [role, setRole] = useState('student');
  const [f, setF] = useState({ name: '', email: '', password: '', confirm: '', roll_no: '', course_id: '', semester: '', employee_id: '', department_id: '' });
  const [errors, setErrors] = useState({}); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const toast = useToast();
  useEffect(() => { api.get('/public/meta').then(setMeta).catch(() => setError('Could not load course list. Is the server running?')); }, []);
  const set = (k) => (e) => { setF({ ...f, [k]: e.target ? e.target.value : e }); setErrors({ ...errors, [k]: undefined }); };
  const course = meta.courses.find((c) => c.id === Number(f.course_id));

  async function submit(e) {
    e.preventDefault(); const errs = {};
    if (f.name.trim().length < 2) errs.name = 'Enter your full name';
    if (!emailRe.test(f.email.trim())) errs.email = 'Enter a valid email address';
    const pe = pwProblem(f.password); if (pe) errs.password = pe;
    if (f.confirm !== f.password) errs.confirm = 'Passwords do not match';
    if (role === 'student') {
      if (!f.roll_no.trim()) errs.roll_no = 'Roll number is required'; if (!f.course_id) errs.course_id = 'Select your course';
      const s = Number(f.semester); if (!f.semester || !Number.isInteger(s) || s < 1 || s > (course?.semesters || 12)) errs.semester = `Enter a semester between 1 and ${course?.semesters || 12}`;
    } else { if (!f.employee_id.trim()) errs.employee_id = 'Employee ID is required'; if (!f.department_id) errs.department_id = 'Select your department'; }
    setErrors(errs); setError(''); if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const body = { role, name: f.name, email: f.email, password: f.password, ...(role === 'student' ? { roll_no: f.roll_no, course_id: Number(f.course_id), semester: Number(f.semester) } : { employee_id: f.employee_id, department_id: Number(f.department_id) }) };
      const r = await api.post('/auth/register', body); toast.success(r.message); onDone(f.email);
    } catch (err) { setError(err.message); setErrors(err.fields || {}); } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} noValidate className="auth-form">
      <Tabs tabs={[{ value: 'student', label: 'Student' }, { value: 'teacher', label: 'Teacher' }]} value={role} onChange={(v) => { setRole(v); setErrors({}); }} />
      {error && <div className="callout danger" role="alert"><Icon name="alert" />{error}</div>}
      {role === 'teacher' && <div className="callout info"><Icon name="info" />Teacher accounts must be approved by an administrator before you can sign in.</div>}
      <Field label="Full name" error={errors.name}><input className="input" value={f.name} onChange={set('name')} autoComplete="name" /></Field>
      <Field label="Email" error={errors.email}><input className="input" type="email" value={f.email} onChange={set('email')} autoComplete="email" /></Field>
      {role === 'student' ? (
        <>
          <div className="row2">
            <Field label="Roll number" error={errors.roll_no}><input className="input" value={f.roll_no} onChange={set('roll_no')} placeholder="e.g. CS24015" /></Field>
            <Field label="Semester" error={errors.semester}><input className="input" type="number" min="1" max="12" value={f.semester} onChange={set('semester')} /></Field>
          </div>
          <Field label="Course" error={errors.course_id}><select className="input" value={f.course_id} onChange={set('course_id')}><option value="">Select course...</option>{meta.courses.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}</select></Field>
        </>
      ) : (
        <div className="row2">
          <Field label="Employee ID" error={errors.employee_id}><input className="input" value={f.employee_id} onChange={set('employee_id')} placeholder="e.g. T-1010" /></Field>
          <Field label="Department" error={errors.department_id}><select className="input" value={f.department_id} onChange={set('department_id')}><option value="">Select...</option>{meta.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
        </div>
      )}
      <div className="row2">
        <Field label="Password" error={errors.password} help="8+ characters with letters and numbers"><PasswordInput value={f.password} onChange={set('password')} autoComplete="new-password" /></Field>
        <Field label="Confirm password" error={errors.confirm}><PasswordInput value={f.confirm} onChange={set('confirm')} autoComplete="new-password" placeholder="Repeat password" /></Field>
      </div>
      <button className="btn btn-primary btn-lg btn-block" disabled={busy}>{busy ? 'Creating account...' : 'Create account'}</button>
    </form>
  );
}

export default function AuthPage({ onAuth, theme, toggleTheme }) {
  const [tab, setTab] = useState('login');
  return (
    <div className="auth">
      <section className="auth-hero">
        <div className="brand brand-light"><span className="brand-mark"><Icon name="scan" size={22} /></span><div><strong>SmartAttend AI</strong><small>Automated Attendance Management</small></div></div>
        <h1>Attendance that takes itself.</h1>
        <p>Face recognition marks students present in seconds - with blink-based liveness checks, duplicate prevention and a full audit trail.</p>
        <ul className="hero-points">
          <li><Icon name="camera" />Camera-based AI attendance</li><li><Icon name="shield" />Anti-spoofing & encrypted face data</li>
          <li><Icon name="chart" />Live analytics and 75% shortage alerts</li><li><Icon name="download" />One-click PDF / Excel reports</li>
        </ul>
      </section>
      <section className="auth-panel">
        <button className="icon-btn auth-theme" aria-label="Toggle dark mode" onClick={toggleTheme}><Icon name={theme === 'dark' ? 'sun' : 'moon'} /></button>
        <div className="auth-card">
          <h2>{tab === 'login' ? 'Welcome back' : 'Create your account'}</h2>
          <p className="muted-text">{tab === 'login' ? 'Sign in to continue to your dashboard.' : 'Register as a student or teacher.'}</p>
          <Tabs tabs={[{ value: 'login', label: 'Sign in' }, { value: 'register', label: 'Register' }]} value={tab} onChange={setTab} />
          {tab === 'login' ? <Login onAuth={onAuth} /> : <Register onDone={() => setTab('login')} />}
        </div>
      </section>
    </div>
  );
}
