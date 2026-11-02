"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getRedirectPathByRole } from "./utils";
import { validateNextParam } from "@/lib/auth/validateNextParam";
import { createSessionMetadata, setSessionMetadataCookie, clearSessionCookies } from "@/lib/session";
import type { UserRole } from "@/types/auth";

import { createClient as createServerSupabase } from "@/lib/supabase/server";

export type SignInAudience = "customer" | "professional";

export type SignInFailureCode =
  | "invalid_input"
  | "invalid_credentials"
  | "email_not_confirmed"
  | "wrong_audience"
  | "no_role"
  | "unknown";

export interface SignInFailure {
  ok: false;
  code: SignInFailureCode;
  message: string;
  /** Set for `wrong_audience`: the sign-in the account actually belongs to. */
  actualAudience?: SignInAudience;
}

/**
 * Sign in with email and password.
 *
 * Uses SSR client so session cookies are set on the server response before the
 * redirect. On success this calls redirect(), which throws NEXT_REDIRECT, so a
 * return value only ever means failure. Failures are returned as typed results
 * rather than thrown: Next masks thrown server-action messages in production,
 * which would turn every error into a generic one on the client.
 *
 * `audience` is the door the user came in through (customer or professional
 * sign-in). An account that belongs behind the other door is signed back out
 * and told where to go. Admin and support accounts pass through either door.
 */
export async function signInWithEmail(
  email: string,
  password: string,
  next?: string | null,
  audience?: SignInAudience | null,
): Promise<SignInFailure> {
  const cleanEmail = typeof email === "string" ? email.toLowerCase().trim() : "";
  if (!cleanEmail || typeof password !== "string" || !password) {
    return { ok: false, code: "invalid_input", message: "Enter your email and password." };
  }

  const supabase = await createServerSupabase();

  const { data, error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });

  if (error) {
    if (error.message.includes("Email not confirmed")) {
      return { ok: false, code: "email_not_confirmed", message: "Confirm your email before signing in." };
    }
    if (error.message.includes("Invalid login credentials")) {
      return { ok: false, code: "invalid_credentials", message: "Email or password is incorrect." };
    }
    return { ok: false, code: "unknown", message: "We could not sign you in right now. Please try again." };
  }

  if (!data.user) {
    return { ok: false, code: "unknown", message: "We could not sign you in right now. Please try again." };
  }

  const role = await getUserRole(data.user.id, supabase);
  const baseRedirectPath = getRedirectPathByRole(role);
  if (!role || !baseRedirectPath) {
    await supabase.auth.signOut({ scope: "local" });
    return { ok: false, code: "no_role", message: "Your account does not have a valid Feazy role." };
  }

  if (audience && (role === "customer" || role === "professional") && role !== audience) {
    await supabase.auth.signOut({ scope: "local" });
    return {
      ok: false,
      code: "wrong_audience",
      actualAudience: role,
      message:
        role === "customer"
          ? "This is a customer account. Use the customer sign-in instead."
          : "This is a professional account. Use the professional sign-in instead.",
    };
  }

  try {
    const metadata = await createSessionMetadata(data.user.id, role);
    await setSessionMetadataCookie(metadata);
  } catch (err) {
    console.warn("Session metadata tracking warning:", err);
  }

  const redirectPath = validateNextParam(next, role, baseRedirectPath);

  // redirect() throws NEXT_REDIRECT so cookies and the redirect are sent in a
  // single response and the target layout sees the session immediately.
  redirect(redirectPath);
}

/**
 * Sign in with Google OAuth
 */
export async function signInWithGoogle(next?: string | null) {
  const supabase = await createServerSupabase();

  // Resolve dynamic origin so OAuth redirect works seamlessly across localhost and any Vercel preview/production URL
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") || headerList.get("host");
  const proto = headerList.get("x-forwarded-proto") || (host?.includes("localhost") ? "http" : "https");
  const origin = headerList.get("origin") || (host ? `${proto}://${host}` : (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"));

  const callbackUrl = new URL(`${origin}/auth/callback`);
  if (next && next.startsWith("/") && !next.startsWith("//")) {
    callbackUrl.searchParams.set("next", next);
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: callbackUrl.toString(),
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  if (data.url) {
    return { url: data.url };
  }

  throw new Error("No OAuth URL returned");
}

/**
 * Get user's role from profiles table
 */
export async function getUserRole(userId: string, authenticatedClient?: Awaited<ReturnType<typeof createServerSupabase>>): Promise<UserRole | null> {
  const supabase = authenticatedClient || await createServerSupabase();
  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  if (error || !data) {
    console.error("[getUserRole] Error:", error);
    return null;
  }

  return data.role as UserRole;
}

/**
 * Get the current user and their role
 */
export async function getCurrentUser() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const role = await getUserRole(user.id, supabase);
  if (!role) return null;

  return {
    id: user.id,
    email: user.email,
    role,
  };
}

/**
 * Sign out the current user
 */
export async function signOut() {
  try {
    const supabase = await createServerSupabase();
    await supabase.auth.signOut();
  } catch (err) {
    console.error("[Auth Actions] signOut error:", err);
  }

  // Clear all session and auth cookies
  await clearSessionCookies();

  // Return redirect path with logged_out flag
  return { success: true, redirectPath: "/auth/login?logged_out=1" };
}

/**
 * Verify and refresh session if needed
 * Called by middleware to ensure session is valid
 */
export async function verifySession() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}
