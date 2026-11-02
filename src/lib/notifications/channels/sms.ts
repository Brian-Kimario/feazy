/**
 * src/lib/notifications/channels/sms.ts
 *
 * SMS adapter using AWS SNS for India (ap-south-1).
 *
 * TRAI / DLT compliance notes:
 *  - All commercial SMS in India requires DLT (Distributed Ledger Technology)
 *    registration with TRAI.
 *  - The sender ID (header) must be registered. We use "FEASY" (6-char alpha).
 *  - Every transactional SMS must include an opt-out instruction:
 *    "Reply STOP to unsubscribe" — already in all templates.
 *  - AWS SNS in ap-south-1 supports DLT sender IDs via MessageAttributes.
 *
 * Required env vars (server-only):
 *   AWS_ACCESS_KEY_ID         — IAM user with sns:Publish permission
 *   AWS_SECRET_ACCESS_KEY
 *   AWS_SNS_REGION            — default "ap-south-1"
 *   SMS_SENDER_ID             — default "FEASY" (must be DLT-registered)
 *
 * @see https://docs.aws.amazon.com/sns/latest/dg/sns-send-sms.html
 * @see https://trai.gov.in/notifications/regulation/telecom-commercial-communications
 */


export interface SMSSendPayload {
  /** E.164 format, e.g. "+919876543210" */
  to: string;
  /** Plain text body, max 160 chars (single SMS). Longer messages are split. */
  body: string;
}

export interface SMSSendResult {
  success: boolean;
  /** AWS SNS MessageId on success. */
  messageId?: string;
  error?: string;
}

// ─── Main adapter function ────────────────────────────────────────────────────

/**
 * Send an SMS via AWS SNS (India, ap-south-1).
 *
 * Never throws — errors are caught and returned so the orchestrator can
 * attempt the email fallback.
 */
export async function sendSMS(payload: SMSSendPayload): Promise<SMSSendResult> {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const region = process.env.AWS_SNS_REGION ?? "ap-south-1";
  const senderId = process.env.SMS_SENDER_ID ?? "FEASY";

  if (!accessKeyId || !secretAccessKey) {
    return {
      success: false,
      error:
        "SMS not configured: missing AWS_ACCESS_KEY_ID or AWS_SECRET_ACCESS_KEY",
    };
  }

  // Enforce 160-char hard limit for single-segment SMS.
  // Longer messages are valid but cost more (concatenated SMS).
  const body = payload.body.length > 160 ? payload.body.slice(0, 157) + "..." : payload.body;

  try {
    // Dynamic import keeps the AWS SDK out of the client bundle.
    // @ts-ignore - optional dependency
    const { SNSClient, PublishCommand } = (await import(
      // @ts-ignore
      "@aws-sdk/client-sns"
    )) as any;

    const client = new SNSClient({
      region,
      credentials: { accessKeyId, secretAccessKey },
    });

    const command = new PublishCommand({
      PhoneNumber: payload.to,
      Message: body,
      MessageAttributes: {
        // SNS SMS type — Transactional for higher delivery reliability.
        "AWS.SNS.SMS.SMSType": {
          DataType: "String",
          StringValue: "Transactional",
        },
        // DLT-registered sender ID for India.
        "AWS.SNS.SMS.SenderID": {
          DataType: "String",
          StringValue: senderId,
        },
      },
    });

    const response = await client.send(command);

    return {
      success: true,
      messageId: response.MessageId,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown SMS send error",
    };
  }
}
