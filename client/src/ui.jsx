import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { initials, statusColor, cap } from './util';

// ---------------- icons ----------------
const ICONS = {
  home: 'M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z',
  users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  cap: 'M22 10L12 5 2 10l10 5 10-5z M6 12v5c3 3 9 3 12 0v-5',
  book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20 M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z',
  building: 'M3 21h18 M5 21V7l8-4v18 M19 21V11l-6-4 M9 9v.01 M9 12v.01 M9 15v.01 M9 18v.01',
  calendar: 'M3 4h18v18H3z M16 2v4 M8 2v4 M3 10h18',
  camera: 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  chart: 'M18 20V10 M12 20V4 M6 20v-6',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8',
  bell: 'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 0 1-3.46 0',
  moon: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10 M12 1v2 M12 21v2 M4.22 4.22l1.42 1.42 M18.36 18.36l1.42 1.42 M1 12h2 M21 12h2 M4.22 19.78l1.42-1.42 M18.36 5.64l1.42-1.42',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9',
  menu: 'M3 12h18 M3 6h18 M3 18h18',
  x: 'M18 6L6 18 M6 6l12 12',
  plus: 'M12 5v14 M5 12h14',
  edit: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7 M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z',
  trash: 'M3 6h18 M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6 M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16 M21 21l-4.35-4.35',
  check: 'M20 6L9 17l-5-5',
  alert: 'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z M12 9v4 M12 17h.01',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20 M12 16v-4 M12 8h.01',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M17 8l-5-5-5 5 M12 3v12',
  play: 'M5 3l14 9-14 9z',
  stop: 'M6 6h12v12H6z',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  key: 'M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.78 7.78 5.5 5.5 0 0 1 7.78-7.78zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20 M12 6v6l4 2',
  scan: 'M3 7V5a2 2 0 0 1 2-2h2 M17 3h2a2 2 0 0 1 2 2v2 M21 17v2a2 2 0 0 1-2 2h-2 M7 21H5a2 2 0 0 1-2-2v-2 M8 14s1.5 2 4 2 4-2 4-2 M9 9h.01 M15 9h.01',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6 M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
  list: 'M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01',
  refresh: 'M23 4v6h-6 M1 20v-6h6 M3.51 9a9 9 0 0 1 14.85-3.36L23 10 M1 14l4.64 4.36A9 9 0 0 0 20.49 15',
  trending: 'M23 6l-9.5 9.5-5-5L1 18 M17 6h6v6',
  layers: 'M12 2L2 7l10 5 10-5z M2 17l10 5 10-5 M2 12l10 5 10-5',
  eye: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
};
export function Icon({ name, size = 18, className = '', ...rest }) {
  return (
    <svg className={`icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      <path d={ICONS[name] || ICONS.info} />
    </svg>
  );
}

// ---------------- toasts ----------------
const ToastCtx = createContext(null);
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((type, message) => {
    const id = Math.random().toString(36).slice(2);
    setItems((l) => [...l.slice(-3), { id, type, message }]);
    setTimeout(() => setItems((l) => l.filter((t) => t.id !== id)), type === 'error' ? 7000 : 4000);
  }, []);
  const api = useRef({ success: (m) => push('success', m), error: (m) => push('error', m), info: (m) => push('info', m) }).current;
  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            <Icon name={t.type === 'success' ? 'check' : t.type === 'error' ? 'alert' : 'info'} />
            <span>{t.message}</span>
            <button className="icon-btn" aria-label="Dismiss" onClick={() => setItems((l) => l.filter((x) => x.id !== t.id))}><Icon name="x" size={14} /></button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ---------------- modal + confirm ----------------
export function Modal({ title, onClose, children, footer, size = 'md' }) {
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', h); document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', h); document.body.style.overflow = ''; };
  }, [onClose]);
  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal modal-${size}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head"><h3>{title}</h3><button className="icon-btn" aria-label="Close" onClick={onClose}><Icon name="x" /></button></div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

const ConfirmCtx = createContext(null);
export const useConfirm = () => useContext(ConfirmCtx);
export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const confirm = useCallback((opts) => new Promise((resolve) => setState({ ...opts, resolve })), []);
  const close = (v) => { state.resolve(v); setState(null); };
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {state && (
        <Modal title={state.title || 'Are you sure?'} onClose={() => close(false)} size="sm"
          footer={<><button className="btn btn-ghost" onClick={() => close(false)}>Cancel</button>
            <button className={`btn ${state.danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => close(true)} autoFocus>{state.confirmLabel || 'Confirm'}</button></>}>
          <p className="muted-text">{state.message}</p>
        </Modal>
      )}
    </ConfirmCtx.Provider>
  );
}

