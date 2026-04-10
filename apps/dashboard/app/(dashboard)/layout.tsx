/**
 * TitanCrew · Dashboard Layout
 * Sidebar navigation + top header. Wraps all authenticated dashboard pages.
 */

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  LayoutDashboard,
  Briefcase,
  Bot,
  BarChart3,
  Calendar,
  Package,
  DollarSign,
  Users,
  Settings,
  Menu,
  Zap,
  Bell,
  ChevronRight,
  LogOut,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { OnboardingChecklist } from "@/components/onboarding/OnboardingChecklist";

// ─── Navigation items ──────────────────────────────────────

const navItems = [
  { label: "Dashboard",   href: "/home",         icon: LayoutDashboard },
  { label: "Jobs",        href: "/jobs",         icon: Briefcase },
  { label: "AI Crew",     href: "/crew",         icon: Bot },
  { label: "Analytics",   href: "/analytics",    icon: BarChart3 },
  { label: "Schedule",    href: "/schedule",     icon: Calendar },
  { label: "Customers",   href: "/customers",    icon: Users },
  { label: "Inventory",   href: "/inventory",    icon: Package },
  { label: "Finance",     href: "/finance",      icon: DollarSign },
];

const bottomNavItems = [
  { label: "Settings",    href: "/settings",     icon: Settings },
];

// ─── Component ────────────────────────────────────────────

