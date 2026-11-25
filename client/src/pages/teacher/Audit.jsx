import React from 'react';
import { api } from '../../api';
import { PageHeader, Card, DataTable, StatusBadge } from '../../ui';
import { useAsync, fmtDate, fmtDateTime } from '../../util';

export default function AuditTrail() {
  const state = useAsync(() => api.get('/audit', { limit: 200 }), []);
  return (
    <>
      <PageHeader title="Audit trail" subtitle="Every manual change to attendance, who made it and why" />
      <Card pad={false}>
        <DataTable loading={state.loading} rows={state.data?.items} empty={state.error ? state.error.message : 'No manual changes have been made yet.'} cols={[
          { h: 'When', render: (r) => fmtDateTime(r.changed_at) }, { h: 'Student', render: (r) => <div><strong>{r.student_name}</strong><small className="block muted-text">{r.roll_no}</small></div> },
          { h: 'Subject / date', hideSm: true, render: (r) => `${r.subject} - ${fmtDate(r.date)}` },
          { h: 'Change', render: (r) => <span className="change"><StatusBadge status={r.old_status} />{' '}&rarr;{' '}<StatusBadge status={r.new_status} /></span> },
          { h: 'Changed by', key: 'changed_by', hideSm: true }, { h: 'Reason', key: 'reason' }]} />
      </Card>
    </>
  );
}
