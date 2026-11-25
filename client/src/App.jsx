import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken } from './api';
import { Icon, ToastProvider, ConfirmProvider, Avatar, Spinner, useToast, Badge } from './ui';
import { useRoute, navigate, fmtDateTime, cap } from './util';
import AuthPage from './pages/Auth';
import AdminDashboard from './pages/admin/Dashboard';
import Students from './pages/Students';
import Teachers from './pages/admin/Teachers';
import Academics from './pages/admin/Academics';
import AdminSettings from './pages/admin/Settings';
import Reports from './pages/Reports';
import TeacherDashboard from './pages/teacher/Dashboard';
import MyClasses from './pages/teacher/Classes';
import LiveSession from './pages/teacher/LiveSession';
import AuditTrail from './pages/teacher/Audit';
import StudentDashboard from './pages/student/Dashboard';
import StudentHistory from './pages/student/History';
import StudentDetail from './pages/StudentDetail';
import Notifications from './pages/Notifications';
import Profile from './pages/Profile';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

const NAV = {
  admin: [
    { path: '/', label: 'Dashboard', icon: 'home' }, { path: '/students', label: 'Students', icon: 'cap' }, { path: '/teachers', label: 'Teachers', icon: 'users' },
    { path: '/academics', label: 'Academics', icon: 'layers' }, { path: '/reports', label: 'Reports & Analytics', icon: 'chart' },
    { path: '/notifications', label: 'Notifications', icon: 'bell' }, { path: '/settings', label: 'Settings', icon: 'settings' }, { path: '/profile', label: 'Account', icon: 'user' },
  ],
  teacher: [
    { path: '/', label: 'Dashboard', icon: 'home' }, { path: '/classes', label: 'My Classes', icon: 'book' }, { path: '/students', label: 'Students', icon: 'cap' },
    { path: '/reports', label: 'Reports & Analytics', icon: 'chart' }, { path: '/audit', label: 'Audit Trail', icon: 'shield' },
    { path: '/notifications', label: 'Notifications', icon: 'bell' }, { path: '/profile', label: 'Account', icon: 'user' },
  ],
  student: [
    { path: '/', label: 'Dashboard', icon: 'home' }, { path: '/history', label: 'Attendance History', icon: 'calendar' },
    { path: '/notifications', label: 'Notifications', icon: 'bell' }, { path: '/profile', label: 'My Profile', icon: 'user' },
  ],
};

function pageFor(role, route) {
  const [, seg, arg] = route.split('/');
  const path = '/' + (seg || '');
  if (path === '/notifications') return <Notifications />;
  if (path === '/profile') return <Profile />;
  if (role === 'admin') {
    switch (path) {
      case '/': return <AdminDashboard />; case '/students': return <Students />; case '/teachers': return <Teachers />; case '/academics': return <Academics />;
      case '/reports': return <Reports />; case '/settings': return <AdminSettings />; case '/session': return <LiveSession id={arg} />; case '/student': return <StudentDetail id={arg} />;
      default: return null;
    }
  }
  if (role === 'teacher') {
    switch (path) {
      case '/': return <TeacherDashboard />; case '/classes': return <MyClasses />; case '/students': return <Students />; case '/reports': return <Reports />;
      case '/audit': return <AuditTrail />; case '/session': return <LiveSession id={arg} />; case '/student': return <StudentDetail id={arg} />;
      default: return null;
    }
  }
  switch (path) { case '/': return <StudentDashboard />; case '/history': return <StudentHistory />; default: return null; }
}

