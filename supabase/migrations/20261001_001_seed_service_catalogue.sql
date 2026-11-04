-- ============================================================================
-- MIGRATION: Seed Indian Home Services Catalogue
-- File: 20261001_001_seed_service_catalogue.sql
-- Created: 2026-10-01
--
-- Inserts realistic Indian home-services data:
--   • 6 categories
--   • 29 services (fixed / inspection / quote_after_inspection pricing)
--   • 42 service options with values and price modifiers
--   • 18 brands (Indian market: Havells, Asian Paints, Jaquar, etc.)
--   • 30 materials
--   • service_materials mapping
--
-- Idempotent: uses ON CONFLICT DO NOTHING on slug/name UNIQUE columns
-- ============================================================================

-- ============================================================================
-- 1. SERVICE CATEGORIES
-- ============================================================================

INSERT INTO public.service_categories
  (id, name, slug, description, icon_key, is_active, sort_order)
VALUES
  (
    '2ff5e494-758c-5d65-a9aa-3651b5e833bf',
    'Electrical',
    'electrical',
    'Wiring faults, sockets, switches, MCBs, fans, lights, and general electrical repairs for homes and apartments.',
    'lightbulb',
    true, 10
  ),
  (
    '0c07c6ff-9983-5ced-8ade-6babb5e75c5a',
    'Plumbing',
    'plumbing',
    'Leaks, blockages, tap repairs, pipe replacements, drainage issues, and water-pressure problems.',
    'wrench',
    true, 20
  ),
  (
    '17313040-177f-5c66-9ef8-f2369ea6dc1e',
    'AC & Cooling',
    'ac-cooling',
    'Air-conditioner servicing, gas refilling, installation, and cooling system repairs.',
    'wind',
    true, 30
  ),
  (
    '43fe32e8-c49e-53e6-9e6e-9c318bebf299',
    'Appliance Repair',
    'appliance-repair',
    'Washing machines, refrigerators, microwaves, geysers, and other household appliance repairs.',
    'cpu',
    true, 40
  ),
  (
    '9697176e-bf91-5005-a002-ae6126904482',
    'Painting',
    'painting',
    'Interior and exterior wall painting, waterproofing, texture finishes, and wood polish.',
    'paintbrush',
    true, 50
  ),
  (
    '31cec87c-c382-5c4f-a839-5165c1c991bb',
    'Carpentry & Furniture',
    'carpentry',
    'Door and window repairs, furniture assembly, cabinet installation, and wood polishing.',
    'hammer',
    true, 60
  )
ON CONFLICT (slug) DO NOTHING;


-- ============================================================================
-- 2. SERVICES
-- ============================================================================

-- ── ELECTRICAL ──────────────────────────────────────────────────────────────

INSERT INTO public.services
  (id, category_id, name, slug, description, pricing_model, base_price,
   inspection_fee, estimated_duration_minutes, requires_inspection, is_active)
VALUES
  (
    '523782c5-41cb-5a43-84f5-b0cc4fbf590c',
    '2ff5e494-758c-5d65-a9aa-3651b5e833bf',
    'Socket & Switch Repair',
    'socket-switch-repair',
    'Replacement or repair of faulty wall sockets, modular switches, or USB outlets.',
    'fixed', 349.00, NULL, 45, false, true
  ),
  (
    '8fb6aeee-2dc0-5e97-baee-8351178a50d2',
    '2ff5e494-758c-5d65-a9aa-3651b5e833bf',
    'Fan Installation & Repair',
    'fan-installation-repair',
    'Ceiling fan installation, speed-regulator replacement, blade balancing, or motor repair.',
    'fixed', 499.00, NULL, 60, false, true
  ),
  (
    '4b8ab8a4-3000-5062-813c-6d3ed947ca84',
    '2ff5e494-758c-5d65-a9aa-3651b5e833bf',
    'MCB / DB Box Fault',
    'mcb-db-box-fault',
    'Tripping MCBs, fuse replacement, earthing issues, or full DB box inspection and repair.',
    'inspection', NULL, 399.00, 60, true, true
  ),
  (
    '8ba9f936-e9fb-5611-959a-20967a6208e5',
    '2ff5e494-758c-5d65-a9aa-3651b5e833bf',
    'Light Fixture Installation',
    'light-fixture-installation',
    'Installing pendant lights, LED panels, batten lights, or spotlights.',
    'fixed', 449.00, NULL, 45, false, true
  ),
  (
    'aa3bd108-1511-59c0-9026-a11247889990',
    '2ff5e494-758c-5d65-a9aa-3651b5e833bf',
    'New Wiring / Re-wiring',
    'wiring-rewiring',
    'Complete room re-wiring, new circuit addition, or conduit wiring for new construction.',
    'quote_after_inspection', NULL, 599.00, 120, true, true
  ),

