# Founder feedback implementation (FEAZY)

Branch: `audit/preproduction-remediation`. Status as of 2026-11-02. `pnpm tsc --noEmit` clean, `pnpm test` 552 passed. Not yet browser-verified; nothing deployed.

## Tracker

| # | Feedback item | Existing implementation | Chosen solution | Implementation | Verification | Outstanding business decision |
|---|---|---|---|---|---|---|
| 1 | Rename FEASY to FEAZY | "Feasy/Fixify" in ~100 files of UI text, metadata, emails | Visible-text rename; wording centralised in `src/lib/brand.ts`. Technical identifiers left alone (see below) | Done (text) | tsc + unit tests pass; no visual check | Logo wordmark SVG and OG image PNG need a design update; `package.json` name left as-is |
| 2 | Tagline + free inspection | Hero: "done properly and written down"; inspection fees ₹349–800 are charged by `create_booking` | Hero "Home repairs, made easy." plus trust subline. Free inspection is copy-only behind `NEXT_PUBLIC_FREE_INSPECTION` (default off) | Done | tsc/tests | **Is inspection free? For which services, and who bears the cost?** Turning the flag on without changing fees would make the site promise something billing contradicts |
| 3 | 4-step journey instead of payment focus | FACTS/STEPS emphasised UPI payment | Choose service / Get it inspected / Clear quotation / Work done (payment last). Facts strip is now trust-led | Done | tsc/tests | None |
| 4 | More service categories | 8 active categories in DB; homepage hardcoded 4 | Homepage and hero chips now read active categories from the DB, so adding a category in the catalogue shows up with no code change | Done (mechanism) | tsc/tests | The reference website for the "12 categories" was not provided. Which 12, and do pros exist for them? Categories without pros would take bookings that cannot be matched |
| 5 | Sign-in messaging | "Welcome back." / "Professional sign in." | Customer "Your home, in good hands."; professional "Your skills. More opportunities." (in `TAGLINES`) | Done | tsc/tests | Final copy approval |
| 6 | Dashboard: Book a Service instead of "Needs your action" | Booking grid in the sidebar; actions first | Book a service is now the first, full-width section; actions kept as "Pending actions" below (hiding them would strand quote approvals) | Done | tsc/tests; needs visual check | None |
| 7 | Material selection | `materials` table has no price; `service_materials.is_customer_selectable` exists | MVP: optional free-text "materials requested" sent with the problem summary; never priced, never part of the quote | Done (MVP) | tsc/tests | Who supplies and prices materials? Needs a priced catalogue before structured selection (draft migration only, not applied) |

## Intentionally not renamed
`feasy-*` cookie/localStorage keys, `/brand/feasy-logo.svg` path, `fixify_*` WhatsApp template names, SMS sender ID "FEASY" (DLT-registered), existing email addresses and hosts, `package.json` name. Renaming these would log users out or break approved templates.

## Fixed along the way
`bookingHref` pointed at `/customer?service=...#intake`, which does not exist; it now goes to `/customer/bookings/new?category=<id>` (via sign-in for visitors).

## Domain readiness (feazy.in) — owner actions, none performed
1. GoDaddy: add the DNS records Vercel shows for apex (A) and `www` (CNAME); keep old domain redirecting.
2. Vercel: add `feazy.in` and `www.feazy.in` to the project; set primary and redirect the other.
3. Env: update the site URL variable(s) in Vercel (see `.env.example`).
4. Supabase Auth: set Site URL and add `https://feazy.in/**` to redirect URLs (email confirm, reset password, Google OAuth).
5. Google OAuth client: add the new origin and callback.
6. Razorpay: add the domain to webhook/allowed origins if restricted.
7. Email: SPF/DKIM/DMARC for the sending domain; switch `noreply@` and `support@` to feazy.in when mailboxes exist.
8. Update sitemap/robots/canonical URLs once the domain is live.
9. Rollback: keep the previous domain attached until verified; revert Supabase redirect URLs if auth fails.

## Open decisions for the founder
Final tagline and sign-in copy; free-inspection policy; the 12-category list and pro coverage; materials supply and pricing; logo/OG assets.