function NotificationBell() {
  const [data, setData] = useState({ items: [], unread: 0 }); const [open, setOpen] = useState(false);
  const load = useCallback(() => api.get('/notifications').then(setData).catch(() => {}), []);
  useEffect(() => { load(); const t = setInterval(load, 30000); window.addEventListener('sa:notifications', load); return () => { clearInterval(t); window.removeEventListener('sa:notifications', load); }; }, [load]);
  useEffect(() => { if (!open) return; const h = (e) => { if (!e.target.closest('.bell-wrap')) setOpen(false); }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, [open]);
  const markAll = async () => { await api.post('/notifications/read', {}); load(); };
  return (
    <div className="bell-wrap">
      <button className="icon-btn" aria-label={`Notifications${data.unread ? `, ${data.unread} unread` : ''}`} onClick={() => setOpen(!open)}>
        <Icon name="bell" />{data.unread > 0 && <span className="bell-dot">{data.unread > 9 ? '9+' : data.unread}</span>}
      </button>
      {open && (
        <div className="dropdown bell-menu">
          <div className="dropdown-head"><strong>Notifications</strong>{data.unread > 0 && <button className="link-btn" onClick={markAll}>Mark all read</button>}</div>
          {data.items.length === 0 ? <div className="dropdown-empty">You're all caught up</div> : data.items.slice(0, 6).map((n) => (
            <div key={n.id} className={`notif-item ${n.is_read ? '' : 'unread'}`}><span className={`notif-dot ${n.type}`} /><div><strong>{n.title}</strong><p>{n.message}</p><small>{fmtDateTime(n.created_at)}</small></div></div>
          ))}
          <button className="dropdown-foot" onClick={() => { setOpen(false); navigate('/notifications'); }}>View all notifications</button>
        </div>
      )}
    </div>
  );
}

function Shell({ user, logout, theme, toggleTheme }) {
  const route = useRoute(); const [menu, setMenu] = useState(false);
  const nav = NAV[user.role]; const page = pageFor(user.role, route);
  const active = (p) => (p === '/' ? route === '/' : route === p || route.startsWith(p + '/'));
  useEffect(() => setMenu(false), [route]);
  return (
    <div className="app">
      <aside className={`sidebar ${menu ? 'open' : ''}`}>
        <div className="brand"><span className="brand-mark"><Icon name="scan" size={20} /></span><div><strong>SmartAttend AI</strong><small>Attendance Management</small></div></div>
        <nav aria-label="Main">
          {nav.map((n) => <a key={n.path} href={`#${n.path}`} className={`nav-link ${active(n.path) ? 'active' : ''}`} aria-current={active(n.path) ? 'page' : undefined}><Icon name={n.icon} />{n.label}</a>)}
        </nav>
        <div className="sidebar-foot">
          <div className="user-chip"><Avatar name={user.name} /><div><strong>{user.name}</strong><small>{cap(user.role)}</small></div></div>
          <button className="btn btn-ghost btn-block" onClick={logout}><Icon name="logout" />Sign out</button>
        </div>
      </aside>
      {menu && <div className="scrim" onClick={() => setMenu(false)} />}
      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu-btn" aria-label="Open menu" onClick={() => setMenu(true)}><Icon name="menu" /></button>
          <div className="topbar-title"><Badge kind="primary">{cap(user.role)} portal</Badge></div>
          <div className="topbar-actions">
            <button className="icon-btn" aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} onClick={toggleTheme}><Icon name={theme === 'dark' ? 'sun' : 'moon'} /></button>
            <NotificationBell />
            <button className="icon-btn" aria-label="Account" onClick={() => navigate('/profile')}><Avatar name={user.name} size={32} /></button>
          </div>
        </header>
        <main className="content" id="content">{page || <div className="empty"><strong>Page not found</strong><p><a href="#/">Go to your dashboard</a></p></div>}</main>
      </div>
    </div>
  );
}

function Root() {
  const toast = useToast();
  const [user, setUser] = useState(null); const [booting, setBooting] = useState(!!getToken());
  const [theme, setTheme] = useState(() => localStorage.getItem('sa_theme') || (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('sa_theme', theme); }, [theme]);
  const logout = useCallback((expired) => { setToken(null); setUser(null); navigate('/'); if (expired === true) toast.info('Your session has expired. Please sign in again.'); }, [toast]);
  useEffect(() => {
    if (getToken()) api.get('/auth/me').then((r) => setUser(r.user)).catch(() => setToken(null)).finally(() => setBooting(false));
    const h = () => logout(true); window.addEventListener('sa:logout', h); return () => window.removeEventListener('sa:logout', h);
  }, [logout]);
  const ctx = { user, setUser, refresh: () => api.get('/auth/me').then((r) => setUser(r.user)) };
  if (booting) return <div className="boot"><Spinner label="Starting SmartAttend AI..." /></div>;
  if (!user) return <AuthPage onAuth={({ token, user: u }) => { setToken(token); setUser(u); navigate('/'); }} theme={theme} toggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')} />;
  return <AuthCtx.Provider value={ctx}><Shell user={user} logout={() => logout()} theme={theme} toggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')} /></AuthCtx.Provider>;
}

export default function App() { return <ToastProvider><ConfirmProvider><Root /></ConfirmProvider></ToastProvider>; }
