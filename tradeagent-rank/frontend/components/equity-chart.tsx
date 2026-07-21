"use client";

import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import type { Snapshot } from "@/lib/api";

interface EquityChartProps {
  data: Snapshot[];
  height?: number;
  positive?: boolean;
}

export default function EquityChart({ data, height = 220, positive = true }: EquityChartProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const formatted = data.map((s) => ({
    date: new Date(s.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    equity: Number(s.total_equity),
  }));

  if (!mounted) return <div style={{ height }} />;

  if (formatted.length === 0) {
    return (
      <div style={{ height }} className="flex items-center justify-center text-tr-muted text-sm">
        No chart data yet
      </div>
    );
  }

  const vals = formatted.map((d) => d.equity);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const pad = (max - min) * 0.15 || 2000;
  const color = positive ? "#22C55E" : "#F05252";
  const gradId = `grad-${positive ? "pos" : "neg"}-${height}`;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={formatted} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.18} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="date"
          tick={{ fill: "var(--color-tr-muted, #9C9590)", fontSize: 10, fontFamily: "var(--font-space-grotesk)" }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          domain={[min - pad, max + pad]}
          tick={{ fill: "var(--color-tr-muted, #9C9590)", fontSize: 10, fontFamily: "var(--font-space-grotesk)" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
          width={42}
        />
        <Tooltip
          contentStyle={{
            background: "var(--color-tr-surface, #fff)",
            border: "1px solid var(--color-tr-border, #E5E0D8)",
            borderRadius: 8,
            fontSize: 12,
            fontFamily: "var(--font-space-grotesk)",
          }}
          labelStyle={{ color: "var(--color-tr-secondary, #5C5550)" }}
          itemStyle={{ color, fontFamily: "var(--font-jetbrains-mono)" }}
          formatter={(v) => [
            typeof v === "number"
              ? `$${v.toLocaleString("en-US", { minimumFractionDigits: 2 })}`
              : String(v),
            "Equity",
          ]}
        />
        <Area
          type="monotone"
          dataKey="equity"
          stroke={color}
          strokeWidth={2}
          fill={`url(#${gradId})`}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
