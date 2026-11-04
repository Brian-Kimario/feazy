'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateJobState } from '@/lib/services/jobs';
import { SuccessState } from '@/components/ui/SuccessState';

// ── Configuration ──────────────────────────────────────────────────────────────

/** States a professional can trigger from any given current state */
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  // An open offer is answered with RequestCardActions, which asks for a decline reason.
  assigned:      [],
  accepted:      ['on_the_way'],
  on_the_way:    ['arrived'],
  // A repair job is assessed and quoted before any work starts. See nextStatesFor().
  arrived:       ['in_progress'],
  assessing:     [],
  in_progress:   ['completed'],
  quote_pending: [],
  completed:     [],
  cancelled:     [],
  closed:        [],
};

const TRANSITION_LABELS: Record<string, string> = {
  accepted:   'Accept Job',
  on_the_way: "I'm On the Way",
  arrived:    "I've Arrived",
  assessing:  'Start Assessment',
  in_progress:'Start Work',
  completed:  'Mark Complete',
  cancelled:  'Cancel Job',
  declined:   'Decline Job',
};

const TRANSITION_STYLES: Record<string, string> = {
  accepted:    'bg-[#176B5B] text-white hover:bg-[#0D5144] focus-visible:ring-[#176B5B]',
  on_the_way:  'bg-[#176B5B] text-white hover:bg-[#0D5144] focus-visible:ring-[#176B5B]',
  arrived:     'bg-[#176B5B] text-white hover:bg-[#0D5144] focus-visible:ring-[#176B5B]',
  assessing:   'bg-[#176B5B] text-white hover:bg-[#0D5144] focus-visible:ring-[#176B5B]',
  in_progress: 'bg-[#176B5B] text-white hover:bg-[#0D5144] focus-visible:ring-[#176B5B]',
  completed:   'bg-[#2F7D5B] text-white hover:bg-[#226048] focus-visible:ring-[#2F7D5B]',
  cancelled:   'border border-[#DFC0C0] text-[#9B3535] hover:bg-[#F5E6E6] focus-visible:ring-[#DFC0C0]',
  declined:    'border border-[#DFC0C0] text-[#9B3535] hover:bg-[#F5E6E6] focus-visible:ring-[#DFC0C0]',
};

/** States that require an explicit confirmation dialog before proceeding */
const REQUIRES_CONFIRMATION = new Set(['cancelled', 'declined', 'completed']);

const CONFIRMATION_MESSAGES: Record<string, string> = {
  cancelled: 'Are you sure you want to cancel this job? This cannot be undone.',
  declined: 'Decline this request? It will be offered to another professional.',
  completed: 'Mark this job as complete? Please confirm all work has been finished.',
};

