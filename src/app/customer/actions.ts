'use server';

import { createClient } from '@/lib/supabase/server';
import { clearSessionCookies } from '@/lib/session';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { cancelBooking, type CancelBookingOutcome } from '@/lib/services/bookings';
import { ACTIVE_STATES } from '@/lib/jobs/states';
import { fail, ok, parseInput, type ActionResult } from '@/lib/actions/result';
import {
  problemIntakeSchema,
  type CancelBookingInput,
  respondToQuoteSchema,
  type ProblemIntakeInput,
  type RespondToQuoteInput,
} from '@/validators';

// OWNERSHIP CHECK: Every fetch action verifies customer_id = auth.getUser().id via RLS policy jobs_select_own

/**
 * Type definitions for customer data
 */

export interface Property {
  id: string;
  name: string;
  propertyType: string;
  addressLine1?: string;
  city?: string;
  state?: string;
}

export interface CustomerJob {
  id: string;
  referenceNumber: string;
  serviceTitle: string;
  category: string;
  propertyName: string;
  currentState: string;
  createdAt: string;
  professional?: {
    id: string;
    name: string;
    rating: number;
    verificationStatus: 'verified' | 'pending' | 'not_verified';
  };
  booking?: {
    amount: number;
    scheduledStart?: string;
  };
  quote?: {
    status: string;
    total: number;
  };
}

export interface JobDetails {
  id: string;
  referenceNumber: string;
  serviceTitle: string;
  category: string;
  propertyName: string;
  propertyAddress: string;
  currentState: string;
  createdAt: string;
  scheduledTime?: string;
  professional?: {
    id: string;
    name: string;
    rating: number;
    completedJobs: number;
    verificationStatus: 'verified' | 'pending' | 'not_verified';
  };
  booking?: {
    amount: number;
    reference: string;
  };
  quote?: {
    id: string;
    status: string;
    total: number;
    items: Array<{
      type: 'labour' | 'material' | 'fee';
      description: string;
      quantity: number;
      unitPrice: number;
      total: number;
    }>;
  };
  inspection?: {
    findings: string;
    recommendation: string;
  };
  events: Array<{
    eventType: string;
    toState: string;
    createdAt: string;
  }>;
}

export interface TimelineEvent {
  id: string;
  date: string;
  fullDate: string;
  category: string;
  title: string;
  propertyName: string;
  summary: string;
  cost: number;
  proName: string;
  proRating: number;
  warrantyValidUntil: string;
  referenceNumber: string;
}

export interface ActivityEvent {
  id: string;
  eventType: string;
  title: string;
  description: string;
  createdAt: string;
  toState?: string;
}

/**
 * Server Action: Logout user
 * Signs out the user, wipes session cookies, and redirects to login page.
 */
export async function logoutUser() {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch (err) {
    console.error('Logout error:', err);
  }

  try {
    await clearSessionCookies();
  } catch (err) {
    console.error('Clear cookies error:', err);
  }

  // Redirect to login page with logged_out flag to prevent middleware bounce-back
  redirect('/auth/login?logged_out=1');
}

/**
 * Server Action: Submit Problem Intake
 * Inserts a service_requests row for the customer. `requestId` is null when the customer
 * has no property yet: service_requests.property_id is NOT NULL, so nothing is saved and
 * the booking wizard collects the property instead.
 */
