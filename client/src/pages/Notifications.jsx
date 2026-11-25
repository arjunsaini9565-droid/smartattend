import React from 'react';
import { api } from '../api';
import { PageHeader, Card, Loadable, Empty, Icon, useToast } from '../ui';
import { useAsync, fmtDateTime } from '../util';

export default function Notifications() {
  const toast = useToast(); const state = useAsync(() => api.get('/notifications'), []);
  const refresh = () => { state.reload(true); window.dispatchEvent(new Event('sa:notifications')); };
  const markAll = async () => { await api.post('/notifications/read', {}); refresh(); };
  const markOne = async (n) => { if (!n.is_read) { await api.post('/notifications/read', { ids: [n.id] }); refresh(); } };
  const remove = async (n) => { try { await api.del(`/notifications/${n.id}`); refresh(); } catch (e) { toast.error(e.message); } };
  return (
    <>
      <PageHeader title="Notifications" subtitle="Alerts about attendance, approvals and announcements" actions={<button className="btn btn-soft" onClick={markAll}><Icon name="check" size={16} />Mark all as read</button>} />
      <Loadable state={state}>{(d) => (d.items.length === 0 ? <Card><Empty icon="bell" title="No notifications" >You are all caught up.</Empty></Card> : (
        <Card pad={false}><div className="notif-list">{d.items.map((n) => (
          <div key={n.id} className={`notif-item big ${n.is_read ? '' : 'unread'}`} onClick={() => markOne(n)}>
            <span className={`notif-dot ${n.type}`} /><div><strong>{n.title}</strong><p>{n.message}</p><small>{fmtDateTime(n.created_at)}</small></div>
            <button className="icon-btn" aria-label="Delete notification" onClick={(e) => { e.stopPropagation(); remove(n); }}><Icon name="trash" size={15} /></button></div>))}</div></Card>))}</Loadable>
    </>
  );
}
