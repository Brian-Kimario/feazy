import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSessionMetadata, isSessionExpired, DEFAULT_SESSION_CONFIG } from "@/lib/session";

// Security headers with Supabase domains allowed in CSP
const SECURITY_HEADERS: Record<string, string> = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "geolocation=(), microphone=(), camera=(), payment=*",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://*.supabase.co wss://*.supabase.co; frame-ancestors 'none'",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
};

const ADMIN_CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://*.supabase.co wss://*.supabase.co; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

/**
 * Enterprise Security Middleware
 * 
 * Enforces:
 * - Authentication on protected routes (/customer, /professional, /admin)
 * - Strict role-based routing (customer → /customer, professional → /professional, admin → /admin)
 * - Professional onboarding state (unverified professionals → /professional/onboarding)
 * - Redirects logged-in users away from /auth/login to their dashboard
 * - Security headers & Content Security Policy (allowing Supabase backend connections)
 * - Cache-Control: no-store on sensitive/protected dashboard & API routes
 * - Token cookie synchronization for SSR
 */

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            // FIX 1: HttpOnly prevents JavaScript from accessing cookies (XSS protection)
            // FIX 2: Secure forces HTTPS only (prevents MITM interception)
            // FIX 3: SameSite=Strict prevents CSRF attacks
            // FIX 4: Reduce token lifetime from 6 months to 7 days
            
            const isAuthCookie = name.includes('auth') || name.includes('session') || name.startsWith('sb-');
            
            const secureOptions = isAuthCookie
              ? {
                  ...options,
                  httpOnly: true,
                  secure: process.env.NODE_ENV === 'production',
                  sameSite: 'strict' as const,
                  maxAge: 7 * 24 * 60 * 60, // 7 days instead of 6 months
                }
              : {
                  ...options,
                  httpOnly: true,
                  secure: process.env.NODE_ENV === 'production',
                };

            request.cookies.set(name, value);
            response.cookies.set(name, value, secureOptions);
          });
        },
      },
    }
  );

  // Get current user from session
  const { data: { user } } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ||
    request.headers.get("x-real-ip") ||
    "unknown";

  // Define protected routes and their required roles
  const protectedRoutes: Record<string, string> = {
    "/customer": "customer",
    "/professional": "professional",
    "/professional/onboarding": "professional",
    "/inspector": "professional",
    "/admin": "admin",
    "/support": "support",
  };

  // Routes that don't require verification (professionals can access while pending)
  const onboardingAllowedRoutes = ["/professional/onboarding"];

  // Match on a segment boundary so /professionals or /supporters stay public.
  const matchesRoute = (route: string) =>
    pathname === route || pathname.startsWith(`${route}/`);

  const isProtectedRoute = Object.keys(protectedRoutes).some(matchesRoute);

  const isOnboardingRoute = onboardingAllowedRoutes.some(matchesRoute);

  const isAuthRoute = pathname.startsWith("/auth/login") || pathname.startsWith("/auth/register");

  function redirectWithSession(path: string) {
    const redirectResponse = NextResponse.redirect(new URL(path, request.url));
    response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
    redirectResponse.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0");
    redirectResponse.headers.set("Pragma", "no-cache");
    redirectResponse.headers.set("Expires", "0");
    return redirectResponse;
  }

  // Helper to fetch user's role securely
  async function fetchUserRole(userId: string): Promise<string> {
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .single();

      return profile?.role || "unknown";
    } catch {
      return "unknown";
    }
  }

  // Helper to fetch professional verification status
  async function fetchProfessionalVerificationStatus(userId: string): Promise<string | null> {
    try {
      const { data: profile } = await supabase
        .from("professional_profiles")
        .select("verification_status")
        .eq("user_id", userId)
        .single();

      return profile?.verification_status || null;
    } catch {
      return null;
    }
  }

  // Bypass all redirect logic for logout route
  if (pathname.startsWith("/auth/logout")) {
    return response;
  }

  const isLoggedOutParam = request.nextUrl.searchParams.get("logged_out") === "1" ||
                           request.nextUrl.searchParams.get("logged_out") === "true";

  // If user just logged out, purge any remaining auth cookies on the response
  if (isLoggedOutParam) {
    const allCookies = request.cookies.getAll();
    allCookies.forEach(({ name }) => {
      if (
        name.startsWith("sb-") ||
        name.includes("auth-token") ||
        name.includes("session") ||
        name.startsWith("supabase")
      ) {
        response.cookies.set(name, "", {
          path: "/",
          maxAge: 0,
          expires: new Date(0),
        });
      }
    });
  }

  // 1. If user is already authenticated and visits login/register → redirect to role dashboard
  // (unless they are landing here immediately after an explicit logout)
  if (user && isAuthRoute && !isLoggedOutParam) {
    const userRole = await fetchUserRole(user.id);
    const target = userRole === "customer" ? "/customer" : userRole === "professional" ? "/professional" : userRole === "admin" ? "/admin" : userRole === "support" ? "/support" : "/";
    return redirectWithSession(target);
  }

  // 2. If unauthenticated user tries to access protected route → redirect to login with next param
  if (isProtectedRoute && !user) {
    console.warn(`[Security] Unauthenticated attempt to access ${pathname} from IP ${ip}`);
    const loginUrl = new URL("/auth/login", request.url);
    const requiredRole = protectedRoutes[pathname.split('/').slice(0, 2).join('/')] || "customer";
    loginUrl.searchParams.set("role", requiredRole);
    // The login page opens on the matching door: professionals for /professional, customers otherwise.
    loginUrl.searchParams.set("as", requiredRole === "professional" ? "professional" : "customer");
    loginUrl.searchParams.set("next", pathname);
    return redirectWithSession(`${loginUrl.pathname}${loginUrl.search}`);
  }

  // 3. If authenticated user is accessing protected route → enforce strict RBAC
  if (user && isProtectedRoute) {
    const userRole = await fetchUserRole(user.id);
    response.headers.set("x-user-role", userRole);

    // Check if session has exceeded max age (30 days)
    const sessionMetadata = await getSessionMetadata();
    if (sessionMetadata && isSessionExpired(sessionMetadata, DEFAULT_SESSION_CONFIG)) {
      console.warn(`[Security] Session expired for user ${user.id} (max age exceeded)`);
      await supabase.auth.signOut();
      const loginUrl = new URL("/auth/login?reason=session_expired", request.url);
      return redirectWithSession(loginUrl.toString());
    }

    if (pathname.startsWith("/customer") && userRole !== "customer") {
      const target = userRole === "professional" ? "/professional" : userRole === "admin" ? "/admin" : userRole === "support" ? "/support" : "/";
      return redirectWithSession(target);
    }

    // Inspector workspace: professional-role accounts; the layout checks the active inspector row.
    if (pathname.startsWith("/inspector") && userRole !== "professional") {
      const target = userRole === "customer" ? "/customer" : userRole === "admin" ? "/admin" : userRole === "support" ? "/support" : "/";
      return redirectWithSession(target);
    }

    // Professional route: Check verification status
    if (pathname.startsWith("/professional")) {
      if (userRole !== "professional") {
        const target = userRole === "customer" ? "/customer" : userRole === "admin" ? "/admin" : userRole === "support" ? "/support" : "/";
        return redirectWithSession(target);
      }

      // If professional accessing main dashboard (not onboarding), check verification
      if (!isOnboardingRoute) {
        const verificationStatus = await fetchProfessionalVerificationStatus(user.id);
        if (verificationStatus && verificationStatus !== "verified") {
          // Redirect unverified professionals to onboarding
          return redirectWithSession("/professional/onboarding");
        }
      }
    }

    if (pathname.startsWith("/admin") && userRole !== "admin") {
      const target = userRole === "customer" ? "/customer" : userRole === "professional" ? "/professional" : userRole === "support" ? "/support" : "/";
      return redirectWithSession(target);
    }

    if (pathname.startsWith("/support") && userRole !== "support") {
      const target = userRole === "customer" ? "/customer" : userRole === "professional" ? "/professional" : userRole === "admin" ? "/admin" : "/";
      return redirectWithSession(target);
    }
  }

  // 4. Security Headers
  Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  const isAdminRoute = pathname.startsWith("/admin");
  if (isAdminRoute) {
    response.headers.set("Content-Security-Policy", ADMIN_CSP);
  }

  // 5. Caching Strategy
  const publicCacheRoutes = ["/", "/help", "/demo-contact"];
  const volatileDataRoutes = ["/api/csrf-token"];

  // Public static routes: cache for 1 hour on CDN + browser
  if (publicCacheRoutes.includes(pathname)) {
    response.headers.set("Cache-Control", "public, s-maxage=3600, max-age=3600, stale-while-revalidate=86400");
  }
  // Volatile data (CSRF tokens): cache for 1 minute
  else if (volatileDataRoutes.includes(pathname)) {
    response.headers.set("Cache-Control", "max-age=60, s-maxage=60");
  }
  // Protected dashboards and auth routes: never cache
  else if (isProtectedRoute || isAuthRoute || pathname.startsWith("/api")) {
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0");
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Expires", "0");
    response.headers.set("Surrogate-Control", "no-store");
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - Static asset extensions (.svg, .png, .jpg, .woff, etc.)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2)$).*)",
  ],
};