/** The buttons for a job. On arrival, a repair job starts with an assessment; the database enforces the same rule. */
function nextStatesFor(currentState: string, pricingModel?: string): string[] {
  if (currentState === 'arrived' && pricingModel === 'quote_after_inspection') {
    return ['assessing'];
  }
  return ALLOWED_TRANSITIONS[currentState] ?? [];
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface Toast {
  type: 'success' | 'error';
  message: string;
}

interface StateTransitionButtonsProps {
  jobId: string;
  currentState: string;
  /** Repair jobs (`quote_after_inspection`) go to assessment first; other jobs go straight to work. */
  pricingModel?: string;
  /** Targets that stay disabled until the matching code is verified, with the reason shown under the button. */
  lockedTargets?: Partial<Record<string, string>>;
}

// ── Component ──────────────────────────────────────────────────────────────────

/**
 * StateTransitionButtons — Professional job state action buttons
 *
 * - Shows only the transitions allowed from `currentState`
 * - High-stakes transitions (cancel, complete) show a confirmation dialog
 * - Displays a success/error toast after each action
 * - Disables all buttons while a transition is pending
 * - Calls `updateJobState` server action; Next.js revalidatePath handles refresh
 */
export function StateTransitionButtons({
  jobId,
  currentState,
  pricingModel,
  lockedTargets = {},
}: StateTransitionButtonsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState<Toast | null>(null);
  const [pendingState, setPendingState] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<string | null>(null);
  const [showSuccessState, setShowSuccessState] = useState(false);
  const [successState, setSuccessState] = useState<string | null>(null);

  const nextStates = nextStatesFor(currentState, pricingModel);

  function showToast(type: 'success' | 'error', message: string) {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  }

  function handleButtonClick(targetState: string) {
    if (REQUIRES_CONFIRMATION.has(targetState)) {
      setConfirmTarget(targetState);
      return;
    }
    executeTransition(targetState);
  }

  function executeTransition(targetState: string) {
    setConfirmTarget(null);
    setPendingState(targetState);

    startTransition(async () => {
      try {
        const result = await updateJobState(jobId, targetState);

        if (result.success === false) {
          showToast('error', ('error' in result ? result.error : 'State transition failed.'));
        } else {
          const label = TRANSITION_LABELS[targetState] ?? targetState;
          
          // Show success state for job acceptance
          if (targetState === 'accepted') {
            setSuccessState(targetState);
            setShowSuccessState(true);
            return;
          }
          
          // For other transitions, show toast
          showToast('success', `✓ ${label} — job updated successfully.`);
        }
      } catch {
        showToast('error', 'An unexpected error occurred. Please try again.');
      } finally {
        setPendingState(null);
      }
    });
  }

  if (nextStates.length === 0) {
    return null;
  }

  // Show success state for job acceptance
  if (showSuccessState && successState === 'accepted') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-[#18211F]/40 backdrop-blur-sm" />
        <div className="relative">
          <SuccessState
            title="Request accepted"
            description="You're now assigned to this job. The customer has been notified. Schedule your visit and get started."
            action={{
              label: 'View job details',
              onClick: () => router.push(`/professional/jobs/${jobId}`),
            }}
            secondaryAction={{
              label: 'Back to requests',
              onClick: () => router.push('/professional/jobs'),
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <>
      {/* ── Transition Buttons ── */}
      <div className="space-y-2">
        {nextStates.map((targetState) => {
          const isCancellation = targetState === 'cancelled';
          const isThisButtonPending = pendingState === targetState;
          const lockedReason = lockedTargets[targetState];
          const isAnyPending = isPending || pendingState !== null || Boolean(lockedReason);

          return (
            <div key={targetState}>
              <button
                type="button"
                disabled={isAnyPending}
                onClick={() => handleButtonClick(targetState)}
                aria-busy={isThisButtonPending}
                aria-label={
                  isThisButtonPending
                    ? `${TRANSITION_LABELS[targetState] ?? targetState}… Please wait`
                    : (TRANSITION_LABELS[targetState] ?? targetState)
                }
                className={`
                  w-full min-h-[48px] px-4 py-3 text-sm font-bold rounded-xl transition-all duration-150
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2
                  disabled:opacity-50 disabled:cursor-not-allowed
                  flex items-center justify-center gap-2
                  ${TRANSITION_STYLES[targetState] ?? 'bg-[#176B5B] text-white hover:bg-[#0D5144]'}
                `}
              >
                {isThisButtonPending ? (
                  <>
                    <svg
                      className="animate-spin h-4 w-4 flex-shrink-0"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden="true"
                    >
                      <path
                        className="opacity-25"
                        d="M12 2a10 10 0 0 1 10 10"
                        strokeLinecap="round"
                      />
                      <path
                        className="opacity-75"
                        d="M12 2a10 10 0 0 0-10 10"
                        strokeLinecap="round"
                      />
                    </svg>
                    <span>Updating…</span>
                  </>
                ) : (
                  TRANSITION_LABELS[targetState] ?? targetState
                )}
              </button>
              {lockedReason && <p className="text-xs text-ink-3 text-center mt-1">{lockedReason}</p>}
              {isCancellation && !isAnyPending && (
                <p className="text-xs text-[#7C8681] text-center mt-1">
                  This cannot be undone
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Confirmation Dialog ── */}
      {confirmTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-[#18211F]/40 backdrop-blur-sm"
            onClick={() => setConfirmTarget(null)}
            aria-hidden="true"
          />

          {/* Panel */}
          <div className="relative bg-[#FFFEFA] border border-[#D9DED8] rounded-2xl shadow-xl p-6 max-w-sm w-full">
            {/* Icon */}
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-[#F5E6E6] mx-auto mb-4">
              <svg
                className="w-6 h-6 text-[#9B3535]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>

            <h2
              id="confirm-dialog-title"
              className="text-lg font-bold text-[#18211F] text-center mb-2"
            >
              Confirm Action
            </h2>
            <p className="text-sm text-[#5A6661] text-center mb-6">
              {CONFIRMATION_MESSAGES[confirmTarget] ?? 'Are you sure?'}
            </p>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmTarget(null)}
                className="flex-1 min-h-[48px] px-4 py-3 text-sm font-bold rounded-xl border border-[#D9DED8] text-[#5A6661] hover:bg-[#F4F5F3] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D9DED8] flex items-center justify-center"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => executeTransition(confirmTarget)}
                className={`flex-1 min-h-[48px] px-4 py-3 text-sm font-bold rounded-xl transition focus:outline-none focus-visible:ring-2 flex items-center justify-center ${
                  TRANSITION_STYLES[confirmTarget] ?? 'bg-[#176B5B] text-white hover:bg-[#0D5144]'
                }`}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast Notification ── */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`
            fixed bottom-6 left-1/2 -translate-x-1/2 z-50
            flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-sm font-semibold
            transition-all duration-300
            ${
              toast.type === 'success'
                ? 'bg-[#E3F0E8] text-[#2F7D5B] border border-[#C7DCCF]'
                : 'bg-[#F5E6E6] text-[#9B3535] border border-[#DFC0C0]'
            }
          `}
        >
          {toast.type === 'success' ? (
            <svg
              className="w-4 h-4 flex-shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg
              className="w-4 h-4 flex-shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          )}
          <span>{toast.message}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Dismiss notification"
            className="ml-1 opacity-60 hover:opacity-100 transition"
          >
            <svg
              className="w-3.5 h-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}
    </>
  );
}
