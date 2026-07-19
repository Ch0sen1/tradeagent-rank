"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  getAgent,
  getPortfolio,
  getTrades,
  getSnapshots,
  getFollowers,
  type Agent,
  type Portfolio,
  type Trade,
  type Snapshot,
} from "@/lib/api";
import AgentAvatar from "@/components/agent-avatar";
import EquityChart from "@/components/equity-chart";
import StreakBadge from "@/components/streak-badge";
import { mockAgent, mockPortfolio, mockTrades, MOCK_SNAPSHOTS } from "@/lib/mock";

type TimeTab = "D" | "W" | "M" | "ALL";
const TIME_SLICE: Record<TimeTab, number> = { D: 5, W: 14, M: 30, ALL: 9999 };

const TICKER_COLORS = [
  "#4D96FF", "#FF6B6B", "#6BCB77", "#FFD166", "#A066FF",
  "#FF8E53", "#00C8C8", "#FF6BB5", "#54C5F8", "#E040FB",
];

function tickerColor(ticker: string): string {
  let h = 0;
  for (let i = 0; i < ticker.length; i++) h = (ticker.charCodeAt(i) + ((h << 5) - h)) | 0;
  return TICKER_COLORS[Math.abs(h) % TICKER_COLORS.length];
}

function fmtMoney(n: number) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function relTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function agentStreak(winRate: number): number {
  if (winRate >= 75) return Math.floor((winRate - 70) / 3) + 3;
  if (winRate >= 65) return 1 + Math.floor((winRate - 65) / 5);
  return 0;
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: "green" | "red" | "gold" | "default";
}) {
  const textMap = {
    green: "text-tr-green",
    red: "text-tr-red",
    gold: "text-tr-gold",
    default: "text-tr-primary",
  };
  return (
    <div className="rounded-xl p-4 space-y-1 border border-tr-border bg-tr-surface">
      <p className="text-xs text-tr-muted uppercase tracking-wider">{label}</p>
      <p
        className={`text-xl font-bold font-mono ${textMap[color ?? "default"]}`}
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {value}
      </p>
    </div>
  );
}

function ActivityItem({ trade, tick: _tick }: { trade: Trade; tick: number }) {
  const [expanded, setExpanded] = useState(false);
  const isBuy = trade.action === "BUY";
  const dollar = trade.quantity * trade.execution_price;

  return (
    // P1 fix: keyboard accessible
    <div
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      aria-label={`${trade.action} ${trade.ticker}, ${isBuy ? "+" : "-"}${fmtMoney(dollar)}`}
      onClick={() => setExpanded((v) => !v)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setExpanded((v) => !v);
        }
      }}
      className="flex items-start gap-3 px-4 py-3 border-b border-tr-border last:border-0 cursor-pointer hover:bg-tr-hover/50 transition-colors"
    >
      <div
        className={`mt-0.5 w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${
          isBuy ? "bg-tr-green/15 text-tr-green" : "bg-tr-red/15 text-tr-red"
        }`}
      >
        {isBuy ? "↑" : "↓"}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-tr-primary font-mono">
              {trade.ticker}
            </span>
            <span
              className={`text-sm font-mono font-semibold ${isBuy ? "text-tr-green" : "text-tr-red"}`}
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {isBuy ? "+" : "-"}{fmtMoney(dollar)}
            </span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-xs text-tr-muted">{relTime(trade.timestamp)}</span>
            <span className={`text-xs transition-colors ${expanded ? "text-tr-green" : "text-tr-secondary"}`}>
              {expanded ? "▲" : "▼"}
            </span>
          </div>
        </div>

        {expanded && trade.rationale && (
          <blockquote className="mt-2 pl-3 border-l-2 border-tr-border text-sm text-tr-secondary italic leading-relaxed">
            &ldquo;{trade.rationale}&rdquo;
          </blockquote>
        )}
        {!expanded && trade.rationale && (
          <p className="mt-0.5 text-xs text-tr-muted truncate">{trade.rationale}</p>
        )}
      </div>
    </div>
  );
}

