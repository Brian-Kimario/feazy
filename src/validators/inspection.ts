import { z } from 'zod';
import { uuid } from './common';

/** Bounds mirror the CHECK constraints and RPC guards in migration 119. */

export const INSPECTION_OUTCOMES = ['repair_needed', 'no_repair_needed'] as const;
export type InspectionOutcome = (typeof INSPECTION_OUTCOMES)[number];

export const completeInspectionInput = z.object({
  visitId: uuid,
  outcome: z.enum(INSPECTION_OUTCOMES, { message: 'Choose an outcome' }),
  findings: z.string().trim().min(10, 'Findings need at least 10 characters').max(2000, 'Findings must be 2000 characters or fewer'),
  recommendation: z.string().trim().max(1000, 'Recommendation must be 1000 characters or fewer').optional(),
});
export type CompleteInspectionInput = z.infer<typeof completeInspectionInput>;

export const markMissedInput = z.object({
  visitId: uuid,
  reason: z.string().trim().min(3, 'Please give a short reason').max(300, 'Reason must be 300 characters or fewer'),
});

export const registerInspectorInput = z.object({
  userId: uuid,
  displayName: z.string().trim().min(1, 'A name is required').max(100, 'Name must be 100 characters or fewer'),
  phone: z.string().trim().max(20, 'Phone must be 20 characters or fewer').optional(),
  active: z.boolean().default(true),
});

export const assignInspectorInput = z.object({
  visitId: uuid,
  inspectorId: uuid,
  scheduledStart: z.iso.datetime({ offset: true, message: 'Choose a valid date and time' }),
});

export const recordInspectionCostInput = z.object({
  visitId: uuid,
  amount: z.number().min(0, 'Cost cannot be negative').max(100000, 'Cost must be at most 1,00,000'),
  note: z.string().trim().max(300, 'Note must be 300 characters or fewer').optional(),
});

export const confirmedMaterialItem = z.object({
  materialId: uuid,
  quantity: z.number().positive('Quantity must be more than 0').max(100000, 'Quantity is too high'),
  sourcing: z.enum(['customer', 'feazy']),
  note: z.string().trim().max(200, 'Note must be 200 characters or fewer').optional(),
});

export const confirmMaterialsInput = z
  .object({
    visitId: uuid,
    items: z.array(confirmedMaterialItem).max(20, 'Choose at most 20 materials'),
  })
  .refine((v) => new Set(v.items.map((i) => i.materialId)).size === v.items.length, {
    message: 'Each material can be listed once',
    path: ['items'],
  });

export const setMaterialPriceInput = z.object({
  materialId: uuid,
  /** null clears the guide price, so customers see "confirmed in your quotation". */
  price: z.number().min(0, 'Price cannot be negative').max(10000000, 'Price is too high').nullable(),
  unit: z.string().trim().max(30, 'Unit must be 30 characters or fewer').optional(),
});

export const CATEGORY_AVAILABILITY = ['bookable', 'manual_assignment', 'coming_soon'] as const;
export type CategoryAvailability = (typeof CATEGORY_AVAILABILITY)[number];

export const setCategoryAvailabilityInput = z.object({
  categoryId: uuid,
  availability: z.enum(CATEGORY_AVAILABILITY, { message: 'Choose an availability' }),
});

export const upsertMaterialInput = z.object({
  id: uuid.optional(),
  name: z.string().trim().min(1, 'Enter a name').max(120, 'Name must be 120 characters or fewer'),
  brand: z.string().trim().max(80, 'Brand must be 80 characters or fewer').optional(),
  specification: z.string().trim().max(300, 'Specification must be 300 characters or fewer').optional(),
  unit: z.string().trim().min(1, 'Enter a unit').max(30, 'Unit must be 30 characters or fewer'),
  isActive: z.boolean(),
});

export const setMaterialServicesInput = z.object({
  materialId: uuid,
  serviceIds: z.array(uuid).max(200),
});