-- ── PLUMBING ─────────────────────────────────────────────────────────────────

  (
    '973851ef-ce45-53f1-b873-0140e97c62bf',
    '0c07c6ff-9983-5ced-8ade-6babb5e75c5a',
    'Tap / Faucet Repair',
    'tap-faucet-repair',
    'Dripping taps, broken handles, washer or cartridge replacement for kitchen and bathroom faucets.',
    'fixed', 299.00, NULL, 30, false, true
  ),
  (
    '141c9a5f-43f3-58a7-ae8c-c93efdcef0a1',
    '0c07c6ff-9983-5ced-8ade-6babb5e75c5a',
    'Drain & Pipe Blockage',
    'drain-pipe-blockage',
    'Kitchen sink, bathroom drain, floor trap, or toilet blockage cleared using jetting or rodding.',
    'fixed', 499.00, NULL, 60, false, true
  ),
  (
    '8a4ee2ca-86bd-547f-b42d-4cf22e082a56',
    '0c07c6ff-9983-5ced-8ade-6babb5e75c5a',
    'Flush Tank Repair',
    'flush-tank-repair',
    'Continuous running flush, broken flush valve, float ball, or overflow pipe replacement.',
    'fixed', 399.00, NULL, 45, false, true
  ),
  (
    '096d5f48-00e4-53c3-942c-467501b1a47e',
    '0c07c6ff-9983-5ced-8ade-6babb5e75c5a',
    'Water Pipe Leak Repair',
    'water-pipe-leak',
    'Visible or concealed pipe leaks, joint failures, and water hammer diagnosis.',
    'inspection', NULL, 349.00, 60, true, true
  ),
  (
    'aaf0fb13-600b-5b21-93ac-a3bc733c8aac',
    '0c07c6ff-9983-5ced-8ade-6babb5e75c5a',
    'Bathroom Fitting Installation',
    'bathroom-fitting-installation',
    'New tap, shower head, health faucet, towel rod, or soap dispenser installation.',
    'fixed', 599.00, NULL, 90, false, true
  ),

-- ── AC & COOLING ──────────────────────────────────────────────────────────────

  (
    '0aff49ac-c13f-51a8-861e-00b47ecd39e8',
    '17313040-177f-5c66-9ef8-f2369ea6dc1e',
    'AC Regular Servicing',
    'ac-regular-service',
    'Filter cleaning, coil wash, drain flush, and performance check for split or window ACs.',
    'fixed', 699.00, NULL, 75, false, true
  ),
  (
    '605458c4-822b-5ac0-9372-a180fac3b6e3',
    '17313040-177f-5c66-9ef8-f2369ea6dc1e',
    'AC Gas Refilling (R32 / R410A)',
    'ac-gas-refilling',
    'Refrigerant top-up or full recharge for split ACs not cooling adequately.',
    'fixed', 1499.00, NULL, 60, false, true
  ),
  (
    '6fd15fdb-bb6b-527a-9421-bfcbf6e7f6e6',
    '17313040-177f-5c66-9ef8-f2369ea6dc1e',
    'AC Installation (Split)',
    'ac-installation-split',
    'New split AC indoor + outdoor unit installation including piping, drilling, and electrical connections.',
    'fixed', 1999.00, NULL, 180, false, true
  ),
  (
    '1607bb33-7c6f-53e4-a931-2b3a2732fb9e',
    '17313040-177f-5c66-9ef8-f2369ea6dc1e',
    'AC Not Cooling — Diagnosis',
    'ac-not-cooling-diagnosis',
    'Full inspection for ACs that are running but not cooling. Gas leak, compressor, or PCB check.',
    'inspection', NULL, 499.00, 60, true, true
  ),
  (
    'b8a83184-3b9c-5b76-ab0c-85edfe873fe0',
    '17313040-177f-5c66-9ef8-f2369ea6dc1e',
    'AC Deep Cleaning (Jet Wash)',
    'ac-deep-cleaning',
    'High-pressure jet wash of indoor and outdoor units to remove dirt, mold, and bacteria.',
    'fixed', 999.00, NULL, 90, false, true
  ),

-- ── APPLIANCE REPAIR ─────────────────────────────────────────────────────────

  (
    'b435f05c-a3d1-57d2-9cfd-2df742053846',
    '43fe32e8-c49e-53e6-9e6e-9c318bebf299',
    'Washing Machine Repair',
    'washing-machine-repair',
    'Front-load or top-load washing machine — drum, motor, PCB, drain pump, or door seal issues.',
    'inspection', NULL, 399.00, 60, true, true
  ),
  (
    '0cea1798-8d44-599b-b15d-69fb678b72e9',
    '43fe32e8-c49e-53e6-9e6e-9c318bebf299',
    'Refrigerator Repair',
    'refrigerator-repair',
    'Cooling issues, compressor, thermostat, ice-maker, or frost-free heater faults.',
    'inspection', NULL, 399.00, 60, true, true
  ),
  (
    '1773b7a3-103d-5b73-9e04-604395092505',
    '43fe32e8-c49e-53e6-9e6e-9c318bebf299',
    'Geyser / Water Heater Repair',
    'geyser-water-heater-repair',
    'Electric or instant geyser — heating element, thermostat, pressure valve, or tank leak.',
    'fixed', 549.00, NULL, 60, false, true
  ),
  (
    'f035600d-8acc-5527-bd69-40f518a1aa31',
    '43fe32e8-c49e-53e6-9e6e-9c318bebf299',
    'Microwave Repair',
    'microwave-repair',
    'Microwave oven not heating, turntable, door switch, or magnetron issues.',
    'inspection', NULL, 349.00, 45, true, true
  ),
  (
    '641e0ccc-401e-5b14-96b7-563cfb43a222',
    '43fe32e8-c49e-53e6-9e6e-9c318bebf299',
    'Chimney / Exhaust Hood Servicing',
    'chimney-exhaust-servicing',
    'Deep cleaning of kitchen chimney filters, motor, and suction duct.',
    'fixed', 799.00, NULL, 90, false, true
  ),

