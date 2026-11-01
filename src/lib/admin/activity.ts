/** Plain-language labels for the audit actions written by runAdminAction (`<name>.<outcome>`). */
const ACTION_LABELS: Record<string, string> = {
  'admin.job.reconcile': 'Reconciled a job',
  'admin.job.cancel': 'Cancelled a job',
  'admin.professional.approve': 'Approved a professional',
  'admin.professional.reject': 'Rejected a professional',
  'admin.professional.suspend': 'Suspended a professional',
  'admin.professional.reactivate': 'Reactivated a professional',
  'admin.verification_document.review': 'Reviewed a verification document',
};

export type AdminActionOutcome = 'succeeded' | 'failed';

/** Null for anything that is not a closing row of an admin action (requested rows, logins, views). */
export function describeAdminAction(action: string): { label: string; outcome: AdminActionOutcome } | null {
  const m = /^(admin\..+)\.(succeeded|failed)$/.exec(action);
  if (!m) return null;
  const label = ACTION_LABELS[m[1]] ?? m[1].replace(/^admin\./, '').replace(/[._]/g, ' ');
  return { label, outcome: m[2] as AdminActionOutcome };
}
