# Feazy website revisions: traceability matrix

Source: `Feazy_Website_Revision_Requirements.pdf` (11 pages, five reference screenshots).

Release labels (only these three are used):
- **COMPLETE**: implemented and checked for this release.
- **DEFERRED — OWNER INPUT**: not implemented here because a founder decision or a missing input is needed. Not a launch blocker on its own.
- **BLOCKED — LAUNCH CRITICAL**: must be resolved before unrestricted public launch.

Base: `origin/main` at `7af79e2` (PR #11 merged). The production deployment of `7af79e2` has not been verified against Vercel metadata yet; the last recorded production deployment is `dpl_FieFRiGyLJSMEPRhj4MGSeKFLiWi` at `ae8539b`.

## Pricing model (approved direction)

- **Fixed-price services**: admin-set price and scope; the amount is server-authoritative; the customer sees and accepts the price before booking. Extra work needs separate approval. Booking flow exists (`BookingWizard.tsx`, `pricing_model = 'fixed'`). Not re-run end to end in this release.
- **Inspection-based services**: visit terms are shown first; the professional submits an itemised quote; customer approval is required before repair.
- Free inspection means ₹0 and is not advertised while the operational workflow is off. A paid ₹700 diagnosis must be a separately labelled, explicitly accepted option.
- Materials are indicative unless explicitly included in a fixed package.
- Live payments and payouts stay disabled until the provider and business onboarding are ready.

## Requirement status

| Req | Requirement | Label | Evidence / note |
|---|---|---|---|
| 01 | Homepage headline and supporting line use the approved wording | COMPLETE | `src/lib/brand.ts` `TAGLINES`. Checked at 375px. |
| 01 | Customer sign-in tagline and "Get Started" | COMPLETE | `/auth/login`. |
| 01 | Professional sign-in tagline and "Join as a Professional" | COMPLETE (code) | `TAGLINES.professionalSignIn`. Visual check of the professional page not done. |
| 01 | Visible "Sign in" in header, usable on mobile | COMPLETE | Checked at 375px. |
| 01 | After sign-in, customer or professional choice | COMPLETE | `/auth/login` role switch. |
| 01 | "Feazy" spelling in visible UI and titles | COMPLETE | Technical identifiers keep their legacy names on purpose. |
| 02 | Five-step "How It Works" with approved titles | DEFERRED — OWNER INPUT | Five steps present. Step 3 reads "Inspection & professional assignment". Founder to confirm the final wording. |
| 02 | Describe the problem before the visit (photo optional) | COMPLETE (code) | Problem-summary step in the wizard. Photo upload not re-verified. |
| 02b | Visible "Free Inspection" option | DEFERRED — OWNER INPUT | Not advertised. `NEXT_PUBLIC_FREE_INSPECTION` is off and the inspection workflow is not confirmed in production. Founder go-ahead plus a readiness check needed. |
| 02c | "₹700 Visit & diagnosis" matches final policy | DEFERRED — OWNER INPUT | Shown as a paid visit with explainer text, never as free. Final policy is a founder decision. |
| 03 | Add every service from the HTML services file | DEFERRED — OWNER INPUT | The HTML services file is not in the repo or Downloads. Not invented. |
| 03 | Add "Bike & Car Service" category | DEFERRED — OWNER INPUT | Seeded as an inactive draft (migration 120), hidden from customers. Activate only once professional coverage is approved. |
| 03 | Distinct icon per category | COMPLETE (code) | Icon map in `src/app/customer/page.tsx` and `BookingWizard.tsx`. Not checked against live rows. |
| 03 | AI-suggested, category-specific example issues | DEFERRED — OWNER INPUT | Not started. Needs the catalogue first. |
| 03 | Category names, icons and examples consistent across pages | COMPLETE (code) | Homepage chips and wizard share category data. Live consistency not re-checked. |
| 04 | Guided material selection replaces free text | COMPLETE | Checkbox list with indicative prices and a quantity slider. Free text is optional. |
| 04 | Indicative cost beside each option | COMPLETE | "About ₹X per unit" or "Price confirmed after inspection". |
| 04 | Slider for quantity / price range | COMPLETE | Per-material range input (1–10). |
| 04 | Costs labelled as estimates; quote approved by customer | COMPLETE | "Estimate: about ₹X" with disclaimer. Nothing is charged for choosing. |
| 05 | Remove "Pending actions" from customer dashboard | COMPLETE | Live page not re-checked. |
| 05 | Booking records and payment functions unaffected | COMPLETE | No data or RPC changes in this release. |
| 06 | Footer email support@feazy.com | COMPLETE | Mailbox delivery is an owner check. |
| 06 | Other footer and contact spellings | COMPLETE | No other "Feasy" in `src/`. |
| 07 | Login IDs and account identifiers use "Feazy" | DEFERRED — OWNER INPUT | Renaming identifiers would break existing accounts. Display labels already say "Feazy". |
| 08 | Homepage on desktop and mobile | COMPLETE (mobile) | 375px checked. Desktop not re-checked. |
| 08 | Customer and professional sign-in paths | COMPLETE (customer) | Professional path not checked in a browser. |
| 08 | Fixed-price booking, end to end | BLOCKED — LAUNCH CRITICAL | Not re-verified in this release. Needs a staging run to confirm the accepted amount. |
| 08 | Inspection flow to quote approval, staging | COMPLETE (staging) | Previously verified on isolated staging. Production not exercised. |
| 08 | Professional completion with finish code; invalid code rejected | BLOCKED — LAUNCH CRITICAL | Staging run not closed in this release. |
| 08 | Links, buttons, spacing and navigation | COMPLETE (partial audit) | Footer "About Feazy" links to a real page. Full link audit not done. |
| New | "About Feazy" page | COMPLETE | `src/app/(marketing)/about/page.tsx`. |
| P0005 | One open inspection per customer, service and property | COMPLETE (staging) / BLOCKED — LAUNCH CRITICAL (production) | Fix on `fix/p0005-open-inspection-guard`, PR #12. Staging verified. Production apply needs owner approval of the exact SQL. Staging ledger version differs from the repo filename; reconcile before release. |
| Release | Production deployment of the revisions | COMPLETE | GitHub Production deployment `7620127908` is for `7af79e2`, status success. feazy.in returns 200 and serves the About page and approved tagline. |

## Verification run on this branch

- `pnpm tsc --noEmit`: exit 0
- `pnpm vitest run`: passed
- ESLint, `pnpm build` and the SQL regression set: see the release report for this release.

## Pending decisions for the owner

1. Fixed-price catalogue: prices and scope per service.
2. Free inspection: go or no-go, and the operational readiness of inspection RPCs in production.
3. ₹700 diagnosis policy.
4. Bike & Car coverage and the full services HTML file.
5. Step 3 wording on the homepage.
6. Approval of the exact P0005 production SQL.
7. Account identifier naming.
