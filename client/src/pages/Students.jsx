import React, { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../App';
import { PageHeader, Card, DataTable, SearchInput, Pagination, Badge, Avatar, FormModal, useToast, useConfirm, Icon } from '../ui';
import { useAsync, useDebounced, navigate } from '../util';
import FaceEnroll from './FaceEnroll';

export default function Students() {
  const { user } = useAuth(); const isAdmin = user.role === 'admin'; const toast = useToast(); const confirm = useConfirm();
  const [q, setQ] = useState(''); const [course, setCourse] = useState(''); const [face, setFace] = useState(''); const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const courses = useAsync(() => api.get('/courses'), []);
  const state = useAsync(() => api.get('/students', { q: dq, course_id: course, face, page, limit: 15 }), [dq, course, face, page]);
  const [edit, setEdit] = useState(null); const [enroll, setEnroll] = useState(null);

  const courseOpts = (courses.data?.items || []).map((c) => ({ value: c.id, label: `${c.name} (${c.code})` }));
  const maxSem = (cid) => (courses.data?.items || []).find((c) => c.id === Number(cid))?.semesters || 12;
  const fields = (isNew) => [
    { name: 'name', label: 'Full name', required: true, minLength: 2, maxLength: 80, pattern: /^[\p{L} .'-]+$/u, patternMessage: "Name may only contain letters, spaces and . ' -" },
    { name: 'email', label: 'Email', type: 'email', required: true },
    { name: 'roll_no', label: 'Roll number', required: true, maxLength: 20, pattern: /^[A-Za-z0-9/-]+$/, patternMessage: 'Letters, digits, - and / only' },
    { name: 'course_id', label: 'Course', type: 'select', options: courseOpts, required: true },
    { name: 'semester', label: 'Semester', type: 'number', min: 1, max: 12, required: true, validate: (v, all) => (Number(v) > maxSem(all.course_id) ? `This course has ${maxSem(all.course_id)} semesters` : null) },
    { name: 'section', label: 'Section', maxLength: 5, default: 'A' },
    { name: 'phone', label: 'Phone', pattern: /^[0-9+() -]*$/, patternMessage: 'Digits, spaces, + ( ) - only', maxLength: 20 },
    { name: 'password', label: isNew ? 'Initial password' : 'New password (optional)', type: 'password', help: isNew ? 'Defaults to Student@123 if left blank' : 'Leave blank to keep the current password', autoComplete: 'new-password',
      validate: (v) => (v && (v.length < 8 || !/[A-Za-z]/.test(v) || !/\d/.test(v)) ? '8+ characters with letters and numbers' : null) },
  ];

  async function save(values) {
    if (!values.password) delete values.password;
    if (edit.id) await api.put(`/students/${edit.id}`, values); else await api.post('/students', values);
    toast.success(edit.id ? 'Student updated' : 'Student added'); setEdit(null); state.reload(true);
  }
  async function remove(s) {
    if (!(await confirm({ title: 'Delete student?', message: `${s.name} (${s.roll_no}) and all of their attendance records will be permanently deleted.`, confirmLabel: 'Delete', danger: true }))) return;
    try { await api.del(`/students/${s.id}`); toast.success('Student deleted'); state.reload(true); } catch (e) { toast.error(e.message); }
  }
  async function removeFace(s) {
    if (!(await confirm({ title: 'Remove face data?', message: `${s.name} will no longer be recognized by the camera until a new photo is enrolled.`, confirmLabel: 'Remove', danger: true }))) return;
    try { await api.del(`/students/${s.id}/face`); toast.success('Face data removed'); state.reload(true); } catch (e) { toast.error(e.message); }
  }

  return (
    <>
      <PageHeader title="Students" subtitle={isAdmin ? 'Manage student records and face enrollment' : 'Students in your classes'}
        actions={isAdmin && <button className="btn btn-primary" onClick={() => setEdit({})}><Icon name="plus" />Add student</button>} />
      <Card pad={false}>
        <div className="toolbar">
          <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search by name, roll number or email" />
          <select className="input" value={course} onChange={(e) => { setCourse(e.target.value); setPage(1); }} aria-label="Filter by course"><option value="">All courses</option>{courseOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
          <select className="input" value={face} onChange={(e) => { setFace(e.target.value); setPage(1); }} aria-label="Filter by face status"><option value="">Any face status</option><option value="enrolled">Face enrolled</option><option value="missing">Face missing</option></select>
        </div>
        <DataTable loading={state.loading} rows={state.data?.items} empty={state.error ? state.error.message : 'No students match your search'} cols={[
          { h: 'Student', render: (s) => <div className="person"><Avatar name={s.name} /><div><strong>{s.name}</strong><small>{s.email}</small></div></div> },
          { h: 'Roll no', key: 'roll_no' },
          { h: 'Course', hideSm: true, render: (s) => `${s.course_code} - Sem ${s.semester}` },
          { h: 'Face AI', render: (s) => (s.face_enrolled ? <Badge kind="present"><Icon name="check" size={12} /> {s.face_samples} sample{s.face_samples > 1 ? 's' : ''}</Badge> : <Badge kind="absent">Not enrolled</Badge>) },
          { h: 'Actions', align: 'right', render: (s) => (
            <div className="row-actions">
              <button className="btn btn-sm btn-ghost" title="View attendance" onClick={() => navigate(`/student/${s.id}`)}><Icon name="chart" size={15} /></button>
              <button className="btn btn-sm btn-soft" onClick={() => setEnroll(s)}><Icon name="camera" size={15} />{s.face_enrolled ? 'Re-enroll' : 'Enroll face'}</button>
              {isAdmin && <><button className="icon-btn" aria-label={`Edit ${s.name}`} onClick={() => setEdit(s)}><Icon name="edit" size={16} /></button>
                {s.face_enrolled && <button className="icon-btn" aria-label="Remove face data" title="Remove face data" onClick={() => removeFace(s)}><Icon name="scan" size={16} /></button>}
                <button className="icon-btn danger" aria-label={`Delete ${s.name}`} onClick={() => remove(s)}><Icon name="trash" size={16} /></button></>}
            </div>) },
        ]} />
        <div className="table-foot"><span className="muted-text">{state.data ? `${state.data.total} student${state.data.total === 1 ? '' : 's'}` : ''}</span><Pagination page={page} pages={state.data?.pages || 1} onPage={setPage} /></div>
      </Card>
      {edit && <FormModal title={edit.id ? 'Edit student' : 'Add student'} fields={fields(!edit.id)} initial={edit} onSubmit={save} onClose={() => setEdit(null)} />}
      {enroll && <FaceEnroll student={enroll} onClose={() => setEnroll(null)} onSaved={() => { setEnroll(null); state.reload(true); }} />}
    </>
  );
}
