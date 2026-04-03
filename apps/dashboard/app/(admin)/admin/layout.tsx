// @ts-nocheck
/**
 * TitanCrew · Admin Panel Layout
 *
 * Role-aware sidebar navigation for platform administrators.
 * Dark Titan Navy theme with Safety Orange accents.
 */
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  LayoutDashboard, Users, DollarSign, Bot, HeadphonesIcon,
  Shield, Activity, Settings, Menu, X, Zap, ChevronRight,
  LogOut, ArrowLeft, AlertTriangle, TrendingUp,
} from "lucide-react";

// ─── Navigation ─────────────────────────────────────────────

const adminNav = [
  { label: "Overview",    href: "/admin",            icon: LayoutDashboard, perm: null },
  { label: "Accounts",    href: "/admin/accounts",   icon: Users,           perm: "accounts.read" },
  { label: "Financials",  href: "/admin/financials",  icon: DollarSign,      perm: "financials.read" },
  { label: "AI Agents",   href: "/admin/agents",     icon: Bot,             perm: "agents.read" },
  { label: "Support",     href: "/admin/support",    icon: HeadphonesIcon,  perm: "support.read" },
];

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  support: "Support",
  viewer: "Viewer",
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [admin, setAdmin] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { router.replace("/login"); return; }

        const { data: adminUser } = await (supabase.from("admin_users") as any)
          .select("*")
          .eq("user_id", user.id)
          .eq("is_active", true)
          .single();

        if (!adminUser) { router.replace("/"); return; }
        setAdmin(adminUser);
      } catch {
        router.replace("/");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0F1B2D] flex items-center justify-center">
        <div className="flex items-center gap-3 text-white/60">
          <div className="w-5 h-5 border-2 border-[#FF6B00] border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Verifying admin access…</span>
        </div>
      </div>
    );
  }

  if (!admin) return null;

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10">
        <div className="w-8 h-8 bg-[#FF6B00] rounded-lg flex items-center justify-center">
          <Shield className="w-4 h-4 text-white" strokeWidth={2.5} />
        </div>
        <div>
          <span className="text-white font-extrabold text-base tracking-tight">Titan</span>
          <span className="text-[#FF6B00] font-extrabold text-base tracking-tight">Admin</span>
        </div>
      </div>

      {/* Back to dashboard */}
      <Link
        href="/home"
        className="flex items-center gap-2 px-5 py-2.5 text-xs text-slate-400 hover:text-white transition-colors border-b border-white/5"
      >
        <ArrowLeft className="w-3 h-3" />
        Back to Dashboard
      </Link>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {adminNav.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group
                ${active
                  ? "bg-[#FF6B00] text-white shadow-md"
                  : "text-slate-300 hover:bg-white/10 hover:text-white"
                }`}
            >
              <Icon className={`w-4 h-4 flex-shrink-0 ${active ? "text-white" : "text-slate-400 group-hover:text-white"}`} />
              {item.label}
              {active && <ChevronRight className="w-3 h-3 ml-auto opacity-70" />}
            </Link>
          );
        })}
      </nav>

      {/* Admin user info */}
      <div className="px-3 pb-4 border-t border-white/10 pt-4">
        <div className="px-3 py-2 rounded-lg bg-white/5 border border-white/10">
          <p className="text-xs text-slate-400 truncate">{admin.email}</p>
          <div className="flex items-center justify-between mt-1">
            <span className="text-xs font-semibold text-[#FF6B00]">
              {ROLE_LABELS[admin.role] ?? admin.role}
            </span>
            <span className="w-2 h-2 bg-emerald-400 rounded-full" title="Active" />
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-[#0F1B2D]">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-60 bg-[#1A2744] flex-col flex-shrink-0 border-r border-white/10">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-60 bg-[#1A2744] flex flex-col">
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-14 bg-[#1A2744]/80 backdrop-blur border-b border-white/10 flex items-center justify-between px-4 lg:px-6 flex-shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 rounded-lg hover:bg-white/10">
              <Menu className="w-5 h-5 text-white/70" />
            </button>
            <AdminBreadcrumb pathname={pathname} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 hidden sm:block">
              {new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
            </span>
          </div>
        </header>

        {/* Scrollable content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}

function AdminBreadcrumb({ pathname }: { pathname: string }) {
  const labels: Record<string, string> = {
    "/admin": "Overview",
    "/admin/accounts": "Accounts",
    "/admin/financials": "Financials",
    "/admin/agents": "AI Agents",
    "/admin/support": "Support",
  };

  const label = Object.entries(labels).find(([key]) =>
    key === "/admin" ? pathname === "/admin" : pathname.startsWith(key)
  )?.[1] ?? "Admin";

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-slate-500">Admin</span>
      <span className="text-slate-600">/</span>
      <span className="text-sm font-semibold text-white">{label}</span>
    </div>
  );
}
