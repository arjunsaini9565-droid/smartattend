import React, { useState } from 'react';
import { api } from '../../api';
import { PageHeader, Card, DataTable, Tabs, FormModal, useToast, useConfirm, Icon, Badge } from '../../ui';
import { useAsync } from '../../util';

const codeRule = { pattern: /^[A-Za-z0-9-]+$/, patternMessage: 'Letters, digits and - only' };

function Resource({ path, singular, fields, columns, extra, reloadKey }) {
  const toast = useToast(); const confirm = useConfirm();
  const state = useAsync(() => api.get(path), [path, reloadKey]); const [edit, setEdit] = useState(null);
  async function save(v) {
    if (edit.id) await api.put(`${path}/${edit.id}`, v); else await api.post(path, v);
    toast.success(`${singular} ${edit.id ? 'updated' : 'added'}`); setEdit(null); state.reload(true); extra?.onChange?.();
  }
  async function remove(r) {
    if (!(await confirm({ title: `Delete ${singular.toLowerCase()}?`, message: `"${r.name || r.subject}" will be permanently deleted along with everything that depends on it.`, confirmLabel: 'Delete', danger: true }))) return;
    try { await api.del(`${path}/${r.id}`); toast.success(`${singular} deleted`); state.reload(true); extra?.onChange?.(); } catch (e) { toast.error(e.message); }
  }
  return (
    <Card pad={false} title={`${singular}s`} actions={<button className="btn btn-primary btn-sm" onClick={() => setEdit({})}><Icon name="plus" size={15} />Add {singular.toLowerCase()}</button>}>
      <DataTable loading={state.loading} rows={state.data?.items} empty={`No ${singular.toLowerCase()}s yet`} cols={[...columns, { h: 'Actions', align: 'right', render: (r) => (
        <div className="row-actions"><button className="icon-btn" aria-label="Edit" onClick={() => setEdit(r)}><Icon name="edit" size={16} /></button><button className="icon-btn danger" aria-label="Delete" onClick={() => remove(r)}><Icon name="trash" size={16} /></button></div>) }]} />
      {edit && <FormModal title={`${edit.id ? 'Edit' : 'Add'} ${singular.toLowerCase()}`} fields={fields} initial={edit} onSubmit={save} onClose={() => setEdit(null)} />}
    </Card>
  );
}

export default function Academics() {
  const [tab, setTab] = useState('departments'); const [v, setV] = useState(0); const bump = () => setV((x) => x + 1);
  const depts = useAsync(() => api.get('/departments'), [v]); const courses = useAsync(() => api.get('/courses'), [v]);
  const subjects = useAsync(() => api.get('/subjects'), [v]); const teachers = useAsync(() => api.get('/teachers'), [v]);
  const dOpts = (depts.data?.items || []).map((d) => ({ value: d.id, label: d.name }));
  const cOpts = (courses.data?.items || []).map((c) => ({ value: c.id, label: `${c.name} (${c.code})` }));
  const tOpts = (teachers.data?.items || []).filter((t) => t.active).map((t) => ({ value: t.id, label: t.name }));
  const sOpts = (courseId) => (subjects.data?.items || []).filter((s) => s.course_id === Number(courseId)).map((s) => ({ value: s.id, label: `${s.name} (${s.code}) - Sem ${s.semester}` }));
  const maxSem = (cid) => (courses.data?.items || []).find((c) => c.id === Number(cid))?.semesters || 12;
  const semVal = { validate: (v2, all) => (all.course_id && Number(v2) > maxSem(all.course_id) ? `This course has ${maxSem(all.course_id)} semesters` : null) };
  return (
    <>
      <PageHeader title="Academics" subtitle="Departments, courses, subjects and class assignments" />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'departments', label: 'Departments', icon: 'building' }, { value: 'courses', label: 'Courses', icon: 'cap' }, { value: 'subjects', label: 'Subjects', icon: 'book' }, { value: 'classes', label: 'Class assignments', icon: 'users' }]} />
      {tab === 'departments' && <Resource path="/departments" singular="Department" extra={{ onChange: bump }} fields={[{ name: 'name', label: 'Name', required: true, minLength: 2, maxLength: 80 }, { name: 'code', label: 'Code', required: true, maxLength: 10, ...codeRule }]}
        columns={[{ h: 'Department', render: (r) => <strong>{r.name}</strong> }, { h: 'Code', render: (r) => <Badge kind="primary">{r.code}</Badge> }, { h: 'Courses', key: 'courses', hideSm: true }, { h: 'Teachers', key: 'teachers', hideSm: true }]} />}
      {tab === 'courses' && <Resource path="/courses" singular="Course" extra={{ onChange: bump }} fields={[{ name: 'name', label: 'Name', required: true, minLength: 2, maxLength: 80 }, { name: 'code', label: 'Code', required: true, maxLength: 12, ...codeRule },
        { name: 'department_id', label: 'Department', type: 'select', options: dOpts, required: true }, { name: 'semesters', label: 'Semesters', type: 'number', min: 1, max: 12, default: 8, required: true }]}
        columns={[{ h: 'Course', render: (r) => <strong>{r.name}</strong> }, { h: 'Code', render: (r) => <Badge kind="primary">{r.code}</Badge> }, { h: 'Department', key: 'department_name', hideSm: true }, { h: 'Subjects', key: 'subjects', hideSm: true }, { h: 'Students', key: 'students' }]} />}
      {tab === 'subjects' && <Resource path="/subjects" singular="Subject" extra={{ onChange: bump }} reloadKey={v} fields={[{ name: 'name', label: 'Name', required: true, minLength: 2, maxLength: 80 }, { name: 'code', label: 'Code', required: true, maxLength: 12, ...codeRule },
        { name: 'course_id', label: 'Course', type: 'select', options: cOpts, required: true }, { name: 'semester', label: 'Semester', type: 'number', min: 1, max: 12, required: true, ...semVal }]}
        columns={[{ h: 'Subject', render: (r) => <strong>{r.name}</strong> }, { h: 'Code', render: (r) => <Badge kind="primary">{r.code}</Badge> }, { h: 'Course', key: 'course_code' }, { h: 'Semester', key: 'semester', hideSm: true }]} />}
      {tab === 'classes' && <ClassesTab cOpts={cOpts} tOpts={tOpts} sOpts={sOpts} semVal={semVal} />}
    </>
  );
}