-- ── PAINTING ──────────────────────────────────────────────────────────────────

  (
    '5e37b446-0432-5de7-8c2d-84852e62f085',
    '9697176e-bf91-5005-a002-ae6126904482',
    'Interior Wall Painting (Per Room)',
    'interior-wall-painting-room',
    'Full interior wall painting including putty, primer, and two coats of emulsion — quoted per room.',
    'quote_after_inspection', NULL, 699.00, 480, true, true
  ),
  (
    'ab7ed2de-3c0e-5f6e-b52d-b47b129cf69e',
    '9697176e-bf91-5005-a002-ae6126904482',
    'Exterior / Terrace Waterproofing',
    'exterior-waterproofing',
    'Terrace, parapet, or exterior wall waterproofing using Dr. Fixit or SikaFlex solutions.',
    'quote_after_inspection', NULL, 799.00, 240, true, true
  ),
  (
    'aae69672-0812-5e38-92c3-59c759b4c77d',
    '9697176e-bf91-5005-a002-ae6126904482',
    'Wood / Door Polish & Paint',
    'wood-door-polish',
    'Sanding, wood primer, PU polish, or enamel paint for doors, windows, or furniture.',
    'fixed', 1299.00, NULL, 180, false, true
  ),
  (
    '7802332d-2c7b-577e-b6f9-e583bc9e3a28',
    '9697176e-bf91-5005-a002-ae6126904482',
    'Texture Finish (Feature Wall)',
    'texture-finish-feature-wall',
    'Sand, Venetian, or rustic texture finish on a feature wall up to 100 sq ft.',
    'fixed', 2499.00, NULL, 360, false, true
  ),

-- ── CARPENTRY & FURNITURE ────────────────────────────────────────────────────

  (
    '3af7a373-fdc4-595f-926d-46096da9604e',
    '31cec87c-c382-5c4f-a839-5165c1c991bb',
    'Door Repair & Alignment',
    'door-repair-alignment',
    'Stiff, sagging, or squeaking doors — hinge replacement, frame adjustment, or lock repair.',
    'fixed', 449.00, NULL, 60, false, true
  ),
  (
    'aae695a6-463c-52e4-b636-b662644a8d45',
    '31cec87c-c382-5c4f-a839-5165c1c991bb',
    'Furniture Assembly',
    'furniture-assembly',
    'IKEA, Nilkamal, or flat-pack furniture assembly for beds, wardrobes, or shelves.',
    'fixed', 599.00, NULL, 90, false, true
  ),
  (
    'fff04607-1ceb-5d5d-bd39-68d33fe0e7fe',
    '31cec87c-c382-5c4f-a839-5165c1c991bb',
    'Cabinet / Wardrobe Repair',
    'cabinet-wardrobe-repair',
    'Broken hinges, loose drawer runners, handle replacement, or lock repair.',
    'fixed', 499.00, NULL, 60, false, true
  ),
  (
    'ba5701bb-36a0-5209-8cef-1abead79f735',
    '31cec87c-c382-5c4f-a839-5165c1c991bb',
    'Window Grill / Mesh Replacement',
    'window-grill-mesh',
    'Rusted window grill repair, mosquito mesh replacement, or sliding window track service.',
    'fixed', 699.00, NULL, 90, false, true
  ),
  (
    '8698b7b8-f3e8-50bf-a358-9defbf37a4e5',
    '31cec87c-c382-5c4f-a839-5165c1c991bb',
    'Custom Woodwork (Quote)',
    'custom-woodwork-quote',
    'Loft bed, TV unit, study table, or small storage unit — site inspection + custom quote.',
    'quote_after_inspection', NULL, 799.00, 120, true, true
  )
ON CONFLICT (slug) DO NOTHING;


-- ============================================================================
-- 3. SERVICE OPTIONS & VALUES
-- ============================================================================

-- ── Socket & Switch Repair options ──────────────────────────────────────────

INSERT INTO public.service_options (id, service_id, name, option_type, is_required, sort_order)
VALUES
  ('94c7f7b3-7093-5cd9-94a8-24b3ee35cb0e', '523782c5-41cb-5a43-84f5-b0cc4fbf590c',
   'Type of fitting',     'choice', true,  1),
  ('d5994a77-856f-5760-877b-bd0bc44ae071', '523782c5-41cb-5a43-84f5-b0cc4fbf590c',
   'Number of points',    'choice', true,  2)
ON CONFLICT DO NOTHING;

INSERT INTO public.service_option_values (service_option_id, label, value, price_modifier, is_active, sort_order)
VALUES
  ('94c7f7b3-7093-5cd9-94a8-24b3ee35cb0e', 'Standard socket (2-pin / 3-pin)', 'socket_standard', 0,      true, 1),
  ('94c7f7b3-7093-5cd9-94a8-24b3ee35cb0e', 'USB charging socket',             'socket_usb',      50.00,  true, 2),
  ('94c7f7b3-7093-5cd9-94a8-24b3ee35cb0e', '5-amp modular switch',            'switch_5a',       0,      true, 3),
  ('94c7f7b3-7093-5cd9-94a8-24b3ee35cb0e', '15-amp heavy duty socket',        'socket_15a',      80.00,  true, 4),
  ('d5994a77-856f-5760-877b-bd0bc44ae071', '1 point',                         '1',               0,      true, 1),
  ('d5994a77-856f-5760-877b-bd0bc44ae071', '2 points',                        '2',               200.00, true, 2),
  ('d5994a77-856f-5760-877b-bd0bc44ae071', '3 points',                        '3',               400.00, true, 3)
