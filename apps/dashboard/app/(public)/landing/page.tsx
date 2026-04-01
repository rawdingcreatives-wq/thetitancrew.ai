// @ts-nocheck
/**
 * TitanCrew · Public Landing Page
 *
 * Marketing page for trade contractors. Shows value prop,
 * features, pricing, and CTA to sign up.
 */

import Link from "next/link";
import {
  Bot, Calendar, DollarSign, Wrench, Shield, Zap,
  ArrowRight, CheckCircle2, Star, Phone, Clock,
  TrendingUp, Users, MessageSquare, Package,
} from "lucide-react";

const TRADES = [
  "Plumbing", "Electrical", "HVAC", "Roofing", "Painting",
  "Landscaping", "General Contracting", "Remodeling",
];

const FEATURES = [
  {
    icon: Calendar,
    title: "Smart Scheduling",
    desc: "AI books jobs, avoids conflicts, and routes techs for minimum drive time.",
  },
  {
    icon: MessageSquare,
    title: "Customer Comms",
    desc: "Automated appointment reminders, follow-ups, and review requests via SMS.",
  },
  {
    icon: DollarSign,
    title: "Invoicing & Payments",
    desc: "Generate invoices on job completion. Chase late payments automatically.",
  },
  {
    icon: Package,
    title: "Parts Ordering",
    desc: "Track inventory and auto-reorder from suppliers when stock runs low.",
  },
  {
    icon: TrendingUp,
    title: "Revenue Insights",
    desc: "See MRR, job profitability, close rates, and tech performance in real time.",
  },
  {
    icon: Shield,
    title: "Built for Trades",
    desc: "Not generic SaaS. Every feature designed for how trade businesses actually work.",
  },
];

const PLANS = [
  {
    name: "Starter",
    price: "$79",
    period: "/mo",
    desc: "For solo operators getting started",
    features: [
      "1 AI scheduling agent",
      "SMS reminders & follow-ups",
      "Basic invoicing",
      "Up to 50 jobs/month",
      "Email support",
    ],
    cta: "Start Free Trial",
    highlight: false,
  },
  {
    name: "Pro",
    price: "$149",
    period: "/mo",
    desc: "For growing crews that need full automation",
    features: [
      "All Starter features",
      "Unlimited AI agents",
      "Parts ordering & inventory",
      "QuickBooks integration",
      "Priority support",
      "Custom workflows",
    ],
    cta: "Start Free Trial",
    highlight: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    desc: "For multi-location operations",
    features: [
      "All Pro features",
      "Dedicated account manager",
      "Custom integrations",
      "SLA guarantees",
      "Multi-location support",
      "API access",
    ],
    cta: "Contact Sales",
    highlight: false,
  },
];

