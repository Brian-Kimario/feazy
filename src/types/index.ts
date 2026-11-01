/**
 * TypeScript type definitions and interfaces
 * Centralized types for the application
 */

// User Types
export interface User {
  id: string;
  email: string;
  name: string;
  role: "property_manager" | "professional" | "admin";
  created_at: string;
  updated_at: string;
}

// Job Types
export interface Job {
  id: string;
  title: string;
  description: string;
  status: "open" | "assigned" | "in_progress" | "completed" | "cancelled";
  created_at: string;
  updated_at: string;
}

// Bid Types
export interface Bid {
  id: string;
  job_id: string;
  professional_id: string;
  amount: number;
  status: "pending" | "accepted" | "rejected" | "completed";
  created_at: string;
  updated_at: string;
}

// ─── Notification Types ───────────────────────────────────────────────────────

/**
 * All notification event types supported by Feasy.
 * Maps 1:1 to the CHECK constraint in notification_logs.notification_type.
 */
export type NotificationType =
  | "job_assigned"        // Professional assigned to a booking
  | "arrived"             // Professional arrived on-site
  | "quote_ready"         // Professional submitted a quote
  | "payment_received"    // Payment captured successfully
  | "job_completed"       // Job moved to completed state
  | "payment_failed"      // Payment capture failed (bypasses DND)
  | "cancellation";       // Job or booking cancelled (bypasses DND)

/**
 * Delivery channels in priority order: WhatsApp → SMS → Email.
 * Maps 1:1 to the CHECK constraints in notification_logs.
 */
export type NotificationChannel = "whatsapp" | "sms" | "email";

/**
 * Per-customer notification opt-in flags and Do Not Disturb window.
 * Stored as JSONB in profiles.notification_preferences.
 * Times are "HH:MM" in IST (Asia/Kolkata).
 */
export interface NotificationPreferences {
  whatsapp_enabled: boolean;
  sms_enabled: boolean;
  /** Always true — email is required for compliance (DPDP Act). Cannot be disabled. */
  email_enabled: boolean;
  /** 24-hr IST time string, e.g. "19:00". Notifications are suppressed from this time... */
  do_not_disturb_start: string;
  /** ...until this time, e.g. "09:00". payment_failed and cancellation bypass DND. */
  do_not_disturb_end: string;
}

/**
 * A row in the notification_logs table.
 * Append-only — no UPDATE or DELETE.
 */
export interface NotificationLog {
  id: string;
  customer_id: string;
  job_id: string | null;
  notification_type: NotificationType;
  /** The first channel tried. */
  channel_attempted: NotificationChannel;
  /** The channel that actually delivered the message. Null if all channels failed. */
  channel_delivered: NotificationChannel | null;
  status: "sent" | "delivered" | "failed" | "skipped_dnd";
  /** Provider-level message ID (Razorpay, AWS SNS, SendGrid, etc.) */
  provider_message_id: string | null;
  error_message: string | null;
  created_at: string;
}

/**
 * Return value from sendNotification().
 */
export interface NotificationResult {
  success: boolean;
  channel: NotificationChannel | "none";
  /** Set when success is false. */
  error?: string;
  /** Provider message id when a channel accepted the message. */
  messageId?: string;
  /** On failure: true when trying again later may succeed. */
  retryable?: boolean;
}
