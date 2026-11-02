'use server';

/**
 * Inspection write actions. Inspector actions run on the user-scoped client, so the RPCs see
 * auth.uid() and enforce that the caller is the assigned, active inspector. Admin actions go through
 * runAdminAction (role check, Zod, audit rows).
 */

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { runAdminAction } from '@/lib/admin/action';
import { adminFailure, type AdminResult } from '@/lib/admin/result';
import { mapInspectionError, rpcFailureMessage, type InspectionActionResult } from '@/lib/inspections/errors';
import {
  assignInspectorInput,
  completeInspectionInput,
  confirmMaterialsInput,
  setMaterialPriceInput,
  setCategoryAvailabilityInput,
  upsertMaterialInput,
  setMaterialServicesInput,
  markMissedInput,
  recordInspectionCostInput,
  registerInspectorInput,
} from '@/validators/inspection';

function refresh(): void {
  revalidatePath('/inspector');
  revalidatePath('/admin/inspections');
  revalidatePath('/customer/bookings');
}

export async function completeInspection(input: unknown): Promise<InspectionActionResult> {
  const parsed = completeInspectionInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const i = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('inspector_complete_visit', {
    p_visit_id: i.visitId,
    p_outcome: i.outcome,
    p_findings: i.findings,
    p_recommendation: i.recommendation || undefined,
  });
  if (error) return { ok: false, error: mapInspectionError(error) };
  const failure = rpcFailureMessage(data);
  if (failure) return { ok: false, error: failure };
  refresh();
  return { ok: true };
}

export async function markInspectionMissed(input: unknown): Promise<InspectionActionResult> {
  const parsed = markMissedInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('mark_inspection_missed', {
    p_visit_id: parsed.data.visitId,
    p_reason: parsed.data.reason,
  });
  if (error) return { ok: false, error: mapInspectionError(error) };
  const failure = rpcFailureMessage(data);
  if (failure) return { ok: false, error: failure };
  refresh();
  return { ok: true };
}

export async function adminRegisterInspector(input: unknown): Promise<AdminResult<null>> {
  return runAdminAction({
    name: 'admin.inspection.register_inspector',
    schema: registerInspectorInput,
    input,
    targetType: 'inspector',
    targetId: (i) => i.userId,
    subjectUserId: (i) => i.userId,
    execute: async ({ input: i }) => {
      const supabase = await createClient();
      const { data, error } = await supabase.rpc('admin_set_inspector', {
        p_user_id: i.userId,
        p_display_name: i.displayName,
        p_phone: i.phone || undefined,
        p_active: i.active,
      });
      if (error) return adminFailure('FAILED', mapInspectionError(error));
      const failure = rpcFailureMessage(data);
      if (failure) return adminFailure('FAILED', failure);
      refresh();
      return { ok: true, data: null };
    },
  });
}

export async function adminAssignInspector(input: unknown): Promise<AdminResult<null>> {
  return runAdminAction({
    name: 'admin.inspection.assign_inspector',
    schema: assignInspectorInput,
    input,
    targetType: 'inspection_visit',
    targetId: (i) => i.visitId,
    subjectUserId: (i) => i.inspectorId,
    execute: async ({ input: i }) => {
      const supabase = await createClient();
      const { data, error } = await supabase.rpc('admin_assign_inspector', {
        p_visit_id: i.visitId,
        p_inspector_id: i.inspectorId,
        p_scheduled_start: i.scheduledStart,
      });
      if (error) return adminFailure('FAILED', mapInspectionError(error));
      const failure = rpcFailureMessage(data);
      if (failure) return adminFailure('FAILED', failure);
      refresh();
      return { ok: true, data: null };
    },
  });
}

export async function adminRecordInspectionCost(input: unknown): Promise<AdminResult<null>> {
  return runAdminAction({
    name: 'admin.inspection.record_cost',
    schema: recordInspectionCostInput,
    input,
    targetType: 'inspection_visit',
    targetId: (i) => i.visitId,
    execute: async ({ input: i }) => {
      const supabase = await createClient();
      const { data, error } = await supabase.rpc('admin_record_inspection_cost', {
        p_visit_id: i.visitId,
        p_amount: i.amount,
        p_note: i.note || undefined,
      });
      if (error) return adminFailure('FAILED', mapInspectionError(error));
      const failure = rpcFailureMessage(data);
      if (failure) return adminFailure('FAILED', failure);
      refresh();
      return { ok: true, data: null };
    },
  });
}

