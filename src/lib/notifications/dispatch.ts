/**
 * Drains queued notification_logs rows (written by the job-state trigger) through sendNotification.
 *
 * - Dry-run (live=false) only reads: it never claims, sends or writes.
 * - Live runs claim rows through claim_notifications() (FOR UPDATE SKIP LOCKED, one statement, no open
 *   transaction during the provider call), so overlapping runs cannot send the same row twice.
 * - Rows older than maxAgeMinutes are expired by the claim step and never sent.
 * - Retryable failures go back to the queue with backoff until the attempt limit; permanent ones fail.
 * - A claim that is never completed is not retried (the provider may already have accepted it); see the
 *   migration for the one unavoidable duplicate-risk case.
 */

import { randomUUID } from "node:crypto";
import { createTypedAdminClient } from "@/lib/admin/client";
import type { SendNotificationParams } from "./send";
import { retryDelaySeconds } from "./classify";
import type { NotificationResult, NotificationType } from "./types";
import type { NotificationData } from "./templates";

export interface QueuedRow {
  id: string;
  customer_id: string;
  job_id: string | null;
  notification_type: string;
  attempts: number;
  created_at?: string;
}

export interface DispatchSummary {
  live: boolean;
  considered: number;
  stale: number;
  due: number;
  claimed: number;
  sent: number;
  retried: number;
  failed: number;
  lostClaims: number;
}

export interface DispatchOptions {
  live: boolean;
  limit?: number;
  maxAgeMinutes?: number;
  leaseMinutes?: number;
  maxAttempts?: number;
}

export interface DispatchDeps {
  /** Read-only look at the queue, for dry-run. */
  peek(limit: number): Promise<{ created_at: string }[]>;
  claim(worker: string, o: { limit: number; maxAgeMinutes: number; leaseMinutes: number; maxAttempts: number }): Promise<QueuedRow[]>;
  complete(a: { id: string; worker: string; outcome: "sent" | "retry" | "failed"; channel?: string; providerId?: string; error?: string; retryAfterSeconds?: number }): Promise<boolean>;
  loadData(row: QueuedRow): Promise<NotificationData>;
  send(p: SendNotificationParams): Promise<NotificationResult>;
}

export const DEFAULT_MAX_ATTEMPTS = 5;

function defaultDeps(): DispatchDeps {
  return {
    async peek(limit) {
      const a = await createTypedAdminClient();
      const r = await a.from("notification_logs").select("created_at").eq("status", "pending").order("created_at", { ascending: true }).limit(limit);
      if (r.error) throw new Error(`queue read failed: ${r.error.message}`);
      return r.data ?? [];
    },
    async claim(worker, o) {
      const a = await createTypedAdminClient();
      const r = await a.rpc("claim_notifications" as never, {
        p_worker: worker,
        p_limit: o.limit,
        p_max_age: `${o.maxAgeMinutes} minutes`,
        p_lease: `${o.leaseMinutes} minutes`,
        p_max_attempts: o.maxAttempts,
      } as never);
      if (r.error) throw new Error(`claim failed (is migration 117 applied?): ${r.error.message}`);
      return (r.data ?? []) as unknown as QueuedRow[];
    },
    async complete(c) {
      const a = await createTypedAdminClient();
      const r = await a.rpc("complete_notification" as never, {
        p_id: c.id,
        p_worker: c.worker,
        p_outcome: c.outcome,
        p_channel: c.channel ?? null,
        p_provider_id: c.providerId ?? null,
        p_error: c.error ?? null,
        p_retry_after_seconds: c.retryAfterSeconds ?? 300,
      } as never);
      if (r.error) throw new Error(`complete failed: ${r.error.message}`);
      return r.data === true;
    },
    async loadData(row) {
      if (!row.job_id) return { customerName: "" };
      const a = await createTypedAdminClient();
      const job = await a
        .from("jobs")
        .select("professional_id, booking:bookings!jobs_booking_id_fkey(booking_reference, scheduled_start, service:services(name))")
        .eq("id", row.job_id)
        .maybeSingle();
      const b = job.data?.booking as unknown;
      const booking = (Array.isArray(b) ? b[0] : b) as { booking_reference?: string; scheduled_start?: string; service?: { name?: string } | { name?: string }[] } | null;
      const svc = Array.isArray(booking?.service) ? booking?.service[0] : booking?.service;
      let professionalName: string | undefined;
      if (job.data?.professional_id) {
        const p = await a.from("professional_profiles").select("display_name").eq("user_id", job.data.professional_id).maybeSingle();
        professionalName = p.data?.display_name ?? undefined;
      }
      return {
        customerName: "",
        jobRef: booking?.booking_reference,
        serviceName: svc?.name,
        professionalName,
        scheduledTime: booking?.scheduled_start
          ? new Date(booking.scheduled_start).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
          : undefined,
        appBaseUrl: process.env.NEXT_PUBLIC_APP_URL,
      };
    },
    // Loaded lazily so a dry-run never pulls in the provider adapters.
    async send(p) { return (await import("./send")).sendNotification(p); },
  };
}

export async function dispatchPending(opts: DispatchOptions, deps: DispatchDeps = defaultDeps()): Promise<DispatchSummary> {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100);
  const maxAgeMinutes = opts.maxAgeMinutes ?? 360;
  const leaseMinutes = opts.leaseMinutes ?? 5;
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const summary: DispatchSummary = { live: opts.live, considered: 0, stale: 0, due: 0, claimed: 0, sent: 0, retried: 0, failed: 0, lostClaims: 0 };

  if (!opts.live) {
    const rows = await deps.peek(limit);
    const cutoff = Date.now() - maxAgeMinutes * 60_000;
    summary.considered = rows.length;
    summary.due = rows.filter((r) => new Date(r.created_at).getTime() >= cutoff).length;
    summary.stale = rows.length - summary.due;
    return summary;
  }

  const worker = randomUUID();
  const claimed = await deps.claim(worker, { limit, maxAgeMinutes, leaseMinutes, maxAttempts });
  summary.considered = summary.due = summary.claimed = claimed.length;

  for (const row of claimed) {
    let outcome: "sent" | "retry" | "failed";
    let result: NotificationResult | undefined;
    let error: string | undefined;
    try {
      const data = await deps.loadData(row);
      result = await deps.send({ customerId: row.customer_id, jobId: row.job_id ?? undefined, type: row.notification_type as NotificationType, data, skipLog: true });
      if (result.success) outcome = "sent";
      else {
        error = result.error;
        outcome = result.retryable !== false && row.attempts < maxAttempts ? "retry" : "failed";
      }
    } catch (e) {
      // The provider may or may not have accepted the message, so an ambiguous outcome is never resent.
      error = e instanceof Error ? e.message : "unexpected dispatch error";
      outcome = "failed";
    }

    const recorded = await deps.complete({
      id: row.id,
      worker,
      outcome,
      channel: result?.success ? result.channel : undefined,
      providerId: result?.messageId,
      error,
      retryAfterSeconds: outcome === "retry" ? retryDelaySeconds(row.attempts) : undefined,
    });
    if (!recorded) summary.lostClaims++;
    if (outcome === "sent") summary.sent++;
    else if (outcome === "retry") summary.retried++;
    else summary.failed++;
  }
  return summary;
}
