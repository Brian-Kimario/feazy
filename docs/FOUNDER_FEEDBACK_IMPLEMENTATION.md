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

---

# Round 2: founder decisions (free inspection, inspectors, materials, 12 categories)

**Status: built dark, nothing applied.** Migrations `20261102_119` (inspection foundation) and `20261102_120` (materials and categories) are committed but NOT applied to any database. Both were tested only on a throwaway local Postgres. `NEXT_PUBLIC_FREE_INSPECTION` stays `false` until 119 is applied and the fee/gate flags are switched on. Nothing was pushed, deployed, or changed in DNS or external communications.

## Assessment (the 8 questions)
1. **Booking architecture vs the inspection model.** Partly. Pricing models `inspection` and `quote_after_inspection` and the quote/approval flow existed; there was no visit, no inspector and no free-inspection path. 119 adds `inspection_visits` beside bookings, without touching job state or payments.
2. **Simplest safe inspector role.** An existing `professional`-role account with an active `inspectors` row and no professional profile, using `/inspector`. No new auth role, no RLS rewrite; every write goes through SECURITY DEFINER RPCs that check the assigned, active inspector.
3. **Workflow changes.** Fixed-price services get no visit (they have no unknown to inspect). A missed visit is a recorded outcome, not a silent reschedule. Inspection is gated so a professional is only assigned after the visit result.
4. **Risky founder assumptions.** Free inspection for every service is an uncapped cost (travel and time) before any revenue; an in-house team limits it to the cities you can staff. Hence costs are recorded by an admin (never estimated) and the admin queue shows the totals. Advertising 12 categories without verified professionals would take bookings that cannot be fulfilled.
5. **12 categories to skills (proposal).** Existing 8 + Pest Control, Waterproofing, Tiling & Masonry, CCTV & Security (drafted as `coming_soon`, pending your confirmation). Suggested 9 skill types: plumbing, electrical, carpentry, painting, appliance/HVAC repair, cleaning, civil (tiling, masonry, waterproofing), pest control, security/low-voltage. Activate a category (`availability` → `bookable` or `manual_assignment`) only when it has at least one verified professional.
6. **MVP materials and pricing.** Customer picks materials/brands (preference only) → inspector confirms → quotation fixes the price → customer approves. `materials.indicative_price` is an admin-set guide; null shows "confirmed in your quotation". No inventory, nothing auto-charged.
7. **Branding.** Keep the logo; only the name changed to Feazy. The taglines in the PDF are centralised in `src/lib/brand.ts`; the final choice is yours.
8. **Sequence.** Brand → inspection foundation → inspector workspace → materials → categories/coverage → verification. Done in that order.

## Built in round 2
- 119: availability on categories, inspectors, visits, admin-only visit costs, assignment gate, RPCs. Inspector workspace `/inspector`, admin `/admin/inspections`, customer inspection card.
- 120: material guide prices, `booking_material_preferences`, `inspection_visit_materials`, RPCs, four draft categories.
- Booking wizard: structured material selection (hidden until a service has customer-selectable materials), plus an "other parts or brands" note. Preferences are saved after the booking and never fail it.
- Homepage: "Coming soon" line for inactive categories; booking flow excludes them.
- Server actions and Zod schemas for inspector material confirmation and admin material pricing, with tests.

## Round 3: build completed (local only)
Founder defaults accepted: 12-category catalogue (4 new stay Coming Soon until coverage is verified), free inspection never weakened, FEAZY bears recorded actual costs, materials are preferences until an approved quotation.

- **Atomic booking + preferences:** `create_booking_with_materials` (120) saves the booking and its material preferences in one transaction; a bad material rolls the booking back. Without materials the app uses plain `create_booking`, so pre-120 databases keep working. Replace-all RPCs make retries idempotent.
- **Inspector:** `/inspector/visits/[id]` shows preferences, lets the assigned inspector confirm materials (quantity, who arranges, note) while the visit is open, then submit findings. Confirmed materials reach the customer and professional only after the visit completes. They inform the quotation; they never replace its approval.
- **Customer / professional:** `MaterialsPanel` shows preferences vs confirmed (with sourcing) and a "guide, not a price" note.
- **Admin:** `/admin/catalogue`: category availability, verified-professional count per category with a warning for bookable categories with none, material create/edit, guide prices, active flag, service links.
- **RPCs added to 120:** `admin_set_category_availability`, `admin_upsert_material`, `admin_set_material_services`, `get_booking_materials`, `get_visit_materials`, `create_booking_with_materials`; `inspector_confirm_materials` now takes items with quantity/sourcing/note. Rollback script drops all of them.

## Verification
- Vitest 564 passing; `pnpm tsc --noEmit` clean for `src`.
- Local throwaway Postgres (not Supabase): 119 journey (book, gate, assign, missed, complete, cost, metrics, no-repair path) and 120 materials journey: admin catalogue RPCs, customer blocked from admin RPCs, atomic booking, rollback on bad material, idempotent re-save, confirm/replace, invalid material and zero quantity refused, other inspector and unrelated customer denied, confirmed hidden until completion, confirm refused after completion, cancelled visit cannot complete, duplicate completion creates no second job.
- Browser: homepage (desktop + 375px, no horizontal overflow, new headline), customer sign-in copy, auth redirects for gated routes.
- **Round 4: authenticated verification done** on a disposable local Supabase stack (real Auth), see `docs/FEAZY_DEPLOYMENT_CHECKLIST.md`. 8 Playwright journeys pass; quotation approval verified over PostgREST with real JWTs. Fixed a mobile wizard overflow and added inspection findings to the professional job page.

## Migration readiness (119 then 120; 120 depends on 119)
- Order: 119 → 120. Both are additive; 120 only adds columns/tables/functions and four `coming_soon` categories.
- RLS: new tables have policies in the same migration; writes go through SECURITY DEFINER RPCs with role checks; internal helper revoked.
- Compatibility: app tolerates both unapplied (materials read as empty, plain `create_booking`, `availability` absent treated as bookable). Fee/gate flags stay off.
- Rollback: scripts in `supabase/rollbacks/`. After data exists, dropping tables loses inspections/materials; take a backup first.
- Coverage (read-only live check): verified professionals Electrical 2, Plumbing 1, every other category 0. Keep such categories Coming Soon or manual assignment before launch.
- No notifications are triggered by either migration.

## Remaining
- Production apply of 119 then 120 (owner approval needed), seed real materials and inspectors. Follow `docs/FEAZY_DEPLOYMENT_CHECKLIST.md`.
- Onboard verified professionals for categories with zero coverage.

## Open decisions
City limits for free inspection; whether fixed-price services skip inspection.