// ---------------- forms ----------------
export function Field({ label, error, help, children, required }) {
  return (
    <label className={`field ${error ? 'has-error' : ''}`}>
      {label && <span className="field-label">{label}{required && <span className="req"> *</span>}</span>}
      {children}
      {error ? <span className="field-error" role="alert">{error}</span> : help ? <span className="field-help">{help}</span> : null}
    </label>
  );
}

function checkField(f, value, values) {
  const empty = value === undefined || value === null || String(value).trim() === '';
  if (empty) return f.required ? `${f.label} is required` : null;
  const s = String(value).trim();
  if (f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) return 'Enter a valid email address';
  if (f.type === 'number') {
    const n = Number(s);
    if (!Number.isFinite(n) || (f.integer !== false && !Number.isInteger(n))) return `${f.label} must be a whole number`;
    if (f.min !== undefined && n < f.min) return `${f.label} must be at least ${f.min}`;
    if (f.max !== undefined && n > f.max) return `${f.label} must be at most ${f.max}`;
  }
  if (f.minLength && s.length < f.minLength) return `${f.label} must be at least ${f.minLength} characters`;
  if (f.pattern && !f.pattern.test(s)) return f.patternMessage || `${f.label} has an invalid format`;
  if (f.validate) return f.validate(value, values) || null;
  return null;
}

