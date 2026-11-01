'use client';

/**
 * VerificationQueue — Admin component that manages professional verification & directory.
 *
 * Features:
 * - Tab 1: Verification Queue for pending files with document view, approve & reject modal
 * - Tab 2: All Professionals directory with status filter, search, and suspend/reactivate actions
 * - In-app Document Viewer Modal (inline preview for images & PDFs)
 * - Optimistic UI updates on state transitions
 */

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Dialog } from '@/components/ui/Dialog';
import {
  approveProfessional,
  rejectProfessional,
  suspendProfessional,
  reactivateProfessional,
  getDocumentSignedUrl,
  reviewVerificationDocument,
  type PendingProfessional,
  type VerificationDocument,
} from '@/lib/services/verification';
import {
  type AdminProfessional,
} from '@/lib/services/admin';
import { SuccessState } from '@/components/ui/SuccessState';
import { isAdminFailure } from '@/lib/admin/result';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function statusBadge(status: string) {
  const map: Record<string, { label: string; class: string }> = {
    pending: {
      label: 'Pending',
      class: 'bg-[#E6EEF2] text-[#416B84] border-[#BCD0DB]',
    },
    documents_submitted: {
      label: 'Docs submitted',
      class: 'bg-[#F5EBD7] text-[#9B6A1E] border-[#DDCCAB]',
    },
    under_review: {
      label: 'Under review',
      class: 'bg-[#F5EBD7] text-[#9B6A1E] border-[#DDCCAB]',
    },
    verified: {
      label: 'Verified',
      class: 'bg-[#C7DCCF] text-[#1C5E41] border-[#C7DCCF]',
    },
    rejected: {
      label: 'Rejected',
      class: 'bg-[#F3E1DA] text-[#A9523D] border-[#DFC0B7]',
    },
    suspended: {
      label: 'Suspended',
      class: 'bg-[#F3E1DA] text-[#A9523D] border-[#DFC0B7]',
    },
  };
  const cfg = map[status] ?? { label: status, class: 'bg-[#D9DED8] text-[#5A6661] border-[#C5CBC4]' };
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${cfg.class}`}
    >
      {cfg.label}
    </span>
  );
}

function docTypeLabel(type: string) {
  const labels: Record<string, string> = {
    id: 'Government ID',
    license: 'Professional Licence',
    insurance: 'Insurance Certificate',
    background_check: 'Background Check',
    other: 'Other Document',
  };
  return labels[type] ?? type;
}

function timeAgo(dateStr: string | null) {
  if (!dateStr) return 'Unknown';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Document Viewer Modal
// ─────────────────────────────────────────────────────────────────────────────

interface DocPreview {
  url: string;
  type: string;
  path: string;
}

function DocumentPreviewModal({
  doc,
  onClose,
}: {
  doc: DocPreview;
  onClose: () => void;
}) {
  const isImage = /\.(jpg|jpeg|png|webp|svg)$/i.test(doc.path);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-[#FFFEFA] border border-[#D9DED8] rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
        <div className="px-5 py-3.5 border-b border-[#D9DED8] bg-[#F7F4EC] flex items-center justify-between">
          <div className="font-bold text-sm text-[#18211F]">{docTypeLabel(doc.type)}</div>
          <div className="flex items-center gap-2">
            <a
              href={doc.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold text-[#0D5144] hover:underline"
            >
              Open in new tab ↗
            </a>
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-[#5A6661] hover:text-[#18211F] hover:bg-[#EAE6DC]"
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-gray-50 min-h-[300px]">
          {isImage ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={doc.url}
              alt="Verification Document"
              className="max-h-[70vh] object-contain rounded-lg border border-[#D9DED8]"
            />
          ) : (
            <iframe
              src={doc.url}
              title="Verification Document"
              className="w-full h-[70vh] rounded-lg border border-[#D9DED8]"
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Document List Sub-component
// ─────────────────────────────────────────────────────────────────────────────

function DocumentList({
  documents,
  inspected,
  busy,
  onOpenPreview,
  onInspected,
  onReview,
}: {
  documents: VerificationDocument[];
  /** Ids of documents the reviewer has opened this session; acceptance needs it. */
  inspected: ReadonlySet<string>;
  busy: boolean;
  onOpenPreview: (doc: DocPreview) => void;
  onInspected: (documentId: string) => void;
  onReview: (documentId: string, decision: 'accepted' | 'rejected', note: string) => Promise<string | null>;
}) {
  const [loadingPath, setLoadingPath] = useState<string | null>(null);
  const [errorMap, setErrorMap] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  const handleView = async (doc: VerificationDocument) => {
    setLoadingPath(doc.storage_path);
    setErrorMap((prev) => {
      const n = { ...prev };
      delete n[doc.id];
      return n;
    });

    const { url, error } = await getDocumentSignedUrl(doc.storage_path);
    setLoadingPath(null);

    if (url) {
      onInspected(doc.id);
      onOpenPreview({ url, type: doc.document_type, path: doc.storage_path });
    } else {
      setErrorMap((prev) => ({ ...prev, [doc.id]: error ?? 'Failed to get URL' }));
    }
  };

  const handleReview = async (doc: VerificationDocument, decision: 'accepted' | 'rejected') => {
    const failure = await onReview(doc.id, decision, (notes[doc.id] ?? '').trim());
    if (failure) setErrorMap((prev) => ({ ...prev, [doc.id]: failure }));
  };

  if (documents.length === 0) {
    return <p className="text-xs text-[#7C8681] italic">No documents uploaded yet.</p>;
  }

  return (
    <ul className="space-y-2 mt-2">
      {documents.map((doc) => {
        const note = notes[doc.id] ?? '';
        const canJudge = doc.status === 'pending' && inspected.has(doc.id);
        const noteLength = note.trim().length;
        return (
          <li key={doc.id} className="bg-[#F7F4EC] rounded-lg px-3 py-2 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-[#18211F] truncate">
                  {docTypeLabel(doc.document_type)}
                </div>
                <div className="text-[11px] text-[#7C8681]">
                  Uploaded {timeAgo(doc.uploaded_at)} ·{' '}
                  <span
                    className={
                      doc.status === 'accepted'
                        ? 'text-[#2F7D5B]'
                        : doc.status === 'rejected'
                        ? 'text-[#A9523D]'
                        : 'text-[#9B6A1E]'
                    }
                  >
                    {doc.status}
                  </span>
                </div>
                {doc.reviewer_notes && (
                  <p className="text-[11px] text-[#5A6661] mt-0.5">Reviewer note: {doc.reviewer_notes}</p>
                )}
                {errorMap[doc.id] && (
                  <p className="text-[11px] text-[#A9523D] mt-0.5" role="alert">
                    {errorMap[doc.id]}
                  </p>
                )}
              </div>
              <button
                onClick={() => handleView(doc)}
                disabled={loadingPath === doc.storage_path}
                className="flex-shrink-0 min-h-11 px-3 py-1.5 border border-[#D9DED8] rounded-lg text-xs font-semibold text-[#5A6661] hover:bg-[#F1EEE5] hover:text-[#0D5144] transition disabled:opacity-50"
              >
                {loadingPath === doc.storage_path ? 'Loading…' : 'Inspect Document'}
              </button>
            </div>

            {doc.status === 'pending' && !canJudge && (
              <p className="text-[11px] text-[#7C8681]">Open the document before you accept or reject it.</p>
            )}

            {canJudge && (
              <div className="space-y-2">
                <label className="block text-[11px] font-bold text-[#18211F]" htmlFor={`doc-note-${doc.id}`}>
                  Note (required to reject, at least 5 characters)
                </label>
                <textarea
                  id={`doc-note-${doc.id}`}
                  rows={2}
                  maxLength={500}
                  value={note}
                  onChange={(e) => setNotes((prev) => ({ ...prev, [doc.id]: e.target.value }))}
                  className="w-full resize-none rounded-lg border border-[#D9DED8] bg-white px-3 py-2 text-xs text-[#18211F] focus:outline-none focus:border-[#5FE3B0]"
                />
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => handleReview(doc, 'rejected')}
                    disabled={busy || noteLength < 5}
                    className="min-h-11 px-3.5 border border-[#DFC0B7] bg-[#F3E1DA] text-[#A9523D] text-xs font-bold rounded-lg hover:bg-[#EDD1C8] transition disabled:opacity-50"
                  >
                    Reject document
                  </button>
                  <button
                    onClick={() => handleReview(doc, 'accepted')}
                    disabled={busy}
                    className="min-h-11 px-3.5 bg-[#18211F] text-white text-xs font-bold rounded-lg hover:bg-[#0D5144] transition disabled:opacity-50"
                  >
                    Accept document
                  </button>
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pending Professional Card
// ─────────────────────────────────────────────────────────────────────────────

interface ProfessionalCardProps {
  professional: PendingProfessional;
  onActionDone: (userId: string) => void;
  onOpenPreview: (doc: DocPreview) => void;
}

function ProfessionalCard({
  professional,
  onActionDone,
  onOpenPreview,
}: ProfessionalCardProps) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [showSuccessState, setShowSuccessState] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [inspected, setInspected] = useState<ReadonlySet<string>>(new Set());
  const [reviewed, setReviewed] = useState<Record<string, { status: 'accepted' | 'rejected'; note: string | null }>>({});

  // Reviews made here show at once; the database stays the authority when Approve is pressed.
  const documents: VerificationDocument[] = professional.documents.map((d) =>
    reviewed[d.id] ? { ...d, status: reviewed[d.id].status, reviewer_notes: reviewed[d.id].note } : d,
  );
  const idAccepted = documents.some((d) => d.document_type === 'id' && d.status === 'accepted');

  const handleReviewDocument = async (
    documentId: string,
    decision: 'accepted' | 'rejected',
    note: string,
  ): Promise<string | null> => {
    setActionError(null);
    const result = await reviewVerificationDocument({ documentId, decision, note: note || undefined });
    if (isAdminFailure(result)) return result.error;
    setReviewed((prev) => ({ ...prev, [documentId]: { status: result.data.status, note: note || null } }));
    return null;
  };

  const handleApprove = () => {
    setActionError(null);
    startTransition(async () => {
      const result = await approveProfessional(professional.user_id, professional.verification_status);
      if (result.success) {
        setShowSuccessState(true);
      } else {
        setActionError(result.error ?? 'Failed to approve');
      }
    });
  };

  const handleReject = () => {
    if (rejectReason.trim().length < 5) {
      setActionError('Please provide a reason (min 5 characters).');
      return;
    }
    setActionError(null);
    startTransition(async () => {
      const result = await rejectProfessional(professional.user_id, professional.verification_status, rejectReason);
      if (result.success) {
        setShowRejectModal(false);
        onActionDone(professional.user_id);
      } else {
        setActionError(result.error ?? 'Failed to reject');
      }
    });
  };

  const name = professional.full_name || professional.display_name;
  const docCount = professional.documents.length;

  // Show success state overlay when professional is approved
  if (showSuccessState) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-[#18211F]/40 backdrop-blur-sm" />
        <div className="relative">
          <SuccessState
            title="Professional verified"
            description={`${name} is now verified and eligible to receive service requests on the platform.`}
            action={{
              label: 'View profile',
              onClick: () => {
                onActionDone(professional.user_id);
                router.push(`/admin/professionals?view=${professional.user_id}`);
              },
            }}
            secondaryAction={{
              label: 'Back to queue',
              onClick: () => {
                onActionDone(professional.user_id);
                setShowSuccessState(false);
              },
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="bg-[#FFFEFA] border border-[#D9DED8] rounded-xl overflow-hidden shadow-sm">
        {/* Card header */}
        <div className="px-5 py-4 flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-[#18211F] text-base">{name}</span>
              {statusBadge(professional.verification_status)}
            </div>
            <div className="text-xs text-[#7C8681] mt-1">
              {professional.email ?? '—'} · {professional.years_experience ?? '?'} yrs exp
            </div>
            {professional.submitted_at && (
              <div className="text-xs text-[#5A6661] mt-0.5">
                Submitted {timeAgo(professional.submitted_at)} · {docCount} document{docCount !== 1 ? 's' : ''}
              </div>
            )}
          </div>

          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex-shrink-0 text-[#5A6661] hover:text-[#18211F] transition p-1"
            aria-label={expanded ? 'Collapse' : 'Expand documents'}
          >
            <svg
              viewBox="0 0 24 24"
              className={`w-5 h-5 transition-transform ${expanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>

        {/* Expanded documents */}
        {expanded && (
          <div className="px-5 py-3 border-t border-[#D9DED8] bg-[#FAFAF8]">
            {professional.bio && (
              <p className="text-xs text-[#5A6661] mb-3 italic">&ldquo;{professional.bio}&rdquo;</p>
            )}
            <DocumentList
              documents={documents}
              inspected={inspected}
              busy={isPending}
              onOpenPreview={onOpenPreview}
              onInspected={(id) => setInspected((prev) => new Set(prev).add(id))}
              onReview={handleReviewDocument}
            />
          </div>
        )}

        {/* Action footer */}
        <div className="px-5 py-3 border-t border-[#D9DED8] flex items-center justify-between gap-3 bg-[#F7F4EC]">
          {actionError ? (
            <p className="text-xs text-[#A9523D] font-medium flex-1" role="alert">{actionError}</p>
          ) : !idAccepted ? (
            <p className="text-xs text-[#7C8681] flex-1">
              Approve unlocks once the Government ID document has been inspected and accepted.
            </p>
          ) : null}
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={() => {
                setShowRejectModal(true);
                setActionError(null);
              }}
              disabled={isPending}
              className="min-h-11 px-3.5 py-1.5 border border-[#DFC0B7] bg-[#F3E1DA] text-[#A9523D] text-xs font-bold rounded-lg hover:bg-[#EDD1C8] transition disabled:opacity-50"
            >
              Reject
            </button>
            <button
              onClick={handleApprove}
              disabled={isPending || !idAccepted}
              className="min-h-11 px-3.5 py-1.5 bg-[#18211F] text-white text-xs font-bold rounded-lg hover:bg-[#0D5144] transition disabled:opacity-50"
            >
              {isPending ? 'Processing…' : 'Approve'}
            </button>
          </div>
        </div>
      </div>

      {/* Reject modal */}
      {showRejectModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowRejectModal(false);
          }}
        >
          <div className="bg-[#FFFEFA] rounded-2xl border border-[#D9DED8] shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-bold text-[#18211F]">Reject — {name}</h3>
            <p className="text-sm text-[#5A6661]">
              This professional will be notified and can resubmit documents. Please provide a clear reason.
            </p>

            <div>
              <label className="block text-xs font-bold text-[#18211F] mb-1.5" htmlFor="reject-reason">
                Rejection reason <span className="text-[#A9523D]">*</span>
              </label>
              <textarea
                id="reject-reason"
                rows={4}
                value={rejectReason}
                onChange={(e) => {
                  setRejectReason(e.target.value);
                  setActionError(null);
                }}
                placeholder="E.g. Licence document is expired or unreadable. Please re-upload a valid, current government document."
                className="w-full resize-none rounded-xl border border-[#D9DED8] bg-white px-4 py-3 text-sm text-[#18211F] placeholder-[#9BA5A0] focus:outline-none focus:border-[#5FE3B0] transition"
              />
              <p className="text-[11px] text-[#7C8681] mt-1">{rejectReason.trim().length} / min 5 chars</p>
            </div>

            {actionError && <p className="text-xs text-[#A9523D] font-medium">{actionError}</p>}

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowRejectModal(false)}
                className="px-4 py-2 border border-[#D9DED8] rounded-xl text-sm font-semibold text-[#5A6661] hover:bg-[#F1EEE5] transition"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={isPending || rejectReason.trim().length < 5}
                className="px-4 py-2 bg-[#A9523D] text-white text-sm font-bold rounded-xl hover:bg-[#8E3F2C] transition disabled:opacity-50"
              >
                {isPending ? 'Submitting…' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// All Professionals Directory Sub-component
// ─────────────────────────────────────────────────────────────────────────────

function AllProfessionalsDirectory({ initialList }: { initialList: AdminProfessional[] }) {
  const [pros, setPros] = useState(initialList);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  const [reasonFor, setReasonFor] = useState<AdminProfessional | null>(null);
  const [reasonText, setReasonText] = useState('');

  const handleToggleSuspend = (pro: AdminProfessional, reason: string) => {
    setActioningId(pro.user_id);
    setActionErr((prev) => {
      const n = { ...prev };
      delete n[pro.user_id];
      return n;
    });

    startTransition(async () => {
      const isSuspended = pro.verification_status === 'suspended';
      const res = isSuspended
        ? await reactivateProfessional(pro.user_id, reason)
        : await suspendProfessional(pro.user_id, reason);

      setActioningId(null);
      if (res.success) {
        setPros((prev) =>
          prev.map((p) =>
            p.user_id === pro.user_id
              ? {
                  ...p,
                  verification_status: isSuspended ? 'verified' : 'suspended',
                  is_available: isSuspended ? p.is_available : false,
                }
              : p
          )
        );
      } else {
        setActionErr((prev) => ({
          ...prev,
          [pro.user_id]: res.error ?? 'Action failed',
        }));
      }
    });
  };

  const filtered = pros.filter((p) => {
    const matchesFilter = filter === 'all' || p.verification_status === filter;
    const q = search.toLowerCase().trim();
    const matchesSearch =
      !q ||
      p.display_name.toLowerCase().includes(q) ||
      (p.full_name ?? '').toLowerCase().includes(q) ||
      (p.email ?? '').toLowerCase().includes(q);
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="space-y-4">
      {/* Search & Filter Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, email…"
          className="px-4 py-2 border border-[#D9DED8] rounded-xl bg-white text-sm text-[#18211F] placeholder-[#9BA5A0] focus:outline-none focus:border-[#5FE3B0] transition w-full sm:w-64"
        />

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {['all', 'verified', 'suspended', 'pending'].map((st) => (
            <button
              key={st}
              onClick={() => setFilter(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition capitalize ${
                filter === st
                  ? 'bg-[#18211F] text-white'
                  : 'bg-[#FFFEFA] border border-[#D9DED8] text-[#5A6661] hover:bg-[#F1EEE5]'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Directory Table */}
      {filtered.length === 0 ? (
        <div className="bg-[#FFFEFA] border border-[#D9DED8] rounded-xl p-8 text-center text-sm text-[#7C8681]">
          No professionals found matching query.
        </div>
      ) : (
        <div className="bg-[#FFFEFA] border border-[#D9DED8] rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#D9DED8] bg-[#F7F4EC] text-left text-xs font-bold text-[#7C8681] uppercase tracking-wide">
                  <th className="px-5 py-3">Professional</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Rating</th>
                  <th className="px-5 py-3">Jobs Done</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D9DED8]">
                {filtered.map((pro) => (
                  <tr key={pro.user_id} className="hover:bg-[#F7F4EC] transition">
                    <td className="px-5 py-3.5">
                      <Link href={`/admin/professionals/${pro.user_id}`} className="font-bold text-[#18211F] hover:underline">
                        {pro.display_name}
                      </Link>
                      <div className="text-xs text-[#7C8681]">{pro.email ?? 'No email'}</div>
                    </td>
                    <td className="px-5 py-3.5">{statusBadge(pro.verification_status)}</td>
                    <td className="px-5 py-3.5 text-xs font-medium text-[#18211F]">
                      ★ {pro.rating_average.toFixed(1)}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-[#5A6661]">{pro.completed_jobs_count}</td>
                    <td className="px-5 py-3.5 text-right whitespace-nowrap">
                      {actionErr[pro.user_id] && (
                        <span className="text-[11px] text-[#A9523D] mr-2">
                          {actionErr[pro.user_id]}
                        </span>
                      )}
                      {(pro.verification_status === 'verified' || pro.verification_status === 'suspended') && (
                      <button
                        onClick={() => {
                          setReasonText('');
                          setReasonFor(pro);
                        }}
                        disabled={actioningId === pro.user_id || isPending}
                        className={`px-3 py-1 text-xs font-bold rounded-lg border transition disabled:opacity-50 ${
                          pro.verification_status === 'suspended'
                            ? 'border-[#C7DCCF] bg-[#E2EEE9] text-[#2F7D5B] hover:bg-[#D2E8DF]'
                            : 'border-[#DFC0B7] bg-[#F3E1DA] text-[#A9523D] hover:bg-[#EDD1C8]'
                        }`}
                      >
                        {actioningId === pro.user_id
                          ? 'Updating…'
                          : pro.verification_status === 'suspended'
                          ? 'Reactivate'
                          : 'Suspend'}
                      </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {reasonFor && (
        <Dialog
          title={`${reasonFor.verification_status === 'suspended' ? 'Reactivate' : 'Suspend'} ${reasonFor.display_name}`}
          onClose={() => setReasonFor(null)}
          description={
            reasonFor.verification_status === 'suspended'
              ? 'They stay unavailable until they switch availability on themselves.'
              : 'Pending offers are withdrawn and no new work is offered. Active jobs are flagged, not cancelled.'
          }
        >
          <div className="space-y-3">
            <label htmlFor="suspend-reason" className="sr-only">
              Reason
            </label>
            <textarea
              id="suspend-reason"
              value={reasonText}
              onChange={(e) => setReasonText(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Reason (required, at least 5 characters)"
              className="w-full rounded-xl border border-line p-3 text-sm"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setReasonFor(null)} className="min-h-11 px-4 py-2 text-sm font-bold rounded-xl border border-line">
                Cancel
              </button>
              <button
                disabled={reasonText.trim().length < 5 || isPending}
                onClick={() => {
                  const target = reasonFor;
                  setReasonFor(null);
                  handleToggleSuspend(target, reasonText.trim());
                }}
                className="min-h-11 px-4 py-2 text-sm font-bold rounded-xl bg-clay text-white disabled:opacity-50"
              >
                Confirm
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Verification & Directory Component
// ─────────────────────────────────────────────────────────────────────────────

interface VerificationQueueProps {
  professionals: PendingProfessional[];
  allProfessionals?: AdminProfessional[];
}

export default function VerificationQueue({
  professionals: initialProfessionals,
  allProfessionals = [],
}: VerificationQueueProps) {
  const [activeTab, setActiveTab] = useState<'queue' | 'all'>('queue');
  const [professionals, setProfessionals] = useState(initialProfessionals);
  const [filter, setFilter] = useState<'all' | 'documents_submitted' | 'pending'>('all');
  const [previewDoc, setPreviewDoc] = useState<DocPreview | null>(null);

  const handleActionDone = (userId: string) => {
    setProfessionals((prev) => prev.filter((p) => p.user_id !== userId));
  };

  const filtered =
    filter === 'all'
      ? professionals
      : professionals.filter((p) => p.verification_status === filter);

  return (
    <div>
      {/* Top Tab Bar */}
      <div className="flex items-center gap-3 border-b border-[#D9DED8] mb-6">
        <button
          onClick={() => setActiveTab('queue')}
          className={`pb-3 text-sm font-bold border-b-2 transition flex items-center gap-2 ${
            activeTab === 'queue'
              ? 'border-[#0D5144] text-[#0D5144]'
              : 'border-transparent text-[#7C8681] hover:text-[#18211F]'
          }`}
        >
          Verification Queue
          <span className="px-2 py-0.5 rounded-full text-xs bg-[#E2EEE9] text-[#2F7D5B]">
            {professionals.length}
          </span>
        </button>

        {allProfessionals.length > 0 && (
          <button
            onClick={() => setActiveTab('all')}
            className={`pb-3 text-sm font-bold border-b-2 transition flex items-center gap-2 ${
              activeTab === 'all'
                ? 'border-[#0D5144] text-[#0D5144]'
                : 'border-transparent text-[#7C8681] hover:text-[#18211F]'
            }`}
          >
            All Registered Technicians
            <span className="px-2 py-0.5 rounded-full text-xs bg-gray-200 text-[#5A6661]">
              {allProfessionals.length}
            </span>
          </button>
        )}
      </div>

      {activeTab === 'all' ? (
        <AllProfessionalsDirectory initialList={allProfessionals} />
      ) : (
        <>
          {/* Sub-toolbar for Queue */}
          <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
            <div className="flex items-center gap-2">
              {(['all', 'documents_submitted', 'pending'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={[
                    'px-3 py-1.5 rounded-lg text-xs font-bold transition',
                    filter === f
                      ? 'bg-[#18211F] text-white'
                      : 'bg-[#FFFEFA] border border-[#D9DED8] text-[#5A6661] hover:bg-[#F1EEE5]',
                  ].join(' ')}
                >
                  {f === 'all' ? 'All' : f === 'documents_submitted' ? 'Docs submitted' : 'Pending'}
                </button>
              ))}
            </div>
            <span className="text-xs text-[#7C8681]">
              {filtered.length} professional{filtered.length !== 1 ? 's' : ''} awaiting review
            </span>
          </div>

          {/* Queue List */}
          {filtered.length === 0 ? (
            <div className="bg-[#FFFEFA] border border-[#D9DED8] rounded-xl px-6 py-12 text-center">
              <svg
                viewBox="0 0 48 48"
                className="w-10 h-10 mx-auto mb-3 text-[#2F7D5B]"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="24" cy="24" r="20" />
                <polyline points="16 24 21 29 33 18" />
              </svg>
              <p className="font-bold text-[#18211F] mb-1">Queue cleared</p>
              <p className="text-sm text-[#7C8681]">No pending professional files require action.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filtered.map((pro) => (
                <ProfessionalCard
                  key={pro.user_id}
                  professional={pro}
                  onActionDone={handleActionDone}
                  onOpenPreview={setPreviewDoc}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* In-app Document Viewer Modal */}
      {previewDoc && (
        <DocumentPreviewModal doc={previewDoc} onClose={() => setPreviewDoc(null)} />
      )}
    </div>
  );
}
