// @ts-nocheck
/**
 * TitanCrew Â· Next.js Middleware
 *
 * Runs at the edge on every matched request.
 * 1. Refreshes the Supabase auth session (keeps cookies alive).
 * 2. Redirects unauthenticated users away from protected routes.
 * 3. Returns 401 JSON for unauthenticated API requests.
 * 4. Redirects authenticated users away from auth pages.
 */

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_ROUTES = [
  "/login",
  "/signup",
  "/forgot-password",
  "/auth/callback",
  "/landing",
];

const AUTH_ROUTES = ["/login", "/signup", "/forgot-password"];

/** API routes that do NOT require user-session auth (e.g. webhooks with their own secret). */
const PUBLIC_API_ROUTES = ["/api/agents/webhook"];

function isPublicRoute(pathname: string) {
  return PUBLIC_ROUTES.some((r) => pathname.startsWith(r));
}

function isAuthRoute(pathname: string) {
  return AUTH_ROUTES.some((r) => pathname.startsWith(r));
}

function isPublicApiRoute(pathname: string) {
  return PUBLIC_API_ROUTES.some((r) => pathname.startsWith(r));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public API routes (webhooks) through without any auth check
  if (isPublicApiRoute(pathname)) {
    return NextResponse.next({ request });
  }

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

  // IMPORTANT: Do NOT use getSession() â it reads from local storage
  // and can be spoofed. getUser() hits the Supabase auth server.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Unauthenticated user trying to access protected route
  if (!user && !isPublicRoute(pathname)) {
    // API routes get a 401 JSON response instead of redirect
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Unauthorized", message: "Authentication required" },
        { status: 401 }
      );
    }

    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Authenticated user trying to access auth pages
  if (user && isAuthRoute(pathname)) {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/";
    return NextResponse.redirect(homeUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
