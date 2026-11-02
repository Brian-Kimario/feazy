/**
 * src/lib/notifications/channels/whatsapp.ts
 *
 * WhatsApp Business API adapter via Razorpay.
 *
 * Razorpay acts as a WhatsApp Business Solution Provider (BSP), meaning you
 * register templates through the Razorpay dashboard and they handle the Meta
 * template approval workflow.
 *
 * Template names registered with Meta must match WHATSAPP_TEMPLATES exactly.
 * All templates use utility category (free within 24-hour service window).
 *
 * Required env vars (server-only, never NEXT_PUBLIC_):
 *   RAZORPAY_WHATSAPP_API_KEY        — Razorpay API key
 *   RAZORPAY_WHATSAPP_PHONE_ID       — WhatsApp Business Phone Number ID
 *   RAZORPAY_WHATSAPP_BUSINESS_ACCOUNT_ID — WABA ID
 *
 * Docs: https://razorpay.com/docs/whatsapp-business/
 */


/** Shape of a single WhatsApp template parameter (text variable). */
export interface WhatsAppTemplateParam {
  type: "text";
  text: string;
}

/** Payload for one WhatsApp template message send request. */
export interface WhatsAppSendPayload {
  /** E.164 format, e.g. "+919876543210" */
  to: string;
  /** Template name exactly as registered with Meta via Razorpay. */
  templateName: string;
  /** Language code, always "en" for Feazy's English templates. */
  languageCode?: string;
  /** Ordered list of {{1}}, {{2}}, … variable values for the template body. */
  bodyParams: string[];
  /** Optional CTA button URL params if the template includes a URL button. */
  ctaUrlParam?: string;
}

export interface WhatsAppSendResult {
  success: boolean;
  /** Provider-assigned message ID on success. */
  messageId?: string;
  error?: string;
}

// ─── Razorpay WhatsApp API response shape ─────────────────────────────────────

interface RazorpayWhatsAppResponse {
  id?: string;
  status?: string;
  error?: {
    code?: string;
    description?: string;
  };
}

// ─── Main adapter function ────────────────────────────────────────────────────

/**
 * Send a pre-approved WhatsApp template message via Razorpay.
 *
 * Never throws — all errors are caught and returned in the result object so
 * the notification orchestrator can attempt fallback channels.
 */
export async function sendWhatsApp(
  payload: WhatsAppSendPayload
): Promise<WhatsAppSendResult> {
  const apiKey = process.env.RAZORPAY_WHATSAPP_API_KEY;
  const phoneId = process.env.RAZORPAY_WHATSAPP_PHONE_ID;

  if (!apiKey || !phoneId) {
    return {
      success: false,
      error:
        "WhatsApp not configured: missing RAZORPAY_WHATSAPP_API_KEY or RAZORPAY_WHATSAPP_PHONE_ID",
    };
  }

  try {
    // Build the Razorpay WhatsApp message payload.
    // Razorpay follows the Meta Cloud API message structure.
    const requestBody = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: payload.to,
      type: "template",
      template: {
        name: payload.templateName,
        language: {
          code: payload.languageCode ?? "en",
        },
        components: buildComponents(payload),
      },
    };

    const response = await fetch(
      `https://api.razorpay.com/v1/whatsapp/messages/${phoneId}/send`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${Buffer.from(apiKey + ":").toString("base64")}`,
        },
        body: JSON.stringify(requestBody),
      }
    );

    const data: RazorpayWhatsAppResponse = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error?.description ?? `HTTP ${response.status}`,
      };
    }

    return {
      success: true,
      messageId: data.id,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown WhatsApp send error",
    };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildComponents(
  payload: WhatsAppSendPayload
): Record<string, unknown>[] {
  const components: Record<string, unknown>[] = [];

  // Body parameters
  if (payload.bodyParams.length > 0) {
    components.push({
      type: "body",
      parameters: payload.bodyParams.map((text) => ({
        type: "text",
        text,
      })),
    });
  }

  // CTA URL button (if template has one)
  if (payload.ctaUrlParam) {
    components.push({
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: [
        {
          type: "text",
          text: payload.ctaUrlParam,
        },
      ],
    });
  }

  return components;
}
