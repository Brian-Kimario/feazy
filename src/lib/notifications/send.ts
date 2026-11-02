/**
 * src/lib/notifications/send.ts
 *
 * Main notification orchestrator for Feazy.
 *
 * Strategy (India-optimised, per PHASE_10_NOTIFICATION_STRATEGY.md):
 *   1. Fetch customer preferences using service-role client (never trust caller-supplied prefs).
 *   2. Check Do Not Disturb window (IST / Asia/Kolkata).
 *      payment_failed and cancellation bypass DND — they are time-critical.
 *   3. Try channels in priority order: WhatsApp → SMS → Email.
 *      payment_failed starts at SMS (WhatsApp not used for failures).
 *   4. Log every attempt to notification_logs via service-role INSERT.
 *   5. Never throw — notification failure must not roll back a state transition.
 *
 * Call this AFTER the authoritative DB write succeeds. Wrap in try/catch at
 * the call site if you want belt-and-suspenders safety.
 */


import { createAdminClient } from "@/lib/supabase/admin";
import type { NotificationChannel, NotificationPreferences, NotificationResult, NotificationType } from "./types";
import { buildMessage, type NotificationData } from "./templates";
import { sendWhatsApp } from "./channels/whatsapp";
import { sendSMS } from "./channels/sms";
import { sendEmail } from "./channels/email";
import { isTransientError } from "./classify";

// ─── Public interface ─────────────────────────────────────────────────────────

export interface SendNotificationParams {
  /** UUID of the customer in profiles. */
  customerId: string;
  /** UUID of the related job, if any. */
  jobId?: string;
  /** The notification event type. */
  type: NotificationType;
  /** Template variable data. */
  data: NotificationData;
  /** Set by the dispatcher, which records the outcome on the queued row itself. */
  skipLog?: boolean;
}

/**
 * Send a notification to a customer across the best available channel.
 *
 * Never throws. All errors are caught and recorded in notification_logs.
 */
export async function sendNotification(
  params: SendNotificationParams
): Promise<NotificationResult> {
  const { customerId, jobId, type, data, skipLog } = params;

  try {
    // ── 1. Fetch customer contact info and preferences ──────────────────────
    const admin = await createAdminClient();

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("phone, whatsapp_number, email: id, notification_preferences, full_name")
      // Re-select email from auth.users isn't directly possible via this table,
      // so we join — but profiles doesn't store email. We use a separate query.
      .eq("id", customerId)
      .single();

    if (profileError || !profile) {
      await writeLog(admin, {
        skip: skipLog,
        customerId,
        jobId,
        type,
        channelAttempted: "email",
        channelDelivered: null,
        status: "failed",
        error: profileError?.message ?? "Customer profile not found",
      });
      return { success: false, channel: "none", error: "Customer profile not found", retryable: false };
    }

    // Fetch email from auth.users via admin (profiles table doesn't store it).
    const { data: authUser } = await admin.auth.admin.getUserById(customerId);
    const customerEmail = authUser?.user?.email ?? null;
    const customerName = (profile as Record<string, unknown>).full_name as string | null ?? "there";
    const whatsappNumber = (profile as Record<string, unknown>).whatsapp_number as string | null;
    const phone = (profile as Record<string, unknown>).phone as string | null;

    const prefs: NotificationPreferences = {
      whatsapp_enabled: true,
      sms_enabled: true,
      email_enabled: true,
      do_not_disturb_start: "19:00",
      do_not_disturb_end: "09:00",
      ...((profile as Record<string, unknown>).notification_preferences as Partial<NotificationPreferences> ?? {}),
    };

    // ── 2. Check Do Not Disturb ──────────────────────────────────────────────
    const bypassDnd = type === "payment_failed" || type === "cancellation";

    if (!bypassDnd && isInDndWindow(prefs.do_not_disturb_start, prefs.do_not_disturb_end)) {
      await writeLog(admin, {
        skip: skipLog,
        customerId,
        jobId,
        type,
        channelAttempted: "whatsapp",
        channelDelivered: null,
        status: "skipped_dnd",
        error: null,
      });
      return { success: false, channel: "none", error: "Notification suppressed: DND window active", retryable: true };
    }

    // ── 3. Determine channel order ────────────────────────────────────────────
    // payment_failed: SMS first (WhatsApp not used for failures — urgency).
    // All others: WhatsApp → SMS → Email.
    const channelOrder: NotificationChannel[] =
      type === "payment_failed"
        ? ["sms", "email"]
        : ["whatsapp", "sms", "email"];

    // ── 4. Try channels in order ──────────────────────────────────────────────
    let anyTransient = false;
    for (const channel of channelOrder) {
      // Skip if disabled in preferences.
      if (channel === "whatsapp" && !prefs.whatsapp_enabled) continue;
      if (channel === "sms" && !prefs.sms_enabled) continue;
      // email_enabled is always true (compliance requirement).

      // Build the message payload for this channel.
      const enrichedData: NotificationData = {
        ...data,
        customerName: data.customerName || customerName,
      };

      const messagePayload = buildMessage(type, channel, enrichedData);
      if (!messagePayload) continue; // channel not applicable for this type

      let result: { success: boolean; messageId?: string; error?: string };

      if (channel === "whatsapp") {
        const recipient = whatsappNumber ?? phone;
        if (!recipient) {
          result = { success: false, error: "No WhatsApp number on file" };
        } else {
          const wp = messagePayload as { templateName: string; bodyParams: string[]; ctaUrlParam?: string };
          result = await sendWhatsApp({
            to: recipient,
            templateName: wp.templateName,
            bodyParams: wp.bodyParams,
            ctaUrlParam: wp.ctaUrlParam,
          });
        }
      } else if (channel === "sms") {
        const recipient = phone ?? whatsappNumber;
        if (!recipient) {
          result = { success: false, error: "No phone number on file" };
        } else {
          const sms = messagePayload as { body: string };
          result = await sendSMS({ to: recipient, body: sms.body });
        }
      } else {
        // email
        if (!customerEmail) {
          result = { success: false, error: "No email address on file" };
        } else {
          const em = messagePayload as { subject: string; text: string; html: string };
          result = await sendEmail({
            to: customerEmail,
            subject: em.subject,
            text: em.text,
            html: em.html,
          });
        }
      }

      // Log this attempt.
      await writeLog(admin, {
        skip: skipLog,
        customerId,
        jobId,
        type,
        channelAttempted: channelOrder[0], // first channel in the order (the intended primary)
        channelDelivered: result.success ? channel : null,
        status: result.success ? "sent" : "failed",
        providerId: result.messageId,
        error: result.success ? null : result.error,
      });

      if (result.success) {
        return { success: true, channel, messageId: result.messageId };
      }
      if (isTransientError(result.error)) anyTransient = true;

      // Channel failed — try next in order.
    }

    // All channels failed.
    return { success: false, channel: "none", error: "All notification channels failed", retryable: anyTransient };

  } catch (err) {
    // Unexpected error — log to console but never propagate.
    console.error("[sendNotification] Unexpected error:", err);
    return {
      success: false,
      channel: "none",
      error: err instanceof Error ? err.message : "Unexpected notification error",
      retryable: true,
    };
  }
}

