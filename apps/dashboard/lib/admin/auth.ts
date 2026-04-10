/**
 * TitanCrew · Admin Auth Utilities
 *
 * Helpers to verify admin access on both client and server side.
 * Uses the admin_users table to determine role-based permissions.
 */

import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createLogger } from "@/lib/logger";

const log = createLogger("admin-auth");

export type AdminRole = "super_admin" | "admin" | "support" | "viewer";

export interface AdminUser {
  id: string;
  user_id: string;
  email: string;
  display_name: string;
  role: AdminRole;
  is_active: boolean;
  last_login_at: string | null;
  permissions: Record<string, boolean>;
}

/** Permission matrix per role */
const ROLE_PERMISSIONS: Record<AdminRole, string[]> = {
  super_admin: [
    "accounts.read", "accounts.write", "accounts.suspend", "accounts.delete",
    "financials.read", "financials.export",
    "agents.read", "agents.write", "agents.restart",
    "support.read", "support.write", "support.assign",
    "users.read", "users.write", "users.create_admin",
    "compliance.read", "compliance.process",
    "system.read", "system.write",
  ],
  admin: [
    "accounts.read", "accounts.write", "accounts.suspend",
    "financials.read", "financials.export",
    "agents.read", "agents.write", "agents.restart",
    "support.read", "support.write", "support.assign",
    "users.read",
    "compliance.read", "compliance.process",
    "system.read",
  ],
  support: [
    "accounts.read",
    "financials.read",
    "agents.read",
    "support.read", "support.write",
    "users.read",
  ],
  viewer: [
    "accounts.read",
    "financials.read",
    "agents.read",
    "support.read",
    "users.read",
  ],
};

/** Check if a role has a specific permission */
export function roleHasPermission(role: AdminRole, permission: string): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/**
 * Server-side: Get the current admin user from the session.
 * Returns null if the user is not an admin.
 */
export async function getAdminUser(): Promise<AdminUser | null> {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: adminUser } = await (supabase.from("admin_users") as any)
      .select("*")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .single();

    if (!adminUser) return null;

    // Update last_login_at
    await (supabase.from("admin_users") as any)
      .update({ last_login_at: new Date().toISOString() })
      .eq("id", adminUser.id);

    return adminUser as AdminUser;
  } catch {
    return null;
  }
}

/**
 * Server-side: Require admin access with a minimum role.
 * Throws a redirect if the user is not authorized.
 */
export async function requireAdmin(minimumRole?: AdminRole): Promise<AdminUser> {
  const admin = await getAdminUser();

  if (!admin) {
    throw new Error("UNAUTHORIZED");
  }

  if (minimumRole) {
    const roleHierarchy: AdminRole[] = ["viewer", "support", "admin", "super_admin"];
    const minIdx = roleHierarchy.indexOf(minimumRole);
    const userIdx = roleHierarchy.indexOf(admin.role);
    if (userIdx < minIdx) {
      throw new Error("INSUFFICIENT_PERMISSIONS");
    }
  }

  return admin;
}

/**
 * Log an admin action to the admin_action_log table.
 */
export async function logAdminAction(
  adminUserId: string,
  action: string,
  entityType?: string,
  entityId?: string,
  details?: Record<string, unknown>
) {
  try {
    const supabase = await createServerSupabase();
    await (supabase.from("admin_action_log") as any).insert({
      admin_user_id: adminUserId,
      action,
      entity_type: entityType ?? null,
      entity_id: entityId ?? null,
      details: details ?? {},
    });
  } catch (err) {
    log.error({ event: "log_action_failed", err: String(err) }, "Failed to log action");
  }
}
