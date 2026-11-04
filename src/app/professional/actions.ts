"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, ok, parseInput, type ActionResult } from "@/lib/actions/result";
import {
  ARRIVAL_WINDOWS,
  JOB_MEDIA_TYPES,
  addJobMediaSchema,
  createQuoteSchema,
  discardJobMediaUploadSchema,
  jobMediaUploadSchema,
  reportEtaSchema,
  type AddJobMediaInput,
  type DiscardJobMediaUploadInput,
  type JobMediaUploadInput,
  type ReportEtaInput,
  declineJobSchema,
  professionalWithdrawInput,
  inspectionSchema,
  jobIdSchema,
  type CreateQuoteInput,
  type DeclineJobInput,
  type ProfessionalWithdrawInput,
  type InspectionInput,
} from "@/validators";
import { mapA4Error } from "@/lib/admin/a4-errors";
import type {
  Job,
  ProfessionalProfile,
  ServiceCatalogueItem,
  Verification,
  Availability,
  Skill,
} from "./types";

/**
 * Get all jobs for the authenticated professional
 * RLS ensures only assigned jobs are returned
 */
export async function getProfessionalJobs(options?: {
  state?: string;
  includeCompleted?: boolean;
}): Promise<Job[]> {
  // Create authenticated Supabase client (respects RLS)
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  // Get jobs assigned to this professional
  let query = supabase
    .from("jobs")
    .select(
      `
      id,
      current_state,
      created_at,
      completed_at,
      customer:profiles!jobs_customer_id_fkey(id, full_name, phone),
      property:properties(id, name, address:addresses(id, city, label, address_line_1)),
      booking:bookings(id, scheduled_start, service:services(id, name, category:service_categories(id, name)))
    `
    )
    .eq("professional_id", user.id);

  if (options?.state && options.state !== 'all') {
    query = query.eq("current_state", options.state);
  } else {
    // Include all active lifecycle states + quote_pending + completed
    query = query.in("current_state", [
      "assigned",
      "accepted",
      "on_the_way",
      "arrived",
      "in_progress",
      "quote_pending",
      "completed",
    ]);
  }

  const { data, error } = await query
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch jobs: ${error.message}`);
  }

  return (data || []) as unknown as Job[];
}

/**
 * Get a single job by ID for the authenticated professional
 * Includes job events timeline, customer, property, and booking info
 * RLS ensures only assigned jobs are returned
 */
export async function getJobById(jobId: string): Promise<Job | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  const { data, error } = await supabase
    .from("jobs")
    .select(
      `
      id,
      current_state,
      created_at,
      accepted_at,
      on_the_way_at,
      arrived_at,
      started_at,
      completed_at,
      cancelled_at,
      customer:profiles!jobs_customer_id_fkey(id, full_name, phone),
      property:properties(id, name, address:addresses(id, city, label, address_line_1)),
      booking:bookings(id, scheduled_start, service:services(id, name, category:service_categories(id, name))),
      job_events(id, from_state, to_state, actor_user_id, event_type, metadata, created_at)
    `
    )
    .eq("id", jobId)
    .eq("professional_id", user.id)
    .order("created_at", { referencedTable: "job_events", ascending: true })
    .single();

  if (error) {
    if (error.code === "PGRST116") return null; // Not found
    throw new Error(`Failed to fetch job: ${error.message}`);
  }

  return data as unknown as Job;
}

/**
 * Get professional profile info (for header)
 * RLS ensures only own profile can be read
 */
export async function getProfessionalProfile(): Promise<ProfessionalProfile | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  const { data, error } = await supabase
    .from("professional_profiles")
    .select(
      `
      user_id,
      display_name,
      rating_average,
      completed_jobs_count,
      verification_status,
      is_available
    `
    )
    .eq("user_id", user.id)
    .single();

  if (error) {
    throw new Error(`Failed to fetch professional profile: ${error.message}`);
  }

  return data;
}

/**
 * Get service catalogue (public, no auth required)
 */
export async function getServiceCatalogue(): Promise<ServiceCatalogueItem[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("service_categories")
    .select(
      `
      id,
      name,
      slug,
      description,
      services(id, name, slug, description, pricing_model, base_price)
    `
    )
    .eq("is_active", true)
    .order("name");

  if (error) {
    throw new Error(`Failed to fetch service catalogue: ${error.message}`);
  }

  return (data || []) as unknown as ServiceCatalogueItem[];
}

/**
 * Get earnings data for the last 6 weeks
 * Calculated from completed jobs and approved quotes/bookings
 */
export async function getEarningsData(): Promise<{weeklyEarnings: number[], total: number}> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  const sixWeeksAgo = new Date();
  sixWeeksAgo.setDate(sixWeeksAgo.getDate() - 42);

  try {
    const { data: jobs, error } = await supabase
      .from("jobs")
      .select(`
        id,
        completed_at,
        created_at,
        current_state,
        booking:bookings(quoted_or_base_amount),
        quotes(total, status)
      `)
      .eq("professional_id", user.id)
      .eq("current_state", "completed")
      .gte("completed_at", sixWeeksAgo.toISOString());

    if (error) {
      console.warn("Could not fetch completed jobs for earnings:", error.message);
      return { weeklyEarnings: [0, 0, 0, 0, 0, 0], total: 0 };
    }

    const weeklyEarnings = Array(6).fill(0);
    let total = 0;

    (jobs || []).forEach((job) => {
      const rawBooking = Array.isArray(job.booking) ? job.booking[0] : job.booking;
      const quotesList = Array.isArray(job.quotes) ? job.quotes : (job.quotes ? [job.quotes] : []);
      const approvedQuote = quotesList.find((q: { status?: string }) => q.status === 'approved');

      const jobAmount = Number(approvedQuote?.total ?? rawBooking?.quoted_or_base_amount ?? 0);
      const dateStr = job.completed_at || job.created_at;
      const jobDate = new Date(dateStr);
      const daysAgo = Math.floor(
        (new Date().getTime() - jobDate.getTime()) / (24 * 60 * 60 * 1000)
      );
      const weekIndex = Math.min(5, Math.max(0, Math.floor(daysAgo / 7)));

      weeklyEarnings[5 - weekIndex] += jobAmount;
      total += jobAmount;
    });

    return { weeklyEarnings, total };
  } catch (err) {
    console.warn("Error calculating earnings:", err);
    return { weeklyEarnings: [0, 0, 0, 0, 0, 0], total: 0 };
  }
}

/**
 * Get professional verification status
 * RLS ensures only own verification records are returned
 */
export async function getVerificationStatus(): Promise<Verification[]> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  const { data, error } = await supabase
    .from("professional_verifications")
    .select("id, verification_type, status, verified_at")
    .eq("professional_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(
      `Failed to fetch verification status: ${error.message}`
    );
  }

  return (data || []) as unknown as Verification[];
}

/**
 * Get professional availability
 * RLS ensures only own availability is returned
 */
export async function getProfessionalAvailability(): Promise<Availability[]> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  const { data, error } = await supabase
    .from("professional_availability")
    .select("id, day_of_week, start_time, end_time, is_active")
    .eq("professional_id", user.id)
    .order("day_of_week", { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch availability: ${error.message}`);
  }

  return data || [];
}

