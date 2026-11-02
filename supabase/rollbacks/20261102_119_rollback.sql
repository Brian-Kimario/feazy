-- Rollback for 20261102_119_inspection_foundation. Safe only while no inspection visit rows matter:
-- it drops them. Set both switches to 0 first (the migration ships with them at 0) and restore the
-- 20261030_009 definitions of create_booking and _assign_booking_internal from that file.
UPDATE public.matching_config SET value = 0 WHERE key IN ('free_inspection_enabled', 'inspection_gate_enabled');
DROP TRIGGER IF EXISTS bookings_close_visit ON public.bookings;
DROP FUNCTION IF EXISTS public._close_visit_on_booking_cancel();
DROP FUNCTION IF EXISTS public.admin_inspection_metrics(timestamptz);
DROP FUNCTION IF EXISTS public.admin_record_inspection_cost(uuid, numeric, text);
DROP FUNCTION IF EXISTS public.mark_inspection_missed(uuid, text);
DROP FUNCTION IF EXISTS public.inspector_complete_visit(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.get_inspection_visit_site(uuid);
DROP FUNCTION IF EXISTS public.admin_assign_inspector(uuid, uuid, timestamptz);
DROP FUNCTION IF EXISTS public.admin_set_inspector(uuid, text, text, boolean);
-- Re-run the bodies of create_booking and _assign_booking_internal from 20261030_009 here, then:
DROP FUNCTION IF EXISTS public._booking_awaits_inspection(uuid);
DROP TABLE IF EXISTS public.inspection_visit_costs;
DROP TABLE IF EXISTS public.inspection_visits;
DROP TABLE IF EXISTS public.inspectors;
ALTER TABLE public.service_categories DROP COLUMN IF EXISTS availability;
DELETE FROM public.matching_config WHERE key IN ('free_inspection_enabled', 'inspection_gate_enabled');
-- _require_admin() is left in place: later migrations may use it.
