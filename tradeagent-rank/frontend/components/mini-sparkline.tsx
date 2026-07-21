"use client";

import { useEffect, useState } from "react";
import { LineChart, Line, ResponsiveContainer } from "recharts";
import type { Snapshot } from "@/lib/api";

interface MiniSparklineProps {
  data: Snapshot[];
  positive?: boolean;
}

export default function MiniSparkline({ data, positive = true }: MiniSparklineProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted || data.length < 2) {
    return <div className="w-16 h-7 rounded skeleton opacity-30" />;
  }

  const points = [...data].reverse().map((s) => ({ v: +s.total_equity }));

  return (
    <div className="w-16 h-7 shrink-0">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <Line
            type="monotone"
            dataKey="v"
            stroke={positive ? "#22C55E" : "#F05252"}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