ON CONFLICT DO NOTHING;

-- ── Fan Installation options ─────────────────────────────────────────────────

INSERT INTO public.service_options (id, service_id, name, option_type, is_required, sort_order)
VALUES
  ('3b333478-9afe-5bd6-81a0-188876fad26a', '8fb6aeee-2dc0-5e97-baee-8351178a50d2',
   'Service type', 'choice', true, 1),
  ('b0368646-4cb8-5ab3-9e3b-7e8f1d9fbda7', '8fb6aeee-2dc0-5e97-baee-8351178a50d2',
   'Fan type',     'choice', true, 2)
ON CONFLICT DO NOTHING;

INSERT INTO public.service_option_values (service_option_id, label, value, price_modifier, is_active, sort_order)
VALUES
  ('3b333478-9afe-5bd6-81a0-188876fad26a', 'New installation',          'install',       0,      true, 1),
  ('3b333478-9afe-5bd6-81a0-188876fad26a', 'Repair / speed issue',      'repair',        -100.00,true, 2),
  ('3b333478-9afe-5bd6-81a0-188876fad26a', 'Replace old fan',           'replace',       0,      true, 3),
  ('b0368646-4cb8-5ab3-9e3b-7e8f1d9fbda7', 'Standard ceiling fan',      'ceiling_std',   0,      true, 1),
  ('b0368646-4cb8-5ab3-9e3b-7e8f1d9fbda7', 'BLDC energy-saving fan',    'ceiling_bldc',  150.00, true, 2),
  ('b0368646-4cb8-5ab3-9e3b-7e8f1d9fbda7', 'Exhaust fan',               'exhaust',       -100.00,true, 3),
  ('b0368646-4cb8-5ab3-9e3b-7e8f1d9fbda7', 'Pedestal / table fan',      'pedestal',      -150.00,true, 4)
ON CONFLICT DO NOTHING;

-- ── AC Regular Servicing options ──────────────────────────────────────────────

INSERT INTO public.service_options (id, service_id, name, option_type, is_required, sort_order)
VALUES
  ('58f7b6b6-18fc-5e8d-ab4e-051da2e92f6c', '0aff49ac-c13f-51a8-861e-00b47ecd39e8',
   'AC type',      'choice', true, 1),
  ('6ab19dce-5dc9-5bbb-894e-9ea7769b1863', '0aff49ac-c13f-51a8-861e-00b47ecd39e8',
   'AC capacity',  'choice', true, 2),
  ('d82656ff-db03-5c3e-82e6-cdd4895202df', '0aff49ac-c13f-51a8-861e-00b47ecd39e8',
   'Number of units', 'choice', true, 3)
ON CONFLICT DO NOTHING;

INSERT INTO public.service_option_values (service_option_id, label, value, price_modifier, is_active, sort_order)
VALUES
  ('58f7b6b6-18fc-5e8d-ab4e-051da2e92f6c', 'Split AC',                     'split',    0,       true, 1),
  ('58f7b6b6-18fc-5e8d-ab4e-051da2e92f6c', 'Window AC',                    'window',   -100.00, true, 2),
  ('58f7b6b6-18fc-5e8d-ab4e-051da2e92f6c', 'Cassette / Ducted AC',         'cassette', 300.00,  true, 3),
  ('6ab19dce-5dc9-5bbb-894e-9ea7769b1863', '1.0 Ton',                      '1_ton',    0,       true, 1),
  ('6ab19dce-5dc9-5bbb-894e-9ea7769b1863', '1.5 Ton',                      '1_5_ton',  0,       true, 2),
  ('6ab19dce-5dc9-5bbb-894e-9ea7769b1863', '2.0 Ton',                      '2_ton',    200.00,  true, 3),
  ('d82656ff-db03-5c3e-82e6-cdd4895202df', '1 unit',                       '1',        0,       true, 1),
  ('d82656ff-db03-5c3e-82e6-cdd4895202df', '2 units',                      '2',        599.00,  true, 2),
  ('d82656ff-db03-5c3e-82e6-cdd4895202df', '3 units',                      '3',        1198.00, true, 3)
ON CONFLICT DO NOTHING;

-- ── AC Gas Refilling options ──────────────────────────────────────────────────

INSERT INTO public.service_options (id, service_id, name, option_type, is_required, sort_order)
VALUES
  ('f7b5ad5b-c015-5a7d-8a80-9de59612d825', '605458c4-822b-5ac0-9372-a180fac3b6e3',
   'Gas type',    'choice', true, 1),
  ('7b97e2d9-0c87-5a1a-a920-ff21688124b5', '605458c4-822b-5ac0-9372-a180fac3b6e3',
   'AC capacity', 'choice', true, 2)
ON CONFLICT DO NOTHING;

