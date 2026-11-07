# Feazy website revisions: traceability matrix

Source: `Feazy_Website_Revision_Requirements.pdf` (11 pages, five reference screenshots).
Status key: **DONE** (implemented and checked), **PARTIAL** (some of it is in place), **BLOCKED** (needs an input or decision from the founder, or a production readiness step).

Base: `origin/main` at `ae8539b` (production deployment `dpl_FieFRiGyLJSMEPRhj4MGSeKFLiWi`, READY, PROMOTED).

| Req | Requirement | Status | Evidence / note |
|---|---|---|---|
| 01 | Homepage headline and supporting line use the exact approved wording | DONE | `src/lib/brand.ts` `TAGLINES`. Checked at 375px: "Where Better Living Begins." and supporting line rendered verbatim. |
| 01 | Customer sign-in tagline and "Get Started" | DONE | `/auth/login` shows "Exceptional Care, Right at Your Doorstep." and "Get Started". |
| 01 | Professional sign-in tagline and "Join as a Professional" | DONE (code) | `TAGLINES.professionalSignIn`, `professionalPrimaryAction`. Visual check of the professional page not done. |
| 01 | Visible "Sign in" in header, usable on mobile | DONE | Header "Sign in" visible at 375px on the homepage. |
| 01 | After Sign in, user picks Customer or Professional | DONE | `/auth/login` has "I need a service" / "I'm a professional" switch. |
| 01 | "Feazy" spelling in visible UI and titles | DONE | No "Feasy" remains in `src/`. Technical identifiers (cookie names, DB objects, template names) keep their legacy spelling on purpose. |
| 02 | Five-step "How It Works" with the approved titles | PARTIAL | Five steps present (`src/components/home/sections.tsx`). Step 3 reads "Inspection & professional assignment", not "Free inspection", because the free-inspection flag is off (see row 02b). |
| 02 | Describe the problem before the visit (photo optional) | PARTIAL | Problem-summary step exists in the booking wizard. Photo upload not re-verified in this pass. |
| 02b | Visible "Free Inspection" option on homepage and booking | BLOCKED | Not advertised: `NEXT_PUBLIC_FREE_INSPECTION` is off and the inspection RPCs are not confirmed in production. Promising it now would breach the release rule. Needs the founder's go-ahead plus a production readiness check. |
| 02c | Booking summary "₹700 Visit & diagnosis" matches the final policy | PARTIAL | Shown as a paid visit with explainer text (`BookingWizard.tsx` `priceInfo`), so it is not presented as free anywhere. Final policy needs a founder decision. Customer approval step for the paid visit not verified. |
| 03 | Add every service from the HTML services file | BLOCKED | The HTML services file is not in the repo or Downloads. `Downloads/fixify (1).html` is an older FIXIFY-branded mock with different categories. Not used as the source of truth. |
| 03 | Add "Bike & Car Service" category | BLOCKED | Needs the catalogue and professional coverage before it can be bookable. |
| 03 | Distinct icon per category | PARTIAL | Icon map exists (`src/app/customer/page.tsx`, `BookingWizard.tsx`). Not checked against live category rows. |
| 03 | AI-suggested, category-specific example issues | BLOCKED | Not started. No AI generation exists in the repo. Static examples would also need the catalogue first. |
| 03 | Category names, icons and examples consistent across homepage, dashboard, booking | PARTIAL | Homepage chips and booking wizard share category data. Consistency not re-verified after the catalogue. |
| 04 | Replace the free-text "Other parts or brands" box with guided selection | DONE (code) | Checkbox list of example materials with indicative prices (pre-existing), now with a quantity slider. Free text is labelled "Something not listed above (optional)". |
| 04 | Indicative cost beside each option | DONE | `indicativePrice` shown as "About ₹X per unit", or "Price confirmed after inspection". |
| 04 | Slider for quantity/price range | DONE (code) | `input type="range"` per selected material (1–10, unit shown). Rough-budget slider already existed. |
| 04 | Costs labelled as estimates; final itemised quote approved by customer | DONE | "Estimate: about ₹X" line with disclaimer. Nothing is charged for choosing. |
| 04 | Authenticated, browser-level check of the wizard | PARTIAL | Typecheck, lint and unit tests pass. Not run in a browser with a signed-in customer and a seeded service. |
| 05 | Remove "Pending actions" from customer dashboard | DONE (code) | Dashboard sections are Book a service, Active, Upcoming, Recently finished, Your properties. Quote review stays on the booking cards. Live page not re-checked. |
| 05 | Booking records and quote/payment functions unaffected | DONE (code) | No data or RPC changes in this branch. |
| 06 | Footer email support@feazy.com | DONE (code) | `site-footer.tsx`. Mailbox is not verified; that is an owner check. |
| 06 | Correct other footer/contact spellings | DONE | No other "Feasy" in `src/`. |
| 07 | Login IDs and account identifiers use "Feazy" | BLOCKED | Renaming identifiers would break authentication or existing accounts, and the directive forbids identity renames. Display labels already say "Feazy". Needs a founder decision. |
| 08 | Homepage on desktop and mobile | PARTIAL | Mobile 375px checked: no horizontal overflow, taglines and sign-in visible. Desktop not re-checked. |
| 08 | Customer and professional sign-in paths | PARTIAL | Customer sign-in page and role switch checked. Professional path not checked in browser. |
| 08 | End-to-end: service select, problem, free inspection, assignment, quote approval, tracking | BLOCKED | No staging environment. Running this on production would need real bookings, which the directive forbids. |
| 08 | Links, buttons, spacing and navigation | PARTIAL | Footer "About Feazy" now links to a real page. Full link audit not done. |
| New | "About Feazy" page (directive) | DONE | `src/app/(marketing)/about/page.tsx`, linked from the footer. Rendered and checked at 375px. |

## Verification run on this branch

- `pnpm tsc --noEmit`: exit 0
- `pnpm exec eslint` on changed files: clean
- `pnpm vitest run`: 48 files passed, 1 skipped; 609 tests passed, 16 skipped, 15 todo
- `pnpm build`: exit 0. One pre-existing warning: `Can't resolve '@aws-sdk/client-sns'`. Not in changed files.
- Browser (dev server, 375px): `/` and `/auth/login` and `/about` render; no horizontal scroll.

## Not done, and why

- Services, Bike & Car, AI examples: waiting for the HTML services file.
- Free inspection: waiting for a production readiness check and the founder's go-ahead.
- Account identifiers: waiting for the founder's decision; renames are not made.
- Production smoke tests and deployment: not run. This branch is not merged.
