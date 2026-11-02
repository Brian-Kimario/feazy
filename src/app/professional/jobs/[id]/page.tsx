import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, MapPin, MessageSquare, Phone, User } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import { getProfessionalCase } from '@/lib/services/job-case';
import { getJobCodeState } from '@/lib/services/job-codes';
import { STATE_META, isJobState } from '@/lib/jobs/states';
import { formatSlot, offerLocalityLabel, offerPayBasis, propertyTypeLabel } from '@/lib/shell/rules';
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
import { StateTransitionButtons } from '@/components/professional/StateTransitionButtons';
import { WithdrawFromJob } from '@/components/professional/WithdrawFromJob';
import { JobCodeEntry } from '@/components/professional/JobCodeEntry';
import { RequestCardActions } from '@/components/professional/RequestCardActions';
import { JobInspectionAndQuote } from '@/components/professional/JobInspectionAndQuote';
import { ArrivalWindowForm } from '@/components/professional/ArrivalWindowForm';
import { JobMessages } from '@/components/messages/JobMessages';
import { JobMediaUploader } from '@/components/professional/JobMediaUploader';

export const metadata: Metadata = {
  title: 'Job — Feazy Professional',
};

/** States where the professional can move the job forward with StateTransitionButtons. */
const ACTIONABLE: ReadonlySet<string> = new Set(['accepted', 'on_the_way', 'arrived', 'in_progress']);
/** Inspection notes and quotes are written on site, before the work is finished. */
const ON_SITE: ReadonlySet<string> = new Set(['arrived', 'in_progress']);
/** Before arrival: an arrival window or a late notice can be sent (report_job_eta). */
const TRAVELLING: ReadonlySet<string> = new Set(['accepted', 'on_the_way']);
/** States in which add_job_media and the job-media upload policy accept files. */
const MEDIA_OPEN: ReadonlySet<string> = new Set(['arrived', 'in_progress', 'quote_pending', 'completed']);

const IDLE_COPY: Record<string, string> = {
  quote_pending: 'Waiting for the customer to approve your quote.',
  completed: 'Work is complete. The customer pays through the app.',
  closed: 'This job is closed.',
  cancelled: 'This job was cancelled.',
};

interface JobDetailsPageProps {
  params: Promise<{ id: string }>;
}