const TESTIMONIALS = [
  {
    name: "Mike Rodriguez",
    role: "Owner, Rodriguez Plumbing",
    text: "TitanCrew cut my office time in half. My schedule fills itself, invoices go out same day, and I haven't missed a parts order in months.",
    stars: 5,
  },
  {
    name: "Sarah Chen",
    role: "Operations Manager, CoolAir HVAC",
    text: "We went from 3 office staff to 1 after deploying TitanCrew. The AI handles scheduling for our 12-tech crew flawlessly.",
    stars: 5,
  },
  {
    name: "James Patterson",
    role: "Owner, Patterson Electric",
    text: "The ROI was instant. First month we recovered $4,200 in late invoices the AI chased down automatically.",
    stars: 5,
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0F1B2D] text-white">
      {/* Nav */}
      <nav className="border-b border-white/10 backdrop-blur bg-[#0F1B2D]/80 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[#FF6B00] rounded-lg flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" strokeWidth={2.5} />
            </div>
            <span className="text-xl font-extrabold tracking-tight">
              Titan<span className="text-[#FF6B00]">Crew</span>
            </span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm text-slate-300">
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
            <a href="#testimonials" className="hover:text-white transition-colors">Testimonials</a>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm text-slate-300 hover:text-white transition-colors">
              Log in
            </Link>
            <Link
              href="/signup"
              className="text-sm font-semibold px-4 py-2 bg-[#FF6B00] hover:bg-[#e55f00] rounded-lg transition-colors"
            >
              Start Free Trial
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-[#FF6B00]/10 via-transparent to-transparent" />
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-20 pb-24 text-center relative">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#FF6B00]/20 border border-[#FF6B00]/30 rounded-full text-xs font-medium text-[#FF6B00] mb-6">
            <Bot className="w-3.5 h-3.5" />
            AI-Powered Back Office for Trade Contractors
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-tight max-w-4xl mx-auto">
            Your AI crew runs the office
            <br />
            <span className="text-[#FF6B00]">while you run the jobs</span>
          </h1>
          <p className="mt-6 text-lg text-slate-300 max-w-2xl mx-auto leading-relaxed">
            TitanCrew deploys AI agents that handle scheduling, customer comms,
            invoicing, and parts ordering — so you can focus on the work that pays.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 px-6 py-3 bg-[#FF6B00] hover:bg-[#e55f00] text-white font-semibold rounded-lg text-base transition-colors shadow-lg shadow-[#FF6B00]/25"
            >
              Deploy Your AI Crew
              <ArrowRight className="w-4 h-4" />
            </Link>
            <a
              href="#features"
              className="inline-flex items-center gap-2 px-6 py-3 bg-white/10 hover:bg-white/15 text-white font-medium rounded-lg text-base transition-colors"
            >
              See How It Works
            </a>
          </div>
          <div className="mt-12 flex flex-wrap items-center justify-center gap-3">
            {TRADES.map((t) => (
              <span
                key={t}
                className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-xs text-slate-400"
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 bg-[#1A2744]/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-extrabold">
              Everything your back office needs.{" "}
              <span className="text-[#FF6B00]">Automated.</span>
            </h2>
            <p className="mt-4 text-slate-400 max-w-xl mx-auto">
              Deploy AI agents in 5 minutes. No coding, no consultants, no contracts.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <div
                  key={f.title}
                  className="rounded-xl border border-white/10 bg-white/5 p-6 hover:bg-white/[0.07] transition-colors"
                >
                  <div className="w-10 h-10 rounded-lg bg-[#FF6B00]/20 flex items-center justify-center mb-4">
                    <Icon className="w-5 h-5 text-[#FF6B00]" />
                  </div>
                  <h3 className="text-lg font-bold text-white mb-2">{f.title}</h3>
                  <p className="text-sm text-slate-400 leading-relaxed">{f.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Social proof */}
      <section className="py-12 border-y border-white/10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-wrap items-center justify-center gap-12 text-center">
          <div>
            <p className="text-3xl font-extrabold text-[#FF6B00]">500+</p>
            <p className="text-xs text-slate-400 mt-1">Trade Businesses</p>
          </div>
          <div>
            <p className="text-3xl font-extrabold text-white">12,000+</p>
            <p className="text-xs text-slate-400 mt-1">Jobs Scheduled</p>
          </div>
          <div>
            <p className="text-3xl font-extrabold text-white">$2.1M</p>
            <p className="text-xs text-slate-400 mt-1">Invoices Collected</p>
          </div>
          <div>
            <p className="text-3xl font-extrabold text-white">4.9/5</p>
            <p className="text-xs text-slate-400 mt-1">Customer Rating</p>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-extrabold">
              Trusted by contractors <span className="text-[#FF6B00]">who get it done</span>
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t) => (
              <div
                key={t.name}
                className="rounded-xl border border-white/10 bg-white/5 p-6"
              >
                <div className="flex gap-1 mb-4">
                  {Array.from({ length: t.stars }).map((_, i) => (
                    <Star key={i} className="w-4 h-4 text-[#FF6B00] fill-[#FF6B00]" />
                  ))}
                </div>
                <p className="text-sm text-slate-300 leading-relaxed mb-4">
                  &ldquo;{t.text}&rdquo;
                </p>
                <div>
                  <p className="text-sm font-semibold text-white">{t.name}</p>
                  <p className="text-xs text-slate-400">{t.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24 bg-[#1A2744]/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-extrabold">
              Simple pricing. <span className="text-[#FF6B00]">No surprises.</span>
            </h2>
            <p className="mt-4 text-slate-400">14-day free trial on all plans. Cancel anytime.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className={`rounded-xl border p-6 flex flex-col ${
                  plan.highlight
                    ? "border-[#FF6B00] bg-[#FF6B00]/10 ring-1 ring-[#FF6B00]/30"
                    : "border-white/10 bg-white/5"
                }`}
              >
                {plan.highlight && (
                  <span className="text-xs font-bold text-[#FF6B00] uppercase tracking-wider mb-2">
                    Most Popular
                  </span>
                )}
                <h3 className="text-xl font-bold text-white">{plan.name}</h3>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold text-white">{plan.price}</span>
                  <span className="text-sm text-slate-400">{plan.period}</span>
                </div>
                <p className="text-sm text-slate-400 mt-2">{plan.desc}</p>
                <ul className="mt-6 space-y-3 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-slate-300">
                      <CheckCircle2 className="w-4 h-4 text-[#FF6B00] mt-0.5 flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/signup"
                  className={`mt-6 block text-center py-2.5 rounded-lg font-semibold text-sm transition-colors ${
                    plan.highlight
                      ? "bg-[#FF6B00] hover:bg-[#e55f00] text-white"
                      : "bg-white/10 hover:bg-white/15 text-white"
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-3xl sm:text-4xl font-extrabold">
            Ready to put AI to work <span className="text-[#FF6B00]">for your business?</span>
          </h2>
          <p className="mt-4 text-slate-400 max-w-xl mx-auto">
            Deploy your AI crew in under 5 minutes. No credit card required.
          </p>
          <div className="mt-8">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 px-8 py-3.5 bg-[#FF6B00] hover:bg-[#e55f00] text-white font-semibold rounded-lg text-base transition-colors shadow-lg shadow-[#FF6B00]/25"
            >
              Start Your Free Trial
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 py-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-[#FF6B00] rounded flex items-center justify-center">
                <Zap className="w-3 h-3 text-white" strokeWidth={2.5} />
              </div>
              <span className="text-sm font-bold">
                Titan<span className="text-[#FF6B00]">Crew</span>
              </span>
            </div>
            <p className="text-xs text-slate-500">
              \u00a9 {new Date().getFullYear()} TitanCrew AI. All rights reserved.
            </p>
            <div className="flex items-center gap-6 text-xs text-slate-500">
              <a href="#" className="hover:text-white transition-colors">Privacy</a>
              <a href="#" className="hover:text-white transition-colors">Terms</a>
              <a href="mailto:stephen@titancrew.ai" className="hover:text-white transition-colors">Contact</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