// ─── DND helper ──────────────────────────────────────────────────────────────

/**
 * Returns true if the current time in IST (Asia/Kolkata) falls inside the
 * Do Not Disturb window.
 *
 * Handles overnight windows correctly, e.g. 19:00 – 09:00 spans midnight.
 *
 * @param startHHMM  e.g. "19:00"
 * @param endHHMM    e.g. "09:00"
 */
function isInDndWindow(startHHMM: string, endHHMM: string): boolean {
  try {
    const nowIST = new Date(
      new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
    );
    const nowMinutes = nowIST.getHours() * 60 + nowIST.getMinutes();

    const [sh, sm] = startHHMM.split(":").map(Number);
    const [eh, em] = endHHMM.split(":").map(Number);
    const startMin = sh * 60 + sm;
    const endMin = eh * 60 + em;

    if (startMin < endMin) {
      // Same-day window, e.g. 02:00 – 06:00
      return nowMinutes >= startMin && nowMinutes < endMin;
    } else {
      // Overnight window, e.g. 19:00 – 09:00
      return nowMinutes >= startMin || nowMinutes < endMin;
    }
  } catch {
    // If timezone detection fails, allow the notification through.
    return false;
  }
}

// ─── Log helper ───────────────────────────────────────────────────────────────

interface LogParams {
  customerId: string;
  jobId?: string;
  type: NotificationType;
  channelAttempted: NotificationChannel;
  channelDelivered: NotificationChannel | null;
  status: "sent" | "delivered" | "failed" | "skipped_dnd";
  providerId?: string;
  error: string | null;
  skip?: boolean;
}

async function writeLog(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  params: LogParams
): Promise<void> {
  try {
    if (params.skip) return;
    await admin.from("notification_logs").insert({
      customer_id: params.customerId,
      job_id: params.jobId ?? null,
      notification_type: params.type,
      channel_attempted: params.channelAttempted,
      channel_delivered: params.channelDelivered,
      status: params.status,
      provider_message_id: params.providerId ?? null,
      error_message: params.error,
    });
  } catch (logErr) {
    // Log write failure is non-fatal.
    console.error("[sendNotification] Failed to write notification_log:", logErr);
  }
}
