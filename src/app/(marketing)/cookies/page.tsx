import { Metadata } from 'next';

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://feazy.in";

export const metadata: Metadata = {
  title: 'Cookie Policy | Feazy',
  description: 'Feazy cookie policy and session tracking',
  openGraph: {
    title: 'Cookie Policy | Feazy',
    description: 'Feazy Cookie Policy',
    url: `${siteUrl}/cookies`,
    type: 'website',
    images: [{ url: "/og-image-1200x630.png", width: 1200, height: 630, alt: "Cookies" }],
  },
  twitter: {
    card: "summary_large_image",
    title: 'Cookie Policy | Feazy',
    description: 'Feazy Cookie Policy',
    images: ["/og-image-1200x630.png"],
  },
  alternates: {
    canonical: `${siteUrl}/cookies`,
  },
};

const LAST_UPDATED = 'October 4, 2026';

export default function CookiePage() {
  return (
    <div className="bg-porcelain">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20">
        {/* Header */}
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-3 mb-3">Legal</p>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-ink mb-3">Cookie Policy</h1>
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
            <h2 className="text-xl font-semibold tracking-tight text-ink mb-3 pt-6 border-t border-line">1. Overview</h2>
            <p className="text-ink-3">
              Feazy uses cookies and similar tracking technologies to provide essential functionality, 
              maintain secure sessions, and protect against fraud. This policy describes how we use these technologies.
            </p>
          </section>

          {/* Section 2 */}
          <section>
            <h2 className="text-xl font-semibold tracking-tight text-ink mb-3 pt-6 border-t border-line">2. What Are Cookies?</h2>
            <p className="text-ink-3">
              Cookies are small text files stored on your device that help websites recognize you when you return. 
              They are essential for modern web applications to maintain session state and security.
            </p>
          </section>

          {/* Section 3 */}
          <section>
            <h2 className="text-xl font-semibold tracking-tight text-ink mb-3 pt-6 border-t border-line">3. Cookies Used by Feazy</h2>
            <p className="text-ink-3">
              Feazy uses the following cookies and session technologies:
            </p>

            <div className="space-y-4">
              {/* Cookie 1 */}
              <div className="border border-line/20 rounded-lg p-4">
                <h3 className="font-semibold text-ink mb-2">sb-access-token</h3>
                <div className="text-sm text-ink-3 space-y-2">
                  <p><strong>Purpose:</strong> Supabase authentication session token</p>
                  <p><strong>Type:</strong> Essential (authentication)</p>
                  <p><strong>Duration:</strong> Session (expires when you close your browser)</p>
                  <p><strong>Description:</strong> Maintains your authenticated session with Feazy. Required to keep you logged in.</p>
                </div>
              </div>

              {/* Cookie 2 */}
              <div className="border border-line/20 rounded-lg p-4">
                <h3 className="font-semibold text-ink mb-2">sb-refresh-token</h3>
                <div className="text-sm text-ink-3 space-y-2">
                  <p><strong>Purpose:</strong> Supabase authentication refresh token</p>
                  <p><strong>Type:</strong> Essential (authentication)</p>
                  <p><strong>Duration:</strong> Persistent (expires after 30 days of inactivity)</p>
                  <p><strong>Description:</strong> Allows Feazy to refresh your session automatically without requiring re-authentication.</p>
                </div>
              </div>

              {/* Cookie 3 */}
              <div className="border border-line/20 rounded-lg p-4">
                <h3 className="font-semibold text-ink mb-2">feasy-session-id</h3>
                <div className="text-sm text-ink-3 space-y-2">
                  <p><strong>Purpose:</strong> Application session identifier</p>
                  <p><strong>Type:</strong> Essential (session management)</p>
                  <p><strong>Duration:</strong> Session (expires when you close your browser)</p>
                  <p><strong>Description:</strong> Identifies your current session within the Feazy application.</p>
                </div>
              </div>

              {/* Cookie 4 */}
              <div className="border border-line/20 rounded-lg p-4">
                <h3 className="font-semibold text-ink mb-2">feasy-session-metadata</h3>
                <div className="text-sm text-ink-3 space-y-2">
                  <p><strong>Purpose:</strong> Session metadata storage</p>
                  <p><strong>Type:</strong> Essential (session management)</p>
                  <p><strong>Duration:</strong> Session (expires when you close your browser)</p>
                  <p><strong>Description:</strong> Stores metadata about your current session (e.g., user role, preferences).</p>
                </div>
              </div>

              {/* Cookie 5 */}
              <div className="border border-line/20 rounded-lg p-4">
                <h3 className="font-semibold text-ink mb-2">feasy-csrf-token</h3>
                <div className="text-sm text-ink-3 space-y-2">
                  <p><strong>Purpose:</strong> CSRF (Cross-Site Request Forgery) protection</p>
                  <p><strong>Type:</strong> Essential (security)</p>
                  <p><strong>Duration:</strong> Session (expires when you close your browser)</p>
                  <p><strong>Description:</strong> Prevents unauthorized actions by validating that requests originate from Feazy, not malicious third-party sites.</p>
                </div>
              </div>
            </div>
          </section>

          {/* Section 4 */}
          <section>
            <h2 className="text-xl font-semibold tracking-tight text-ink mb-3 pt-6 border-t border-line">4. What We Don't Use</h2>
            <p className="text-ink-3">
              <strong>Feazy does NOT use:</strong>
            </p>
            <ul className="list-disc list-inside text-ink-3 space-y-2">
              <li>Advertising cookies or marketing pixels</li>
              <li>Behavioral tracking for profiling</li>
              <li>Google Analytics or similar third-party analytics</li>
              <li>Meta Pixel, TikTok Pixel, or other social media tracking</li>
              <li>Retargeting or remarketing technologies</li>
            </ul>
          </section>

          {/* Section 5 */}
          <section>
            <h2 className="text-xl font-semibold tracking-tight text-ink mb-3 pt-6 border-t border-line">5. Managing Your Cookies</h2>
            <p className="text-ink-3">
              Most modern browsers allow you to control cookies through your browser settings. You can:
            </p>
            <ul className="list-disc list-inside text-ink-3 space-y-2">
              <li>View cookies stored on your device</li>
              <li>Delete cookies individually or clear all cookies</li>
              <li>Block cookies from specific sites</li>
              <li>Set your browser to prompt before accepting cookies</li>
            </ul>
            <p className="text-ink-3 mt-4 text-amber-900 bg-amber-50 p-3 rounded border border-amber-200 text-sm">
              <strong>Note:</strong> Blocking essential cookies may prevent Feazy from functioning properly. 
              We recommend allowing essential cookies for authentication and security.
            </p>
          </section>

          {/* Section 6 */}
          <section>
            <h2 className="text-xl font-semibold tracking-tight text-ink mb-3 pt-6 border-t border-line">6. Browser Settings</h2>
            <p className="text-ink-3">
              To manage cookies in popular browsers:
            </p>
            <ul className="list-disc list-inside text-ink-3 space-y-2">
              <li><strong>Chrome:</strong> Settings → Privacy and security → Cookies and other site data</li>
              <li><strong>Firefox:</strong> Options → Privacy & Security → Cookies and Site Data</li>
              <li><strong>Safari:</strong> Preferences → Privacy → Manage Website Data</li>
              <li><strong>Edge:</strong> Settings → Privacy, search, and services → Cookies and other site permissions</li>
            </ul>
          </section>

          {/* Section 7 */}
          <section>
            <h2 className="text-xl font-semibold tracking-tight text-ink mb-3 pt-6 border-t border-line">7. Third-Party Services</h2>
            <p className="text-ink-3">
              Feazy integrates with the following third-party services that may use cookies:
            </p>
            <ul className="list-disc list-inside text-ink-3 space-y-2">
              <li><strong>Supabase:</strong> Authentication and database service. See <a href="https://supabase.com/privacy" className="text-teal underline">Supabase Privacy Policy</a></li>
              <li><strong>Razorpay:</strong> Payment processing. See <a href="https://razorpay.com/privacy/" className="text-teal underline">Razorpay Privacy Policy</a></li>
            </ul>
            <p className="text-ink-3 mt-4">
              These services may collect additional data according to their own privacy policies.
            </p>
          </section>

          {/* Section 8 */}
          <section>
            <h2 className="text-xl font-semibold tracking-tight text-ink mb-3 pt-6 border-t border-line">8. Do Not Track</h2>
            <p className="text-ink-3">
              Some browsers include a "Do Not Track" (DNT) feature. Feazy respects DNT signals and does not use behavioral tracking or profiling cookies.
            </p>
          </section>

          {/* Section 9 */}
          <section>
            <h2 className="text-xl font-semibold tracking-tight text-ink mb-3 pt-6 border-t border-line">9. Changes to This Policy</h2>
            <p className="text-ink-3">
              Feazy may update this cookie policy from time to time. The most current version will be posted to this page.
            </p>
          </section>

          {/* Section 10 */}
          <section>
            <h2 className="text-xl font-semibold tracking-tight text-ink mb-3 pt-6 border-t border-line">10. Contact Us</h2>
            <p className="text-ink-3">
              If you have questions about this cookie policy, contact us at{' '}
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
              Subject line: "Cookie Policy Review — [Your Concern]"
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
