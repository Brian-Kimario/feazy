/**
 * src/lib/notifications/channels/email.ts
 *
 * Email adapter using SendGrid.
 *
 * DPDP Act (India) compliance notes:
 *  - Every marketing/transactional email must include an unsubscribe link.
 *  - PII must not be logged in plain text.
 *  - Data retention: unsubscribe requests must be honoured within 30 days.
 *
 * The HTML templates in this file include:
 *  - A footer with unsubscribe link (placeholder — wire to actual preference URL).
 *  - A link to the privacy policy.
 *  - The Feasy company address (required by anti-spam laws).
 *
 * Required env vars (server-only):
 *   SENDGRID_API_KEY  — SendGrid API key with "Mail Send" permission
 *   EMAIL_FROM        — Verified sender, e.g. "noreply@feasy.in"
 *
 * @see https://docs.sendgrid.com/api-reference/mail-send/mail-send
 */


export interface EmailSendPayload {
  to: string;
  subject: string;
  /** Plain-text fallback (required for accessibility and spam filters). */
  text: string;
  /** Full HTML body. Should include unsubscribe link and privacy policy footer. */
  html: string;
}

export interface EmailSendResult {
  success: boolean;
  /** SendGrid message ID from the X-Message-Id response header. */
  messageId?: string;
  error?: string;
}

// ─── Main adapter function ────────────────────────────────────────────────────

/**
 * Send a transactional email via SendGrid.
 *
 * Never throws — errors are caught and returned so the orchestrator can
 * record the failure in notification_logs.
 */
export async function sendEmail(
  payload: EmailSendPayload
): Promise<EmailSendResult> {
  const apiKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.EMAIL_FROM ?? "noreply@feasy.in";

  if (!apiKey) {
    return {
      success: false,
      error: "Email not configured: missing SENDGRID_API_KEY",
    };
  }

  try {
    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        personalizations: [
          {
            to: [{ email: payload.to }],
          },
        ],
        from: { email: fromEmail, name: "Feasy" },
        subject: payload.subject,
        content: [
          { type: "text/plain", value: payload.text },
          { type: "text/html", value: payload.html },
        ],
        // Tracking settings — disable open/click tracking to reduce PII exposure.
        tracking_settings: {
          click_tracking: { enable: false },
          open_tracking: { enable: false },
        },
      }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const detail =
        // SendGrid error shape: { errors: [{ message }] }
        (body as { errors?: { message: string }[] }).errors?.[0]?.message ??
        `HTTP ${response.status}`;
      return { success: false, error: detail };
    }

    // SendGrid returns 202 with no body; the message ID is in the header.
    const messageId = response.headers.get("X-Message-Id") ?? undefined;

    return { success: true, messageId };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown email send error",
    };
  }
}

// ─── HTML template helper ─────────────────────────────────────────────────────

/**
 * Wraps content in a minimal, on-brand HTML email shell.
 * Includes the DPDP-required unsubscribe link and privacy policy reference.
 *
 * @param customerName  Display name for the greeting.
 * @param content       Inner HTML (the notification-specific content).
 * @param unsubscribeUrl  URL to the customer's notification preference page.
 */
export function buildEmailHtml(
  customerName: string,
  content: string,
  unsubscribeUrl: string
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Feasy Notification</title>
  <style>
    body { margin: 0; padding: 0; font-family: Inter, Arial, sans-serif; background: #F4F5F3; color: #0A0B0D; }
    .wrapper { max-width: 600px; margin: 32px auto; background: #ffffff; border-radius: 8px; overflow: hidden; }
    .header  { background: #0A0B0D; padding: 24px 32px; }
    .header h1 { margin: 0; font-size: 22px; color: #5FE3B0; letter-spacing: -0.5px; }
    .body    { padding: 32px; }
    .greeting { font-size: 16px; margin-bottom: 16px; }
    .footer  { background: #F4F5F3; padding: 20px 32px; font-size: 12px; color: #6b7280; text-align: center; }
    .footer a { color: #5FE3B0; text-decoration: none; }
    .divider { border: none; border-top: 1px solid #e5e7eb; margin: 24px 0; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>Feasy</h1>
    </div>
    <div class="body">
      <p class="greeting">Hi ${escapeHtml(customerName)},</p>
      ${content}
    </div>
    <hr class="divider" />
    <div class="footer">
      <p>
        Feasy | Bengaluru, Karnataka, India<br />
        <a href="${unsubscribeUrl}">Manage notification preferences</a> &nbsp;·&nbsp;
        <a href="https://feasy.in/privacy">Privacy Policy</a>
      </p>
      <p>
        You are receiving this because you have an active Feasy account.<br />
        To stop receiving these emails, update your
        <a href="${unsubscribeUrl}">notification preferences</a>.
      </p>
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
