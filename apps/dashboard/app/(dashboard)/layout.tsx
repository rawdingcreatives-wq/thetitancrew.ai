/**
 * TitanCrew · Dashboard Layout
 * Sidebar navigation + top header. Wraps all authenticated dashboard pages.
 */

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
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
  X,
  Zap,
  Bell,
  ChevronRight,
} from "lucide-react";

// ─── Navigation items ──────────────────────────────────────

const navItems = [
  { label: "Dashboard",   href: "/",            icon: LayoutDashboard },
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

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

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

        {/* Plan badge */}
        <div className="mx-1 mt-3 px-3 py-2 rounded-lg bg-white/5 border border-white/10">
          <p className="text-xs text-slate-400">Current plan</p>
          <div className="flex items-center justify-between mt-0.5">
            <span className="text-sm font-semibold text-white">Pro</span>
            <span className="text-xs text-[#FF6B00] font-medium">$799/mo</span>
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
            <button className="relative p-2 rounded-lg hover:bg-slate-100 transition-colors">
              <Bell className="w-5 h-5 text-slate-500" />
              {/* Unread dot */}
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#FF6B00] rounded-full" />
            </button>

            {/* Avatar */}
            <div className="w-8 h-8 bg-[#1A2744] rounded-full flex items-center justify-center text-white text-sm font-semibold">
              TC
            </div>
          </div>
        </header>

        {/* Scrollable page content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

// ─── Breadcrumb title helper ──────────────────────────────

function BreadcrumbTitle({ pathname }: { pathname: string }) {
  const labels: Record<string, string> = {
    "/": "Dashboard",
    "/jobs": "Jobs Pipeline",
    "/crew": "AI Crew",
    "/analytics": "Analytics",
    "/schedule": "Schedule",
    "/customers": "Customers",
    "/inventory": "Inventory",
    "/finance": "Finance",
    "/settings": "Settings",
  };

  const label = Object.entries(labels).find(([key]) =>
    key === "/" ? pathname === "/" : pathname.startsWith(key)
  )?.[1] ?? "TitanCrew";

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-slate-400">TitanCrew</span>
      <span className="text-slate-300">/</span>
      <span className="text-sm font-semibold text-[#1A2744]">{label}</span>
    </div>
  );
}