/** Inspector records which materials the job needs. Still not a price: the quotation fixes that. */
export async function confirmInspectionMaterials(input: unknown): Promise<InspectionActionResult> {
  const parsed = confirmMaterialsInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('inspector_confirm_materials', {
    p_visit_id: parsed.data.visitId,
    p_items: parsed.data.items.map((i) => ({
      material_id: i.materialId,
      quantity: i.quantity,
      sourcing: i.sourcing,
      note: i.note ?? '',
    })),
  });
  if (error) return { ok: false, error: mapInspectionError(error) };
  const failure = rpcFailureMessage(data);
  if (failure) return { ok: false, error: failure };
  refresh();
  return { ok: true };
}

export async function adminSetMaterialPrice(input: unknown): Promise<AdminResult<null>> {
  return runAdminAction({
    name: 'admin.material.set_price',
    schema: setMaterialPriceInput,
    input,
    targetType: 'material',
    targetId: (i) => i.materialId,
    execute: async ({ input: i }) => {
      const supabase = await createClient();
      const { data, error } = await supabase.rpc('admin_set_material_price', {
        p_material_id: i.materialId,
        p_price: i.price as number,
        p_unit: i.unit || undefined,
      });
      if (error) return adminFailure('FAILED', mapInspectionError(error));
      const failure = rpcFailureMessage(data);
      if (failure) return adminFailure('FAILED', failure);
      refresh();
      return { ok: true, data: null };
    },
  });
}

export async function adminSetCategoryAvailability(input: unknown): Promise<AdminResult<null>> {
  return runAdminAction({
    name: 'admin.category.set_availability',
    schema: setCategoryAvailabilityInput,
    input,
    targetType: 'service_category',
    targetId: (i) => i.categoryId,
    execute: async ({ input: i }) => {
      const supabase = await createClient();
      const { data, error } = await supabase.rpc('admin_set_category_availability', {
        p_category_id: i.categoryId,
        p_availability: i.availability,
      });
      if (error) return adminFailure('FAILED', mapInspectionError(error));
      const failure = rpcFailureMessage(data);
      if (failure) return adminFailure('FAILED', failure);
      revalidatePath('/admin/catalogue');
      revalidatePath('/customer/bookings/new');
      return { ok: true, data: null };
    },
  });
}

export async function adminUpsertMaterial(input: unknown): Promise<AdminResult<null>> {
  return runAdminAction({
    name: 'admin.material.upsert',
    schema: upsertMaterialInput,
    input,
    targetType: 'material',
    targetId: (i) => i.id ?? 'new',
    execute: async ({ input: i }) => {
      const supabase = await createClient();
      const { data, error } = await supabase.rpc('admin_upsert_material', {
        p_id: i.id as string,
        p_name: i.name,
        p_brand: i.brand ?? '',
        p_specification: i.specification ?? '',
        p_unit: i.unit,
        p_is_active: i.isActive,
      });
      if (error) return adminFailure('FAILED', mapInspectionError(error));
      const failure = rpcFailureMessage(data);
      if (failure) return adminFailure('FAILED', failure);
      revalidatePath('/admin/catalogue');
      return { ok: true, data: null };
    },
  });
}

export async function adminSetMaterialServices(input: unknown): Promise<AdminResult<null>> {
  return runAdminAction({
    name: 'admin.material.set_services',
    schema: setMaterialServicesInput,
    input,
    targetType: 'material',
    targetId: (i) => i.materialId,
    execute: async ({ input: i }) => {
      const supabase = await createClient();
      const { data, error } = await supabase.rpc('admin_set_material_services', {
        p_material_id: i.materialId,
        p_service_ids: i.serviceIds,
      });
      if (error) return adminFailure('FAILED', mapInspectionError(error));
      const failure = rpcFailureMessage(data);
      if (failure) return adminFailure('FAILED', failure);
      revalidatePath('/admin/catalogue');
      revalidatePath('/customer/bookings/new');
      return { ok: true, data: null };
    },
  });
}
