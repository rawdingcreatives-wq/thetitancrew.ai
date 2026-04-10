/**
 * TitanCrew · Supabase Server Client
 * Server-side client for Route Handlers, Server Components, Server Actions.
 */
import { createServerClient as createServerClientBase } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./types";
import type { CookieOptions } from "@supabase/ssr/dist/module/types";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClientBase<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Ignore cookie errors in Server Components
          }
        },
      },
    }
  );
}

/** Service role client for internal API routes (bypasses RLS) */
export function createServiceClient() {
  return createServerClientBase<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  );
}

// Alias for backward-compat with imports that use createServerClient
export { createClient as createServerClient };
