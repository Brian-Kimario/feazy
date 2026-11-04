# Repair pricing workflow

Status: written from code on `feat/founder-revisions`. Verified against the migrations and actions named below. Items marked **open** are not yet verified or not built.

## 1. What the customer pays at booking

`create_booking` (migration `20261102_119_inspection_foundation.sql`) sets the amount from the service row only:

| Pricing model | Amount charged at booking |
|---|---|
| `fixed` | `services.base_price` |
| `inspection` | `services.inspection_fee`, **or ₹0** when `matching_config.free_inspection_enabled = 1` |

Option price modifiers are not applied at booking (noted in `src/app/customer/bookings/new/actions.ts`).

The public price card reads the same switch through `get_booking_free_inspection()`, so the displayed price and the charge come from one decision. `src/app/customer/bookings/new/page.tsx` loads it with `getFreeInspectionStatus`.

## 2. Guard against a changed price

The wizard sends `expectedFreeInspection` with the booking. If the database now disagrees, `createBookingAction` returns `price_changed` and the customer sees the new price before confirming again. If the status read fails, it returns `failed`, so no booking is created on an unconfirmed price.

Known limit: the check is a read before the insert. A switch flipped between the read and the insert is not caught. The window is small, but it is not closed.

## 3. Materials and budget are preferences, not prices

- Material quantities (1–10 per material), a rough budget and a free-text note travel with the problem summary as text only (`src/lib/booking/booking-preferences.ts`).
- `create_booking` and `create_booking_with_materials` do not charge for them. The budget line says it is not a price.
- Materials without an indicative price show "Price confirmed after inspection".
- Because they are text, the professional reads them but nothing stores them as structured data. Structured storage is **open**.

## 4. After booking: the quotation

The price for repair work is set by the professional's quotation, which the customer approves before work starts. Job state changes go through `transition_job_state()`, never a direct update (project rule 3).

**Open:** the quotation and approval steps have not been traced end to end in this pass. Before release, confirm in the job-state migrations which state the quotation is approved in, and that work cannot start before that approval.

## 5. Founder decisions still needed

- Whether inspection stays free by default in production. The switch is off in production until migration 119 is applied and `NEXT_PUBLIC_FREE_INSPECTION` is set in the same release.
- Whether budget and quantity should ever affect the quotation. The current design says no.
