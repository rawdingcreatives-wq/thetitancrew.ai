/**
 * TitanCrew · ROI / Savings Calculator
 * Interactive 4-slider calculator showing projected revenue lift, hours saved,
 * 30-day ROI, and break-even. Animated counters, orange glows, glassmorphism.
 *
 * Formula:
 *   Monthly jobs      = jobsPerWeek × 4.33
 *   Current revenue   = monthlyJobs × avgJobValue
 *   Revenue lift (18%)= currentRevenue × 0.18   (faster response + AI scheduling)
 *   Hours saved       = adminHours × 4.33 × 0.75
 *   ROI %             = (revenueLift / $799) × 100
 *   Break-even days   = ceil(799 / (revenueLift / 30))
 */
"use client";

import { useState, useEffect, useRef } from "react";
import { TrendingUp, Clock, DollarSign, Zap, ChevronRight } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────

export interface ROIData {
  technicians: number;
  jobsPerWeek: number;
  avgJobValue: number;
  adminHours: number;
}

interface ROICalculatorProps {
  initialData: ROIData;
  onUpdate: (data: ROIData) => void;
  onContinue?: () => void;
}

// ─── Animated counter hook ───────────────────────────────────

function useCountUp(target: number, duration = 900): number {
  const [count, setCount] = useState(0);
  const prevTarget = useRef(0);
  const frameRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const start = prevTarget.current;
    prevTarget.current = target;
    const startTime = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic for satisfying deceleration
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(start + (target - start) * eased));
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      }
    };

    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(animate);
    return () => { if (frameRef.current) cancelAnimationFrame(frameRef.current); };
  }, [target, duration]);

  return count;
}

// ─── ROI Math ────────────────────────────────────────────────

function calcROI(d: ROIData) {
  const monthlyJobs = d.jobsPerWeek * 4.33;
  const currentRevenue = monthlyJobs * d.avgJobValue;
  const revenueLift = Math.round(currentRevenue * 0.18);
  const hoursSaved = Math.round(d.adminHours * 4.33 * 0.75);
  const planCost = 799;
  const roi = Math.round((revenueLift / planCost) * 100);
  const breakEvenDays = Math.max(1, Math.ceil(planCost / Math.max(1, revenueLift / 30)));
  return { revenueLift, hoursSaved, roi, breakEvenDays };
}

// ─── Result card ─────────────────────────────────────────────

function ResultCard({
  icon: Icon,
  label,
  value,
  prefix = "",
  suffix = "",
  color,
  glow,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  color: string;
  glow: string;
}) {
  const animated = useCountUp(value);

  return (
    <div
      className="rounded-2xl p-5 flex flex-col gap-3 transition-all duration-500"
      style={{
        background: "rgba(13,22,38,0.7)",
        border: `1px solid ${color}28`,
        boxShadow: `0 0 28px ${glow}, 0 4px 24px rgba(0,0,0,0.4)`,
      }}
    >
      <div className="flex items-center gap-2">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ background: `${color}18` }}
        >
          <Icon className="w-3.5 h-3.5" style={{ color }} />
        </div>
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
          {label}
        </span>
      </div>
      <div
        className="text-3xl font-extrabold leading-none tabular-nums"
        style={{
          color,
          textShadow: `0 0 24px ${color}50`,
        }}
      >
        {prefix}
        {animated.toLocaleString()}
        {suffix}
      </div>
    </div>
  );
}

// ─── Slider input ────────────────────────────────────────────