INSERT INTO public.service_option_values (service_option_id, label, value, price_modifier, is_active, sort_order)
VALUES
  ('f7b5ad5b-c015-5a7d-8a80-9de59612d825', 'R32 (new inverter ACs)',        'r32',      0,      true, 1),
  ('f7b5ad5b-c015-5a7d-8a80-9de59612d825', 'R410A (older inverter ACs)',    'r410a',    0,      true, 2),
  ('f7b5ad5b-c015-5a7d-8a80-9de59612d825', 'R22 (non-inverter / legacy)',   'r22',      -200.00,true, 3),
  ('7b97e2d9-0c87-5a1a-a920-ff21688124b5', '1.0 Ton',                      '1_ton',    0,      true, 1),
  ('7b97e2d9-0c87-5a1a-a920-ff21688124b5', '1.5 Ton',                      '1_5_ton',  200.00, true, 2),
  ('7b97e2d9-0c87-5a1a-a920-ff21688124b5', '2.0 Ton',                      '2_ton',    400.00, true, 3)
ON CONFLICT DO NOTHING;

-- ── Washing Machine Repair options ───────────────────────────────────────────

INSERT INTO public.service_options (id, service_id, name, option_type, is_required, sort_order)
VALUES
  ('d427276e-e0bc-5486-a39d-a6a53cbd92fc', 'b435f05c-a3d1-57d2-9cfd-2df742053846',
   'Machine type',  'choice', true, 1),
  ('99e26769-4950-5265-ac6c-9b7658620e09', 'b435f05c-a3d1-57d2-9cfd-2df742053846',
   'Reported fault','choice', true, 2)
ON CONFLICT DO NOTHING;

INSERT INTO public.service_option_values (service_option_id, label, value, price_modifier, is_active, sort_order)
VALUES
  ('d427276e-e0bc-5486-a39d-a6a53cbd92fc', 'Top-load',                    'top_load',   0,     true, 1),
  ('d427276e-e0bc-5486-a39d-a6a53cbd92fc', 'Front-load',                  'front_load', 0,     true, 2),
  ('99e26769-4950-5265-ac6c-9b7658620e09', 'Not draining',                'no_drain',   0,     true, 1),
  ('99e26769-4950-5265-ac6c-9b7658620e09', 'Not spinning',                'no_spin',    0,     true, 2),
  ('99e26769-4950-5265-ac6c-9b7658620e09', 'Not switching on',            'no_power',   0,     true, 3),
  ('99e26769-4950-5265-ac6c-9b7658620e09', 'Excessive vibration / noise', 'vibration',  0,     true, 4),
  ('99e26769-4950-5265-ac6c-9b7658620e09', 'Water leaking',               'leaking',    0,     true, 5)
ON CONFLICT DO NOTHING;

-- ── Interior Painting options ──────────────────────────────────────────────────

INSERT INTO public.service_options (id, service_id, name, option_type, is_required, sort_order)
VALUES
  ('d3da8753-e424-584b-a6ba-59693a2fccad', '5e37b446-0432-5de7-8c2d-84852e62f085',
   'Paint brand',    'choice', true, 1),
  ('88e68968-ad7d-557b-8d79-82babba2c2f6', '5e37b446-0432-5de7-8c2d-84852e62f085',
   'Finish type',    'choice', true, 2),
  ('91eae3fb-6c27-5631-b474-d26037fdd8ec', '5e37b446-0432-5de7-8c2d-84852e62f085',
   'Number of rooms','choice', true, 3)
ON CONFLICT DO NOTHING;

INSERT INTO public.service_option_values (service_option_id, label, value, price_modifier, is_active, sort_order)
VALUES
  ('d3da8753-e424-584b-a6ba-59693a2fccad', 'Asian Paints Tractor Emulsion',  'asian_tractor',    0,       true, 1),
  ('d3da8753-e424-584b-a6ba-59693a2fccad', 'Asian Paints Royale',            'asian_royale',     800.00,  true, 2),
  ('d3da8753-e424-584b-a6ba-59693a2fccad', 'Nerolac Excel',                  'nerolac_excel',    200.00,  true, 3),
  ('d3da8753-e424-584b-a6ba-59693a2fccad', 'Berger Silk',                    'berger_silk',      500.00,  true, 4),
  ('88e68968-ad7d-557b-8d79-82babba2c2f6', 'Matt finish',                    'matt',             0,       true, 1),
  ('88e68968-ad7d-557b-8d79-82babba2c2f6', 'Sheen / silk finish',            'sheen',            300.00,  true, 2),
  ('88e68968-ad7d-557b-8d79-82babba2c2f6', 'Gloss finish',                   'gloss',            400.00,  true, 3),
  ('91eae3fb-6c27-5631-b474-d26037fdd8ec', '1 room',                         '1',                0,       true, 1),
  ('91eae3fb-6c27-5631-b474-d26037fdd8ec', '2 rooms',                        '2',                5500.00, true, 2),
  ('91eae3fb-6c27-5631-b474-d26037fdd8ec', '3 rooms',                        '3',                10500.00,true, 3),
  ('91eae3fb-6c27-5631-b474-d26037fdd8ec', 'Full 2BHK',                      '2bhk',             14000.00,true, 4),
  ('91eae3fb-6c27-5631-b474-d26037fdd8ec', 'Full 3BHK',                      '3bhk',             21000.00,true, 5)
ON CONFLICT DO NOTHING;

-- ── Tap / Faucet Repair options ───────────────────────────────────────────────

