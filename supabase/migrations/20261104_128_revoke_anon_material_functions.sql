-- Forward-only follow-up to 127. Both functions were created without an explicit revoke, so PUBLIC (including anon) could execute them.
-- Both reject unauthenticated or non-admin callers internally; this removes the anon path entirely.
REVOKE EXECUTE ON FUNCTION public.admin_set_material_price(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_material_price(uuid, numeric, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.set_booking_material_preferences(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_booking_material_preferences(uuid, jsonb) TO authenticated, service_role;