function ClassesTab({ cOpts, tOpts, sOpts, semVal }) {
  const toast = useToast(); const confirm = useConfirm(); const state = useAsync(() => api.get('/classes'), []); const [edit, setEdit] = useState(null);
  const fields = [
    { name: 'course_id', label: 'Course', type: 'select', options: cOpts, required: true },
    { name: 'semester', label: 'Semester', type: 'number', min: 1, max: 12, required: true, ...semVal },
    { name: 'subject_id', label: 'Subject', type: 'select', options: (vals) => sOpts(vals.course_id), required: true, help: 'Choose the course first; add subjects under the Subjects tab' },
    { name: 'teacher_id', label: 'Teacher', type: 'select', options: tOpts, required: true },
    { name: 'section', label: 'Section', default: 'A', maxLength: 5 }, { name: 'schedule', label: 'Schedule', placeholder: 'e.g. Mon/Wed 10:00', maxLength: 60 },
  ];
  async function save(v) { if (edit.id) await api.put(`/classes/${edit.id}`, v); else await api.post('/classes', v); toast.success('Class saved'); setEdit(null); state.reload(true); }
  async function remove(c) {
    if (!(await confirm({ title: 'Delete class?', message: `${c.subject} (${c.course_code}) and all of its sessions and attendance will be deleted.`, confirmLabel: 'Delete', danger: true }))) return;
    try { await api.del(`/classes/${c.id}`); toast.success('Class deleted'); state.reload(true); } catch (e) { toast.error(e.message); }
  }
  return (
    <Card pad={false} title="Class assignments" actions={<button className="btn btn-primary btn-sm" onClick={() => setEdit({})}><Icon name="plus" size={15} />Assign class</button>}>
      <DataTable loading={state.loading} rows={state.data?.items} empty="No classes assigned" cols={[
        { h: 'Subject', render: (c) => <div><strong>{c.subject}</strong><small className="block muted-text">{c.subject_code}</small></div> }, { h: 'Course', render: (c) => `${c.course_code} - Sem ${c.semester}` },
        { h: 'Teacher', key: 'teacher_name', hideSm: true }, { h: 'Schedule', key: 'schedule', hideSm: true }, { h: 'Students', key: 'student_count' },
        { h: 'Actions', align: 'right', render: (c) => <div className="row-actions"><button className="icon-btn" aria-label="Edit" onClick={() => setEdit(c)}><Icon name="edit" size={16} /></button><button className="icon-btn danger" aria-label="Delete" onClick={() => remove(c)}><Icon name="trash" size={16} /></button></div> },
      ]} />
      {edit && <FormModal title={`${edit.id ? 'Edit' : 'Assign'} class`} fields={fields} initial={edit} onSubmit={save} onClose={() => setEdit(null)} />}
    </Card>
  );
}