INSERT INTO public.service_options (id, service_id, name, option_type, is_required, sort_order)
VALUES
  ('7db6018b-1de9-576a-b8a8-e699f92fe1aa', '973851ef-ce45-53f1-b873-0140e97c62bf',
   'Fault type', 'choice', true, 1)
ON CONFLICT DO NOTHING;

INSERT INTO public.service_option_values (service_option_id, label, value, price_modifier, is_active, sort_order)
VALUES
  ('7db6018b-1de9-576a-b8a8-e699f92fe1aa', 'Dripping / leaking tap',   'drip',     0,    true, 1),
  ('7db6018b-1de9-576a-b8a8-e699f92fe1aa', 'Broken handle or spout',   'broken',   0,    true, 2),
  ('7db6018b-1de9-576a-b8a8-e699f92fe1aa', 'Low water pressure',       'pressure', 0,    true, 3),
  ('7db6018b-1de9-576a-b8a8-e699f92fe1aa', 'Full tap replacement',     'replace',  150.00,true,4)
ON CONFLICT DO NOTHING;

-- ── Door Repair options ────────────────────────────────────────────────────────

INSERT INTO public.service_options (id, service_id, name, option_type, is_required, sort_order)
VALUES
  ('83c7b4d0-811a-5d6b-b461-b75ce4cad47d', '3af7a373-fdc4-595f-926d-46096da9604e',
   'Door material', 'choice', true, 1),
  ('f75e1e1a-c382-59f1-ac63-228955e80043', '3af7a373-fdc4-595f-926d-46096da9604e',
   'Issue',         'choice', true, 2)
ON CONFLICT DO NOTHING;

INSERT INTO public.service_option_values (service_option_id, label, value, price_modifier, is_active, sort_order)
VALUES
  ('83c7b4d0-811a-5d6b-b461-b75ce4cad47d', 'Wooden door',         'wood',      0,      true, 1),
  ('83c7b4d0-811a-5d6b-b461-b75ce4cad47d', 'Flush door (PVC)',    'flush_pvc', -50.00, true, 2),
  ('83c7b4d0-811a-5d6b-b461-b75ce4cad47d', 'Steel / metal door',  'steel',     100.00, true, 3),
  ('f75e1e1a-c382-59f1-ac63-228955e80043', 'Stiff / hard to open','stiff',     0,      true, 1),
  ('f75e1e1a-c382-59f1-ac63-228955e80043', 'Squeaking hinge',     'squeak',    0,      true, 2),
  ('f75e1e1a-c382-59f1-ac63-228955e80043', 'Lock / latch broken', 'lock',      150.00, true, 3),
  ('f75e1e1a-c382-59f1-ac63-228955e80043', 'Door not closing flush','frame',   200.00, true, 4)
ON CONFLICT DO NOTHING;


-- ============================================================================
-- 4. BRANDS (Indian market)
-- ============================================================================

INSERT INTO public.brands (id, name, is_active)
VALUES
  ('497ddff4-fe38-52f7-95fb-f814873780ef', 'Havells',          true),
  ('2f7ad791-717e-5515-8ea4-8483572c1538', 'Legrand',          true),
  ('17118fa0-ecd2-54bf-b311-9ebfca84fea8', 'Anchor by Panasonic', true),
  ('17e859c1-41f4-5663-b678-f68ab43360ac', 'Finolex',          true),
  ('bb6bd509-2ab1-529e-8031-0b82ae4060db', 'Polycab',          true),
  ('8f00ed5e-c2a8-5101-a94f-148960217ba2', 'Jaquar',           true),
  ('9544215f-7d2e-5f71-b213-7fe0662efa0f', 'Hindware',         true),
  ('709b0862-5336-5464-9cdd-c7dd2df5145f', 'Parryware',        true),
  ('6257da6c-d413-5290-a69e-6a96bd68777b', 'Cera',             true),
  ('be7b8f1f-3ae4-5927-8b83-f21779f8803f', 'Astral',           true),
  ('d67ec0ae-5f7a-581f-ad0e-f621e3de8580', 'Ashirvad (Aliaxis)',true),
  ('bf04199f-80e1-5053-b64c-9fb08446b56b', 'Honeywell',        true),
  ('ca5eedca-fd80-5865-a6dc-4ff6fe36d4fd','Asian Paints',     true),
  ('81ace3e0-e607-54b5-a35b-ed69e4702ee6','Nerolac',          true),
  ('77babd8b-9842-56f0-9a5a-813027333336', 'Berger Paints',    true),
  ('2e7a872b-8d0c-5b1e-b331-2383e28f952d','Dr. Fixit',        true),
  ('3c940f2d-c86d-5fb7-9871-4d209ad99694', 'Sika',             true),
  ('761355ad-4e94-5d31-a3b8-95ee714e59d0','Nilkamal',         true)
ON CONFLICT (name) DO NOTHING;


-- ============================================================================
-- 5. MATERIALS
-- ============================================================================

