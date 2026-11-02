import { Metadata } from 'next';

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://fixify.vercel.app";

export const metadata: Metadata = {
  title: 'Privacy Policy | Feazy',
  description: 'How Feazy collects, uses, and protects your data',
  openGraph: {
    title: 'Privacy Policy | Feazy',
    description: 'Feazy Privacy Policy',
    url: `${siteUrl}/privacy`,
    type: 'website',
    images: [{ url: "/og-image-1200x630.png", width: 1200, height: 630, alt: "Privacy" }],
  },
  twitter: {
    card: "summary_large_image",
    title: 'Privacy Policy | Feazy',
    description: 'Feazy Privacy Policy',
    images: ["/og-image-1200x630.png"],
  },
  alternates: {
    canonical: `${siteUrl}/privacy`,
  },
};

const LAST_UPDATED = 'October 4, 2026';

export default function PrivacyPage() {
  return (
    <div className="bg-porcelain">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20">
        {/* Header */}
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-3 mb-3">Legal</p>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-ink mb-3">Privacy Policy</h1>
          <p className="text-ink-3">Last updated: {LAST_UPDATED}</p>
        </div>

        {/* Provisional Notice */}
        <div className="bg-ochre-soft border border-ochre/30 rounded-xl p-4 mb-10">
          <p className="text-sm text-ink-2">
            <strong>This policy is provisional</strong> and marked for legal review. 
            It will be reviewed and updated by a qualified legal professional before production deployment.
            This policy is provisional and compliant with current regulatory requirements pending formal DPDP Act review.
          </p>
        </div>

        {/* Content */}
        <div className="max-w-none space-y-8 text-[15px] leading-7 [&_p]:mb-3 [&_ul]:ml-1 [&_a]:text-teal [&_a]:underline [&_a:hover]:text-teal-deep">
          {/* Section 1 */}
          <section>
            <h2 className="text-xl font-semibold tracking-tight text-ink mb-3 pt-6 border-t border-line">1. Introduction</h2>
            <p className="text-ink-3">
              Feazy ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, 
              use, disclose, and otherwise process personal data in connection with the Feazy marketplace platform.
            </p>
          </section>

          {/* Section 2 */}
          <section>
            <h2 className="text-xl font-semibold tracking-tight text-ink mb-3 pt-6 border-t border-line">2. Data We Collect</h2>
            
            <h3 className="text-xl font-semibold text-ink mb-2">2.1 Account Information</h3>
            <p className="text-ink-3">
              When you create a Feazy account, we collect:
            </p>
            <ul className="list-disc list-inside text-ink-3 space-y-2">
              <li>Full name</li>
              <li>Email address</li>
              <li>Phone number</li>
              <li>Password (encrypted/hashed)</li>
              <li>Account type (customer or professional)</li>
            </ul>

            <h3 className="text-xl font-semibold text-ink mb-2 mt-4">2.2 Service Request Data</h3>
            <p className="text-ink-3">
              When you submit a service request, we collect:
            </p>
            <ul className="list-disc list-inside text-ink-3 space-y-2">
              <li>Service category and description</li>
              <li>Photos or attachments</li>
              <li>Property address and location</li>
              <li>Preferred scheduling dates/times</li>
              <li>Access notes and hazard disclosures</li>
            </ul>

            <h3 className="text-xl font-semibold text-ink mb-2 mt-4">2.3 Professional Verification Data</h3>
            <p className="text-ink-3">
              When professionals submit verification documents, we collect:
            </p>
            <ul className="list-disc list-inside text-ink-3 space-y-2">
              <li>Government-issued ID (document only, not stored as plaintext)</li>
              <li>Service category credentials</li>
              <li>Years of experience</li>
              <li>Service areas and specializations</li>
            </ul>

            <h3 className="text-xl font-semibold text-ink mb-2 mt-4">2.4 Transaction Data</h3>
            <p className="text-ink-3">
              We collect data about transactions:
            </p>
            <ul className="list-disc list-inside text-ink-3 space-y-2">
              <li>Quotes provided and approved</li>
              <li>Job status and completion dates</li>
              <li>Payment status and amounts (NOT raw payment card data)</li>
              <li>Payment provider reference IDs</li>
              <li>Refund requests and outcomes</li>
            </ul>
          </section>

          {/* Section 3 */}
          <section>
            <h2 className="text-xl font-semibold tracking-tight text-ink mb-3 pt-6 border-t border-line">3. How We Use Your Data</h2>
            <p className="text-ink-3">We use collected data to:</p>
            <ul className="list-disc list-inside text-ink-3 space-y-2">
              <li>Facilitate marketplace transactions between customers and professionals</li>
              <li>Verify professional credentials and qualifications</li>
              <li>Process payments via our payment provider (Razorpay)</li>
              <li>Send service-related communications (job status, quotes, payment confirmations)</li>
              <li>Provide customer support and resolve disputes</li>
              <li>Comply with legal and regulatory obligations</li>
              <li>Detect and prevent fraud or abuse</li>
              <li>Improve platform functionality and user experience</li>
            </ul>
          </section>

          {/* Section 4 */}
          <section>
            <h2 className="text-xl font-semibold tracking-tight text-ink mb-3 pt-6 border-t border-line">4. Data Access and Visibility</h2>
            <p className="text-ink-3"><strong>Customers can see:</strong></p>
            <ul className="list-disc list-inside text-ink-3 space-y-2">
              <li>Their own profile, addresses, and service requests</li>
              <li>Quotes and job details</li>
              <li>Professional names, ratings, and verified status (public information)</li>
              <li>Payment history and invoices</li>
            </ul>

            <p className="text-ink-3 mt-4"><strong>Professionals can see:</strong></p>
            <ul className="list-disc list-inside text-ink-3 space-y-2">
              <li>Their own profile and verification status</li>
              <li>Assigned jobs, quotes provided, and earnings</li>
              <li>Customer names, addresses, and service details for their jobs</li>
              <li>Payment and payout history</li>
            </ul>

            <p className="text-ink-3 mt-4"><strong>Feazy admins can see:</strong></p>
            <ul className="list-disc list-inside text-ink-3 space-y-2">
              <li>Operational and audit data (with proper access controls)</li>
              <li>Verification submissions and audit trails</li>
              <li>Transaction and payment data for operational needs</li>
            </ul>
          </section>

          {/* Section 5 */}
          <section>
            <h2 className="text-xl font-semibold tracking-tight text-ink mb-3 pt-6 border-t border-line">5. Cookies and Session Tracking</h2>
            <p className="text-ink-3">
              Feazy uses the following cookies and session technologies:
            </p>
            <ul className="list-disc list-inside text-ink-3 space-y-2">
              <li><code>sb-access-token</code> — Supabase authentication session (expires per session)</li>
              <li><code>sb-refresh-token</code> — Supabase token refresh (persistent)</li>
              <li><code>feasy-session-id</code> — Application session identifier</li>
              <li><code>feasy-session-metadata</code> — Session metadata</li>
              <li><code>feasy-csrf-token</code> — CSRF protection token</li>
            </ul>
            <p className="text-ink-3 mt-4">
              <strong>Feazy does NOT use:</strong> advertising cookies, marketing pixels, behavioral tracking, 
              or third-party analytics services.
            </p>
          </section>

          {/* Section 6 */}
          <section>
            <h2 className="text-xl font-semibold tracking-tight text-ink mb-3 pt-6 border-t border-line">6. Data Retention</h2>
            <p className="text-ink-3">
              We retain your data as follows:
            </p>
            <ul className="list-disc list-inside text-ink-3 space-y-2">
              <li><strong>Active account data:</strong> Retained while your account is active</li>
              <li><strong>Job and payment records:</strong> Retained for 7 years (provisional, based on regulatory requirements)</li>
              <li><strong>Verification documents:</strong> Retained only as necessary for verification purposes</li>
              <li><strong>Rejected verification documents:</strong> Deleted 30 days after rejection</li>
              <li><strong>Audit logs:</strong> Retained for minimum 2 years</li>
              <li><strong>Deleted account data:</strong> Permanently deleted after account closure (with limited exceptions for legal compliance)</li>
            </ul>
          </section>

          {/* Section 7 */}
          <section>
            <h2 className="text-xl font-semibold tracking-tight text-ink mb-3 pt-6 border-t border-line">7. Your Privacy Rights</h2>
            <p className="text-ink-3">You have the right to:</p>
            <ul className="list-disc list-inside text-ink-3 space-y-2">
              <li>Access your personal data held by Feazy</li>
              <li>Request correction of inaccurate data</li>
              <li>Request deletion of your data (where legally permissible)</li>
              <li>Request restriction of processing</li>
              <li>File a complaint with applicable regulatory authorities</li>
            </ul>
            <p className="text-ink-3 mt-4">
              To exercise these rights, contact us at{' '}
              <a href="mailto:privacy@feasy.com" className="text-teal underline">
                privacy@feasy.com
              </a>
            </p>
          </section>

          {/* Section 8 */}
          <section>
            <h2 className="text-xl font-semibold tracking-tight text-ink mb-3 pt-6 border-t border-line">8. Legal Basis for Processing</h2>
            <p className="text-ink-3 text-amber-900 bg-amber-50 p-3 rounded border border-amber-200 text-sm">
              <strong>[PROVISIONAL — Pending Legal Review]</strong> Detailed legal basis to be confirmed pending DPDP Act review.
            </p>
            <p className="text-ink-3">
              Processing is conducted in compliance with applicable Indian data protection regulations 
              and is subject to formal legal review.
            </p>
          </section>

          {/* Section 9 */}
          <section>
            <h2 className="text-xl font-semibold tracking-tight text-ink mb-3 pt-6 border-t border-line">9. Data Security</h2>
            <p className="text-ink-3">
              We implement technical and organizational measures to protect your data from unauthorized access, 
              alteration, disclosure, or destruction. However, no transmission over the internet is completely secure. 
              You are responsible for maintaining the confidentiality of your account credentials.
            </p>
          </section>

          {/* Section 10 */}
          <section>
            <h2 className="text-xl font-semibold tracking-tight text-ink mb-3 pt-6 border-t border-line">10. Contact Us</h2>
            <p className="text-ink-3">
              For privacy inquiries or to exercise your rights, contact:
            </p>
            <p className="text-ink-3 font-semibold">
              Privacy Team<br />
              Email:{' '}
              <a href="mailto:privacy@feasy.com" className="text-teal underline">
                privacy@feasy.com
              </a>
            </p>
          </section>

          {/* Section 11 */}
          <section>
            <h2 className="text-xl font-semibold tracking-tight text-ink mb-3 pt-6 border-t border-line">11. Legal Review and Feedback</h2>
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
              Subject line: "Privacy Policy Review — [Your Concern]"
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
