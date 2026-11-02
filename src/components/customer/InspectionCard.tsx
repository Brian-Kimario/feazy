import { Panel } from '@/components/shell/primitives';
import { formatSlot } from '@/lib/shell/rules';
import type { BookingInspection } from '@/lib/services/inspections';

/** Status of the free inspection visit, and its findings once the inspector has reported. */
export function InspectionCard({ inspection }: { inspection: BookingInspection }) {
  const { status, scheduledStart, outcome, findings, recommendation } = inspection;
  const headline: Record<string, string> = {
    requested: 'Your free inspection is being arranged.',
    scheduled: scheduledStart ? `Visit: ${formatSlot(scheduledStart) ?? ''}` : 'Free inspection visit scheduled.',
    missed: 'We could not complete the inspection visit. We will contact you to reschedule.',
    completed: outcome === 'no_repair_needed' ? 'Inspection complete: no repair needed.' : 'Inspection complete: a repair is needed.',
    cancelled: 'The inspection was cancelled.',
  };
  return (
    <Panel className="p-5">
      <h2 className="mb-1 text-sm font-bold text-ink">Free inspection</h2>
      <p className="text-sm text-ink-2">{headline[status] ?? 'Inspection'}</p>
      {status === 'completed' && findings && (
        <div className="mt-3 space-y-2 text-sm text-ink-2">
          <p className="whitespace-pre-wrap">{findings}</p>
          {recommendation && <p className="whitespace-pre-wrap">Recommendation: {recommendation}</p>}
          {outcome === 'repair_needed' && (
            <p className="text-ink-3">You will receive an itemised quotation. No repair work starts until you approve it.</p>
          )}
        </div>
      )}
    </Panel>
  );
}