export async function submitProblemIntakeAction(
  payload: ProblemIntakeInput
): Promise<ActionResult<{ requestId: string | null }>> {
  const parsed = parseInput(problemIntakeSchema, payload);
  if (parsed.success === false) return parsed;
  const input = parsed.data;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail('unauthenticated', 'User is not authenticated');

  let targetPropertyId = input.propertyId;

  if (targetPropertyId) {
    const { data: owned } = await supabase
      .from('properties')
      .select('id')
      .eq('id', targetPropertyId)
      .eq('owner_customer_id', user.id)
      .maybeSingle();
    if (!owned) return fail('not_found', 'Property not found');
  } else {
    const { data: properties } = await supabase
      .from('properties')
      .select('id')
      .eq('owner_customer_id', user.id)
      .limit(1);
    targetPropertyId = properties?.[0]?.id;
  }

  if (!targetPropertyId) return ok({ requestId: null });

  const { data: requestData, error } = await supabase
    .from('service_requests')
    .insert({
      customer_id: user.id,
      property_id: targetPropertyId,
      input_text: input.inputText,
      normalized_summary: input.inputText.slice(0, 160),
      intake_source: input.hasMedia ? 'media' : 'manual',
      classification_confidence: input.detectedCategory ? 'high' : 'low',
      status: 'draft',
    })
    .select('id')
    .single();

  if (error) {
    console.error('submitProblemIntakeAction insert failed:', error.message);
    return fail('failed', 'We could not save your request. Please try again.');
  }

  revalidatePath('/customer');
  return ok({ requestId: requestData.id });
}

/**
 * Server Action: Respond to Quote (Approve or Decline)
 * Delegates to the respond_to_quote() RPC, which checks ownership, quote/job state and
 * expiry, updates the quote and moves the job back to in_progress in one transaction
 * (approve = extra work authorised, decline = professional continues the original scope).
 */
export async function respondToQuoteAction(
  payload: RespondToQuoteInput
): Promise<ActionResult> {
  const parsed = parseInput(respondToQuoteSchema, payload);
  if (parsed.success === false) return parsed;
  const input = parsed.data;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail('unauthenticated', 'User not authenticated');

  const { error: rpcError } = await supabase.rpc('respond_to_quote', {
    p_quote_id: input.quoteId,
    p_decision: input.decision,
    p_reason: input.reason ?? null,
  });

  if (rpcError) {
    console.error('respondToQuoteAction respond_to_quote RPC error:', rpcError.message);
    return fail('rejected', rpcError.message);
  }

  // The quote also drives the top-bar bell and the action inbox, so refresh the layout.
  revalidatePath('/customer', 'layout');
  return ok();
}

/**
 * Server Action: customer cancels their own booking.
 * Delegates to customer_cancel_booking() through the bookings service; the database checks ownership,
 * the state the customer saw, and cancels the job in one transaction. Payments are never changed.
 */
export async function cancelBookingAction(
  payload: CancelBookingInput
): Promise<ActionResult<CancelBookingOutcome>> {
  const result = await cancelBooking(payload);
  if (result.success) {
    revalidatePath('/customer', 'layout');
  }
  return result;
}

/**
 * OWNERSHIP CHECK: Fetches only properties owned by authenticated customer
 * RLS policy: properties_select_own ensures owner_customer_id = auth.uid()
 */
export async function fetchCustomerProperties(): Promise<{
  data: Property[];
  error: string | null;
}> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { data: [], error: 'User not authenticated' };
  }

  try {
    const { data: propsData, error } = await supabase
      .from('properties')
      .select(`
        id,
        name,
        property_type,
        addresses:address_id (
          address_line_1,
          city,
          state
        )
      `)
      .eq('owner_customer_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('fetchCustomerProperties error:', error.message);
      return { data: [], error: error.message };
    }

    const properties: Property[] = (propsData || []).map((p: Record<string, any>) => {
      const addr = Array.isArray(p.addresses) ? p.addresses[0] : p.addresses;
      return {
        id: p.id,
        name: p.name,
        propertyType: p.property_type || 'Residential',
        addressLine1: addr?.address_line_1,
        city: addr?.city,
        state: addr?.state,
      };
    });

    return { data: properties, error: null };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error fetching properties';
    console.error('fetchCustomerProperties exception:', errorMsg);
    return { data: [], error: errorMsg };
  }
}

/**
 * OWNERSHIP CHECK: Fetches only jobs for authenticated customer
 * RLS policy: jobs_select_own ensures customer_id = auth.uid() or professional_id = auth.uid()
 */
