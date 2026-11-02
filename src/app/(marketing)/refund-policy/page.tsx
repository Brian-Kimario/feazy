import { Metadata } from 'next';

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://fixify.vercel.app";

export const metadata: Metadata = {
  title: 'Refund Policy | Feazy',
  description: 'Feazy refund and cancellation policy for customers and professionals',
  openGraph: {
    title: 'Refund Policy | Feazy',
    description: 'Feazy Refund and Cancellation Policy',
    url: `${siteUrl}/refund-policy`,
    type: 'website',
    images: [{ url: "/og-image-1200x630.png", width: 1200, height: 630, alt: "Refund Policy" }],
  },
  twitter: {
    card: "summary_large_image",
    title: 'Refund Policy | Feazy',
    description: 'Feazy Refund and Cancellation Policy',
    images: ["/og-image-1200x630.png"],
  },
  alternates: {
    canonical: `${siteUrl}/refund-policy`,
  },
};

const LAST_UPDATED = 'October 4, 2026';

export default function RefundPolicyPage() {
  return (
    <div className="bg-porcelain">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20">
        {/* Header */}
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-3 mb-3">Legal</p>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-ink mb-3">Refund and Cancellation Policy</h1>
          <p className="text-ink-3">Last updated: {LAST_UPDATED}</p>
        </div>

        {/* Provisional Notice */}
        <div className="bg-ochre-soft border border-ochre/30 rounded-xl p-4 mb-10">
          <p className="text-sm text-ink-2">
            <strong>This policy is provisional</strong> and marked for legal review. 
            It will be reviewed and updated by a qualified legal professional before production deployment.
            Some rules are marked provisional pending operational data.
          </p>
        </div>

        {/* Content */}
        <div className="max-w-none space-y-8 text-[15px] leading-7 [&_p]:mb-3 [&_ul]:ml-1 [&_a]:text-teal [&_a]:underline [&_a:hover]:text-teal-deep">
          {/* Section 1 */}
          <section>
            <h2 className="text-xl font-semibold tracking-tight text-ink mb-3 pt-6 border-t border-line">1. Overview</h2>
            <p className="text-ink-3">
              This refund policy outlines the terms under which customers and professionals can request cancellations 
              and refunds for services on the Feazy platform. Our goal is to be fair to all parties while protecting customers.
            </p>
          </section>

          {/* Section 2 */}
          <section>
            <h2 className="text-xl font-semibold tracking-tight text-ink mb-3 pt-6 border-t border-line">2. Customer Cancellation Before Professional Acceptance</h2>
            <p className="text-ink-3"><strong>Scenario:</strong> Customer submits request → professional has not yet accepted</p>
            <p className="text-ink-3"><strong>Refund:</strong> 100% of any payment made</p>
            <p className="text-ink-3"><strong>Processing time:</strong> Full refund to original payment method</p>
            <p className="text-ink-3">
              <strong>Rationale:</strong> Customer can cancel at any point before a professional commits to the job.
            </p>
          </section>

          {/* Section 3 */}
          <section>
            <h2 className="text-xl font-semibold tracking-tight text-ink mb-3 pt-6 border-t border-line">3. Customer Cancellation After Professional Acceptance, Before Work Starts</h2>
            <p className="text-ink-3"><strong>Scenario:</strong> Professional has accepted job → work has not yet begun</p>
            <p className="text-ink-3"><strong>Refund:</strong> 100% of payment</p>
            <p className="text-ink-3"><strong>Processing time:</strong> 5-7 business days</p>
            <p className="text-ink-3 text-amber-900 bg-amber-50 p-3 rounded border border-amber-200 text-sm">
              <strong>[PROVISIONAL]</strong> This 100% refund rule is provisional pending 3-6 months of operational data. 
              Once Feazy has sufficient data on professional cancellation patterns and customer behavior, 
              cancellation penalties may be introduced to protect professional earnings.
            </p>
          </section>

          {/* Section 4 */}
          <section>
            <h2 className="text-xl font-semibold tracking-tight text-ink mb-3 pt-6 border-t border-line">4. Professional Cancellation</h2>
            <p className="text-ink-3"><strong>Scenario:</strong> Professional accepts job then cancels before work starts</p>
            <p className="text-ink-3"><strong>Customer refund:</strong> 100% of payment</p>
            <p className="text-ink-3"><strong>Professional impact:</strong> Cancellation recorded in professional's history for tracking</p>
            <p className="text-ink-3">
              <strong>Rationale:</strong> Customer is fully protected. Professional cancellations are tracked 
              to identify patterns of unreliable behavior.
            </p>
          </section>

          {/* Section 5 */}
          <section>
            <h2 className="text-xl font-semibold tracking-tight text-ink mb-3 pt-6 border-t border-line">5. Professional No-Show</h2>
            <p className="text-ink-3"><strong>Scenario:</strong> Professional fails to arrive at scheduled time</p>
            <p className="text-ink-3"><strong>Customer refund:</strong> 100% of payment</p>
            <p className="text-ink-3"><strong>Professional impact:</strong> No-show recorded and may affect professional rating/availability</p>
            <p className="text-ink-3">
              <strong>Rationale:</strong> Customer is protected from wasted time and resources.
            </p>
          </section>

          {/* Section 6 */}
          <section>
            <h2 className="text-xl font-semibold tracking-tight text-ink mb-3 pt-6 border-t border-line">6. Work Already Started — Case-by-Case Review</h2>
            <p className="text-ink-3">
              <strong>Scenario:</strong> Customer requests refund or cancellation after work has begun
            </p>
            <p className="text-ink-3">
              <strong>Refund:</strong> Subject to case-by-case review considering:
            </p>
            <ul className="list-disc list-inside text-ink-3 space-y-2">
              <li>Percentage of work completed</li>
              <li>Quality of work performed</li>
              <li>Reason for cancellation (customer satisfaction issue, change of plans, etc.)</li>
              <li>Photographic/documentary evidence</li>
              <li>Professional's account history and reliability</li>
              <li>Actual costs incurred by professional</li>
            </ul>
            <p className="text-ink-3 mt-4">
              <strong>Processing:</strong> Feazy may grant full refund, partial refund, or no refund. 
              In disputes, we will attempt mediation before determining outcome.
            </p>
          </section>

          {/* Section 7 */}
          <section>
            <h2 className="text-xl font-semibold tracking-tight text-ink mb-3 pt-6 border-t border-line">7. Refund Processing Timeline</h2>
            <ul className="list-disc list-inside text-ink-3 space-y-2">
              <li><strong>Request submitted:</strong> Refund request logged in system</li>
              <li><strong>Pending phase (0-2 days):</strong> Feazy reviews request and gathers evidence</li>
              <li><strong>Processing phase (2-7 business days):</strong> Refund is processed by payment provider</li>
              <li><strong>Completed:</strong> Refund reflected in your original payment method</li>
            </ul>
            <p className="text-ink-3 mt-4">
              <strong>Note:</strong> Processing time varies by payment provider and financial institutions. 
              Razorpay typically processes refunds within 5-7 business days.
            </p>
          </section>

          {/* Section 8 */}
          <section>
            <h2 className="text-xl font-semibold tracking-tight text-ink mb-3 pt-6 border-t border-line">8. Mock Payment Refunds</h2>
            <p className="text-ink-3">
              On development environments using Mock Payments: refunds are simulated and no actual money is transferred.
            </p>
          </section>

          {/* Section 9 */}
          <section>
            <h2 className="text-xl font-semibold tracking-tight text-ink mb-3 pt-6 border-t border-line">9. Refund Status Tracking</h2>
            <p className="text-ink-3">
              Refund status progresses through the following states:
            </p>
            <ul className="list-disc list-inside text-ink-3 space-y-2">
              <li><strong>Requested:</strong> Customer has submitted refund request</li>
              <li><strong>Pending:</strong> Feazy is reviewing the request</li>
              <li><strong>Processing:</strong> Refund has been approved and sent to payment provider</li>
              <li><strong>Completed:</strong> Refund has been successfully processed</li>
              <li><strong>Failed:</strong> Refund could not be processed (rare; customer will be contacted)</li>
            </ul>
            <p className="text-ink-3 mt-4">
              Customers can track refund status in their account dashboard.
            </p>
          </section>

          {/* Section 10 */}
          <section>
            <h2 className="text-xl font-semibold tracking-tight text-ink mb-3 pt-6 border-t border-line">10. Future Policy Changes</h2>
            <p className="text-ink-3 text-amber-900 bg-amber-50 p-3 rounded border border-amber-200 text-sm">
              <strong>[PROVISIONAL]</strong> After 3-6 months of operational experience, Feazy may establish:
            </p>
            <ul className="list-disc list-inside text-ink-3 space-y-2">
              <li>Cancellation fees or penalties for customer cancellations after a certain time</li>
              <li>Partial refunds based on work completed</li>
              <li>Professional cancellation penalties or restrictions</li>
              <li>Revised no-show policies</li>
            </ul>
            <p className="text-ink-3 mt-4">
              <strong>Notice:</strong> Any policy changes will be announced in advance. 
              Existing bookings will be grandfathered under the refund policy in effect when the booking was made.
            </p>
          </section>

          {/* Section 11 */}
          <section>
            <h2 className="text-xl font-semibold tracking-tight text-ink mb-3 pt-6 border-t border-line">11. Disputes and Appeals</h2>
            <p className="text-ink-3">
              If you disagree with a refund decision:
            </p>
            <ol className="list-decimal list-inside text-ink-3 space-y-2">
              <li>Contact Feazy support within 14 days of the decision</li>
              <li>Provide additional evidence or explanation</li>
              <li>Feazy will review your appeal</li>
              <li>We will communicate the final decision within 7 days</li>
            </ol>
          </section>

          {/* Section 12 */}
          <section>
            <h2 className="text-xl font-semibold tracking-tight text-ink mb-3 pt-6 border-t border-line">12. Contact Support</h2>
            <p className="text-ink-3">
              To request a refund or discuss a refund-related issue:
            </p>
            <p className="text-ink-3">
              Email:{' '}
              <a href="mailto:support@feasy.com" className="text-teal underline">
                support@feasy.com
              </a>
            </p>
            <p className="text-ink-3 mt-4">
              Include your job/booking reference, payment details, and reason for the refund request.
            </p>
          </section>

          {/* Section 13 */}
          <section>
            <h2 className="text-xl font-semibold tracking-tight text-ink mb-3 pt-6 border-t border-line">13. Legal Review and Feedback</h2>
            <p className="text-ink-3">
              This policy is provisional and will be formally reviewed by legal counsel before production deployment. 
              If you have feedback regarding this policy or believe there are errors or omissions, please contact:
            </p>
            <p className="text-ink-3 font-semibold mt-3">
              Legal Review Team<br />
              Email:{' '}
              <a href="mailto:legal@feasy.com" className="text-teal underline">
                legal@feasy.com
              </a>
            </p>
            <p className="text-ink-3 mt-3 text-sm text-ink-3/80">
              Subject line: "Refund Policy Review — [Your Concern]"
            </p>
          </section>
        </div>

        {/* Footer Notice */}
        <div className="mt-12 pt-8 border-t border-line/20 text-sm text-ink-3 text-center">
          <p>This page was last updated on {LAST_UPDATED}</p>
          <p className="text-xs text-ink-3/60 mt-2">
            Status: Provisional and marked for legal review
          </p>
        </div>
      </div>
    </div>
  );
}
