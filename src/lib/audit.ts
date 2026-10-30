/**
 * Comprehensive Audit Logging System
 * 
 * Tracks:
 * - Admin activities and changes
 * - Failed access attempts
 * - Role changes and escalations
 * - Data access patterns
 * - API calls and modifications
 * - Security events
 */

import { createClient } from "@supabase/supabase-js";

export enum AuditAction {
  // Authentication events
  LOGIN_SUCCESS = "auth.login_success",
  LOGIN_FAILED = "auth.login_failed",
  LOGOUT = "auth.logout",
  SESSION_EXPIRED = "auth.session_expired",
  SESSION_REFRESH = "auth.session_refresh",
  TOKEN_ROTATED = "auth.token_rotated",

  // Admin panel events
  ADMIN_LOGIN = "admin.login",
  ADMIN_LOGOUT = "admin.logout",
  ADMIN_VIEW_USERS = "admin.view_users",
  ADMIN_VIEW_BOOKINGS = "admin.view_bookings",
  ADMIN_VIEW_JOBS = "admin.view_jobs",
  ADMIN_VIEW_PAYMENTS = "admin.view_payments",
  ADMIN_VIEW_AUDIT_LOGS = "admin.view_audit_logs",

  // User management
  USER_CREATED = "user.created",
  USER_UPDATED = "user.updated",
  USER_DELETED = "user.deleted",
  USER_ROLE_CHANGED = "user.role_changed",
  USER_PROFILE_UPDATED = "user.profile_updated",

  // Booking/Job management
  BOOKING_CREATED = "booking.created",
  BOOKING_UPDATED = "booking.updated",
  BOOKING_CANCELLED = "booking.cancelled",
  JOB_CREATED = "job.created",
  JOB_UPDATED = "job.updated",
  JOB_ASSIGNED = "job.assigned",

  // Payment events
  PAYMENT_CREATED = "payment.created",
  PAYMENT_PROCESSED = "payment.processed",
  PAYMENT_FAILED = "payment.failed",
  PAYMENT_REFUNDED = "payment.refunded",

  // Security events
  UNAUTHORIZED_ACCESS = "security.unauthorized_access",
  ROLE_ESCALATION_ATTEMPT = "security.role_escalation_attempt",
  SUSPICIOUS_ACTIVITY = "security.suspicious_activity",
  RATE_LIMIT_EXCEEDED = "security.rate_limit_exceeded",
  INVALID_CSRF_TOKEN = "security.invalid_csrf_token",
  DEVICE_FINGERPRINT_MISMATCH = "security.device_fingerprint_mismatch",
}

/** Privileged admin operations, recorded as `admin.<domain>.<verb>.<requested|succeeded|failed>`. */
export type AdminAuditAction = `admin.${string}`;

export enum AuditSeverity {
  INFO = "info",
  WARNING = "warning",
  CRITICAL = "critical",
}

export interface AuditLogEntry {
  id?: string;
  user_id: string;
  action: AuditAction | AdminAuditAction;
  severity: AuditSeverity;
  resource_type?: string; // "user", "booking", "payment", etc.
  resource_id?: string;
  changes?: Record<string, any>;
  ip_address?: string;
  user_agent?: string;
  success: boolean;
  error_message?: string;
  created_at?: string;
  created_by?: string;
}

/**
 * Create audit client with service role for writing logs
 */
function createAuditClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Log an audit event
 */