export async function fetchCustomerJobs(): Promise<{
  data: CustomerJob[];
  error: string | null;
}> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { data: [], error: 'User not authenticated' };
  }

  try {
    const { data: jobsData, error } = await supabase
      .from('jobs')
      .select(`
        id,
        current_state,
        created_at,
        booking_id,
        bookings (
          id,
          booking_reference,
          quoted_or_base_amount,
          scheduled_start,
          services (
            name,
            service_categories (
              name
            )
          )
        ),
        professional_id,
        professional_profiles (
          user_id,
          display_name,
          rating_average,
          verification_status
        ),
        quotes (
          id,
          status,
          total
        )
      `)
      .eq('customer_id', user.id)
      .in('current_state', [...ACTIVE_STATES])
      .order('created_at', { ascending: false });

    if (error) {
      console.error('fetchCustomerJobs error:', error.message);
      return { data: [], error: error.message };
    }

    const jobs: CustomerJob[] = (jobsData || []).map((job: Record<string, any>) => {
      const booking = Array.isArray(job.bookings) ? job.bookings[0] : job.bookings;
      const service = booking?.services as { name?: string; service_categories?: Record<string, any> } | undefined;
      const category = Array.isArray(service?.service_categories)
        ? service?.service_categories[0]?.name
        : service?.service_categories?.name;
      const pro = Array.isArray(job.professional_profiles) ? job.professional_profiles[0] : job.professional_profiles;
      const quotesList: { status?: string; total?: number | string }[] = Array.isArray(job.quotes) ? job.quotes : job.quotes ? [job.quotes] : [];
      // Prefer the quote that matters to the customer: pending first, then approved
      const quote =
        quotesList.find((q) => q.status === 'pending_customer') ??
        quotesList.find((q) => q.status === 'approved');

      return {
        id: job.id,
        referenceNumber: booking?.booking_reference || `FX-${job.id.slice(0, 4).toUpperCase()}`,
        serviceTitle: service?.name || 'Home Maintenance & Repair',
        category: category || 'General Service',
        propertyName: 'Property',
        currentState: job.current_state,
        createdAt: job.created_at,
        professional: pro ? {
          id: pro.user_id,
          name: pro.display_name || 'Professional',
          rating: Number(pro.rating_average) || 0,
          verificationStatus: pro.verification_status || 'not_verified',
        } : undefined,
        booking: booking ? {
          amount: Number(booking.quoted_or_base_amount) || 0,
          scheduledStart: booking.scheduled_start,
        } : undefined,
        quote: quote ? {
          status: quote.status,
          total: Number(quote.total) || 0,
        } : undefined,
      };
    });

    return { data: jobs, error: null };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error fetching jobs';
    console.error('fetchCustomerJobs exception:', errorMsg);
    return { data: [], error: errorMsg };
  }
}

/**
 * OWNERSHIP CHECK: Fetches single job with full context, verifies customer_id = auth.uid()
 * Returns 401 error if customer does not own this job
 * RLS policy: jobs_select_own enforces this at database layer
 */
