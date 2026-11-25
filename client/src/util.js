import { useCallback, useEffect, useRef, useState } from 'react';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function fmtDate(d) {
  if (!d) return '-';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  if (m && d.length <= 10) return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
  const dt = new Date(d); return isNaN(dt) ? '-' : `${dt.getDate()} ${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`;
}
export const fmtTime = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-');
export const fmtDateTime = (iso) => (iso ? `${fmtDate(iso)}, ${fmtTime(iso)}` : '-');
export const pctText = (p) => (p === null || p === undefined ? '-' : `${p}%`);
export const initials = (name = '') => name.replace(/^(Dr|Prof)\.?\s+/i, '').split(/\s+/).slice(0, 2).map((s) => s[0]).join('').toUpperCase();
export const todayStr = (offset = 0) => { const d = new Date(); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');
export function shortLabel(label, granularity) {
  if (!label) return '';
  if (granularity === 'monthly') { const [y, m] = label.split('-'); return `${MONTHS[Number(m) - 1]} ${y.slice(2)}`; }
  const [, m, d] = label.split('-'); return `${Number(d)} ${MONTHS[Number(m) - 1]}`;
}
export const statusColor = (p, threshold = 75) => (p === null || p === undefined ? 'var(--muted)' : p < threshold ? 'var(--danger)' : p < threshold + 10 ? 'var(--warning)' : 'var(--success)');

// ---- tiny hash router ----
export function useRoute() {
  const get = () => (window.location.hash.replace(/^#/, '') || '/');
  const [route, setRoute] = useState(get());
  useEffect(() => { const h = () => { setRoute(get()); window.scrollTo(0, 0); }; window.addEventListener('hashchange', h); return () => window.removeEventListener('hashchange', h); }, []);
  return route;
}
export const navigate = (path) => { window.location.hash = path; };

// ---- data loading hook ----
export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const alive = useRef(true); const seq = useRef(0);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const run = useCallback((silent) => {
    const id = ++seq.current;
    if (!silent) setState((s) => ({ ...s, loading: true, error: null }));
    return Promise.resolve().then(fn).then(
      (data) => { if (alive.current && id === seq.current) setState({ data, loading: false, error: null }); return data; },
      (error) => { if (alive.current && id === seq.current) setState((s) => ({ data: silent ? s.data : null, loading: false, error })); },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { run(); }, [run]);
  return { ...state, reload: run };
}

export function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}
