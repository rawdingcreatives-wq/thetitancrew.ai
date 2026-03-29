// @ts-nocheck
/**
 * TitanCrew — SocialActivityChart
 * Pie/donut chart showing social posts by platform using Recharts.
 */

"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";

interface Props {
  platformCounts: Record<string, number>;
}

const PLATFORM_COLORS: Record<string, string> = {
  facebook: "#1877F2",
  reddit: "#FF6314",
  nextdoor: "#00B246",
  linkedin: "#0A66C2",
};

const PLATFORM_LABELS: Record<string, string> = {
  facebook: "Facebook",
  reddit: "Reddit",
  nextdoor: "Nextdoor",
  linkedin: "LinkedIn",
};

export default function SocialActivityChart({ platformCounts }: Props) {
  const data = Object.entries(platformCounts).map(([platform, count]) => ({
    name: PLATFORM_LABELS[platform] ?? platform,
    value: count,
    color: PLATFORM_COLORS[platform] ?? "#94a3b8",
  }));

  if (data.length === 0) {
    return (
      <div className="text-center py-6">
        <p className="text-trade-navy-400 text-sm">No posts yet this month</p>
        <p className="text-xs text-trade-navy-300 mt-1">
          The agent will start posting once groups are configured
        </p>
      </div>
    );
  }

  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <div>
      <div className="relative">
        <ResponsiveContainer width="100%" height={160}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={45}
              outerRadius={70}
              paddingAngle={3}
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number, name: string) => [`${value} posts`, name]}
              contentStyle={{
                backgroundColor: "#1A2744",
                border: "none",
                borderRadius: "8px",
                color: "white",
                fontSize: "12px",
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        {/* Center total */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <p className="text-2xl font-bold text-trade-navy-900">{total}</p>
            <p className="text-xs text-trade-navy-400">posts</p>
          </div>
        </div>
      </div>
    </div>
  );
}