export async function fetchJobDetails(jobId: string): Promise<{
  data: JobDetails | null;
  error: string | null;
}> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { data: null, error: 'User not authenticated' };
  }

  if (!jobId) {
    return { data: null, error: 'Invalid job ID' };
  }

  try {
    // First verify ownership at app layer (defense in depth)
    const { data: jobCheck, error: checkError } = await supabase
      .from('jobs')
      .select('customer_id')
      .eq('id', jobId)
      .single();

    if (checkError || !jobCheck) {
      return { data: null, error: 'Job not found' };
    }

    if (jobCheck.customer_id !== user.id) {
      return { data: null, error: 'Not authorized to view this job' };
    }

    // Now fetch full job details
    const { data: job, error } = await supabase
      .from('jobs')
      .select(`
        id,
        current_state,
        created_at,
        booking_id,
        property_id,
        professional_id,
        bookings (
          id,
          booking_reference,
          quoted_or_base_amount,
          scheduled_start,
          services (
            name,
            service_categories (
              name
            )
          )
        ),
        properties (
          id,
          name,
          addresses:address_id (
            address_line_1,
            city
          )
        ),
        professional_profiles (
          user_id,
          display_name,
          rating_average,
          completed_jobs_count,
          verification_status
        ),
        quotes (
          id,
          status,
          total,
          subtotal,
          taxes_or_fees,
          quote_items (
            id,
            item_type,
            description,
            quantity,
            unit_price,
            line_total
          )
        ),
        inspections (
          id,
          findings,
          recommendation
        ),
        job_events (
          id,
          event_type,
          to_state,
          created_at
        )
      `)
      .eq('id', jobId)
      .single();

    if (error || !job) {
      console.error('fetchJobDetails error:', error?.message);
      return { data: null, error: error?.message || 'Job not found' };
    }

    const booking = Array.isArray(job.bookings) ? job.bookings[0] : job.bookings;
    const service = booking?.services as { name?: string; service_categories?: any } | undefined;
    const category = Array.isArray(service?.service_categories)
      ? service?.service_categories[0]?.name
      : service?.service_categories?.name;
    const property = Array.isArray(job.properties) ? job.properties[0] : job.properties;
    const propertyAddr = Array.isArray(property?.addresses) ? property?.addresses[0] : property?.addresses;
    const pro = Array.isArray(job.professional_profiles) ? job.professional_profiles[0] : job.professional_profiles;
    const quote = Array.isArray(job.quotes) ? job.quotes[0] : job.quotes;
    const inspection = Array.isArray(job.inspections) ? job.inspections[0] : job.inspections;
    const events = Array.isArray(job.job_events) ? job.job_events : [job.job_events].filter(Boolean);

    const quoteItems = (quote?.quote_items || []).map((item: Record<string, any>) => ({
      type: (item.item_type as 'labour' | 'material' | 'fee') || 'material',
      description: item.description,
      quantity: Number(item.quantity) || 1,
      unitPrice: Number(item.unit_price) || 0,
      total: Number(item.line_total) || 0,
    }));

    const details: JobDetails = {
      id: job.id,
      referenceNumber: booking?.booking_reference || `FX-${job.id.slice(0, 4).toUpperCase()}`,
      serviceTitle: service?.name || 'Home Maintenance & Repair',
      category: category || 'General Service',
      propertyName: property?.name || 'Property',
      propertyAddress: propertyAddr ? `${propertyAddr.address_line_1}, ${propertyAddr.city}` : 'On file',
      currentState: job.current_state,
      createdAt: job.created_at,
      scheduledTime: booking?.scheduled_start,
      professional: pro ? {
        id: pro.user_id,
        name: pro.display_name || 'Professional',
        rating: Number(pro.rating_average) || 0,
        completedJobs: Number(pro.completed_jobs_count) || 0,
        verificationStatus: pro.verification_status || 'not_verified',
      } : undefined,
      booking: booking ? {
        amount: Number(booking.quoted_or_base_amount) || 0,
        reference: booking.booking_reference,
      } : undefined,
      quote: quote ? {
        id: quote.id,
        status: quote.status,
        total: Number(quote.total) || 0,
        items: quoteItems,
      } : undefined,
      inspection: inspection ? {
        findings: inspection.findings || '',
        recommendation: inspection.recommendation || '',
      } : undefined,
      events: (events || []).map((e: any) => ({
        eventType: e.event_type,
        toState: e.to_state,
        createdAt: e.created_at,
      })),
    };

    return { data: details, error: null };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error fetching job details';
    console.error('fetchJobDetails exception:', errorMsg);
    return { data: null, error: errorMsg };
  }
}

/**
 * OWNERSHIP CHECK: Fetches completed jobs for customer timeline
 * RLS policy: jobs_select_own ensures customer_id = auth.uid()
 */
