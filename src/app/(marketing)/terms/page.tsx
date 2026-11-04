import Link from 'next/link';
import { Metadata } from 'next';

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://feazy.in";

export const metadata: Metadata = {
  title: 'Terms of Service | Feazy',
  description: 'Feazy marketplace terms of service for customers and service professionals',
  openGraph: {
    title: 'Terms of Service | Feazy',
    description: 'Feazy marketplace terms of service',
    url: `${siteUrl}/terms`,
    type: 'website',
    images: [{ url: "/og-image-1200x630.png", width: 1200, height: 630, alt: "Terms" }],
  },
  twitter: {
    card: "summary_large_image",
    title: 'Terms of Service | Feazy',
    description: 'Feazy marketplace terms of service',
    images: ["/og-image-1200x630.png"],
  },
  alternates: {
    canonical: `${siteUrl}/terms`,
  },
};

const LAST_UPDATED = 'October 4, 2026';

export default function TermsPage() {
  return (
    <div className="bg-porcelain">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20">
        {/* Header */}
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-3 mb-3">Legal</p>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-ink mb-3">Terms of Service</h1>
          <p className="text-ink-3">Last updated: {LAST_UPDATED}</p>
        </div>

        {/* Provisional Notice */}
        <div className="bg-ochre-soft border border-ochre/30 rounded-xl p-4 mb-10">
          <p className="text-sm text-ink-2">
            <strong>This policy is provisional</strong> and marked for legal review. 
            It will be reviewed and updated by a qualified legal professional before production deployment.
          </p>
        </div>

        {/* Content */}
        <div className="max-w-none space-y-8 text-[15px] leading-7 [&_p]:mb-3 [&_ul]:ml-1 [&_a]:text-teal [&_a]:underline [&_a:hover]:text-teal-deep">
          {/* Section 1 */}
          <section>
            <h2 className="text-xl font-semibold tracking-tight text-ink mb-3 pt-6 border-t border-line">1. Feazy's Role as a Marketplace</h2>
            <p className="text-ink-3">
              Feazy is a digital marketplace platform that connects customers with independent service professionals. 
              Feazy does not directly perform services, provide labor, or employ service professionals. 
              Instead, Feazy facilitates transactions between customers and professionals who operate as independent contractors.
            </p>
            <p className="text-ink-3">
              When you use Feazy, you are entering into agreements directly with service professionals, not with Feazy.
            </p>
          </section>

          {/* Section 2 */}
          <section>
            <h2 className="text-xl font-semibold tracking-tight text-ink mb-3 pt-6 border-t border-line">2. Customer Responsibilities</h2>
            <p className="text-ink-3">As a customer using Feazy, you agree to:</p>
            <ul className="list-disc list-inside text-ink-3 space-y-2">
              <li>Provide accurate, complete, and truthful information in service requests</li>
              <li>Describe services needed with sufficient detail for professionals to provide accurate quotes</li>
              <li>Disclose any hazards, obstacles, or property access limitations</li>
              <li>Grant professionals safe and reasonable access to your property</li>
              <li>Provide accurate scheduling and location information</li>
              <li>Comply with all applicable laws and regulations</li>
              <li>Not engage professionals through channels outside of Feazy to avoid platform protections</li>
            </ul>
          </section>

          {/* Section 3 */}
          <section>
            <h2 className="text-xl font-semibold tracking-tight text-ink mb-3 pt-6 border-t border-line">3. Professional Responsibilities</h2>
            <p className="text-ink-3">Service professionals using Feazy agree to:</p>
            <ul className="list-disc list-inside text-ink-3 space-y-2">
              <li>Provide truthful information about qualifications, licenses, and experience</li>
              <li>Perform services in a professional and workmanlike manner</li>
              <li>Comply with all applicable federal, state, and local laws</li>
              <li>Obtain all necessary licenses and insurance required for their trade</li>
              <li>Treat customer property with respect and care</li>
              <li>Provide transparent pricing and deliver quoted work as agreed</li>
            </ul>
          </section>

          {/* Section 4 */}
          <section>
            <h2 className="text-xl font-semibold tracking-tight text-ink mb-3 pt-6 border-t border-line">4. Service Lifecycle</h2>
            <p className="text-ink-3">Typical service requests follow this process:</p>
            <ol className="list-decimal list-inside text-ink-3 space-y-2">
              <li><strong>Request:</strong> Customer submits a service request with details and photos</li>
              <li><strong>Quote:</strong> Professional provides an estimate for the work</li>
              <li><strong>Approval:</strong> Customer reviews and approves the quote</li>
              <li><strong>Acceptance:</strong> Professional accepts the job</li>
              <li><strong>Execution:</strong> Professional completes the work at the scheduled time</li>
              <li><strong>Completion:</strong> Customer confirms work is complete and processes payment</li>
            </ol>
          </section>

          {/* Section 5 */}
          <section>
            <h2 className="text-xl font-semibold tracking-tight text-ink mb-3 pt-6 border-t border-line">5. Cancellation and Refunds</h2>
            <p className="text-ink-3">
              Our refund policy is detailed in the <Link href="/refund-policy" className="text-teal underline">Refund Policy</Link>. 
              Briefly:
            </p>
            <ul className="list-disc list-inside text-ink-3 space-y-2">
              <li>Cancel before professional acceptance: 100% refund</li>
              <li>Cancel after acceptance, before work starts: 100% refund</li>
              <li>Work already in progress: case-by-case review for refunds</li>
            </ul>
          </section>

          {/* Section 6 */}
          <section>
            <h2 className="text-xl font-semibold tracking-tight text-ink mb-3 pt-6 border-t border-line">6. Liability and Warranties</h2>
            <p className="text-ink-3 text-amber-900 bg-amber-50 p-3 rounded border border-amber-200 text-sm">
              <strong>[PROVISIONAL — Pending Legal Review]</strong> This section requires review by a qualified legal professional.
            </p>
            <p className="text-ink-3">
              Feazy facilitates marketplace interactions but does not directly perform services. 
              Responsibility for the quality, workmanship, and outcomes of services rests solely with the service professional. 
              Customers should verify professional credentials and qualifications before engaging services.
            </p>
          </section>

          {/* Section 7 */}
          <section>
            <h2 className="text-xl font-semibold tracking-tight text-ink mb-3 pt-6 border-t border-line">7. Governing Law</h2>
            <p className="text-ink-3 text-amber-900 bg-amber-50 p-3 rounded border border-amber-200 text-sm mb-3">
              <strong>[PROVISIONAL — Pending Legal Review]</strong> Jurisdiction to be confirmed based on company registration.
            </p>
            <p className="text-ink-3">
              These terms are governed by the laws of <strong>India</strong>, without regard to conflicts of law principles.
            </p>
          </section>

          {/* Section 8 */}
          <section>
            <h2 className="text-xl font-semibold tracking-tight text-ink mb-3 pt-6 border-t border-line">8. Dispute Resolution</h2>
            <p className="text-ink-3 text-amber-900 bg-amber-50 p-3 rounded border border-amber-200 text-sm">
              <strong>[PROVISIONAL — Pending Legal Review]</strong> Detailed dispute resolution procedures to be added.
            </p>
            <p className="text-ink-3">
              If a dispute arises between a customer and professional, Feazy may assist with mediation. 
              Unresolved disputes may be pursued through applicable legal channels.
            </p>
          </section>

          {/* Section 9 */}
          <section>
            <h2 className="text-xl font-semibold tracking-tight text-ink mb-3 pt-6 border-t border-line">9. Professional Verification</h2>
            <p className="text-ink-3">
              Feazy maintains a verification program for service professionals. Verification is not a guarantee of competence 
              but indicates that professionals have submitted identity documentation and background information. 
              Customers should still verify credentials and qualifications independently.
            </p>
          </section>

          {/* Section 10 */}
          <section>
            <h2 className="text-xl font-semibold tracking-tight text-ink mb-3 pt-6 border-t border-line">10. Changes to These Terms</h2>
            <p className="text-ink-3">
              Feazy reserves the right to modify these terms at any time. Changes will be effective when posted. 
              Continued use of the platform after changes are posted constitutes acceptance of the new terms.
            </p>
          </section>

          {/* Contact */}
          <section className="border-t border-line pt-6 mt-8">
            <h2 className="text-xl font-semibold tracking-tight text-ink mb-3 pt-6 border-t border-line">Questions?</h2>
            <p className="text-ink-3">
              If you have questions about these terms, please contact us at{' '}
              <a href="mailto:support@feazy.com" className="text-teal underline">
                support@feazy.com
              </a>
            </p>
          </section>

          {/* Legal Review */}
          <section className="border-t border-line pt-6 mt-8">
            <h2 className="text-xl font-semibold tracking-tight text-ink mb-3 pt-6 border-t border-line">Legal Review and Feedback</h2>
            <p className="text-ink-3">
              These terms are provisional and will be formally reviewed by legal counsel before production deployment. 
              If you have feedback regarding these terms or believe there are errors or omissions, please contact:
            </p>
            <p className="text-ink-3 font-semibold mt-3">
              Legal Review Team<br />
              Email:{' '}
              <a href="mailto:legal@feazy.com" className="text-teal underline">
                legal@feazy.com
              </a>
            </p>
            <p className="text-ink-3 mt-3 text-sm text-ink-3/80">
              Subject line: "Terms of Service Review — [Your Concern]"
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
