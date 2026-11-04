import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, CircleCheck, Clock, PartyPopper, SearchX } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import { getBookingInspection } from '@/lib/services/inspections';
import { getBookingMaterials } from '@/lib/services/materials';
import { MaterialsPanel } from '@/components/materials/MaterialsPanel';
import { InspectionCard } from '@/components/customer/InspectionCard';
import { getCustomerCase } from '@/lib/services/job-case';
import { getCancellationReviewStatus, getJobCodeState, getNoShowReportedAt } from '@/lib/services/job-codes';
import { noShowEligibility } from '@/lib/job-codes/rules';
import { toPanelQuote } from '@/lib/quotes/panel';
import { bookingStatusDisplay, formatSlot, missingProfessional, propertyTypeLabel } from '@/lib/shell/rules';
import { formatCurrency } from '@/lib/currency';
import { PageContainer, Panel, StatusPill } from '@/components/shell/primitives';
import {
  CaseCard,
  CaseProgress,
  CaseTimeline,
  FactList,
  IncompleteNotice,
  InspectionList,
  MediaGallery,
  QuoteSummary,
  arrivalWindowText,
} from '@/components/case/CaseFile';
import { ProfessionalCard } from '@/components/customer/ProfessionalCard';
import { QuoteReviewButton } from '@/components/customer/QuoteReviewButton';
import { JobCodeCard } from '@/components/customer/JobCodeCard';
import { NoShowReport } from '@/components/customer/NoShowReport';
import { JobMessages } from '@/components/messages/JobMessages';
import { CancelBookingButton } from '@/components/customer/CancelBookingButton';
import { cancelOffer, expectedCancelState } from '@/lib/bookings/cancel-rules';
import { UPIIntentCheckout } from '@/components/customer/UPIIntentCheckout';

export const metadata: Metadata = {
  title: 'Booking — Feazy',
};

/** bookings.pricing_model, copied from the service at booking time. */
const PRICING_MODEL_NOTE: Record<string, string> = {
  fixed: 'Fixed price, set when you booked.',
  inspection: 'Priced by inspection. Any further work is quoted and needs your approval.',
  quote_after_inspection: 'The professional inspects first and sends a quote. Quoted work needs your approval.',
};

interface BookingDetailPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ new?: string }>;
}

