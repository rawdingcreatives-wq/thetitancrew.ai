// @ts-nocheck
/**
 * TitanCrew · Next.js Middleware
 *
 * Runs at the edge on every matched request.
 * 1. Refreshes the Supabase auth session (keeps cookies alive).
 * 2. Redirects unauthenticated users away from protected routes.
 * 3. Redirects authenticated users away from auth pages.
 * 4. Serves the landing page at "/" for unauthenticated visitors.
 */

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// ─── Route definitions ──────────────────────────────────────
const PUBLIC_ROUTES = [
  "/login",
  "/signup",
  "/signup/confirm",
  "/forgot-password",
  "/auth/callback",
  "/landing",
];

const AUTH_ROUTES = ["/login", "/signup", "/forgot-password"];

// API routes that should be accessible without authentication (webhooks, etc.)
const PUBLIC_API_ROUTES = [
  "/api/webhooks/stripe",
  "/api/webhooks/twilio",
  "/api/agents/webhook",
];

function isPublicRoute(pathname: string) {
  // Root "/" is public (landing page for visitors)
  if (pathname === "/") return true;
  return PUBLIC_ROUTES.some((r) => pathname.startsWith(r));
}

function isAuthRoute(pathname: string) {
  return AUTH_ROUTES.some((r) => pathname.startsWith(r));
}

function isApiRoute(pathname: string) {
  return pathname.startsWith("/api/");
}

function isPublicApiRoute(pathname: string) {
  return PUBLIC_API_ROUTES.some((r) => pathname.startsWith(r));
}

// ─── Middleware ──────────────────────────────────────────────
export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: Do NOT use getSession() — it reads from local storage
  // and can be spoofed. getUser() hits the Supabase auth server.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // ── Allow public API routes without auth (webhooks) ──
  if (isPublicApiRoute(pathname)) {
    return supabaseResponse;
  }

  // ── Unauthenticated API requests → return 401 JSON, not redirect ──
  if (!user && isApiRoute(pathname)) {
    return NextResponse.json(
      { error: "Unauthorized", message: "Authentication required" },
      { status: 401 }
    );
  }

  // ── Unauthenticated user trying to access protected route ──
  if (!user && !isPublicRoute(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // ── Authenticated user trying to access auth pages → go to dashboard ──
  if (user && isAuthRoute(pathname)) {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/home";
    return NextResponse.redirect(homeUrl);
  }

  return supabaseResponse;
}

// ─── Matcher: skip static files, images, favicon ────────────
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