/**
 * Update professional availability status (online/offline).
 *
 * A direct update rather than an RPC: RLS limits the row to the caller, and the
 * professional_profiles guard trigger (20261030_003) blocks changes to verification status,
 * rating and job count, so is_available is the only meaningful column this can change.
 * Going online requires a verified profile, matching transition_job_state(), which only lets
 * verified professionals accept jobs.
 */
export async function updateAvailabilityStatus(
  isAvailable: boolean
): Promise<ActionResult<{ isAvailable: boolean }>> {
  const parsed = parseInput(z.boolean(), isAvailable);
  if (parsed.success === false) return parsed;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("unauthenticated", "Not authenticated");

  const { data: profile, error: profileError } = await supabase
    .from("professional_profiles")
    .select("verification_status")
    .eq("user_id", user.id)
    .maybeSingle();
  if (profileError) {
    console.error("updateAvailabilityStatus profile fetch error:", profileError.message);
    return fail("failed", "Could not update your status. Please try again.");
  }
  if (!profile) return fail("not_found", "Professional profile not found");
  if (parsed.data && profile.verification_status !== "verified") {
    return fail("rejected", "Your profile must be verified before you can go online.");
  }

  const { error } = await supabase
    .from("professional_profiles")
    .update({ is_available: parsed.data })
    .eq("user_id", user.id);
  if (error) {
    console.error("updateAvailabilityStatus update error:", error.message);
    return fail("failed", "Could not update your status. Please try again.");
  }

  revalidatePath("/professional", "layout");
  return ok({ isAvailable: parsed.data });
}

/**
 * Get professional skills/specializations
 * RLS ensures only own skills are returned
 */
export async function getProfessionalSkills(): Promise<Skill[]> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  const { data, error } = await supabase
    .from("professional_skills")
    .select(
      `
      id,
      service_category_id,
      service_id,
      skill_level,
      verified,
      category:service_categories(id, name, slug),
      service:services(id, name, slug)
    `
    )
    .eq("professional_id", user.id)
    .order("category:service_categories(name)");

  if (error) {
    throw new Error(`Failed to fetch skills: ${error.message}`);
  }

  return (data || []) as unknown as Skill[];
}