INSERT INTO public.materials (id, name, brand_id, specification, unit, is_active)
VALUES
  -- Electrical
  ('6fc03654-63b4-5852-a7b2-770bc8171de4', 'MCB 6A Single Pole',
    '497ddff4-fe38-52f7-95fb-f814873780ef', 'Havells 6A SP MCB, 10kA breaking capacity', 'piece', true),
  ('eb065901-6df3-5f03-bb7b-0df7288402ac', 'MCB 32A Double Pole',
    '497ddff4-fe38-52f7-95fb-f814873780ef', 'Havells 32A DP MCB', 'piece', true),
  ('2782bde5-aa2a-5e68-a903-219d1f68fe8a', '1.5 sq mm FR Wire (per metre)',
    'bb6bd509-2ab1-529e-8031-0b82ae4060db', 'Polycab 1.5 sq mm FR-LSH PVC wire', 'metre', true),
  ('e06b786c-0a98-541c-a6bd-0817c55cf999', '4 sq mm FR Wire (per metre)',
    '17e859c1-41f4-5663-b678-f68ab43360ac', 'Finolex 4 sq mm PVC insulated wire', 'metre', true),
  ('caed8e88-9c51-5064-90cb-43bad5e38fea', 'Modular Socket 6A (3-pin)',
    '17118fa0-ecd2-54bf-b311-9ebfca84fea8', 'Anchor Roma 6A 3-pin socket', 'piece', true),
  ('87bd5b92-06ee-57cf-9e5c-d81550491518', 'Modular Switch 6A',
    '2f7ad791-717e-5515-8ea4-8483572c1538', 'Legrand Arteor 6A switch', 'piece', true),

  -- Plumbing
  ('0238dd08-efc9-5d79-8a19-ccdff629135e', 'CPVC Pipe 20mm (per metre)',
    'd67ec0ae-5f7a-581f-ad0e-f621e3de8580', 'Ashirvad CPVC Flowguard Plus 20mm', 'metre', true),
  ('6b42d55e-070c-5293-b277-8418685aabb6','PPRC Pipe 25mm (per metre)',
    'be7b8f1f-3ae4-5927-8b83-f21779f8803f', 'Astral PPRC pipe 25mm PN10', 'metre', true),
  ('d56a4f7f-e35a-5e65-82d1-e073189ab0da', 'Tap Washer Set',
    NULL, 'Standard rubber washer set for pillar taps', 'set', true),
  ('e38f41b0-847c-53ba-b870-d729a757942d', 'Ball Float Valve 1/2"',
    'be7b8f1f-3ae4-5927-8b83-f21779f8803f', 'Astral CPVC float valve 1/2"', 'piece', true),
  ('a244e704-1798-5d01-804e-d459cf81f890', 'Flush Valve (Dual Flush)',
    '8f00ed5e-c2a8-5101-a94f-148960217ba2', 'Jaquar dual-flush flush valve', 'piece', true),
  ('d87f1bd4-4404-57a5-adf2-803a9b02ba5e', 'Health Faucet with Hose',
    '9544215f-7d2e-5f71-b213-7fe0662efa0f', 'Hindware health faucet with 1.2m SS hose', 'piece', true),

  -- AC
  ('c739df35-8e34-53ea-8246-9cc333a96acb','R32 Refrigerant (per kg)',
    'bf04199f-80e1-5053-b64c-9fb08446b56b', 'Honeywell Solstice R32 refrigerant', 'kg', true),
  ('f5e2ca8d-09d7-55c6-a620-5de9d57de21d', 'R410A Refrigerant (per kg)',
    'bf04199f-80e1-5053-b64c-9fb08446b56b', 'Honeywell R410A refrigerant', 'kg', true),
  ('11e19d6b-f2bf-517d-b9b9-82600296ba82',  'Copper Pipe 1/4" (per metre)',
    NULL, '1/4 inch ACR copper pipe for AC piping', 'metre', true),

  -- Painting
  ('fb30a561-dadf-5748-9e7c-d0947b31a6c5', 'Interior Emulsion Paint (per litre)',
    'ca5eedca-fd80-5865-a6dc-4ff6fe36d4fd','Asian Paints Tractor Shyne emulsion', 'litre', true),
  ('5fc6809e-bf9c-52b8-845a-0e269a80ee3f', 'Exterior Wall Primer (per litre)',
    'ca5eedca-fd80-5865-a6dc-4ff6fe36d4fd','Asian Paints Damp Proof primer', 'litre', true),
  ('7f1cd811-4d3d-5da3-b13b-d22cf459473f', 'Wall Putty (per kg)',
    'ca5eedca-fd80-5865-a6dc-4ff6fe36d4fd','Asian Paints WallPutty acrylic', 'kg', true),
  ('1741b028-8cb0-5009-8d6f-1fb569a46c8b', 'Waterproofing Compound (per kg)',
    '2e7a872b-8d0c-5b1e-b331-2383e28f952d','Dr. Fixit Pidicrete URP slurry', 'kg', true),
  ('997e5205-7190-51f0-918a-cbf8efae03fd', 'Wood Primer (per litre)',
    'ca5eedca-fd80-5865-a6dc-4ff6fe36d4fd','Asian Paints wood primer', 'litre', true),
  ('befdc712-b86f-5cb2-babe-ea6b1561d3c4', 'Enamel Paint (per litre)',
    '81ace3e0-e607-54b5-a35b-ed69e4702ee6','Nerolac Enamel Xpert gloss', 'litre', true),

  -- Carpentry
  ('efad5952-7a26-5668-a4de-4e4253fb0b47', 'SS Butt Hinge (pair)',
    NULL, '3x3 inch stainless steel butt hinge, heavy duty', 'pair', true),
  ('dbc8170e-f522-5ae6-9863-78ea31bf505c', 'Mortise Door Lock',
    NULL, '3-lever mortise lock with handle set', 'piece', true),
  ('26ab852e-de5a-5439-92b4-3a2f0403935f', 'Soft-Close Drawer Channel (pair)',
    NULL, '45cm push-to-open soft-close runners', 'pair', true),
  ('74bdc30b-5fe9-5e4e-af76-6f69137ce31c', 'Mosquito Mesh (per sq ft)',
    NULL, 'Fiberglass 18x16 mesh, 0.9mm wire', 'sq_ft', true)
