-- Rollback for 20261102_120_materials_and_categories. Drops customer preferences and inspector
-- confirmations. The four draft categories are removed only if no service uses them.
DROP FUNCTION IF EXISTS public.admin_set_material_services(uuid, uuid[]);
DROP FUNCTION IF EXISTS public.admin_upsert_material(uuid, text, text, text, text, boolean);
DROP FUNCTION IF EXISTS public.admin_set_category_availability(uuid, text);
DROP FUNCTION IF EXISTS public.get_visit_materials(uuid);
DROP FUNCTION IF EXISTS public.get_booking_materials(uuid);
DROP FUNCTION IF EXISTS public._booking_materials_json(uuid, boolean);
DROP FUNCTION IF EXISTS public.create_booking_with_materials(uuid, uuid, timestamptz, text, jsonb, uuid[]);
DROP FUNCTION IF EXISTS public.inspector_confirm_materials(uuid, jsonb);
DROP FUNCTION IF EXISTS public.set_booking_material_preferences(uuid, uuid[]);
DROP FUNCTION IF EXISTS public.admin_set_material_price(uuid, numeric, text);
DROP TABLE IF EXISTS public.inspection_visit_materials;
DROP TABLE IF EXISTS public.booking_material_preferences;
ALTER TABLE public.materials DROP COLUMN IF EXISTS price_unit, DROP COLUMN IF EXISTS indicative_price;
DELETE FROM public.service_categories c
 WHERE c.slug IN ('pest-control', 'waterproofing', 'tiling-masonry', 'cctv-security')
   AND c.availability = 'coming_soon'
   AND NOT EXISTS (SELECT 1 FROM public.services s WHERE s.category_id = c.id);