/**
 * Fetch eligible (unreviewed) requests for the professional
 * Returns jobs in 'assigned' state that are assigned to this professional
 */
export async function fetchEligibleRequests(): Promise<Job[]> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  const { data, error } = await supabase
    .from("jobs")
    .select(
      `
      id,
      current_state,
      created_at,
      customer:profiles!jobs_customer_id_fkey(id, full_name, phone),
      property:properties(id, name, address:addresses(id, city, label, address_line_1)),
      booking:bookings(id, scheduled_start, service:services(id, name, category:service_categories(id, name)))
    `
    )
    .eq("professional_id", user.id)
    .eq("current_state", "assigned")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch eligible requests: ${error.message}`);
  }

  return (data || []) as unknown as Job[];
}

/**
 * Accept a request (transition from 'assigned' to 'accepted').
 * Ownership and the allowed transition are enforced by transition_job_state().
 */
export async function acceptRequest(
  jobId: string
): Promise<ActionResult<{ jobId: string }>> {
  const parsed = parseInput(jobIdSchema, jobId);
  if (parsed.success === false) return parsed;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("unauthenticated", "Not authenticated");

  const { data: job, error: fetchError } = await supabase
    .from("jobs")
    .select("id")
    .eq("id", parsed.data)
    .eq("professional_id", user.id)
    .eq("current_state", "assigned")
    .maybeSingle();

  if (fetchError) {
    console.error("acceptRequest fetch error:", fetchError.message);
    return fail("failed", "Could not load this request. Please try again.");
  }
  if (!job) {
    return fail(
      "not_found",
      "Request not found, already accepted, or you are not assigned to it"
    );
  }

  const { error: transitionError } = await supabase.rpc("transition_job_state", {
    p_job_id: parsed.data,
    p_new_state: "accepted",
    p_actor_user_id: user.id,
  });
  if (transitionError) {
    return fail("rejected", `Failed to accept request: ${transitionError.message}`);
  }

  revalidatePath("/professional", "layout");
  revalidatePath(`/professional/jobs/${parsed.data}`);
  return ok({ jobId: parsed.data });
}

/**
 * Decline an assigned job. The offer moves to the next eligible professional,
 * or the booking returns to "finding a professional" if there is none.
 */
export async function declineJobAction(
  input: DeclineJobInput
): Promise<ActionResult<{ reassigned: boolean }>> {
  const parsed = parseInput(declineJobSchema, input);
  if (parsed.success === false) return parsed;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("unauthenticated", "Not authenticated");

  const { data, error } = await supabase.rpc("decline_job", {
    p_job_id: parsed.data.jobId,
    p_reason_code: parsed.data.reasonCode,
    p_note: parsed.data.note || undefined,
  });
  if (error) {
    if (error.code === "P0002") {
      return fail("not_found", "This request is no longer yours to decline. It may have expired.");
    }
    if (error.code === "22023") {
      return fail("invalid_input", "Choose a reason, and add a note if you pick Other.");
    }
    console.error("decline_job error:", error.message);
    return fail("failed", "Could not decline this request. Please try again.");
  }

  revalidatePath("/professional", "layout");
  const reassigned = Boolean((data as { reassigned?: boolean } | null)?.reassigned);
  return ok({ reassigned });
}

/**
 * Step away from an accepted job. The database decides by its own clock: before the visit start the
 * job goes back to the matching pool and the customer is told ("withdrawn"); at or after the start,
 * or once work is under way, nothing changes and an admin reviews the request ("review_requested").
 * The professional must not assume they are released in the second case.
 */
export async function withdrawFromJobAction(
  input: ProfessionalWithdrawInput
): Promise<ActionResult<{ outcome: "withdrawn" | "review_requested" }>> {
  const parsed = parseInput(professionalWithdrawInput, input);
  if (parsed.success === false) return parsed;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("unauthenticated", "Not authenticated");

  const { data, error } = await supabase.rpc("professional_withdraw_from_job", {
    p_job_id: parsed.data.jobId,
    p_reason: parsed.data.reason,
  });
  if (error) {
    const mapped = mapA4Error(error);
    if (mapped.code === "NOT_FOUND") return fail("not_found", "Job not found or not assigned to you");
    if (mapped.code === "STALE_STATE") {
      return fail("rejected", "This job can no longer be withdrawn from. Reload to see its current state.");
    }
    console.error("professional_withdraw_from_job error:", error.message);
    return fail("failed", "Could not submit your request. Please try again.");
  }

  const outcome = (data as { outcome?: string } | null)?.outcome;
  if (outcome !== "withdrawn" && outcome !== "review_requested") {
    console.error("professional_withdraw_from_job returned an unknown outcome");
    return fail("failed", "Could not confirm your request. Reload to see the job's state.");
  }

  revalidatePath("/professional", "layout");
  revalidatePath(`/professional/jobs/${parsed.data.jobId}`);
  return ok({ outcome });
}

export interface JobCustomerContact {
  full_name: string | null;
  phone: string | null;
  address_line_1: string;
  address_line_2: string | null;
  area: string | null;
  city: string;
  postal_code: string | null;
  access_notes: string | null;
}

/**
 * Customer name, phone and full address. The database releases these only to the
 * assigned professional once the job has been accepted.
 */
export async function getJobCustomerContact(
  jobId: string
): Promise<JobCustomerContact | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_job_customer_contact", {
    p_job_id: jobId,
  });
  if (error) {
    console.error("getJobCustomerContact error:", error.message);
    return null;
  }
  const rows = (data ?? []) as JobCustomerContact[];
  return rows[0] ?? null;
}

/**
 * Fetch full job detail with ownership check
 * Returns comprehensive job data for the job detail page
 */
export async function fetchJobDetail(jobId: string): Promise<{
  data: Job | null;
  error: string | null;
}> {
  try {
    const job = await getJobById(jobId);
    if (!job) {
      return {
        data: null,
        error: "Job not found or access denied",
      };
    }
    return { data: job, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { data: null, error: message };
  }
}

/**
 * Submit an on-site inspection report. submit_inspection checks the caller is the job's
 * professional and the job is on site, and records the timeline event in the same transaction.
 */
export async function submitInspectionAction(
  payload: InspectionInput
): Promise<ActionResult<{ inspectionId: string }>> {
  const parsed = parseInput(inspectionSchema, payload);
  if (parsed.success === false) return parsed;
  const input = parsed.data;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail('unauthenticated', 'Not authenticated');

  const { data, error } = await supabase.rpc('submit_inspection', {
    p_job_id: input.jobId,
    p_findings: input.findings,
    p_recommendation: input.recommendation || undefined,
  });
  if (error) {
    if (error.code === 'P0002') return fail('not_found', 'Job not found or not assigned to you');
    // 22023 messages are written in submit_inspection for the professional to read.
    if (error.code === '22023') return fail('rejected', error.message);
    console.error('submit_inspection error:', error.message);
    return fail('failed', 'Could not save the inspection. Please try again.');
  }

  revalidatePath(`/professional/jobs/${input.jobId}`);
  revalidatePath('/professional', 'layout');
  return ok({ inspectionId: data });
}

/**
 * Submit an additional/variable quote for customer approval.
 * create_quote prices the items in SQL, writes the quote and its items atomically and moves the
 * job to quote_pending. No platform fee or tax is added: none is configured
 * (see ROLE_DASHBOARDS_REBUILD §5.1), so the quote total is the sum of its line items.
 */
export async function createQuoteAction(
  payload: CreateQuoteInput
): Promise<ActionResult<{ quoteId: string }>> {
  const parsed = parseInput(createQuoteSchema, payload);
  if (parsed.success === false) return parsed;
  const input = parsed.data;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail('unauthenticated', 'Not authenticated');

  const { data, error } = await supabase.rpc('create_quote', {
    p_job_id: input.jobId,
    p_reason: input.reason,
    p_items: input.lineItems.map((item) => ({
      item_type: item.itemType,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unitPrice,
    })),
  });
  if (error) {
    if (error.code === 'P0002') return fail('not_found', 'Job not found or not assigned to you');
    // 22023 messages are written in create_quote for the professional to read.
    if (error.code === '22023') return fail('rejected', error.message);
    console.error('create_quote error:', error.message);
    return fail('failed', 'Could not send the quote. Please try again.');
  }

  revalidatePath(`/professional/jobs/${input.jobId}`);
  revalidatePath('/professional', 'layout');
  return ok({ quoteId: data });
}

/**
 * Share or update the arrival window. report_job_eta checks the caller is the job's professional
 * and the job is before arrival, stores the window on the job and records the timeline event.
 */
export async function reportEtaAction(payload: ReportEtaInput): Promise<ActionResult> {
  const parsed = parseInput(reportEtaSchema, payload);
  if (parsed.success === false) return parsed;
  const input = parsed.data;
  const window = ARRIVAL_WINDOWS.find((w) => w.id === input.windowId);
  if (!window) return fail('invalid_input', 'Choose when you expect to arrive.');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail('unauthenticated', 'Not authenticated');

  const { error } = await supabase.rpc('report_job_eta', {
    p_job_id: input.jobId,
    p_earliest_minutes: window.earliest,
    p_latest_minutes: window.latest,
    p_running_late: input.runningLate,
  });
  if (error) {
    if (error.code === 'P0002') return fail('not_found', 'Job not found or not assigned to you');
    // 22023 messages are written in report_job_eta for the professional to read.
    if (error.code === '22023') return fail('rejected', error.message);
    console.error('report_job_eta error:', error.message);
    return fail('failed', 'Could not share your arrival time. Please try again.');
  }

  revalidatePath(`/professional/jobs/${input.jobId}`);
  return ok();
}

/** States in which the job-media upload policy and add_job_media accept files. */
const MEDIA_OPEN_STATES: ReadonlySet<string> = new Set(['arrived', 'assessing', 'in_progress', 'quote_pending', 'completed']);

/**
 * Sign an upload into job-media for this job's professional. Auth cookies are httpOnly, so the
 * browser client has no session; the URL is signed here with the user's own client (storage
 * RLS applies, and the object is owned by the caller) and the browser uploads to it directly.
 */
export async function createJobMediaUploadAction(
  payload: JobMediaUploadInput
): Promise<ActionResult<{ path: string; token: string }>> {
  const parsed = parseInput(jobMediaUploadSchema, payload);
  if (parsed.success === false) return parsed;
  const input = parsed.data;
  const ext = JOB_MEDIA_TYPES[input.contentType];
  if (!ext) return fail('invalid_input', 'Use a JPG, PNG or WebP photo, or a PDF.');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail('unauthenticated', 'Not authenticated');

  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .select('professional_id, current_state')
    .eq('id', input.jobId)
    .maybeSingle();
  if (jobError) {
    console.error('createJobMediaUpload job lookup error:', jobError.message);
    return fail('failed', 'Could not start the upload. Please try again.');
  }
  if (!job || job.professional_id !== user.id) return fail('not_found', 'Job not found or not assigned to you');
  if (!MEDIA_OPEN_STATES.has(job.current_state)) {
    return fail('rejected', 'Photos can be added once you arrive and until the job is closed.');
  }

  const path = `${input.jobId}/${crypto.randomUUID()}.${ext}`;
  const { data, error } = await supabase.storage.from('job-media').createSignedUploadUrl(path);
  if (error || !data) {
    console.error('createSignedUploadUrl error:', error?.message);
    return fail('failed', 'Could not start the upload. Please try again.');
  }
  return ok({ path: data.path, token: data.token });
}

/**
 * Remove a file the professional uploaded but could not attach, so it does not linger in the
 * bucket. The storage DELETE policy only matches the uploader's own unattached files, so attached
 * evidence cannot be removed this way. Anything this misses is left for the job-media sweep.
 */
export async function discardJobMediaUploadAction(
  payload: DiscardJobMediaUploadInput
): Promise<ActionResult> {
  const parsed = parseInput(discardJobMediaUploadSchema, payload);
  if (parsed.success === false) return parsed;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail('unauthenticated', 'Not authenticated');

  const { data, error } = await supabase.storage.from('job-media').remove([parsed.data.storagePath]);
  if (error) {
    console.error('discardJobMediaUpload error:', error.message);
    return fail('failed', 'Could not remove the upload.');
  }
  if (!data || data.length === 0) return fail('not_found', 'Upload not found or already attached');
  return ok();
}

/**
 * Attach a file the professional already uploaded to the job-media bucket. add_job_media checks
 * the object exists under this job and belongs to the caller before recording it.
 */
export async function addJobMediaAction(
  payload: AddJobMediaInput
): Promise<ActionResult<{ mediaId: string }>> {
  const parsed = parseInput(addJobMediaSchema, payload);
  if (parsed.success === false) return parsed;
  const input = parsed.data;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail('unauthenticated', 'Not authenticated');

  const { data, error } = await supabase.rpc('add_job_media', {
    p_job_id: input.jobId,
    p_kind: input.kind,
    p_storage_path: input.storagePath,
  });
  if (error) {
    if (error.code === 'P0002') return fail('not_found', 'Job not found or not assigned to you');
    // 22023 messages are written in add_job_media for the professional to read.
    if (error.code === '22023') return fail('rejected', error.message);
    console.error('add_job_media error:', error.message);
    return fail('failed', 'Could not attach the file. Please try again.');
  }

  revalidatePath(`/professional/jobs/${input.jobId}`);
  return ok({ mediaId: data });
}