export async function fetchJobTimeline(): Promise<{
  data: TimelineEvent[];
  error: string | null;
}> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { data: [], error: 'User not authenticated' };
  }

  try {
    const { data: jobsData, error } = await supabase
      .from('jobs')
      .select(`
        id,
        created_at,
        completed_at,
        current_state,
        booking_id,
        bookings (
          booking_reference,
          quoted_or_base_amount,
          services (
            name,
            service_categories (
              name
            )
          )
        ),
        properties (
          name
        ),
        professional_profiles (
          display_name,
          rating_average
        ),
        quotes (
          total,
          status,
          quote_items (
            description,
            item_type
          )
        )
      `)
      .eq('customer_id', user.id)
      .eq('current_state', 'completed')
      .order('completed_at', { ascending: false });

    if (error) {
      console.error('fetchJobTimeline error:', error.message);
      return { data: [], error: error.message };
    }

    const timeline: TimelineEvent[] = (jobsData || []).map((job: Record<string, any>) => {
      const booking = Array.isArray(job.bookings) ? job.bookings[0] : job.bookings;
      const service = booking?.services as { name?: string; service_categories?: Record<string, any> } | undefined;
      const category = Array.isArray(service?.service_categories)
        ? service?.service_categories[0]?.name
        : service?.service_categories?.name;
      const property = Array.isArray(job.properties) ? job.properties[0] : job.properties;
      const pro = Array.isArray(job.professional_profiles) ? job.professional_profiles[0] : job.professional_profiles;
      const quotesList: { status?: string; total?: number | string }[] = Array.isArray(job.quotes) ? job.quotes : job.quotes ? [job.quotes] : [];
      // History shows what was actually agreed
      const quote = quotesList.find((q) => q.status === 'approved');

      const completedDate = new Date(job.completed_at || job.created_at);
      const warrantyDate = new Date(completedDate);
      warrantyDate.setFullYear(warrantyDate.getFullYear() + 1);

      const categoryMapped = (category?.includes('Plumb')
        ? 'Plumbing'
        : category?.includes('Elect')
        ? 'Electrical'
        : category?.includes('HVAC') || category?.includes('Cool') || category?.includes('Heat')
        ? 'HVAC'
        : category?.includes('Appliance')
        ? 'Appliances'
        : 'Plumbing') as TimelineEvent['category'];

      return {
        id: job.id,
        date: completedDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }).toUpperCase(),
        fullDate: completedDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
        category: categoryMapped,
        title: service?.name || 'Home Maintenance & Repair',
        propertyName: property?.name || 'Property',
        summary: `Completed verified repair work on ${completedDate.toLocaleDateString()}`,
        cost: Number(quote?.total ?? booking?.quoted_or_base_amount ?? 0),
        proName: pro?.display_name || 'Verified Professional',
        proRating: Number(pro?.rating_average) || 0,
        warrantyValidUntil: warrantyDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        referenceNumber: booking?.booking_reference || `FX-${job.id.slice(0, 4).toUpperCase()}`,
      };
    });

    return { data: timeline, error: null };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error fetching timeline';
    console.error('fetchJobTimeline exception:', errorMsg);
    return { data: [], error: errorMsg };
  }
}

/**
 * OWNERSHIP CHECK: Fetches recent activity events for customer
 * RLS policy: job_events are filtered by associated job's customer_id = auth.uid()
 */
export async function fetchRecentActivityEvents(): Promise<{
  data: ActivityEvent[];
  error: string | null;
}> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { data: [], error: 'User not authenticated' };
  }

  try {
    // Get job IDs for this customer first
    const { data: jobIds, error: jobError } = await supabase
      .from('jobs')
      .select('id')
      .eq('customer_id', user.id);

    if (jobError) {
      console.error('fetchRecentActivityEvents — job lookup error:', jobError.message);
      return { data: [], error: jobError.message };
    }

    const jobIdList = (jobIds || []).map((j: any) => j.id);

    if (jobIdList.length === 0) {
      return { data: [], error: null };
    }

    // Now fetch events for these jobs
    const { data: events, error } = await supabase
      .from('job_events')
      .select(`
        id,
        event_type,
        to_state,
        created_at
      `)
      .in('job_id', jobIdList)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      console.error('fetchRecentActivityEvents error:', error.message);
      return { data: [], error: error.message };
    }

    const activities: ActivityEvent[] = (events || []).map((e: Record<string, any>) => ({
      id: e.id,
      eventType: e.event_type,
      title: e.event_type.replace(/_/g, ' ').toUpperCase(),
      description: `Status transitioned to ${e.to_state}`,
      createdAt: e.created_at,
      toState: e.to_state,
    }));

    return { data: activities, error: null };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error fetching activity events';
    console.error('fetchRecentActivityEvents exception:', errorMsg);
    return { data: [], error: errorMsg };
  }
}