export default async function BookingDetailPage({ params, searchParams }: BookingDetailPageProps) {
  const user = await getCurrentUser();
  if (!user) notFound();

  const { id } = await params;
  const { new: isNew } = await searchParams;

  const kase = await getCustomerCase(user.id, id);
  if (!kase) notFound();

  const { booking, service, property, job, professional } = kase;
  const jobState = job?.state ?? null;
  const codeState =
    job && ['on_the_way', 'arrived', 'assessing', 'in_progress'].includes(job.state) ? await getJobCodeState(job.id) : null;
  const noShowReport = job && ['accepted', 'on_the_way'].includes(job.state) ? await getNoShowReportedAt(job.id) : null;
  const noShow = job
    ? noShowEligibility({
        state: job.state,
        arrivedAt: job.arrivedAt,
        scheduledStart: booking.scheduledStart,
        now: new Date(),
        reported: noShowReport != null,
      })
    : null;
  const cancelReview = job && ['arrived', 'assessing', 'quote_pending', 'in_progress'].includes(job.state)
    ? await getCancellationReviewStatus(job.id)
    : null;
  const bookingInspection = await getBookingInspection(booking.id);
  const materials = await getBookingMaterials(booking.id);
  const cancel = cancelOffer(booking.status, jobState);
  const isOpen = booking.status !== 'cancelled' && booking.status !== 'completed';
  // The matcher only offers bookings whose start is still ahead, so don't promise matching after it.
  const startPassed = new Date(booking.scheduledStart) < new Date();
  const missing = missingProfessional({
    bookingStatus: booking.status,
    jobState,
    unmatchedSince: booking.unmatchedSince,
    startPassed,
  });
  // An offer still open at the start is about to expire unanswered, so it counts as overdue.
  const unmatched = missing === 'overdue' || (missing === 'unmatched' && !professional);
  const status = bookingStatusDisplay({
    bookingStatus: booking.status,
    jobState,
    unmatchedSince: booking.unmatchedSince,
    startPassed,
  });

  const showProfessional =
    professional != null && jobState !== 'cancelled' && (isOpen ? missing !== 'overdue' : booking.status === 'completed');
  const pricingNote = PRICING_MODEL_NOTE[booking.pricingModel];
  const hasActivity = kase.quotes.length > 0 || kase.inspections.length > 0 || kase.media.length > 0;
  const proName = professional?.displayName ?? 'Your professional';

  return (
    <PageContainer className="pb-24">
      <Link
        href="/customer/bookings"
        className="mb-5 inline-flex min-h-11 items-center gap-1.5 text-sm text-ink-3 transition-colors hover:text-teal"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Bookings
      </Link>

      {isNew === '1' && (
        <div role="status" className="mb-5 flex items-start gap-3 rounded-2xl border border-teal/25 bg-teal-soft px-4 py-4">
          <PartyPopper className="mt-0.5 h-5 w-5 shrink-0 text-teal" aria-hidden="true" />
          <div className="text-sm">
            <p className="font-semibold text-teal-deep">Booking confirmed</p>
            <p className="mt-0.5 text-ink-2">
              Booking <span className="font-mono">{booking.reference}</span> is submitted. We&apos;ll let you know
              when a professional accepts.
            </p>
          </div>
        </div>
      )}

      <header className="mb-6">
        {service?.categoryName && <p className="text-sm font-medium text-ink-3">{service.categoryName}</p>}
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="font-editorial text-3xl font-semibold leading-tight tracking-[-0.02em] text-ink">
            {service?.name ?? 'Booking'}
          </h1>
          <StatusPill tone={status.tone}>{status.label}</StatusPill>
        </div>
        <p className="mt-1 font-mono text-xs text-ink-4">{booking.reference}</p>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {bookingInspection && <InspectionCard inspection={bookingInspection} />}
          <MaterialsPanel materials={materials} audience="customer" />
          {kase.incomplete && <IncompleteNotice />}

          {/* What needs the customer now: a quote, a payment, or a new time. */}
          {kase.pendingQuote && (
            <Panel className="border-clay/30 p-5">
              <p className="text-sm font-semibold text-ink">Your approval is needed</p>
              <p className="mt-1 text-sm text-ink-3">
                {kase.pendingQuote.proName} sent a quote of {formatCurrency(kase.pendingQuote.total)}. Work on it
                starts only if you approve.
              </p>
              <div className="mt-4">
                <QuoteReviewButton quote={toPanelQuote(kase.pendingQuote)} />
              </div>
            </Panel>
          )}

          {kase.amountDuePaise != null && job && (
            <Panel className="border-teal/40 p-5">
              <p className="text-sm font-semibold text-teal-deep">Payment due</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">
                {formatCurrency(kase.amountDuePaise / 100)}
              </p>
              <p className="mt-1 text-sm text-ink-3">The work is complete. Pay securely with UPI.</p>
              <div className="mt-4">
                <UPIIntentCheckout jobId={job.id} displayAmountRupees={kase.amountDuePaise / 100} />
              </div>
            </Panel>
          )}

          {kase.noPayableAmount && (
            <Panel className="p-5">
              <p className="text-sm font-semibold text-ink">Payment not available yet</p>
              <p className="mt-1 text-sm text-ink-3">
                The work is complete, but this job has no approved quote or booking price to pay against.
              </p>
            </Panel>
          )}

          {kase.paidAt && (
            <div role="status" className="flex items-start gap-3 rounded-2xl border border-success/25 bg-success-soft px-4 py-4">
              <CircleCheck className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden="true" />
              <div className="text-sm">
                <p className="font-semibold text-success">Payment received</p>
                <p className="mt-0.5 text-ink-2">Paid {formatSlot(kase.paidAt)}.</p>
              </div>
            </div>
          )}

          {unmatched && (
            <Panel className="border-ochre/30 bg-ochre-soft p-5">
              <div className="flex items-start gap-3">
                <SearchX className="mt-0.5 h-5 w-5 shrink-0 text-ochre" aria-hidden="true" />
                <div>
                  {missing === 'overdue' ? (
                    <>
                      <p className="font-semibold text-ink">No professional was assigned</p>
                      <p className="mt-1 text-sm text-ink-2">
                        The start time passed before a professional confirmed this visit. Our team can see this
                        booking. You can book a new time.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="font-semibold text-ink">No professional available yet</p>
                      <p className="mt-1 text-sm text-ink-2">
                        None of our verified professionals for this service can take this time slot right now. We
                        keep trying until the start time, and our team can see it. You can also book a different
                        time.
                      </p>
                    </>
                  )}
                  {service && property && (
                    <Link
                      href={`/customer/bookings/new?service=${service.id}&propertyId=${property.id}`}
                      className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-teal px-4 text-sm font-semibold text-paper hover:bg-teal-deep"
                    >
                      {missing === 'overdue' ? 'Book a new time' : 'Book another time'}
                    </Link>
                  )}
                </div>
              </div>
            </Panel>
          )}

          {(kase.eta || kase.lateReportedAt) && (
            <Panel className={`p-5 ${kase.lateReportedAt || kase.eta?.passed ? 'border-ochre/30 bg-ochre-soft' : 'border-teal/30'}`}>
              <div className="flex items-start gap-3">
                <Clock
                  className={`mt-0.5 h-5 w-5 shrink-0 ${kase.lateReportedAt || kase.eta?.passed ? 'text-ochre' : 'text-teal'}`}
                  aria-hidden="true"
                />
                <div className="text-sm">
                  {kase.lateReportedAt && (
                    <p className="font-semibold text-ink">
                      {proName} said they are running late ({formatSlot(kase.lateReportedAt)}).
                    </p>
                  )}
                  {kase.eta && (
                    <>
                      <p className={kase.lateReportedAt ? 'mt-1 text-ink-2' : 'font-semibold text-ink'}>
                        {kase.lateReportedAt ? 'New expected arrival' : 'Expected arrival'}: {arrivalWindowText(kase.eta)}
                      </p>
                      {kase.eta.sharedAt && !kase.lateReportedAt && (
                        <p className="mt-0.5 text-xs text-ink-3">Shared {formatSlot(kase.eta.sharedAt)}</p>
                      )}
                      {kase.eta.passed && (
                        <p className="mt-1 text-ink-2">
                          This window has passed and {proName} has not marked arrival yet.
                        </p>
                      )}
                    </>
                  )}
                  <p className="mt-1 text-xs text-ink-3">
                    This is the professional&apos;s own estimate. Feazy does not track live location.
                  </p>
                </div>
              </div>
            </Panel>
          )}

          {job && codeState && <JobCodeCard jobId={job.id} state={codeState} />}
          {job && (noShow?.status === 'eligible' || noShow?.status === 'already_reported') && (
            <NoShowReport jobId={job.id} reportedAt={noShowReport?.reportedAt ?? null} />
          )}

          {showProfessional && professional && (
            <ProfessionalCard
              professional={professional}
              awaitingAcceptance={jobState === 'assigned'}
              phone={isOpen ? professional.phone : null}
            />
          )}

          {job && professional && (
            <JobMessages userId={user.id} jobId={job.id} jobState={job.state} otherName={proName} />
          )}

          {booking.status === 'cancelled' && (
            <Panel className="p-5 text-sm">
              <p className="font-semibold text-ink">This booking is cancelled</p>
              {kase.paidAt && (
                <p className="mt-1 text-ink-2">
                  You paid for this booking. Cancelling does not refund it automatically. Feazy support reviews it and
                  will contact you.
                </p>
              )}
            </Panel>
          )}
          {cancelReview?.status === 'open' ? (
            <Panel className="p-5 text-sm">
              <p className="font-semibold text-ink">Cancellation under review</p>
              <p className="mt-1 text-ink-2">Feazy will contact you. Your booking stays active until then.</p>
            </Panel>
          ) : cancelReview ? (
            <Panel className="p-5 text-sm">
              <p className="font-semibold text-ink">Cancellation request reviewed</p>
              <p className="mt-1 text-ink-2">Please contact Feazy support if you need anything further.</p>
            </Panel>
          ) : (
            cancel !== 'none' && (
              <CancelBookingButton
                bookingId={booking.id}
                expectedState={expectedCancelState(jobState)}
                professionalAssigned={professional != null}
                needsReview={cancel === 'request_review'}
              />
            )
          )}

          <CaseCard title="Booking">
            <FactList
              facts={[
                { label: 'Scheduled for', value: formatSlot(booking.scheduledStart) ?? '—' },
                ...(property
                  ? [
                      {
                        label: 'Property',
                        value: (
                          <>
                            {property.name}
                            <span className="text-ink-3"> · {propertyTypeLabel(property.propertyType)}</span>
                            {property.address && <span className="block text-xs text-ink-3">{property.address}</span>}
                          </>
                        ),
                      },
                    ]
                  : []),
                {
                  label: 'Price at booking',
                  value: (
                    <>
                      {booking.bookedAmount != null ? formatCurrency(booking.bookedAmount) : 'Quote after inspection'}
                      {pricingNote && <span className="block text-xs text-ink-3">{pricingNote}</span>}
                    </>
                  ),
                },
                ...(booking.createdAt ? [{ label: 'Booked on', value: formatSlot(booking.createdAt) ?? '—' }] : []),
              ]}
            />
            {(booking.problemSummary || booking.intakeOptions.length > 0) && (
              <div className="mt-4 border-t border-line pt-4">
                <p className="text-xs text-ink-4">Your description</p>
                {booking.problemSummary && (
                  <p className="mt-1 whitespace-pre-line text-sm leading-6 text-ink">{booking.problemSummary}</p>
                )}
                {booking.intakeOptions.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {booking.intakeOptions.map((option) => (
                      <li key={option} className="rounded-full border border-line bg-porcelain px-2.5 py-0.5 text-xs text-ink-2">
                        {option}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </CaseCard>

          {hasActivity && (
            <>
              {kase.inspections.length > 0 && (
                <CaseCard title="Inspection notes">
                  <InspectionList inspections={kase.inspections} />
                </CaseCard>
              )}
              {kase.media.length > 0 && (
                <CaseCard title="Photos and receipts">
                  <MediaGallery media={kase.media} />
                </CaseCard>
              )}
              {kase.quotes.length > 0 && (
                <CaseCard title={kase.quotes.length > 1 ? 'Quotes' : 'Quote'}>
                  <div className="space-y-3">
                    {kase.quotes.map((quote) => (
                      <QuoteSummary key={quote.id} quote={quote} role="customer" jobState={jobState} />
                    ))}
                  </div>
                </CaseCard>
              )}
            </>
          )}
        </div>

        <aside className="space-y-4">
          <CaseCard title="Progress">
            <CaseProgress steps={kase.progress} />
          </CaseCard>
          <CaseCard title="Timeline">
            <CaseTimeline entries={kase.timeline} />
          </CaseCard>
        </aside>
      </div>
    </PageContainer>
  );
}