// Generic form dialog: client-side validation + server field errors.
export function FormModal({ title, fields, initial = {}, onSubmit, onClose, submitLabel = 'Save', size = 'md', note }) {
  const [values, setValues] = useState(() => Object.fromEntries(fields.map((f) => [f.name, initial[f.name] ?? f.default ?? ''])));
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const set = (name, v) => { setValues((x) => ({ ...x, [name]: v })); setErrors((e) => ({ ...e, [name]: undefined })); };
  const visible = fields.filter((f) => !f.hidden || !f.hidden(values));

  async function submit(e) {
    e.preventDefault();
    const errs = {};
    visible.forEach((f) => { const m = checkField(f, values[f.name], values); if (m) errs[f.name] = m; });
    setErrors(errs); setFormError('');
    if (Object.keys(errs).length) { document.querySelector('.modal .has-error input, .modal .has-error select, .modal .has-error textarea')?.focus(); return; }
    setBusy(true);
    try {
      const out = {};
      visible.forEach((f) => { const v = values[f.name]; out[f.name] = f.type === 'number' && v !== '' ? Number(v) : typeof v === 'string' ? v.trim() : v; });
      await onSubmit(out);
    } catch (err) {
      setErrors(err.fields || {}); setFormError(err.message || 'Could not save');
    } finally { setBusy(false); }
  }

  return (
    <Modal title={title} onClose={onClose} size={size}
      footer={<><button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button type="submit" form="form-modal" className="btn btn-primary" disabled={busy}>{busy ? 'Saving...' : submitLabel}</button></>}>
      <form id="form-modal" onSubmit={submit} noValidate className="form-grid">
        {note && <div className="callout info full">{note}</div>}
        {formError && <div className="callout danger full" role="alert"><Icon name="alert" />{formError}</div>}
        {visible.map((f) => (
          <Field key={f.name} label={f.label} error={errors[f.name]} help={f.help} required={f.required}>
            {f.type === 'select' ? (
              <select className="input" value={values[f.name]} onChange={(e) => set(f.name, e.target.value)} disabled={f.disabled}>
                <option value="">{f.placeholder || 'Select...'}</option>
                {(typeof f.options === 'function' ? f.options(values) : f.options || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : f.type === 'textarea' ? (
              <textarea className="input" rows={3} value={values[f.name]} placeholder={f.placeholder} onChange={(e) => set(f.name, e.target.value)} />
            ) : (
              <input className="input" type={f.type === 'number' ? 'number' : f.type || 'text'} value={values[f.name]} placeholder={f.placeholder} autoComplete={f.autoComplete || 'off'}
                min={f.min} max={f.max} maxLength={f.maxLength} step={f.step} onChange={(e) => set(f.name, e.target.value)} disabled={f.disabled} />
            )}
          </Field>
        ))}
      </form>
    </Modal>
  );
}

// ---------------- display ----------------
export function Badge({ kind = 'neutral', children }) { return <span className={`badge badge-${kind}`}>{children}</span>; }
export function StatusBadge({ status }) {
  if (!status) return <Badge kind="neutral">Pending</Badge>;
  return <Badge kind={status}>{cap(status)}</Badge>;
}
export const Avatar = ({ name, size = 36 }) => <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.38 }}>{initials(name)}</span>;
export const Spinner = ({ label = 'Loading...' }) => <div className="spinner-wrap" role="status"><span className="spinner" /><span>{label}</span></div>;
export function Empty({ icon = 'file', title, children }) {
  return <div className="empty"><Icon name={icon} size={34} /><strong>{title}</strong>{children && <p>{children}</p>}</div>;
}
export function ErrorState({ error, onRetry }) {
  return <div className="callout danger"><Icon name="alert" /><div><strong>Something went wrong</strong><div>{error?.message || 'Please try again.'}</div></div>{onRetry && <button className="btn btn-sm btn-ghost" onClick={() => onRetry()}>Retry</button>}</div>;
}
export function Loadable({ state, children }) {
  if (state.loading && !state.data) return <Spinner />;
  if (state.error) return <ErrorState error={state.error} onRetry={state.reload} />;
  return state.data ? children(state.data) : null;
}
export function PageHeader({ title, subtitle, actions }) {
  return <div className="page-head"><div><h1>{title}</h1>{subtitle && <p className="muted-text">{subtitle}</p>}</div>{actions && <div className="page-actions">{actions}</div>}</div>;
}
export function Card({ title, actions, children, className = '', pad = true }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && <div className="card-head"><h2>{title}</h2><div className="card-actions">{actions}</div></div>}
      <div className={pad ? 'card-body' : ''}>{children}</div>
    </section>
  );
}
export function StatCard({ icon, label, value, sub, tone = 'blue' }) {
  return (
    <div className="card stat">
      <span className={`stat-icon tone-${tone}`}><Icon name={icon} size={20} /></span>
      <div><div className="stat-label">{label}</div><div className="stat-value">{value}</div>{sub && <div className="stat-sub">{sub}</div>}</div>
    </div>
  );
}
export function ProgressBar({ value, threshold = 75 }) {
  const v = Math.max(0, Math.min(100, value ?? 0));
  return <div className="progress" role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${v}%`, background: statusColor(value, threshold) }} /></div>;
}
export function Tabs({ tabs, value, onChange }) {
  return <div className="tabs" role="tablist">{tabs.map((t) => <button key={t.value} role="tab" aria-selected={value === t.value} className={`tab ${value === t.value ? 'active' : ''}`} onClick={() => onChange(t.value)}>{t.icon && <Icon name={t.icon} size={15} />}{t.label}</button>)}</div>;
}
export function SearchInput({ value, onChange, placeholder = 'Search...' }) {
  return <div className="search"><Icon name="search" size={16} /><input className="input" type="search" value={value} placeholder={placeholder} aria-label={placeholder} onChange={(e) => onChange(e.target.value)} /></div>;
}
export function Pagination({ page, pages, onPage }) {
  if (pages <= 1) return null;
  return <div className="pagination"><button className="btn btn-sm btn-ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button><span>Page {page} of {pages}</span><button className="btn btn-sm btn-ghost" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button></div>;
}
export function DataTable({ cols, rows, rowKey = 'id', empty = 'No records found', loading, onRowClick }) {
  if (loading && !rows?.length) return <Spinner />;
  if (!rows?.length) return <Empty icon="list" title={empty} />;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead><tr>{cols.map((c) => <th key={c.h} style={{ textAlign: c.align, width: c.width }} className={c.hideSm ? 'hide-sm' : ''}>{c.h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => (
          <tr key={r[rowKey] ?? i} onClick={onRowClick ? () => onRowClick(r) : undefined} className={onRowClick ? 'clickable' : ''}>
            {cols.map((c) => <td key={c.h} style={{ textAlign: c.align }} className={c.hideSm ? 'hide-sm' : ''} data-label={c.h}>{c.render ? c.render(r) : r[c.key]}</td>)}
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}
