/**
 * TitanCrew · RevenueChart
 * Weekly revenue bar chart with AI vs manual breakdown.
 * Uses recharts (available via CDN in shadcn setups).
 */

"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from "recharts";

interface WeekData {
  week: string;
  total: number;
  ai: number;
}

interface RevenueChartProps {
  data: WeekData[];
}

const CustomTooltip = ({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ value: number; name: string; color: string }>;
  label?: string;
}) => {
  if (!active || !payload) return null;
  const total = payload.find((p) => p.name === "Total");
  const ai = payload.find((p) => p.name === "AI Booked");

  return (
    <div className="bg-[#1A2744] text-white rounded-xl p-3 shadow-xl border border-white/10 text-xs">
      <p className="font-semibold mb-2">Week of {label}</p>
      {total && <p>Total: <span className="font-bold">${total.value.toLocaleString()}</span></p>}
      {ai && (
        <p className="text-[#FF6B00]">
          AI: <span className="font-bold">${ai.value.toLocaleString()}</span>
          {total && total.value > 0 && (
            <span className="text-slate-400 ml-1">
              ({((ai.value / total.value) * 100).toFixed(0)}%)
            </span>
          )}
        </p>
      )}
    </div>
  );
};

export function RevenueChart({ data }: RevenueChartProps) {
  if (data.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center">
        <p className="text-sm text-slate-400">No revenue data yet. Check back after your first completed jobs.</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }} barGap={2}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis
          dataKey="week"
          tick={{ fontSize: 11, fill: "#94a3b8" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "#94a3b8" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "#f8faff" }} />
        <Legend
          wrapperStyle={{ fontSize: "12px", color: "#64748b" }}
          iconType="square"
          iconSize={10}
        />
        <Bar dataKey="total" name="Total" fill="#e2e8f0" radius={[3, 3, 0, 0]} />
        <Bar dataKey="ai" name="AI Booked" fill="#FF6B00" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
