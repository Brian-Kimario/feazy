'use client';

/**
 * JobDetailModal — Comprehensive Admin Job Inspector Drawer / Modal
 *
 * Provides real-time visibility into:
 * - State machine stepper & event timeline
 * - Customer & Professional details
 * - Property location & access info
 * - On-site diagnostic inspection findings
 * - Multi-item quote breakdown & customer approval status
 * - Payment transactions & provider references
 * - Admin intervention actions (Cancel Job)
 */

import { useState, useEffect, useTransition } from 'react';
import {
  getAdminJobDetail,
  adminCancelJob,
  type AdminJobDetail,
} from '@/lib/services/admin';
import CancelJobDialog from '@/components/admin/CancelJobDialog';

interface JobDetailModalProps {
  jobId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onJobUpdated?: (updatedJob: { id: string; current_state: string }) => void;
}

const STATE_ORDER = [
  'assigned',
  'accepted',
  'on_the_way',
  'arrived',
  'in_progress',
  'completed',
];

const STATE_LABELS: Record<string, string> = {
  assigned: 'Assigned',
  accepted: 'Accepted',
  on_the_way: 'On the Way',
  arrived: 'Arrived',
  in_progress: 'In Progress',
  quote_pending: 'Quote Pending',
  completed: 'Completed',
  cancelled: 'Cancelled',
  closed: 'Closed',
};

const STATE_BADGE: Record<string, string> = {
  assigned: 'bg-[#E6EEF2] text-[#416B84] border-[#BCD0DB]',
  accepted: 'bg-[#E2EEE9] text-[#2F7D5B] border-[#C7DCCF]',
  on_the_way: 'bg-[#E2EEE9] text-[#2F7D5B] border-[#C7DCCF]',
  arrived: 'bg-[#E2EEE9] text-[#2F7D5B] border-[#C7DCCF]',
  in_progress: 'bg-[#F5EBD7] text-[#9B6A1E] border-[#DDCCAB]',
  quote_pending: 'bg-[#F5EBD7] text-[#9B6A1E] border-[#DDCCAB]',
  completed: 'bg-[#C7DCCF] text-[#1C5E41] border-[#C7DCCF]',
  cancelled: 'bg-[#F3E1DA] text-[#A9523D] border-[#DFC0B7]',
  closed: 'bg-[#D9DED8] text-[#5A6661] border-[#C5CBC4]',
};

function formatCurrency(amount: number | null, currency = 'INR') {
  if (amount == null) return '—';
  if (currency === 'INR') return `₹${amount.toLocaleString('en-IN')}`;
  return `${currency} ${amount.toLocaleString()}`;
}

