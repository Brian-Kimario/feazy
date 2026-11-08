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
| 08 | Fixed-price booking, end to end | COMPLETE (production, synthetic) | Synthetic customer booked Duct Cleaning on feazy.in; server-priced at ₹750.00 and shown identically at review and on the booking. See "Production E2E" below. |
| 08 | Inspection flow to quote approval, staging | COMPLETE (staging) | Previously verified on isolated staging. Production not exercised. |
| 08 | Professional completion with finish code; invalid code rejected | COMPLETE (production, synthetic) | Start code and finish code both verified by the synthetic pro. A wrong finish code was rejected ("4 tries left"); the valid code completed the job. See "Production E2E" below. |
| 08 | Links, buttons, spacing and navigation | COMPLETE (partial audit) | Footer "About Feazy" links to a real page. Full link audit not done. |
| New | "About Feazy" page | COMPLETE | `src/app/(marketing)/about/page.tsx`. |
| P0005 | One open inspection per customer, service and property | COMPLETE (staging) / BLOCKED — LAUNCH CRITICAL (production) | Fix on `fix/p0005-open-inspection-guard`, PR #12. Staging verified. Production apply needs owner approval of the exact SQL. Staging ledger version differs from the repo filename; reconcile before release. |
| Release | Production deployment of the revisions | COMPLETE | GitHub Production deployment `7625676387` is for `490f100` (main after PRs #10 and #15), status success as of 2026-11-07T19:05:17Z. Earlier deployment `7620127908` (`7af79e2`) also succeeded. feazy.in returns 200 and serves the About page and approved tagline. |

## Verification run on this branch

- `pnpm tsc --noEmit`: exit 0
- `pnpm vitest run`: passed
- ESLint, `pnpm build` and the SQL regression set: see the release report for this release.

## Production E2E (synthetic identities only, 2026-11-08)

Target: feazy.in (Supabase project `feazy`, `azmajqztvcuwajaaldqm`). Only the reserved `*.invalid` and `e2e.customer@example.com` identities listed in `public.test_identities` were used. No real customer, professional, payment or notification was involved.

| Step | Result | Evidence |
|---|---|---|
| Payment and DB isolation checked before writing data | PASS | Migration `20261107150340_test_isolation_guards_131` is live. Ranker, `create_pending_payment`, `job_payment_amount` and `transition_payment_status` all filter on `is_test`. |
| Synthetic property added via the app | PASS | "E2E Synthetic Home", Mysuru, owned by the synthetic customer. |
| Fixed-price booking (Duct Cleaning) | PASS | `bookings.is_test = true`. Price ₹750.00, fixed. |
| Assignment | PASS | Ranker assigned the job to synthetic pro `synthetic.pro.reject` (`5a100000-…0001`). Only test pros are eligible for test bookings. |
| Accept, On the way, Arrived, Start | PASS | Job states `accepted → on the way → arrived → in_progress`. Start code verified. |
| Invalid finish code | PASS (rejected) | `000000` returned "That code is not right. 4 tries left." |
| Valid finish code and completion | PASS | `finish_code_verified` then `completed`. |
| Customer history | PASS | Booking appears under History as Completed, with the price. The UI shows a "Pay" prompt. It was **not clicked**; no Razorpay order was created. |
| Admin audit / job events | PASS | `job_events`: `assigned`, `state_transition`, `code_issued`, `start_code_verified`, `code_attempt_failed`, `finish_code_verified`, `state_transition`. |
| Payments created | 0 | `payments` count for the synthetic booking is zero. |

Observations (not fixed in this release):

- `bookings.booking_status` stays `pending` after the job completes; the job state and the customer UI both show Completed. Check whether admin booking views read `booking_status` before treating this as a defect.
- The `assessing` drift is still open. Repo migration `125_assessing_state` is not in production's `schema_migrations` ledger, and production's `jobs` state constraint has no `assessing` value. Production is the source of truth; the migration was not applied and nothing was changed in production for it.
- Synthetic professionals were given disposable passwords through the Auth Admin API. Those passwords are not recorded here or in the repo.

## Pending decisions for the owner

1. Fixed-price catalogue: prices and scope per service.
2. Free inspection: go or no-go, and the operational readiness of inspection RPCs in production.
3. ₹700 diagnosis policy.
4. Bike & Car coverage and the full services HTML file.
5. Step 3 wording on the homepage.
6. Approval of the exact P0005 production SQL.
7. Account identifier naming.
8. Live payment activation (Razorpay). Stays disabled until the owner decides.
9. Reconcile the `assessing` migration (repo 125) with production before any release that depends on it.

## Functional defects (tracked; both fixed 2026-11-08)

| ID | Defect | Status | Evidence | Next action |
|---|---|---|---|---|
| DEF-01 | P0005: a new inspection booking can be refused after the previous inspection job was completed, because the guard reads only `bookings.booking_status`. | FIXED 2026-11-08. PR #12 merged (`28ff31c`). Migration 129 applied to production project `azmajqztvcuwajaaldqm` as ledger version `20261108085655`. | Production `create_booking` definition hash now equals the reviewed local definition (md5 `bfe31d47…`). Prior production definition was the migration 126 body (md5 `042d0162…`), kept as the rollback source. The regression test (`supabase/tests/p0005_open_inspection_guard.sql`) passed locally. No behavioural test was run in production, to avoid writing test bookings. | None open. |
| DEF-02 | Admin unmatched queue included bookings whose job is completed, closed or cancelled. The job lifecycle does not advance `bookings.booking_status`. | FIXED 2026-11-08. PR #19 merged (`35ff507`). `getUnmatchedBookings` applies the 200-row limit after the job-state rule, so finished bookings can no longer use up the slots. `bookings.booking_status` and the job state machine are unchanged. | Regression cases in `src/lib/shell/rules.test.ts` cover no job, assigned, completed, closed, cancelled and post-assignment states. Vitest, tsc and build passed. The customer booking tabs were already job-driven and needed no change. The three helpers in `src/lib/services/bookings.ts` are still unused and still read `booking_status`. | Owner may decide later whether to remove those unused helpers. |

Neither item blocks the founder-revision sprint's close. Both must stay visible until resolved.