export default async function JobDetailsPage({ params }: JobDetailsPageProps) {
  const user = await getCurrentUser();
  if (!user) notFound();

  const { id } = await params;
  const kase = await getProfessionalCase(user.id, id);
  if (!kase) {
    return (
      <PageContainer>
        <Panel>
          <h1 className="text-lg font-bold text-ink">This job is not available to you</h1>
          <p className="mt-1 text-sm text-ink-2">
            It may have been reassigned, withdrawn or cancelled. Your current jobs and offers are on your jobs page.
          </p>
          <Link href="/professional/jobs" className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-teal-deep hover:underline">
            Go to my jobs
          </Link>
        </Panel>
      </PageContainer>
    );
  }

  const { job, booking, contact, property } = kase;
  // Only the stages that need a code ask for one: the start code on site, the finish code during the work.
  const codeState = job.state === 'arrived' || job.state === 'in_progress' ? await getJobCodeState(id) : null;
  const codeVerified = codeState?.status === 'used';
  const lockedTargets: Partial<Record<string, string>> = codeVerified
    ? {}
    : job.state === 'arrived'
      ? { in_progress: 'Enter the start code from the customer first.' }
      : job.state === 'in_progress'
        ? { completed: 'Enter the finish code from the customer first.' }
        : {};
  const meta = isJobState(job.state) ? STATE_META[job.state] : null;
  const isOffer = job.state === 'assigned';
  const payBasis = offerPayBasis({
    pricingModel: booking.pricingModel,
    customerPrice: booking.customerPrice,
    inspectionFee: kase.inspectionFee,
  });
  const locality = offerLocalityLabel(kase.locality);
  const address = contact
    ? [contact.address_line_1, contact.address_line_2, contact.area, contact.city, contact.postal_code]
        .filter(Boolean)
        .join(', ')
    : null;
  const paidCopy = job.state === 'completed' && kase.paidAt ? `Customer paid ${formatSlot(kase.paidAt)}.` : null;

  return (
    <PageContainer className="pb-24">
      <Link
        href={isOffer ? '/professional/requests' : '/professional/jobs'}
        className="mb-5 inline-flex min-h-11 items-center gap-1.5 text-sm text-ink-3 transition-colors hover:text-teal"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {isOffer ? 'Requests' : 'Jobs'}
      </Link>

      <header className="mb-6">
        {kase.categoryName && <p className="text-sm font-medium text-ink-3">{kase.categoryName}</p>}
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="font-editorial text-3xl font-semibold leading-tight tracking-[-0.02em] text-ink">
            {kase.serviceName}
          </h1>
          {meta && <StatusPill tone={meta.tone}>{meta.label}</StatusPill>}
        </div>
        {booking.reference && <p className="mt-1 font-mono text-xs text-ink-4">{booking.reference}</p>}
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {kase.incomplete && <IncompleteNotice />}

          {/* The one thing to do next. */}
          <Panel className="border-teal/30 p-5">
            {meta && <p className="text-sm font-semibold text-ink">{meta.proCopy}</p>}
            {isOffer && job.offerExpiresAt && (
              <p className="mt-1 text-sm text-ink-3">Offer open until {formatSlot(job.offerExpiresAt)}.</p>
            )}
            <div className="mt-4">
              {isOffer ? (
                <RequestCardActions jobId={job.id} serviceName={kase.serviceName} afterDeclineHref="/professional/requests" />
              ) : ACTIONABLE.has(job.state) ? (
                <div className="space-y-4">
                  {codeState && <JobCodeEntry jobId={job.id} state={codeState} />}
                  <StateTransitionButtons jobId={job.id} currentState={job.state} lockedTargets={lockedTargets} />
                  <WithdrawFromJob jobId={job.id} />
                </div>
              ) : (
                <p className="text-sm text-ink-3">{paidCopy ?? IDLE_COPY[job.state] ?? 'No actions available.'}</p>
              )}
            </div>
            {TRAVELLING.has(job.state) && (
              <div className="mt-5 border-t border-line pt-4">
                {kase.eta && (
                  <div className="mb-3 text-sm text-ink-2">
                    <p>
                      You told the customer: <span className="font-semibold text-ink">{arrivalWindowText(kase.eta)}</span>
                    </p>
                    {kase.eta.passed && (
                      <p className="mt-1 text-ochre">This window has passed. If you are delayed, send a new one.</p>
                    )}
                  </div>
                )}
                <ArrivalWindowForm jobId={job.id} state={job.state} hasWindow={kase.eta != null} />
              </div>
            )}
          </Panel>

          {ON_SITE.has(job.state) && <JobInspectionAndQuote jobId={job.id} currentState={job.state} />}

          {(MEDIA_OPEN.has(job.state) || kase.media.length > 0) && (
            <CaseCard title="Photos and receipts">
              {MEDIA_OPEN.has(job.state) && (
                <p className="mb-3 text-sm text-ink-3">
                  The customer can see everything you add here.
                </p>
              )}
              {kase.media.length > 0 && <MediaGallery media={kase.media} />}
              {MEDIA_OPEN.has(job.state) && (
                <div className={kase.media.length > 0 ? 'mt-4' : ''}>
                  <JobMediaUploader jobId={job.id} />
                </div>
              )}
            </CaseCard>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <CaseCard title="Customer">
              {contact ? (
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal-soft">
                    <User className="h-5 w-5 text-teal" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    {contact.full_name ? (
                      <p className="font-semibold text-ink">{contact.full_name}</p>
                    ) : (
                      <p className="text-sm text-ink-3">No name on file</p>
                    )}
                    {contact.phone ? (
                      <a
                        href={`tel:${contact.phone}`}
                        className="mt-1 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-teal hover:underline"
                      >
                        <Phone className="h-4 w-4" aria-hidden="true" />
                        {contact.phone}
                      </a>
                    ) : (
                      <>
                        <p className="mt-1 text-sm text-ink-3">No phone number on file</p>
                        <a
                          href="#messages"
                          className="mt-1 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-teal hover:underline"
                        >
                          <MessageSquare className="h-4 w-4" aria-hidden="true" />
                          Message the customer
                        </a>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-ink-3">Name and phone are shared once you accept.</p>
              )}
            </CaseCard>

            <CaseCard title="Property">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal-soft">
                  <MapPin className="h-5 w-5 text-teal" aria-hidden="true" />
                </span>
                <div className="min-w-0 text-sm">
                  {property.name && <p className="font-semibold text-ink">{property.name}</p>}
                  {property.propertyType && <p className="text-ink-3">{propertyTypeLabel(property.propertyType)}</p>}
                  {address ? (
                    <p className="mt-1 text-ink-2">{address}</p>
                  ) : (
                    <>
                      {locality && <p className="mt-1 text-ink-2">{locality}</p>}
                      <p className="mt-1 text-xs text-ink-4">The full address is shared once you accept.</p>
                    </>
                  )}
                  {contact?.access_notes && <p className="mt-1 text-xs text-ink-3">Access: {contact.access_notes}</p>}
                </div>
              </div>
            </CaseCard>
          </div>

          <JobMessages
            userId={user.id}
            jobId={job.id}
            jobState={job.state}
            otherName={contact?.full_name ?? 'the customer'}
          />

          <CaseCard title="Job">
            <FactList
              facts={[
                { label: 'Scheduled for', value: formatSlot(booking.scheduledStart) ?? '—' },
                ...(payBasis
                  ? [
                      {
                        label: 'Pricing',
                        value: (
                          <>
                            {payBasis.label}
                            <span className="block text-xs text-ink-3">{payBasis.detail}</span>
                          </>
                        ),
                      },
                    ]
                  : []),
              ]}
            />
            {(booking.problemSummary || booking.intakeOptions.length > 0) && (
              <div className="mt-4 border-t border-line pt-4">
                <p className="text-xs text-ink-4">Customer&apos;s description</p>
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

          {kase.inspections.length > 0 && (
            <CaseCard title="Inspection notes">
              <InspectionList inspections={kase.inspections} />
            </CaseCard>
          )}
          {kase.quotes.length > 0 && (
            <CaseCard title={kase.quotes.length > 1 ? 'Quotes' : 'Quote'}>
              <div className="space-y-3">
                {kase.quotes.map((quote) => (
                  <QuoteSummary key={quote.id} quote={quote} role="professional" jobState={job.state} />
                ))}
              </div>
            </CaseCard>
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