ON CONFLICT DO NOTHING;


-- ============================================================================
-- 6. SERVICE MATERIALS MAPPING
-- ============================================================================

INSERT INTO public.service_materials
  (service_id, material_id, is_customer_selectable, is_professional_selectable)
VALUES
  -- Electrical: MCB / DB Box Fault
  ('4b8ab8a4-3000-5062-813c-6d3ed947ca84', '6fc03654-63b4-5852-a7b2-770bc8171de4', false, true),
  ('4b8ab8a4-3000-5062-813c-6d3ed947ca84', 'eb065901-6df3-5f03-bb7b-0df7288402ac', false, true),
  -- Electrical: New Wiring
  ('aa3bd108-1511-59c0-9026-a11247889990', '2782bde5-aa2a-5e68-a903-219d1f68fe8a', false, true),
  ('aa3bd108-1511-59c0-9026-a11247889990', 'e06b786c-0a98-541c-a6bd-0817c55cf999', false, true),
  -- Electrical: Socket & Switch Repair
  ('523782c5-41cb-5a43-84f5-b0cc4fbf590c', 'caed8e88-9c51-5064-90cb-43bad5e38fea', true, true),
  ('523782c5-41cb-5a43-84f5-b0cc4fbf590c', '87bd5b92-06ee-57cf-9e5c-d81550491518', true, true),

  -- Plumbing: Pipe Leak
  ('096d5f48-00e4-53c3-942c-467501b1a47e', '0238dd08-efc9-5d79-8a19-ccdff629135e', false, true),
  ('096d5f48-00e4-53c3-942c-467501b1a47e', '6b42d55e-070c-5293-b277-8418685aabb6', false, true),
  -- Plumbing: Tap repair
  ('973851ef-ce45-53f1-b873-0140e97c62bf', 'd56a4f7f-e35a-5e65-82d1-e073189ab0da', false, true),
  -- Plumbing: Flush tank repair
  ('8a4ee2ca-86bd-547f-b42d-4cf22e082a56', 'e38f41b0-847c-53ba-b870-d729a757942d', true,  true),
  ('8a4ee2ca-86bd-547f-b42d-4cf22e082a56', 'a244e704-1798-5d01-804e-d459cf81f890', true,  true),
  -- Plumbing: Bathroom fitting
  ('aaf0fb13-600b-5b21-93ac-a3bc733c8aac', 'd87f1bd4-4404-57a5-adf2-803a9b02ba5e', true,  true),

  -- AC: Gas Refilling
  ('605458c4-822b-5ac0-9372-a180fac3b6e3', 'c739df35-8e34-53ea-8246-9cc333a96acb', false, true),
  ('605458c4-822b-5ac0-9372-a180fac3b6e3', 'f5e2ca8d-09d7-55c6-a620-5de9d57de21d', false, true),
  -- AC: Installation
  ('6fd15fdb-bb6b-527a-9421-bfcbf6e7f6e6', '11e19d6b-f2bf-517d-b9b9-82600296ba82', false, true),

  -- Painting: Interior walls
  ('5e37b446-0432-5de7-8c2d-84852e62f085', 'fb30a561-dadf-5748-9e7c-d0947b31a6c5', true,  true),
  ('5e37b446-0432-5de7-8c2d-84852e62f085', '7f1cd811-4d3d-5da3-b13b-d22cf459473f', false, true),
  ('5e37b446-0432-5de7-8c2d-84852e62f085', '5fc6809e-bf9c-52b8-845a-0e269a80ee3f', false, true),
  -- Painting: Waterproofing
  ('ab7ed2de-3c0e-5f6e-b52d-b47b129cf69e', '1741b028-8cb0-5009-8d6f-1fb569a46c8b', false, true),
  -- Painting: Wood polish
  ('aae69672-0812-5e38-92c3-59c759b4c77d', '997e5205-7190-51f0-918a-cbf8efae03fd', false, true),
  ('aae69672-0812-5e38-92c3-59c759b4c77d', 'befdc712-b86f-5cb2-babe-ea6b1561d3c4', true,  true),

  -- Carpentry: Door repair
  ('3af7a373-fdc4-595f-926d-46096da9604e', 'efad5952-7a26-5668-a4de-4e4253fb0b47', false, true),
  ('3af7a373-fdc4-595f-926d-46096da9604e', 'dbc8170e-f522-5ae6-9863-78ea31bf505c', false, true),
  -- Carpentry: Cabinet/Wardrobe repair
  ('fff04607-1ceb-5d5d-bd39-68d33fe0e7fe', '26ab852e-de5a-5439-92b4-3a2f0403935f', false, true),
  -- Carpentry: Window mesh
  ('ba5701bb-36a0-5209-8cef-1abead79f735', '74bdc30b-5fe9-5e4e-af76-6f69137ce31c', true,  true)
ON CONFLICT DO NOTHING;