function formatDateTime(dateStr: string | null | undefined) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function JobDetailModal({
  jobId,
  isOpen,
  onClose,
  onJobUpdated,
}: JobDetailModalProps) {
  const [detail, setDetail] = useState<AdminJobDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Loading is derived: open on a job with neither detail nor error yet.
  const loading = isOpen && !!jobId && !detail && !error;

  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Load detail whenever opened or jobId changes
  useEffect(() => {
    if (!isOpen || !jobId) return;

    let isMounted = true;

    getAdminJobDetail(jobId).then((res) => {
      if (!isMounted) return;
      if (res.data) {
        setDetail(res.data);
      } else {
        setError(res.error ?? 'Failed to load job details');
      }
    });

    return () => {
      isMounted = false;
      // Reset on close or when the job changes, so a reopened modal never shows the previous job.
      setDetail(null);
      setError(null);
      setConfirmCancel(false);
    };
  }, [isOpen, jobId]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleAdminCancel = (category: string, reason: string) => {
    if (!detail) return;
    startTransition(async () => {
      const res = await adminCancelJob(detail.id, detail.current_state, reason, category);
      if (res.success) {
        setDetail((prev) =>
          prev ? { ...prev, current_state: 'cancelled', cancelled_at: new Date().toISOString() } : prev
        );
        setConfirmCancel(false);
        onJobUpdated?.({ id: detail.id, current_state: 'cancelled' });
      } else {
        setCancelError(res.error ?? 'Failed to cancel job');
      }
    });
  };

  const isTerminal = detail ? ['completed', 'cancelled', 'closed'].includes(detail.current_state) : false;

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 md:p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-[#FFFEFA] border border-[#D9DED8] rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#D9DED8] bg-[#F7F4EC] flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold text-[#0D5144]">
                  {detail?.booking.reference ?? 'Job Inspection'}
                </span>
                {detail && (
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                      STATE_BADGE[detail.current_state] ?? 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {STATE_LABELS[detail.current_state] ?? detail.current_state}
                  </span>
                )}
              </div>
              <p className="text-xs text-[#7C8681] mt-0.5">
                {detail ? `Booked ${formatDateTime(detail.created_at)}` : 'Loading context…'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#5A6661] hover:text-[#18211F] hover:bg-[#EAE6DC] transition"
            aria-label="Close"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading && (
            <div className="py-20 text-center space-y-3">
              <div className="w-8 h-8 border-3 border-[#0D5144] border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-sm font-semibold text-[#5A6661]">Fetching operational job records…</p>
            </div>
          )}

          {error && (
            <div className="bg-[#F3E1DA] border border-[#DFC0B7] rounded-xl p-4 text-sm text-[#A9523D]">
              <strong>Error:</strong> {error}
            </div>
          )}

          {detail && !loading && (
            <>
              {/* State Progress Stepper */}
              <div className="bg-[#F7F4EC] border border-[#D9DED8] rounded-xl p-4">
                <div className="text-xs font-bold uppercase tracking-wider text-[#7C8681] mb-3">
                  Workflow Lifecycle
                </div>
                {detail.current_state === 'cancelled' ? (
                  <div className="flex items-center gap-3 text-sm text-[#A9523D] font-bold bg-[#F3E1DA] p-3 rounded-lg border border-[#DFC0B7]">
                    <svg viewBox="0 0 24 24" className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="15" y1="9" x2="9" y2="15" />
                      <line x1="9" y1="9" x2="15" y2="15" />
                    </svg>
                    Job was cancelled on {formatDateTime(detail.cancelled_at)}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                    {STATE_ORDER.map((st, idx) => {
                      const currIdx = STATE_ORDER.indexOf(
                        detail.current_state === 'quote_pending' ? 'arrived' : detail.current_state
                      );
                      const isPast = idx < currIdx;
                      const isCurrent = idx === currIdx;

                      return (
                        <div
                          key={st}
                          className={`p-2.5 rounded-lg border text-center transition ${
                            isCurrent
                              ? 'bg-[#18211F] text-white border-[#18211F]'
                              : isPast
                              ? 'bg-[#E2EEE9] text-[#2F7D5B] border-[#C7DCCF]'
                              : 'bg-white text-[#7C8681] border-[#D9DED8]'
                          }`}
                        >
                          <div className="text-[10px] uppercase font-bold tracking-wider opacity-75">
                            Step {idx + 1}
                          </div>
                          <div className="text-xs font-bold truncate mt-0.5">
                            {STATE_LABELS[st] ?? st}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 2-Column Info Layout */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Column 1: Service & Property Details */}
                <div className="space-y-6">
                  {/* Service & Booking Card */}
                  <div className="bg-[#FFFEFA] border border-[#D9DED8] rounded-xl p-5 space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#7C8681]">
                      Service & Schedule
                    </h3>
                    <div>
                      <div className="text-base font-bold text-[#18211F]">
                        {detail.booking.service_name}
                      </div>
                      {detail.booking.service_category && (
                        <span className="inline-block mt-1 text-[11px] font-semibold text-[#0D5144] bg-[#E2EEE9] px-2 py-0.5 rounded-md">
                          {detail.booking.service_category}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-xs pt-2 border-t border-[#D9DED8]/60">
                      <div>
                        <span className="text-[#7C8681] block">Scheduled Start</span>
                        <span className="font-semibold text-[#18211F]">
                          {formatDateTime(detail.booking.scheduled_start)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#7C8681] block">Pricing Model</span>
                        <span className="font-semibold text-[#18211F] capitalize">
                          {detail.booking.pricing_model.replace(/_/g, ' ')}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Property Card */}
                  <div className="bg-[#FFFEFA] border border-[#D9DED8] rounded-xl p-5 space-y-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#7C8681]">
                      Job Location
                    </h3>
                    <div className="font-bold text-sm text-[#18211F]">{detail.property.name}</div>
                    <p className="text-xs text-[#5A6661] leading-relaxed">
                      {detail.property.address_line1}
                      <br />
                      {detail.property.city}, Pin: {detail.property.postal_code}
                    </p>
                  </div>

                  {/* Inspection Findings (if any) */}
                  {detail.inspection ? (
                    <div className="bg-[#FFFEFA] border border-[#D9DED8] rounded-xl p-5 space-y-2">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-[#7C8681]">
                          On-Site Diagnostics
                        </h3>
                        <span className="text-[11px] text-[#7C8681]">
                          {formatDateTime(detail.inspection.created_at)}
                        </span>
                      </div>
                      <div className="bg-[#F7F4EC] p-3 rounded-lg text-xs space-y-2">
                        <div>
                          <span className="font-bold text-[#18211F]">Findings: </span>
                          <span className="text-[#5A6661]">{detail.inspection.findings}</span>
                        </div>
                        {detail.inspection.recommendation && (
                          <div>
                            <span className="font-bold text-[#18211F]">Recommendation: </span>
                            <span className="text-[#5A6661]">{detail.inspection.recommendation}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="bg-[#F7F4EC]/60 border border-dashed border-[#D9DED8] rounded-xl p-4 text-xs text-[#7C8681] text-center">
                      No on-site diagnostic report filed yet.
                    </div>
                  )}

                  {/* Quotes Breakdown (if any) */}
                  {detail.quotes.length > 0 && (
                    <div className="bg-[#FFFEFA] border border-[#D9DED8] rounded-xl p-5 space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-[#7C8681]">
                          Technician Quotes
                        </h3>
                        <span className="text-xs font-bold text-[#0D5144]">
                          {detail.quotes.length} Quote{detail.quotes.length > 1 ? 's' : ''}
                        </span>
                      </div>
                      {detail.quotes.map((quote) => (
                        <div key={quote.id} className="border border-[#D9DED8] rounded-lg p-3 space-y-2 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-[#18211F]">Status: {quote.status}</span>
                            <span className="font-mono font-bold text-sm text-[#0D5144]">
                              {formatCurrency(quote.total)}
                            </span>
                          </div>
                          {quote.reason && (
                            <p className="text-[#5A6661] italic">&ldquo;{quote.reason}&rdquo;</p>
                          )}
                          {quote.items.length > 0 && (
                            <div className="divide-y divide-[#D9DED8]/60 pt-1">
                              {quote.items.map((it) => (
                                <div key={it.id} className="py-1 flex items-center justify-between">
                                  <span className="text-[#5A6661]">
                                    {it.description} <span className="text-[#7C8681]">× {it.quantity}</span>
                                  </span>
                                  <span className="font-medium text-[#18211F]">
                                    {formatCurrency(it.line_total)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Column 2: Stakeholders & Operational Financials */}
                <div className="space-y-6">
                  {/* Customer Record */}
                  <div className="bg-[#FFFEFA] border border-[#D9DED8] rounded-xl p-5 space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#7C8681]">
                      Customer Profile
                    </h3>
                    <div>
                      <div className="font-bold text-sm text-[#18211F]">{detail.customer.name}</div>
                      <div className="text-xs text-[#5A6661] mt-0.5">{detail.customer.email ?? 'No email'}</div>
                      <div className="text-xs text-[#5A6661]">{detail.customer.phone ?? 'No phone'}</div>
                    </div>
                  </div>

                  {/* Professional Record */}
                  <div className="bg-[#FFFEFA] border border-[#D9DED8] rounded-xl p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-[#7C8681]">
                        Assigned Professional
                      </h3>
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#E2EEE9] text-[#2F7D5B]">
                        {detail.professional.verification_status}
                      </span>
                    </div>
                    <div>
                      <div className="font-bold text-sm text-[#18211F]">
                        {detail.professional.display_name}
                      </div>
                      <div className="text-xs text-[#5A6661] mt-0.5">
                        {detail.professional.email ?? 'No email'} · {detail.professional.phone ?? 'No phone'}
                      </div>
                      <div className="text-xs text-[#7C8681] mt-1">
                        ★ {detail.professional.rating_average.toFixed(1)} rating ·{' '}
                        {detail.professional.completed_jobs_count} completed jobs
                      </div>
                    </div>
                  </div>

                  {/* Financials & Payments */}
                  <div className="bg-[#FFFEFA] border border-[#D9DED8] rounded-xl p-5 space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#7C8681]">
                      Payments & Invoicing
                    </h3>
                    <div className="flex items-center justify-between text-xs py-1 border-b border-[#D9DED8]/60">
                      <span className="text-[#7C8681]">Base Service Amount</span>
                      <span className="font-bold text-[#18211F]">
                        {formatCurrency(detail.booking.quoted_or_base_amount)}
                      </span>
                    </div>
                    {detail.payments.length > 0 ? (
                      <div className="space-y-2">
                        {detail.payments.map((p) => (
                          <div key={p.id} className="bg-[#F7F4EC] rounded-lg p-2.5 text-xs flex items-center justify-between">
                            <div>
                              <div className="font-semibold text-[#18211F] capitalize">
                                {p.payment_type} · {p.provider}
                              </div>
                              <div className="text-[11px] text-[#7C8681]">
                                {p.paid_at ? `Paid ${formatDateTime(p.paid_at)}` : `Status: ${p.status}`}
                              </div>
                            </div>
                            <span className="font-mono font-bold text-[#0D5144]">
                              {formatCurrency(p.amount, p.currency)}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-[#7C8681] italic">No transaction records captured.</p>
                    )}
                  </div>

                  {/* Event Audit Trail */}
                  {detail.events.length > 0 && (
                    <div className="bg-[#FFFEFA] border border-[#D9DED8] rounded-xl p-5 space-y-3">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-[#7C8681]">
                        Job Audit Log
                      </h3>
                      <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                        {detail.events.map((ev) => (
                          <div key={ev.id} className="text-xs border-l-2 border-[#176B5B] pl-2.5 py-0.5">
                            <div className="font-semibold text-[#18211F]">
                              {STATE_LABELS[ev.from_state] ?? ev.from_state} →{' '}
                              {STATE_LABELS[ev.to_state] ?? ev.to_state}
                            </div>
                            <div className="text-[11px] text-[#7C8681]">
                              {ev.actor_name ?? 'System'} · {formatDateTime(ev.created_at)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Action Footer */}
        <div className="px-6 py-4 border-t border-[#D9DED8] bg-[#F7F4EC] flex items-center justify-between gap-3">
          {detail && !isTerminal && (
            <div>
              <button
                onClick={() => { setCancelError(null); setConfirmCancel(true); }}
                className="px-3.5 py-2 border border-[#DFC0B7] bg-[#F3E1DA] text-[#A9523D] text-xs font-bold rounded-lg hover:bg-[#EDD1C8] transition"
              >
                Admin Cancel Job
              </button>
            </div>
          )}

          <div className="ml-auto">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-[#18211F] text-white text-xs font-bold rounded-lg hover:bg-[#0D5144] transition"
            >
              Done Reviewing
            </button>
          </div>
        </div>
      </div>
      {detail && confirmCancel && (
        <CancelJobDialog
          reference={detail.booking.reference}
          state={detail.current_state}
          hasProfessional={!!detail.professional}
          pending={isPending}
          error={cancelError}
          onConfirm={handleAdminCancel}
          onClose={() => setConfirmCancel(false)}
        />
      )}
    </div>
  );
}
