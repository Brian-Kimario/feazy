/**
 * src/lib/notifications/templates.ts
 *
 * Message content for every notification type on every channel.
 * Pure data — no side effects, no I/O.
 *
 * WhatsApp templates must be pre-approved by Meta through the Razorpay
 * WhatsApp Business console before they can be sent in production.
 * Template names here must match the approved names exactly.
 *
 * Template variable conventions:
 *   WhatsApp: bodyParams[] maps to {{1}}, {{2}}, … in the approved template body.
 *   SMS:      Plain interpolated string, ≤160 chars per segment.
 *   Email:    subject + HTML content string (wrapped by buildEmailHtml in email.ts).
 */

import type { NotificationChannel, NotificationType } from "./types";
import { buildEmailHtml } from "./channels/email";

// ─── Data bag passed by the caller ───────────────────────────────────────────

/**
 * Contextual variables for each notification type.
 * All values are strings so they can be dropped into templates verbatim.
 */
export interface NotificationData {
  // Shared
  customerName: string;
  jobRef?: string;        // e.g. "JOB-00123"

  // job_assigned, arrived, job_completed
  serviceName?: string;
  professionalName?: string;
  scheduledTime?: string; // human-readable, e.g. "Today 2:00 PM"
  address?: string;

  // quote_ready
  quoteAmount?: string;   // e.g. "₹4,500"
  quoteExpiry?: string;   // e.g. "Oct 5, 2026"

  // payment_received, payment_failed
  paymentAmount?: string; // e.g. "₹5,000"
  retryLink?: string;

  // cancellation
  rebookLink?: string;

  // For email deep links (app base URL)
  appBaseUrl?: string;
}

// ─── Output shape ─────────────────────────────────────────────────────────────

export interface WhatsAppTemplateMessage {
  /** Registered Meta template name. */
  templateName: string;
  /** Ordered values for {{1}}, {{2}}, … placeholders in the template body. */
  bodyParams: string[];
  /** URL suffix for a CTA button if the template has one. */
  ctaUrlParam?: string;
}

export interface SMSMessage {
  body: string;
}

export interface EmailMessage {
  subject: string;
  text: string;
  html: string;
}

// ─── Template builder ─────────────────────────────────────────────────────────

/**
 * Build the channel-specific message payload for a given notification event.
 *
 * Returns undefined if the channel is not applicable for this notification type
 * (e.g. WhatsApp is not used for payment_failed — SMS is the primary there).
 */