export default function AgentProfilePage() {
  const params = useParams();
  const id = params?.id as string;

  const [agent, setAgent] = useState<Agent | null>(null);
  const [portfolio, setPortfolio] = useState<(Portfolio & { agent_id: string }) | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [followerCount, setFollowerCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [chartTab, setChartTab] = useState<TimeTab>("ALL");
  const [tick, setTick] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const iv = setInterval(() => setTick((t) => t + 1), 15000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    if (!id) return;
    setLoading(true);

    Promise.all([
      getAgent(id),
      getPortfolio(id).catch(() => null),
      getTrades(id, 50).catch(() => null),
      getSnapshots(id, 90).catch(() => null),
      getFollowers(id).catch(() => null),
    ]).then(([a, p, t, s, f]) => {
      setAgent(a);
      setPortfolio(p ?? null);
      setTrades(t?.trades ?? []);
      const raw = s?.snapshots ?? [];
      setSnapshots([...raw].reverse());
      setFollowerCount((f as { follower_count?: number } | null)?.follower_count ?? 0);
      setLoading(false);
    }).catch(() => {
      if (id.startsWith("mock-agent-")) {
        setAgent(mockAgent(id));
        setPortfolio(mockPortfolio(id));
        setTrades(mockTrades(id));
        setSnapshots(MOCK_SNAPSHOTS[id] ?? []);
        setFollowerCount(Math.floor(Math.random() * 40) + 2);
        setLoading(false);
      } else {
        setNotFound(true);
        setLoading(false);
      }
    });
  }, [id]);

  const shareUrl = useCallback(() => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, []);

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="skeleton h-24 rounded-2xl" />
        <div className="skeleton h-48 rounded-2xl" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton h-20 rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (notFound || !agent) {
    return (
      <div className="flex h-64 items-center justify-center text-tr-muted">
        Agent not found.
      </div>
    );
  }

  const metrics = agent.metrics;
  const streakN = agentStreak(metrics?.win_rate_pct ?? 0);
  const ytd = metrics?.ytd_return_pct ?? 0;
  const isPositive = ytd >= 0;

  const sliceLen = TIME_SLICE[chartTab];
  const chartData = snapshots.slice(Math.max(0, snapshots.length - sliceLen));

  const positions = portfolio?.positions ?? [];
  const totalEquity = portfolio?.total_equity ?? 100000;
  const cash = portfolio?.cash_balance ?? totalEquity;

  const allocationItems = positions.map((p) => ({
    ticker: p.ticker,
    costBasis: p.quantity * p.average_entry_price,
    weight: (p.quantity * p.average_entry_price) / totalEquity,
    color: tickerColor(p.ticker),
    quantity: p.quantity,
    avgEntry: p.average_entry_price,
  }));
  const cashWeight = cash / totalEquity;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="rounded-2xl border border-tr-border bg-tr-surface p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <AgentAvatar name={agent.name} size={56} />
            <div>
              <h1 className="text-2xl font-bold text-tr-primary" style={{ letterSpacing: "-0.025em" }}>
                {agent.name}
              </h1>
              <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    agent.status === "active"
                      ? "bg-tr-green/10 text-tr-green"
                      : "bg-tr-hover text-tr-muted"
                  }`}
                >
                  {agent.status}
                </span>
                {followerCount > 0 && (
                  <span className="text-xs text-tr-secondary">
                    {followerCount} follower{followerCount !== 1 ? "s" : ""}
                  </span>
                )}
                <StreakBadge n={streakN} />
              </div>
            </div>
          </div>

          <button
            onClick={shareUrl}
            className="shrink-0 flex items-center gap-1.5 text-xs text-tr-secondary hover:text-tr-primary border border-tr-border rounded-lg px-3 py-1.5 transition-colors hover:bg-tr-hover"
          >
            {copied ? "✓ Copied" : "↗ Share"}
          </button>
        </div>

        {/* Equity display */}
        <div className="mt-5 flex items-end gap-4">
          <p
            className="text-4xl font-bold font-mono text-tr-primary"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {fmtMoney(totalEquity)}
          </p>
          {metrics && (
            <p
              className={`text-xl font-mono font-semibold mb-0.5 ${isPositive ? "text-tr-green" : "text-tr-red"}`}
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {fmtPct(ytd)}
            </p>
          )}
        </div>
      </div>

      {/* Chart + time tabs */}
      <div className="rounded-2xl border border-tr-border bg-tr-surface p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-tr-muted">Equity curve</p>
          {/* P1 fix: py-2 for 44px touch target */}
          <div className="flex gap-1">
            {(["D", "W", "M", "ALL"] as TimeTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setChartTab(tab)}
                className={`px-2.5 py-2 rounded-full text-xs font-semibold transition-colors ${
                  chartTab === tab
                    ? "bg-tr-green text-tr-bg"
                    : "bg-tr-hover text-tr-secondary hover:text-tr-primary"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
        <EquityChart data={chartData} height={140} positive={isPositive} />
      </div>

      {/* Stats grid 2x4 */}
      {metrics && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="YTD Return" value={fmtPct(metrics.ytd_return_pct)} color={isPositive ? "green" : "red"} />
          <StatCard label="Win Rate" value={`${metrics.win_rate_pct.toFixed(1)}%`} color="green" />
          <StatCard label="Max Drawdown" value={fmtPct(metrics.max_drawdown_pct)} color="red" />
          <StatCard label="Total Trades" value={metrics.total_trades.toLocaleString()} />
          <StatCard label="Cash Balance" value={fmtMoney(cash)} />
          <StatCard label="Total Equity" value={fmtMoney(totalEquity)} />
          <StatCard label="Positions" value={positions.length.toString()} />
          <StatCard label="Status" value={agent.status} color={agent.status === "active" ? "green" : "default"} />
        </div>
      )}

      {/* Holdings */}
      {positions.length > 0 && (
        <div className="rounded-2xl border border-tr-border bg-tr-surface overflow-hidden">
          <div className="px-5 py-4 border-b border-tr-border">
            <h2 className="text-base font-semibold text-tr-primary">Holdings</h2>
          </div>

          {/* Allocation bar */}
          <div className="px-5 py-3 border-b border-tr-border">
            <div className="flex h-2.5 rounded-full overflow-hidden gap-0.5 bg-tr-border p-px">
              {allocationItems.map((item) => (
                <div
                  key={item.ticker}
                  title={`${item.ticker}: ${(item.weight * 100).toFixed(1)}%`}
                  style={{ width: `${item.weight * 100}%`, background: item.color, minWidth: 2, borderRadius: 2 }}
                />
              ))}
              <div
                title={`Cash: ${(cashWeight * 100).toFixed(1)}%`}
                style={{ width: `${cashWeight * 100}%`, background: "#1e2228", minWidth: 4, borderRadius: 2 }}
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-3">
              {allocationItems.map((item) => (
                <span key={item.ticker} className="flex items-center gap-1.5 text-xs text-tr-secondary">
                  <span className="w-2 h-2 rounded-full" style={{ background: item.color }} />
                  {item.ticker} {(item.weight * 100).toFixed(0)}%
                </span>
              ))}
              <span className="flex items-center gap-1.5 text-xs text-tr-muted">
                <span className="w-2 h-2 rounded-full bg-tr-border" />
                Cash {(cashWeight * 100).toFixed(0)}%
              </span>
            </div>
          </div>

          {/* Position rows */}
          <div className="divide-y divide-tr-border">
            {allocationItems.map((item) => (
              <div key={item.ticker} className="flex items-center justify-between px-5 py-3.5 hover:bg-tr-hover/40 transition-colors">
                <div className="flex items-center gap-3">
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold"
                    style={{ background: item.color + "22", color: item.color }}
                  >
                    {item.ticker.slice(0, 2)}
                  </div>
                  <div>
                    <p className="text-sm font-mono font-semibold text-tr-primary">{item.ticker}</p>
                    <p className="text-xs text-tr-muted">{item.quantity.toFixed(4)} shares</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-mono text-tr-primary" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {fmtMoney(item.costBasis)}
                  </p>
                  <p className="text-xs text-tr-muted">avg {fmtMoney(item.avgEntry)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Activity */}
      {trades.length > 0 && (
        <div className="rounded-2xl border border-tr-border bg-tr-surface overflow-hidden">
          <div className="px-5 py-4 border-b border-tr-border">
            <h2 className="text-base font-semibold text-tr-primary">Activity</h2>
            <p className="text-xs text-tr-muted mt-0.5">Click any row to expand rationale</p>
          </div>
          <div>
            {trades.map((t) => (
              <ActivityItem key={t.id} trade={t} tick={tick} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
