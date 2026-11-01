/**
 * Drains queued notification_logs rows (written by the job-state trigger) through sendNotification.
 *
 * Safe by default: unless live is true it only reports what it would send and changes nothing.
 * Rows older than maxAgeMinutes are never sent (a late "arrived" message is worse than none); they are
 * counted as stale and left for an owner decision. The outcome is written back to the queued row.
 */

import { createTypedAdminClient } from "@/lib/admin/client";
import { sendNotification } from "./send";
import type { NotificationType } from "./types";

export interface DispatchSummary {
  live: boolean;
  considered: number;
  stale: number;
  due: number;
  sent: number;
  failed: number;
}


export async function dispatchPending(opts: { live: boolean; limit?: number; maxAgeMinutes?: number }): Promise<DispatchSummary> {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100);
  const cutoff = Date.now() - (opts.maxAgeMinutes ?? 360) * 60_000;
  const admin = await createTypedAdminClient();

  const res = await admin
    .from("notification_logs")
    .select("id, customer_id, job_id, notification_type, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);
  if (res.error) throw new Error(`queue read failed: ${res.error.message}`);

  const rows = res.data ?? [];
  const due = rows.filter((r) => new Date(r.created_at).getTime() >= cutoff);
  const summary: DispatchSummary = { live: opts.live, considered: rows.length, stale: rows.length - due.length, due: due.length, sent: 0, failed: 0 };
  if (!opts.live) return summary;

  for (const row of due) {
    let data = { customerName: "" } as Parameters<typeof sendNotification>[0]["data"];
    if (row.job_id) {
      const job = await admin
        .from("jobs")
        .select("professional_id, booking:bookings!jobs_booking_id_fkey(booking_reference, scheduled_start, service:services(name))")
        .eq("id", row.job_id)
        .maybeSingle();
      const b = job.data?.booking as unknown;
      const booking = (Array.isArray(b) ? b[0] : b) as { booking_reference?: string; scheduled_start?: string; service?: { name?: string } | { name?: string }[] } | null;
      const svc = Array.isArray(booking?.service) ? booking?.service[0] : booking?.service;
      let proName: string | undefined;
      if (job.data?.professional_id) {
        const p = await admin.from("professional_profiles").select("display_name").eq("user_id", job.data.professional_id).maybeSingle();
        proName = p.data?.display_name ?? undefined;
      }
      data = {
        customerName: "",
        jobRef: booking?.booking_reference,
        serviceName: svc?.name,
        professionalName: proName,
        scheduledTime: booking?.scheduled_start
          ? new Date(booking.scheduled_start).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
          : undefined,
        appBaseUrl: process.env.NEXT_PUBLIC_APP_URL,
      };
    }
    const out = await sendNotification({
      customerId: row.customer_id,
      jobId: row.job_id ?? undefined,
      type: row.notification_type as NotificationType,
      data,
      skipLog: true,
    });
    // Only the columns present on every deployed shape of the table.
    const upd = await admin
      .from("notification_logs")
      .update({ status: out.success ? "sent" : "failed", ...(out.success ? { sent_at: new Date().toISOString() } : {}) })
      .eq("id", row.id)
      .eq("status", "pending");
    if (upd.error) console.error("dispatch: could not record outcome:", upd.error.message);
    if (out.success) summary.sent++;
    else summary.failed++;
  }
  return summary;
}