const PLAN_LABELS: Record<string, { name: string; price: string }> = {
  lite:   { name: "Lite",    price: "$399/mo" },
  growth: { name: "Growth",  price: "$799/mo" },
  scale:  { name: "Scale",   price: "$1,299/mo" },
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [planKey, setPlanKey] = useState<string>("lite");
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [userInitials, setUserInitials] = useState("TC");
  const [userEmail, setUserEmail] = useState("");

  useEffect(() => {
    async function fetchPlan() {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        // Set user initials from email
        const email = user.email ?? "";
        setUserEmail(email);
        const initials = email.split("@")[0].slice(0, 2).toUpperCase();
        setUserInitials(initials || "TC");
        const { data } = await supabase.from("accounts")
          .select("plan")
          .eq("owner_user_id", user.id)
          .single() as { data: { plan: string } | null };
        if (data?.plan) setPlanKey(data.plan);
      } catch (err) { console.error("[DashboardLayout] Failed to fetch plan:", err); }
    }
    fetchPlan();
  }, []);

  const handleSignOut = async () => {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push("/login");
    } catch {
      router.push("/login");
    }
  };

  // Close user menu and bell when clicking outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-user-menu]")) setUserMenuOpen(false);
      if (!target.closest("[data-bell-menu]")) setBellOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const isActive = (href: string) =>
    href === "/home" ? pathname === "/home" : pathname.startsWith(href);

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-white/10">
        <div className="w-8 h-8 bg-[#FF6B00] rounded-lg flex items-center justify-center">
          <Zap className="w-4 h-4 text-white" strokeWidth={2.5} />
        </div>
        <div>
          <span className="text-white font-extrabold text-lg tracking-tight">Titan</span>
          <span className="text-[#FF6B00] font-extrabold text-lg tracking-tight">Crew</span>
        </div>
      </div>

      {/* Nav links */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
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

      {/* Bottom nav */}
      <div className="px-3 pb-4 border-t border-white/10 pt-4 space-y-0.5">
        {bottomNavItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setSidebarOpen(false)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:bg-white/10 hover:text-white transition-all"
            >
              <Icon className="w-4 h-4 text-slate-400" />
              {item.label}
            </Link>
          );
        })}

        {/* Plan badge (info only — Settings link is already in bottomNavItems) */}
        <div className="block mx-1 mt-3 px-3 py-2 rounded-lg bg-white/5 border border-white/10">
          <p className="text-xs text-slate-400">Current plan</p>
          <div className="flex items-center justify-between mt-0.5">
            <span className="text-sm font-semibold text-white">{PLAN_LABELS[planKey]?.name ?? "Basic"}</span>
            <span className="text-xs text-[#FF6B00] font-medium">{PLAN_LABELS[planKey]?.price ?? "$399/mo"}</span>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-[#F8FAFF]">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 bg-[#1A2744] flex-col flex-shrink-0">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-[#1A2744] flex flex-col">
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top header */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 lg:px-6 flex-shrink-0">
          <div className="flex items-center gap-4">
            {/* Mobile menu toggle */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg hover:bg-slate-100"
            >
              <Menu className="w-5 h-5 text-slate-600" />
            </button>

            {/* Page title is set per-page; show breadcrumb area */}
            <div className="hidden sm:block">
              <BreadcrumbTitle pathname={pathname} />
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Notifications bell */}
            <div className="relative" data-bell-menu>
              <button
                onClick={() => setBellOpen((o) => !o)}
                className="relative p-2 rounded-lg hover:bg-slate-100 transition-colors"
                aria-label="Notifications"
              >
                <Bell className="w-5 h-5 text-slate-500" />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#FF6B00] rounded-full" />
              </button>

              {bellOpen && (
                <div
                  className="absolute right-0 top-10 w-80 rounded-xl bg-white shadow-xl border border-slate-100 z-50 overflow-hidden"
                  style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.15)" }}
                >
                  <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                    <span className="text-sm font-bold text-[#1A2744]">Notifications</span>
                    <span className="text-xs text-[#FF6B00] font-semibold bg-orange-50 px-2 py-0.5 rounded-full">1 new</span>
                  </div>
                  <div className="divide-y divide-slate-50">
                    <div className="px-4 py-3 hover:bg-slate-50 transition-colors cursor-pointer">
                      <div className="flex items-start gap-2.5">
                        <div className="w-2 h-2 bg-[#FF6B00] rounded-full flex-shrink-0 mt-1.5" />
                        <div>
                          <p className="text-xs font-semibold text-[#1A2744]">AI Crew deployed</p>
                          <p className="text-xs text-slate-500 mt-0.5">Your 6-agent crew is active and monitoring your business 24/7.</p>
                          <p className="text-xs text-slate-400 mt-1">Just now</p>
                        </div>
                      </div>
                    </div>
                    <div className="px-4 py-3 text-center">
                      <p className="text-xs text-slate-400">More notifications will appear as your crew takes action.</p>
                    </div>
                  </div>
                  <div className="px-4 py-2.5 border-t border-slate-100">
                    <button
                      onClick={() => setBellOpen(false)}
                      className="text-xs text-slate-500 hover:text-slate-700 w-full text-center transition-colors"
                    >
                      Mark all as read
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* User menu */}
            <div className="relative" data-user-menu>
              <button
                onClick={() => setUserMenuOpen((o) => !o)}
                className="w-8 h-8 bg-[#1A2744] rounded-full flex items-center justify-center text-white text-sm font-semibold hover:bg-[#243358] transition-colors focus:outline-none focus:ring-2 focus:ring-[#FF6B00] focus:ring-offset-1"
                aria-label="User menu"
              >
                {userInitials}
              </button>

              {userMenuOpen && (
                <div
                  className="absolute right-0 top-10 w-56 rounded-xl bg-white shadow-xl border border-slate-100 z-50 overflow-hidden"
                  style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.15)" }}
                >
                  {/* User info */}
                  <div className="px-4 py-3 border-b border-slate-100">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 bg-[#1A2744] rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
                        {userInitials}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[#1A2744] truncate">{userEmail || "Account"}</p>
                        <p className="text-xs text-slate-400 capitalize">{PLAN_LABELS[planKey]?.name ?? "Basic"} plan</p>
                      </div>
                    </div>
                  </div>

                  {/* Menu items */}
                  <div className="py-1">
                    <Link
                      href="/settings"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 hover:text-[#1A2744] transition-colors"
                    >
                      <Settings className="w-4 h-4 text-slate-400" />
                      Settings
                    </Link>
                  </div>

                  <div className="border-t border-slate-100 py-1">
                    <button
                      onClick={handleSignOut}
                      className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Scrollable page content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>

      {/* Onboarding progress widget — fixed bottom-right, auto-hides when complete */}
      <OnboardingChecklist />
    </div>
  );
}

// ─── Breadcrumb title helper ──────────────────────────────

function BreadcrumbTitle({ pathname }: { pathname: string }) {
  // Ordered from most specific to least specific for correct matching
  const labels: [string, string][] = [
    ["/settings/billing", "Billing"],
    ["/settings/integrations", "Integrations"],
    ["/settings/team", "Team Settings"],
    ["/settings", "Settings"],
    ["/jobs", "Jobs Pipeline"],
    ["/crew", "AI Crew"],
    ["/analytics", "Analytics"],
    ["/schedule", "Schedule"],
    ["/customers", "Customers"],
    ["/inventory", "Inventory"],
    ["/finance", "Finance"],
  ];

  let label = "Dashboard";
  if (pathname !== "/home" && pathname !== "/") {
    const match = labels.find(([key]) => pathname.startsWith(key));
    if (match) label = match[1];
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-slate-400">TitanCrew</span>
      <span className="text-slate-300">/</span>
      <span className="text-sm font-semibold text-[#1A2744]">{label}</span>
    </div>
  );
}
