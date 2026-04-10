/**
 * TitanCrew · Onboarding Welcome Page
 * Shown after Stripe checkout.session.completed.
 * Animated reveal of the AI crew roster, then CTA to begin setup.
 */
"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Rocket, Zap } from "lucide-react";

const AGENTS = [
  { emoji: "🧠", name: "Foreman AI",   desc: "Daily briefing & oversight" },
  { emoji: "📅", name: "Scheduler AI", desc: "Fills your calendar 24/7" },
  { emoji: "💬", name: "Customer AI",  desc: "Confirmations & 5-star reviews" },
  { emoji: "💰", name: "Finance AI",   desc: "Auto-invoicing & follow-ups" },
  { emoji: "🔩", name: "Parts AI",     desc: "Reorder before you run out" },
  { emoji: "📈", name: "Growth AI",    desc: "Facebook posts & lead gen" },
];

function WelcomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [phase, setPhase] = useState(0);

  const name = searchParams.get("name") ?? "";

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 300);
    const t2 = setTimeout(() => setPhase(2), 1100);
    const t3 = setTimeout(() => setPhase(3), 2000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center bg-[#0D1626] px-4 py-12"
      style={{
        backgroundImage:
          "radial-gradient(ellipse 90% 55% at 50% -5%, rgba(255,107,0,0.18) 0%, transparent 65%)",
      }}
    >
      {/* Logo */}
      <div
        className={`flex items-center gap-3 mb-10 transition-all duration-700 ${
          phase >= 1 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
        }`}
      >
        <div className="w-12 h-12 bg-[#FF6B00] rounded-xl flex items-center justify-center shadow-[0_0_30px_rgba(255,107,0,0.5)]">
          <Zap className="w-6 h-6 text-white" strokeWidth={2.5} />
        </div>
        <div className="flex items-baseline gap-0">
          <span className="text-3xl font-extrabold text-white tracking-tight">Titan</span>
          <span className="text-3xl font-extrabold text-[#FF6B00] tracking-tight">Crew</span>
        </div>
      </div>

      {/* Heading */}
      <div
        className={`text-center mb-3 transition-all duration-700 delay-200 ${
          phase >= 1 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
        }`}
      >
        <h1 className="text-4xl md:text-5xl font-extrabold text-white leading-tight">
          Welcome to TitanCrew
          {name ? `, ${name.split(" ")[0]}` : ""}! 🚀
        </h1>
        <p className="text-lg text-slate-300 mt-3 max-w-md mx-auto">
          Your AI crew is assembled and ready to go to work.
        </p>
      </div>

      {/* Agent roster */}
      <div
        className={`grid grid-cols-2 md:grid-cols-3 gap-3 max-w-xl w-full mb-10 transition-all duration-700 delay-400 ${
          phase >= 2 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
        }`}
      >
        {AGENTS.map((agent, i) => (
          <div
            key={i}
            className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-4 flex items-center gap-3 hover:border-white/20 transition-colors"
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <span className="text-2xl flex-shrink-0">{agent.emoji}</span>
            <div className="min-w-0">
              <p className="text-white text-sm font-semibold truncate">{agent.name}</p>
              <p className="text-slate-400 text-xs truncate">{agent.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div
        className={`flex flex-col items-center gap-3 transition-all duration-700 delay-600 ${
          phase >= 3 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
        }`}
      >
        <button
          onClick={() => router.push("/onboarding")}
          className="flex items-center gap-3 bg-[#FF6B00] hover:bg-[#E55A00] text-white font-bold py-4 px-10 rounded-xl text-lg shadow-[0_0_35px_rgba(255,107,0,0.45)] hover:shadow-[0_0_50px_rgba(255,107,0,0.65)] transition-all duration-300"
        >
          <Rocket className="w-5 h-5" />
          Set Up My Crew
        </button>
        <p className="text-slate-500 text-sm">Takes about 5 minutes · Can skip any step</p>
      </div>
    </div>
  );
}

export default function WelcomePage() {
  return (
    <Suspense>
      <WelcomeContent />
    </Suspense>
  );
}