export async function logAuditEvent(
  entry: AuditLogEntry
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createAuditClient();

    // Sanitize changes object to prevent sensitive data logging
    const sanitizedEntry = {
      ...entry,
      changes: sanitizeChanges(entry.changes),
    };

    const { error } = await supabase
      .from("audit_logs")
      .insert({
        user_id: entry.user_id,
        action: entry.action,
        changes: sanitizedEntry.changes,
        created_by: entry.created_by || entry.user_id,
      });

    if (error) {
      console.error("[Audit] Failed to log event:", error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error("[Audit] Unexpected error logging event:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

/**
 * Log failed login attempt
 */
export async function logFailedLogin(
  email: string,
  reason: string,
  ipAddress?: string
): Promise<void> {
  try {
    const supabase = createAuditClient();

    await supabase.from("audit_logs").insert({
      user_id: null, // Unknown user
      action: AuditAction.LOGIN_FAILED,
      changes: {
        email,
        reason,
        ip_address: ipAddress,
      },
    });
  } catch (err) {
    console.error("[Audit] Error logging failed login:", err);
  }
}

/**
 * Log unauthorized access attempt
 */
export async function logUnauthorizedAccess(
  userId: string,
  attemptedResource: string,
  reason: string,
  ipAddress?: string
): Promise<void> {
  try {
    const supabase = createAuditClient();

    await supabase.from("audit_logs").insert({
      user_id: userId,
      action: AuditAction.UNAUTHORIZED_ACCESS,
      changes: {
        attempted_resource: attemptedResource,
        reason,
        ip_address: ipAddress,
      },
    });
  } catch (err) {
    console.error("[Audit] Error logging unauthorized access:", err);
  }
}

/**
 * Log role change
 */
export async function logRoleChange(
  userId: string,
  oldRole: string,
  newRole: string,
  changedBy: string
): Promise<void> {
  try {
    const supabase = createAuditClient();

    await supabase.from("audit_logs").insert({
      user_id: userId,
      action: AuditAction.USER_ROLE_CHANGED,
      changes: {
        old_role: oldRole,
        new_role: newRole,
        changed_by: changedBy,
      },
      created_by: changedBy,
    });
  } catch (err) {
    console.error("[Audit] Error logging role change:", err);
  }
}

/**
 * Log API call with details
 */
export async function logApiCall(
  userId: string,
  method: string,
  path: string,
  statusCode: number,
  responseTime: number,
  ipAddress?: string,
  errorMessage?: string
): Promise<void> {
  try {
    const supabase = createAuditClient();

    // Only log errors and sensitive operations
    if (statusCode >= 400 || method !== "GET") {
      await supabase.from("audit_logs").insert({
        user_id: userId,
        action: `api.${method}`,
        changes: {
          path,
          status_code: statusCode,
          response_time_ms: responseTime,
          ip_address: ipAddress,
          error: errorMessage,
        },
      });
    }
  } catch (err) {
    console.error("[Audit] Error logging API call:", err);
  }
}

/**
 * Log suspicious activity (potential attack)
 */
export async function logSuspiciousActivity(
  userId: string | null,
  activityType: string,
  details: Record<string, any>,
  ipAddress?: string
): Promise<void> {
  try {
    const supabase = createAuditClient();

    await supabase.from("audit_logs").insert({
      user_id: userId,
      action: AuditAction.SUSPICIOUS_ACTIVITY,
      changes: {
        activity_type: activityType,
        details,
        ip_address: ipAddress,
      },
    });

    // Also log to console for immediate attention
    console.warn("[SECURITY] Suspicious activity detected:", {
      userId,
      activityType,
      details,
    });
  } catch (err) {
    console.error("[Audit] Error logging suspicious activity:", err);
  }
}

/**
 * Get audit logs for a specific user
 */
export async function getUserAuditLogs(
  userId: string,
  limit: number = 100
): Promise<AuditLogEntry[]> {
  try {
    const supabase = createAuditClient();

    const { data, error } = await supabase
      .from("audit_logs")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[Audit] Error fetching user logs:", error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error("[Audit] Error fetching user logs:", err);
    return [];
  }
}

/**
 * Get audit logs for a specific resource
 */
export async function getResourceAuditLogs(
  resourceType: string,
  resourceId: string,
  limit: number = 100
): Promise<AuditLogEntry[]> {
  try {
    const supabase = createAuditClient();

    const { data, error } = await supabase
      .from("audit_logs")
      .select("*")
      .eq("resource_type", resourceType)
      .eq("resource_id", resourceId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[Audit] Error fetching resource logs:", error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error("[Audit] Error fetching resource logs:", err);
    return [];
  }
}

/**
 * Get recent critical events
 */
export async function getRecentCriticalEvents(
  minutesBack: number = 60,
  limit: number = 50
): Promise<AuditLogEntry[]> {
  try {
    const supabase = createAuditClient();
    const cutoffTime = new Date(Date.now() - minutesBack * 60000).toISOString();

    const { data, error } = await supabase
      .from("audit_logs")
      .select("*")
      .gte("created_at", cutoffTime)
      .in("action", [
        AuditAction.UNAUTHORIZED_ACCESS,
        AuditAction.ROLE_ESCALATION_ATTEMPT,
        AuditAction.SUSPICIOUS_ACTIVITY,
        AuditAction.RATE_LIMIT_EXCEEDED,
      ])
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[Audit] Error fetching critical events:", error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error("[Audit] Error fetching critical events:", err);
    return [];
  }
}

/**
 * Export audit logs (for compliance/investigations)
 */
export async function exportAuditLogs(
  startDate: string,
  endDate: string,
  format: "json" | "csv" = "json"
): Promise<{ success: boolean; data?: string; error?: string }> {
  try {
    const supabase = createAuditClient();

    const { data, error } = await supabase
      .from("audit_logs")
      .select("*")
      .gte("created_at", startDate)
      .lte("created_at", endDate)
      .order("created_at", { ascending: true });

    if (error) {
      return { success: false, error: error.message };
    }

    if (format === "csv") {
      const csv = convertToCSV(data || []);
      return { success: true, data: csv };
    }

    return {
      success: true,
      data: JSON.stringify(data, null, 2),
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: errorMessage };
  }
}

/**
 * Sanitize changes object to prevent sensitive data from being logged
 */
function sanitizeChanges(
  changes?: Record<string, any>
): Record<string, any> | undefined {
  if (!changes) return undefined;

  const sanitized = { ...changes };
  const sensitiveFields = [
    "password",
    "token",
    "secret",
    "apiKey",
    "creditCard",
    "ssn",
  ];

  for (const field of sensitiveFields) {
    if (field in sanitized) {
      sanitized[field] = "[REDACTED]";
    }
  }

  return sanitized;
}

/**
 * Convert audit logs to CSV format
 */
function convertToCSV(logs: AuditLogEntry[]): string {
  if (logs.length === 0) {
    return "No data";
  }

  const headers = [
    "ID",
    "User ID",
    "Action",
    "Created By",
    "Created At",
    "Changes",
  ];
  const rows = logs.map((log) => [
    log.id || "",
    log.user_id || "",
    log.action,
    log.created_by || "",
    log.created_at || "",
    JSON.stringify(log.changes || {}),
  ]);

  const csv = [
    headers.join(","),
    ...rows.map((row) =>
      row
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(",")
    ),
  ].join("\n");

  return csv;
}

/**
 * Get audit statistics for admin dashboard
 */
export async function getAuditStatistics(daysBack: number = 7): Promise<{
  totalEvents: number;
  criticalEvents: number;
  failedLogins: number;
  unauthorizedAttempts: number;
  roleChanges: number;
}> {
  try {
    const supabase = createAuditClient();
    const cutoffDate = new Date(Date.now() - daysBack * 24 * 60 * 60000).toISOString();

    const { count: totalCount } = await supabase
      .from("audit_logs")
      .select("*", { count: "exact" })
      .gte("created_at", cutoffDate);

    const { count: criticalCount } = await supabase
      .from("audit_logs")
      .select("*", { count: "exact" })
      .gte("created_at", cutoffDate)
      .in("action", [
        AuditAction.UNAUTHORIZED_ACCESS,
        AuditAction.SUSPICIOUS_ACTIVITY,
      ]);

    const { count: failedLoginsCount } = await supabase
      .from("audit_logs")
      .select("*", { count: "exact" })
      .gte("created_at", cutoffDate)
      .eq("action", AuditAction.LOGIN_FAILED);

    const { count: unauthorizedCount } = await supabase
      .from("audit_logs")
      .select("*", { count: "exact" })
      .gte("created_at", cutoffDate)
      .eq("action", AuditAction.UNAUTHORIZED_ACCESS);

    const { count: roleChangesCount } = await supabase
      .from("audit_logs")
      .select("*", { count: "exact" })
      .gte("created_at", cutoffDate)
      .eq("action", AuditAction.USER_ROLE_CHANGED);

    return {
      totalEvents: totalCount || 0,
      criticalEvents: criticalCount || 0,
      failedLogins: failedLoginsCount || 0,
      unauthorizedAttempts: unauthorizedCount || 0,
      roleChanges: roleChangesCount || 0,
    };
  } catch (err) {
    console.error("[Audit] Error getting statistics:", err);
    return {
      totalEvents: 0,
      criticalEvents: 0,
      failedLogins: 0,
      unauthorizedAttempts: 0,
      roleChanges: 0,
    };
  }
}
