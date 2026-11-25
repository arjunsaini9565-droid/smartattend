// Thin fetch wrapper: JSON in/out, bearer token, friendly errors, file downloads.
let token = localStorage.getItem('sa_token') || null;

export class ApiError extends Error {
  constructor(message, status, fields) { super(message); this.status = status; this.fields = fields || {}; }
}
export const getToken = () => token;
export function setToken(t) { token = t; if (t) localStorage.setItem('sa_token', t); else localStorage.removeItem('sa_token'); }

function qs(params) {
  const p = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') p.set(k, v); });
  const s = p.toString();
  return s ? `?${s}` : '';
}

async function request(path, { method = 'GET', body, params } = {}) {
  let res;
  try {
    res = await fetch(`/api${path}${qs(params)}`, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Cannot reach the server. Check your connection and try again.', 0);
  }
  return res;
}

export async function api(path, opts) {
  const res = await request(path, opts);
  let data = null;
  try { data = await res.json(); } catch { /* empty */ }
  if (!res.ok) {
    if (res.status === 401 && token) { setToken(null); window.dispatchEvent(new Event('sa:logout')); }
    throw new ApiError((data && data.error) || `Request failed (${res.status})`, res.status, data && data.fields);
  }
  return data;
}
api.get = (p, params) => api(p, { params });
api.post = (p, body) => api(p, { method: 'POST', body: body || {} });
api.put = (p, body) => api(p, { method: 'PUT', body: body || {} });
api.del = (p) => api(p, { method: 'DELETE' });

export async function download(path, params) {
  const res = await request(path, { params });
  if (!res.ok) {
    let msg = `Download failed (${res.status})`;
    try { msg = (await res.json()).error || msg; } catch { /* ignore */ }
    throw new ApiError(msg, res.status);
  }
  const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '')?.[1] || 'report';
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return name;
}
