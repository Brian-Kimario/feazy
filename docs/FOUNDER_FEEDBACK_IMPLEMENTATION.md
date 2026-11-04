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

## Price source of truth (verified locally)
- The price card no longer reads `NEXT_PUBLIC_FREE_INSPECTION` when the database answers. `get_booking_free_inspection()` (migration 119, section 5b) returns the same `free_inspection_enabled` switch that `create_booking` charges by. The wizard shows that value.
- `NEXT_PUBLIC_FREE_INSPECTION` is now only the fallback when the database cannot answer (migration 119 not applied). Before 119 is applied, the page shows the visit fee, which matches `create_booking` in that state.
- A booking submit sends the value the customer saw. `createBookingAction` refuses with `price_changed` if the database now differs, and the wizard reloads the price. Nothing is charged at a price the customer did not see.
- Local evidence: replay of all migrations with the existing free-inspection booking check (flag off: 700 stored as `inspection`; flag on: `quote_after_inspection` with no amount, no visit row). RPC check: returns `f` and `t` as the switch changes, and `anon` is refused.
- Not verified: browser/Playwright run of the wizard, and production. Migration 119 is still not applied there.

## Verified in this pass (2026-11-04, `feat/founder-revisions`, local only)
Earlier sections describe earlier rounds. Where they conflict with this section, this section is newer. Full pricing detail is in [REPAIR_PRICING_WORKFLOW.md](REPAIR_PRICING_WORKFLOW.md).

**Fixed in this pass**
- Rate-limit error code changed from `P0004` to `P0007`. `P0004` is PostgreSQL's `assert_failure`, which `WHEN OTHERS` handlers do not catch, so a caller that catches all errors would let the limit error escape.
- Migration `20261102_121_profiles_email_column.sql` adds `profiles.email` (`IF NOT EXISTS`). The `handle_new_user` trigger writes that column (migrations 005 and 101), but no migration in the repo created it, so every sign-up failed on a fresh database. Production already has the column (checked read-only), so the migration is a no-op there.
- `src/lib/supabase/database.types.ts` regenerated from the local database. The previous file was hand-maintained and did not include `create_booking_with_materials` (its `p_materials` argument) or `set_booking_material_preferences`, so `tsc` failed on the new wrapper call in `actions.ts`. The previous copy is kept outside the repo.
- Advisory lock in `create_booking` moved before the retry lookup, so a parallel retry cannot race the first insert.

**Verified**
| Check | Result |
|---|---|
| Replay of all migrations on a fresh local database | Completed. 3 files flagged (`20261030_011`, `_016`, `_019`), all `unschedule` output, not failures. |
| `supabase/tests/booking_pricing_guard.sql` | `all checks passed`, transaction rolled back |
| `pnpm tsc --noEmit` | Exit 0 |
| `pnpm test` | 46 files passed, 1 skipped; 593 tests passed, 16 skipped, 15 todo; exit 0 |
| `pnpm build` | Exit 0 |
| Assignment retry | `_assign_booking_internal` returns NULL for a job that already has a professional, so a retried booking is not offered twice (read from code) |
| Admin override | `admin_assign_professional` is audited in `job_events` and `matching_decisions`, requires a reason of 10+ characters and an idempotency key. Not written to `audit_logs`. Read from code, not executed. |

**Not verified in this pass**
- Playwright and browser checks, including the customer sign-in heading. The copy change (`brand.ts`, comma) is in the code, not seen in a browser.
- The "Round 4" section above records 8 Playwright journeys passing and a quotation approval verified over PostgREST. Those results were not reproduced in this pass and are not counted as current results. The Round 4 checklist in `docs/FEAZY_DEPLOYMENT_CHECKLIST.md` is the place to see what was run then.
- No-show handling for inspections, and the customer-facing quotation flow end to end.

**Still missing (not built)**
- Customer service-area coverage check.
- Inspector capacity and calendar clash checks.
- Owner actions: apply 119, 120 and 121 to production only with approval and a backup; revoke the leaked legacy service-role key in the Supabase dashboard and verify it with a request. Changing the Vercel environment variable does not revoke the old key.
