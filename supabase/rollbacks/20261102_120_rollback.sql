-- Rollback for 20261102_120_materials_and_categories. Drops customer preferences and inspector
-- confirmations. The four draft categories are removed only if no service uses them.
DROP FUNCTION IF EXISTS public.inspector_confirm_materials(uuid, uuid[]);
DROP FUNCTION IF EXISTS public.set_booking_material_preferences(uuid, uuid[]);
DROP FUNCTION IF EXISTS public.admin_set_material_price(uuid, numeric, text);
DROP TABLE IF EXISTS public.inspection_visit_materials;
DROP TABLE IF EXISTS public.booking_material_preferences;
ALTER TABLE public.materials DROP COLUMN IF EXISTS price_unit, DROP COLUMN IF EXISTS indicative_price;
DELETE FROM public.service_categories c
 WHERE c.slug IN ('pest-control', 'waterproofing', 'tiling-masonry', 'cctv-security')
   AND c.availability = 'coming_soon'
   AND NOT EXISTS (SELECT 1 FROM public.services s WHERE s.category_id = c.id);