export function buildMessage(
  type: NotificationType,
  channel: NotificationChannel,
  data: NotificationData
): WhatsAppTemplateMessage | SMSMessage | EmailMessage | undefined {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.feasy.in";
  const jobPath = data.jobRef ? `/app/jobs/${data.jobRef}` : "/app";
  const jobUrl = `${data.appBaseUrl ?? base}${jobPath}`;
  const prefUrl = `${data.appBaseUrl ?? base}/app/profile/notifications`;

  switch (type) {
    // ── job_assigned ────────────────────────────────────────────────────────
    case "job_assigned": {
      if (channel === "whatsapp") {
        return {
          // Template body (approved):
          // "🔧 Your {{1}} job has been assigned. {{2}} will arrive by {{3}}."
          templateName: "fixify_job_assigned",
          bodyParams: [
            data.serviceName ?? "service",
            data.professionalName ?? "your professional",
            data.scheduledTime ?? "the scheduled time",
          ],
          ctaUrlParam: jobUrl,
        };
      }
      if (channel === "sms") {
        return {
          body: truncate160(
            `Feazy: ${data.professionalName ?? "A professional"} assigned to your ${data.serviceName ?? "job"}. Arriving by ${data.scheduledTime ?? "scheduled time"}. ${jobUrl} Reply STOP to unsubscribe.`
          ),
        };
      }
      if (channel === "email") {
        const subject = `Professional assigned — ${data.serviceName ?? "Your Job"} | Feazy`;
        const text = `Hi ${data.customerName}, ${data.professionalName ?? "A professional"} has been assigned to your ${data.serviceName ?? "job"} and will arrive by ${data.scheduledTime ?? "the scheduled time"}. View job: ${jobUrl}`;
        const html = buildEmailHtml(
          data.customerName,
          `<p>Your <strong>${escHtml(data.serviceName ?? "job")}</strong> has been assigned.</p>
           <table style="margin:16px 0; border-collapse:collapse; width:100%;">
             <tr><td style="padding:8px 0; color:#6b7280; font-size:14px;">Professional</td><td style="padding:8px 0; font-weight:600;">${escHtml(data.professionalName ?? "—")}</td></tr>
             <tr><td style="padding:8px 0; color:#6b7280; font-size:14px;">Arriving by</td><td style="padding:8px 0;">${escHtml(data.scheduledTime ?? "—")}</td></tr>
             <tr><td style="padding:8px 0; color:#6b7280; font-size:14px;">Address</td><td style="padding:8px 0;">${escHtml(data.address ?? "—")}</td></tr>
           </table>
           <a href="${jobUrl}" style="display:inline-block;background:#5FE3B0;color:#0A0B0D;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;margin-top:8px;">View Job</a>`,
          prefUrl
        );
        return { subject, text, html };
      }
      return undefined;
    }

    // ── arrived ─────────────────────────────────────────────────────────────
    case "arrived": {
      if (channel === "whatsapp") {
        return {
          // Template body:
          // "🏠 {{1}} has arrived at {{2}}. Your {{3}} job is starting."
          templateName: "fixify_arrived",
          bodyParams: [
            data.professionalName ?? "Your professional",
            data.address ?? "your property",
            data.serviceName ?? "service",
          ],
        };
      }
      if (channel === "sms") {
        return {
          body: truncate160(
            `Feazy: ${data.professionalName ?? "Professional"} arrived at your property. ${data.serviceName ?? "Job"} starting now. ${jobUrl} Reply STOP to unsubscribe.`
          ),
        };
      }
      if (channel === "email") {
        const subject = `Professional has arrived — ${data.serviceName ?? "Your Job"} | Feazy`;
        const text = `Hi ${data.customerName}, ${data.professionalName ?? "Your professional"} has arrived at ${data.address ?? "your property"} and is starting your ${data.serviceName ?? "job"} now.`;
        const html = buildEmailHtml(
          data.customerName,
          `<p><strong>${escHtml(data.professionalName ?? "Your professional")}</strong> has arrived at <strong>${escHtml(data.address ?? "your property")}</strong> and is starting your <strong>${escHtml(data.serviceName ?? "job")}</strong>.</p>
           <a href="${jobUrl}" style="display:inline-block;background:#5FE3B0;color:#0A0B0D;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;margin-top:16px;">Track Job</a>`,
          prefUrl
        );
        return { subject, text, html };
      }
      return undefined;
    }

    // ── quote_ready ─────────────────────────────────────────────────────────
    case "quote_ready": {
      if (channel === "whatsapp") {
        return {
          // Template body:
          // "📋 A quote of {{1}} is ready for your {{2}} job. Valid until {{3}}. Please approve or decline."
          templateName: "fixify_quote_ready",
          bodyParams: [
            data.quoteAmount ?? "the quoted amount",
            data.serviceName ?? "service",
            data.quoteExpiry ?? "the expiry date",
          ],
          ctaUrlParam: jobUrl,
        };
      }
      if (channel === "sms") {
        return {
          body: truncate160(
            `Feazy: Quote ${data.quoteAmount ?? ""} ready for your ${data.serviceName ?? "job"}. Expires ${data.quoteExpiry ?? "soon"}. Approve: ${jobUrl} Reply STOP to unsubscribe.`
          ),
        };
      }
      if (channel === "email") {
        const subject = `Quote ready — ${data.quoteAmount ?? ""} for ${data.serviceName ?? "your job"} | Feazy`;
        const text = `Hi ${data.customerName}, a quote of ${data.quoteAmount ?? "the quoted amount"} is ready for your ${data.serviceName ?? "job"}. Valid until ${data.quoteExpiry ?? "the expiry date"}. Review: ${jobUrl}`;
        const html = buildEmailHtml(
          data.customerName,
          `<p>Your professional has submitted a quote for your <strong>${escHtml(data.serviceName ?? "job")}</strong>.</p>
           <table style="margin:16px 0; border-collapse:collapse; width:100%;">
             <tr><td style="padding:8px 0; color:#6b7280; font-size:14px;">Amount</td><td style="padding:8px 0; font-weight:600; font-size:20px;">${escHtml(data.quoteAmount ?? "—")}</td></tr>
             <tr><td style="padding:8px 0; color:#6b7280; font-size:14px;">Valid until</td><td style="padding:8px 0;">${escHtml(data.quoteExpiry ?? "—")}</td></tr>
           </table>
           <p style="color:#6b7280; font-size:14px;">Review the full quote breakdown before approving.</p>
           <a href="${jobUrl}" style="display:inline-block;background:#5FE3B0;color:#0A0B0D;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;margin-top:8px;">Review Quote</a>`,
          prefUrl
        );
        return { subject, text, html };
      }
      return undefined;
    }

    // ── payment_received ────────────────────────────────────────────────────
    case "payment_received": {
      if (channel === "whatsapp") {
        return {
          // Template body:
          // "✅ Payment of {{1}} received for job #{{2}}. Thank you for using Feazy!"
          templateName: "fixify_payment_received",
          bodyParams: [
            data.paymentAmount ?? "your payment",
            data.jobRef ?? "",
          ],
          ctaUrlParam: jobUrl,
        };
      }
      if (channel === "sms") {
        return {
          body: truncate160(
            `Feazy: Payment ${data.paymentAmount ?? ""} received for job #${data.jobRef ?? ""}. Thank you! ${jobUrl} Reply STOP to unsubscribe.`
          ),
        };
      }
      if (channel === "email") {
        const subject = `Payment confirmed — ${data.paymentAmount ?? ""} | Feazy`;
        const text = `Hi ${data.customerName}, payment of ${data.paymentAmount ?? "your payment"} for job #${data.jobRef ?? ""} has been received. View invoice: ${jobUrl}`;
        const html = buildEmailHtml(
          data.customerName,
          `<p>Your payment has been received successfully.</p>
           <table style="margin:16px 0; border-collapse:collapse; width:100%;">
             <tr><td style="padding:8px 0; color:#6b7280; font-size:14px;">Amount</td><td style="padding:8px 0; font-weight:600; font-size:20px;">${escHtml(data.paymentAmount ?? "—")}</td></tr>
             <tr><td style="padding:8px 0; color:#6b7280; font-size:14px;">Job</td><td style="padding:8px 0;">#${escHtml(data.jobRef ?? "—")}</td></tr>
             <tr><td style="padding:8px 0; color:#6b7280; font-size:14px;">Service</td><td style="padding:8px 0;">${escHtml(data.serviceName ?? "—")}</td></tr>
           </table>
           <a href="${jobUrl}" style="display:inline-block;background:#5FE3B0;color:#0A0B0D;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;margin-top:8px;">Download Invoice</a>`,
          prefUrl
        );
        return { subject, text, html };
      }
      return undefined;
    }

    // ── job_completed ────────────────────────────────────────────────────────
    case "job_completed": {
      if (channel === "whatsapp") {
        return {
          // Template body:
          // "🎉 Your {{1}} job has been completed by {{2}}. Please leave a review!"
          templateName: "fixify_job_completed",
          bodyParams: [
            data.serviceName ?? "service",
            data.professionalName ?? "your professional",
          ],
          ctaUrlParam: jobUrl,
        };
      }
      if (channel === "sms") {
        return {
          body: truncate160(
            `Feazy: Your ${data.serviceName ?? "job"} is complete! Rate ${data.professionalName ?? "your professional"}: ${jobUrl} Reply STOP to unsubscribe.`
          ),
        };
      }
      if (channel === "email") {
        const subject = `Job completed — ${data.serviceName ?? "Your Job"} | Feazy`;
        const text = `Hi ${data.customerName}, your ${data.serviceName ?? "job"} has been completed by ${data.professionalName ?? "your professional"}. View invoice and leave a review: ${jobUrl}`;
        const html = buildEmailHtml(
          data.customerName,
          `<p>Your <strong>${escHtml(data.serviceName ?? "job")}</strong> has been completed by <strong>${escHtml(data.professionalName ?? "your professional")}</strong>. 🎉</p>
           <p style="color:#6b7280; font-size:14px;">Your invoice is available to download. Help future customers by leaving a review.</p>
           <div style="display:flex; gap:12px; margin-top:16px;">
             <a href="${jobUrl}" style="display:inline-block;background:#5FE3B0;color:#0A0B0D;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;">Rate &amp; Review</a>
             <a href="${jobUrl}/invoice" style="display:inline-block;background:#f3f4f6;color:#0A0B0D;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;">Download Invoice</a>
           </div>`,
          prefUrl
        );
        return { subject, text, html };
      }
      return undefined;
    }

    // ── payment_failed (bypasses DND) ────────────────────────────────────────
    case "payment_failed": {
      // WhatsApp is NOT used for payment failures — send SMS first.
      // (Payment failure requires immediate action; SMS is more reliable for urgency.)
      if (channel === "sms") {
        return {
          body: truncate160(
            `Feazy: Payment ${data.paymentAmount ?? ""} for job #${data.jobRef ?? ""} FAILED. Retry now: ${data.retryLink ?? jobUrl} Reply STOP to unsubscribe.`
          ),
        };
      }
      if (channel === "email") {
        const subject = `Action required: Payment failed — ${data.paymentAmount ?? ""} | Feazy`;
        const text = `Hi ${data.customerName}, your payment of ${data.paymentAmount ?? ""} for job #${data.jobRef ?? ""} failed. Please retry: ${data.retryLink ?? jobUrl}`;
        const html = buildEmailHtml(
          data.customerName,
          `<p style="color:#dc2626; font-weight:600;">Your payment could not be processed.</p>
           <table style="margin:16px 0; border-collapse:collapse; width:100%;">
             <tr><td style="padding:8px 0; color:#6b7280; font-size:14px;">Amount</td><td style="padding:8px 0; font-weight:600;">${escHtml(data.paymentAmount ?? "—")}</td></tr>
             <tr><td style="padding:8px 0; color:#6b7280; font-size:14px;">Job</td><td style="padding:8px 0;">#${escHtml(data.jobRef ?? "—")}</td></tr>
           </table>
           <p style="font-size:14px;">Please retry your payment to ensure your job continues.</p>
           <a href="${data.retryLink ?? jobUrl}" style="display:inline-block;background:#dc2626;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;margin-top:8px;">Retry Payment</a>`,
          prefUrl
        );
        return { subject, text, html };
      }
      return undefined;
    }

    // ── cancellation (bypasses DND) ──────────────────────────────────────────
    case "cancellation": {
      if (channel === "whatsapp") {
        return {
          // Template body:
          // "Your {{1}} job #{{2}} has been cancelled. We're sorry for the inconvenience."
          templateName: "fixify_cancellation",
          bodyParams: [
            data.serviceName ?? "service",
            data.jobRef ?? "",
          ],
          ctaUrlParam: data.rebookLink ?? base,
        };
      }
      if (channel === "sms") {
        return {
          body: truncate160(
            `Feazy: Your ${data.serviceName ?? "job"} #${data.jobRef ?? ""} was cancelled. Rebook: ${data.rebookLink ?? base} Reply STOP to unsubscribe.`
          ),
        };
      }
      if (channel === "email") {
        const subject = `Job cancelled — ${data.serviceName ?? "Your Job"} | Feazy`;
        const text = `Hi ${data.customerName}, your ${data.serviceName ?? "job"} #${data.jobRef ?? ""} has been cancelled. Rebook: ${data.rebookLink ?? base}`;
        const html = buildEmailHtml(
          data.customerName,
          `<p>Your <strong>${escHtml(data.serviceName ?? "job")}</strong> (job #${escHtml(data.jobRef ?? "—")}) has been cancelled.</p>
           <p style="color:#6b7280; font-size:14px;">We're sorry for the inconvenience. You can rebook a similar service at any time.</p>
           <a href="${data.rebookLink ?? base}" style="display:inline-block;background:#5FE3B0;color:#0A0B0D;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;margin-top:16px;">Rebook Service</a>`,
          prefUrl
        );
        return { subject, text, html };
      }
      return undefined;
    }

    default:
      return undefined;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Truncate a string to 160 characters for single-segment SMS. */
function truncate160(str: string): string {
  return str.length > 160 ? str.slice(0, 157) + "..." : str;
}

function escHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