function SliderInput({
  label,
  value,
  min,
  max,
  step = 1,
  prefix = "",
  suffix = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  prefix?: string;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  const pct = Math.round(((value - min) / (max - min)) * 100);

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
          {label}
        </label>
        <span className="text-sm font-bold text-white tabular-nums">
          {prefix}
          {value.toLocaleString()}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="titan-slider w-full h-2 rounded-full appearance-none cursor-pointer focus:outline-none"
        style={{
          background: `linear-gradient(to right, #FF6B00 0%, #FF9500 ${pct}%, rgba(255,255,255,0.1) ${pct}%, rgba(255,255,255,0.1) 100%)`,
        }}
      />
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────

export function ROICalculator({ initialData, onUpdate, onContinue }: ROICalculatorProps) {
  const [data, setData] = useState<ROIData>(initialData);
  const results = calcROI(data);

  const handleChange = (key: keyof ROIData, value: number) => {
    const next = { ...data, [key]: value };
    setData(next);
    onUpdate(next);
  };

  return (
    <div className="space-y-4">
      {/* Slider CSS */}
      <style>{`
        .titan-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #FF6B00;
          cursor: pointer;
          box-shadow: 0 0 10px rgba(255,107,0,0.6), 0 0 0 3px rgba(255,107,0,0.2);
          border: 2px solid rgba(255,255,255,0.3);
          transition: box-shadow 0.2s;
        }
        .titan-slider::-webkit-slider-thumb:hover {
          box-shadow: 0 0 16px rgba(255,107,0,0.8), 0 0 0 5px rgba(255,107,0,0.25);
        }
        .titan-slider::-moz-range-thumb {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #FF6B00;
          cursor: pointer;
          border: 2px solid rgba(255,255,255,0.3);
          box-shadow: 0 0 10px rgba(255,107,0,0.6);
        }
      `}</style>

      {/* Header */}
      <div
        className="rounded-2xl p-6 shadow-2xl"
        style={{
          background: "rgba(255,255,255,0.05)",
          backdropFilter: "blur(12px)",
          border: "1px solid rgba(255,255,255,0.1)",
        }}
      >
        <div className="flex items-center gap-3 mb-1">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{
              background: "rgba(255,107,0,0.15)",
              border: "1px solid rgba(255,107,0,0.3)",
              boxShadow: "0 0 20px rgba(255,107,0,0.2)",
            }}
          >
            <TrendingUp className="w-5 h-5 text-[#FF6B00]" />
          </div>
          <div>
            <h2 className="text-xl font-extrabold text-white">Your Revenue Potential</h2>
            <p className="text-sm text-slate-400 mt-0.5">
              See exactly what TitanCrew will make you — live
            </p>
          </div>
        </div>
      </div>

      {/* Sliders */}
      <div
        className="rounded-2xl p-6 shadow-2xl space-y-6"
        style={{
          background: "rgba(255,255,255,0.05)",
          backdropFilter: "blur(12px)",
          border: "1px solid rgba(255,255,255,0.1)",
        }}
      >
        <SliderInput
          label="Active Technicians"
          value={data.technicians}
          min={1}
          max={20}
          onChange={(v) => handleChange("technicians", v)}
        />
        <SliderInput
          label="Jobs per Week"
          value={data.jobsPerWeek}
          min={1}
          max={100}
          onChange={(v) => handleChange("jobsPerWeek", v)}
        />
        <SliderInput
          label="Avg Revenue per Job"
          value={data.avgJobValue}
          min={100}
          max={5000}
          step={50}
          prefix="$"
          onChange={(v) => handleChange("avgJobValue", v)}
        />
        <SliderInput
          label="Admin Hours / Week"
          value={data.adminHours}
          min={1}
          max={40}
          suffix=" hrs"
          onChange={(v) => handleChange("adminHours", v)}
        />
      </div>

      {/* Results grid */}
      <div className="grid grid-cols-2 gap-3">
        <ResultCard
          icon={DollarSign}
          label="Revenue lift / month"
          value={results.revenueLift}
          prefix="+$"
          color="#FF6B00"
          glow="rgba(255,107,0,0.15)"
        />
        <ResultCard
          icon={Clock}
          label="Hours saved / month"
          value={results.hoursSaved}
          suffix=" hrs"
          color="#10B981"
          glow="rgba(16,185,129,0.12)"
        />
        <ResultCard
          icon={TrendingUp}
          label="ROI in 30 days"
          value={results.roi}
          suffix="%"
          color="#818CF8"
          glow="rgba(129,140,248,0.12)"
        />
        <ResultCard
          icon={Zap}
          label="Break-even in"
          value={results.breakEvenDays}
          suffix=" days"
          color="#F59E0B"
          glow="rgba(245,158,11,0.12)"
        />
      </div>

      {/* Disclaimer */}
      <div className="text-center space-y-1 px-2">
        <p className="text-xs text-slate-500 italic">
          Based on average TitanCrew customer data — your results may vary.
        </p>
        <p className="text-xs text-slate-600">
          18% revenue improvement from AI scheduling, faster response times & automated follow-ups.
        </p>
      </div>

      {/* CTA */}
      {onContinue && (
        <button
          onClick={onContinue}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-white transition-all duration-300"
          style={{
            background: "linear-gradient(135deg, #FF6B00, #FF9500)",
            boxShadow: "0 0 25px rgba(255,107,0,0.4)",
          }}
        >
          This looks great — let's connect my tools
          <ChevronRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
