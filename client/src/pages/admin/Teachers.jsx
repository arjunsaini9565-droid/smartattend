import React, { useState } from 'react';
import { api } from '../../api';
import { PageHeader, Card, DataTable, SearchInput, Badge, Avatar, FormModal, useToast, useConfirm, Icon } from '../../ui';
import { useAsync, useDebounced } from '../../util';

export default function Teachers() {
  const toast = useToast(); const confirm = useConfirm();
  const [q, setQ] = useState(''); const dq = useDebounced(q);
  const depts = useAsync(() => api.get('/departments'), []);
  const state = useAsync(() => api.get('/teachers', { q: dq }), [dq]);
  const [edit, setEdit] = useState(null);
  const deptOpts = (depts.data?.items || []).map((d) => ({ value: d.id, label: d.name }));
  const fields = (isNew) => [
    { name: 'name', label: 'Full name', required: true, minLength: 2, maxLength: 80, pattern: /^[\p{L} .'-]+$/u, patternMessage: "Name may only contain letters, spaces and . ' -" },
    { name: 'email', label: 'Email', type: 'email', required: true },
    { name: 'employee_id', label: 'Employee ID', required: true, maxLength: 20, pattern: /^[A-Za-z0-9/-]+$/, patternMessage: 'Letters, digits, - and / only' },
    { name: 'department_id', label: 'Department', type: 'select', options: deptOpts, required: true },
    { name: 'phone', label: 'Phone', pattern: /^[0-9+() -]*$/, patternMessage: 'Digits, spaces, + ( ) - only', maxLength: 20 },
    { name: 'password', label: isNew ? 'Initial password' : 'New password (optional)', type: 'password', autoComplete: 'new-password', help: isNew ? 'Defaults to Teacher@123 if left blank' : 'Leave blank to keep the current password',
      validate: (v) => (v && (v.length < 8 || !/[A-Za-z]/.test(v) || !/\d/.test(v)) ? '8+ characters with letters and numbers' : null) },
  ];
  async function save(values) {
    if (!values.password) delete values.password;
    if (edit.id) await api.put(`/teachers/${edit.id}`, values); else await api.post('/teachers', values);
    toast.success(edit.id ? 'Teacher updated' : 'Teacher added'); setEdit(null); state.reload(true);
  }
  async function approval(t, active) {
    try { await api.put(`/teachers/${t.id}/approval`, { active }); toast.success(active ? `${t.name} approved` : `${t.name} deactivated`); state.reload(true); } catch (e) { toast.error(e.message); }
  }
  async function remove(t) {
    if (!(await confirm({ title: 'Delete teacher?', message: `${t.name} will be permanently removed.`, confirmLabel: 'Delete', danger: true }))) return;
    try { await api.del(`/teachers/${t.id}`); toast.success('Teacher deleted'); state.reload(true); } catch (e) { toast.error(e.message); }
  }
  const pending = (state.data?.items || []).filter((t) => !t.active);
  return (
    <>
      <PageHeader title="Teachers" subtitle="Manage faculty accounts and approvals" actions={<button className="btn btn-primary" onClick={() => setEdit({})}><Icon name="plus" />Add teacher</button>} />
      {pending.length > 0 && <div className="callout warn"><Icon name="alert" /><div><strong>{pending.length} account{pending.length > 1 ? 's' : ''} awaiting approval</strong><div>{pending.map((t) => t.name).join(', ')}</div></div></div>}
      <Card pad={false}>
        <div className="toolbar"><SearchInput value={q} onChange={setQ} placeholder="Search by name, employee ID or email" /></div>
        <DataTable loading={state.loading} rows={state.data?.items} empty="No teachers found" cols={[
          { h: 'Teacher', render: (t) => <div className="person"><Avatar name={t.name} /><div><strong>{t.name}</strong><small>{t.email}</small></div></div> },
          { h: 'Employee ID', key: 'employee_id' }, { h: 'Department', key: 'department_name', hideSm: true }, { h: 'Classes', key: 'classes', hideSm: true },
          { h: 'Status', render: (t) => (t.active ? <Badge kind="present">Active</Badge> : <Badge kind="late">Pending</Badge>) },
          { h: 'Actions', align: 'right', render: (t) => (
            <div className="row-actions">
              {t.active ? <button className="btn btn-sm btn-ghost" onClick={() => approval(t, false)}>Deactivate</button> : <button className="btn btn-sm btn-primary" onClick={() => approval(t, true)}>Approve</button>}
              <button className="icon-btn" aria-label={`Edit ${t.name}`} onClick={() => setEdit(t)}><Icon name="edit" size={16} /></button>
              <button className="icon-btn danger" aria-label={`Delete ${t.name}`} onClick={() => remove(t)}><Icon name="trash" size={16} /></button>
            </div>) },
        ]} />
      </Card>
      {edit && <FormModal title={edit.id ? 'Edit teacher' : 'Add teacher'} fields={fields(!edit.id)} initial={edit} onSubmit={save} onClose={() => setEdit(null)} />}
    </>
  );
}
