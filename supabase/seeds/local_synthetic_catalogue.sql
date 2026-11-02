-- LOCAL / DISPOSABLE DATABASES ONLY. Synthetic catalogue and material data for development and
-- browser verification. Never run against the shared Supabase project: production already has its
-- own catalogue, and materials are added through /admin/catalogue.

INSERT INTO public.service_categories (name, slug, description, icon_key, sort_order, availability) VALUES
  ('Heating', 'heating', 'Geysers and water heaters', 'flame', 10, 'bookable'),
  ('Electrical', 'electrical', 'Wiring, switches and fittings', 'zap', 20, 'bookable'),
  ('Plumbing', 'plumbing', 'Leaks, taps and drains', 'droplet', 30, 'bookable'),
  ('AC & Cooling', 'ac-cooling', 'AC service and repair', 'wind', 40, 'bookable'),
  ('Appliance Repair', 'appliance-repair', 'Washing machines, fridges, ovens', 'wrench', 50, 'bookable'),
  ('Painting', 'painting', 'Interior and exterior painting', 'paintbrush', 60, 'bookable'),
  ('Carpentry & Furniture', 'carpentry', 'Doors, wardrobes and furniture', 'hammer', 70, 'bookable'),
  ('Cleaning', 'cleaning', 'Deep cleaning', 'sparkles', 75, 'bookable')
ON CONFLICT DO NOTHING;

INSERT INTO public.services (category_id, name, slug, description, pricing_model, base_price, inspection_fee, estimated_duration_minutes, requires_inspection)
SELECT c.id, s.name, s.slug, s.descr, s.model, s.price, s.fee, 60, s.model <> 'fixed'
FROM (VALUES
  ('plumbing', 'Leak repair', 'leak-repair', 'Find and fix a leak', 'inspection', 0, 499),
  ('plumbing', 'Tap replacement', 'tap-replacement', 'Replace a tap or mixer', 'quote_after_inspection', 0, 499),
  ('electrical', 'Switchboard repair', 'switchboard-repair', 'Repair or replace switches', 'inspection', 0, 499),
  ('electrical', 'Fan installation', 'fan-installation', 'Install a ceiling fan', 'fixed', 399, 0),
  ('heating', 'Geyser repair', 'geyser-repair', 'Diagnose and repair a geyser', 'inspection', 0, 499),
  ('ac-cooling', 'AC repair', 'ac-repair', 'Diagnose and repair an AC', 'inspection', 0, 499),
  ('appliance-repair', 'Washing machine repair', 'washing-machine-repair', 'Repair a washing machine', 'inspection', 0, 499),
  ('painting', 'Room painting', 'room-painting', 'Paint a room', 'quote_after_inspection', 0, 499),
  ('carpentry', 'Door repair', 'door-repair', 'Repair or adjust a door', 'inspection', 0, 499),
  ('cleaning', 'Bathroom deep clean', 'bathroom-deep-clean', 'Deep clean one bathroom', 'fixed', 799, 0)
) AS s(cat, name, slug, descr, model, price, fee)
JOIN public.service_categories c ON c.slug = s.cat
ON CONFLICT DO NOTHING;

INSERT INTO public.brands (name) VALUES ('Jaquar'), ('Cera'), ('Havells'), ('Anchor'), ('Asian Paints'), ('Dr. Fixit')
ON CONFLICT DO NOTHING;

WITH m(name, brand, spec, unit, price, punit) AS (VALUES
  ('Basin tap', 'Jaquar', 'Chrome, quarter turn', 'piece', 1450, 'piece'),
  ('Basin tap', 'Cera', 'Chrome, quarter turn', 'piece', 980, 'piece'),
  ('CPVC pipe 15mm', NULL, 'ISI marked', 'metre', 85, 'metre'),
  ('Waterproofing sealant', 'Dr. Fixit', 'Tube', 'tube', 320, 'tube'),
  ('Modular switch', 'Havells', '6A one way', 'piece', 120, 'piece'),
  ('Modular switch', 'Anchor', '6A one way', 'piece', 85, 'piece'),
  ('Interior emulsion', 'Asian Paints', '1 litre', 'litre', NULL, NULL)
), ins AS (
  INSERT INTO public.materials (name, brand_id, specification, unit, indicative_price, price_unit)
  SELECT m.name, b.id, m.spec, m.unit, m.price, m.punit FROM m LEFT JOIN public.brands b ON b.name = m.brand
  RETURNING id, name
)
INSERT INTO public.service_materials (service_id, material_id, is_customer_selectable, is_professional_selectable)
SELECT s.id, ins.id, true, true
FROM ins JOIN public.services s ON
     (ins.name IN ('Basin tap','CPVC pipe 15mm','Waterproofing sealant') AND s.slug IN ('leak-repair','tap-replacement'))
  OR (ins.name = 'Modular switch' AND s.slug = 'switchboard-repair')
  OR (ins.name = 'Interior emulsion' AND s.slug = 'room-painting')
ON CONFLICT DO NOTHING;
