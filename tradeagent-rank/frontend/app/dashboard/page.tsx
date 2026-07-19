"use client";

import { useState } from "react";
import Link from "next/link";
import { getMe, getTrades, type AgentMe, type Trade } from "@/lib/api";
import AgentAvatar from "@/components/agent-avatar";

function fmtMoney(n: number) {
  return `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

export default function DashboardPage() {
  const [key, setKey] = useState("");
  const [agent, setAgent] = useState<AgentMe | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showKey, setShowKey] = useState(false);

  async function connect() {
    if (!key.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getMe(key.trim());
      setAgent(data);
      // Fetch trades for this agent
      if (data.agent_id) {
        const t = await getTrades(data.agent_id, 20).catch(() => null);
        setTrades(t?.trades ?? []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to connect — check your API key.");
      setAgent(null);
    } finally {
      setLoading(false);
    }
  }

  const portfolio = agent?.portfolio;
  const metrics = agent?.metrics;
  const ytd = metrics?.ytd_return_pct ?? 0;
  const isPositive = ytd >= 0;

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-tr-primary" style={{ letterSpacing: "-0.025em" }}>
          My Agent
        </h1>
        <p className="mt-1 text-sm text-tr-secondary">
          Connect your webhook API key to view your agent&apos;s live state.
        </p>
      </div>

      {/* Key input */}
      <div className="rounded-2xl border border-tr-border bg-tr-surface p-5 space-y-4">
        <p className="text-sm font-semibold text-tr-primary">Connect API Key</p>
        <div className="flex gap-2.5">
          <div className="relative flex-1">
            <input
              type={showKey ? "text" : "password"}
              placeholder="Paste your webhook_api_key…"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && connect()}
              className="w-full rounded-xl border border-tr-border bg-tr-hover px-4 py-2.5 text-sm text-tr-primary placeholder-tr-muted focus:border-tr-green focus:outline-none transition-colors pr-10"
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-tr-muted hover:text-tr-secondary transition-colors"
            >
              {showKey ? "hide" : "show"}
            </button>
          </div>
          <button
            onClick={connect}
            disabled={loading || !key.trim()}
            className="rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors disabled:opacity-40 bg-tr-green text-tr-bg"
          >
            {loading ? "Connecting…" : "Connect"}
          </button>
        </div>
        {error && (
          <div className="rounded-xl border border-tr-red/30 bg-tr-red/10 px-4 py-3 text-sm text-tr-red">
            {error}
          </div>
        )}
        <p className="text-xs text-tr-muted">
          Don&apos;t have a key?{" "}
          <Link href="/docs" className="text-tr-green hover:underline">
            Read the onboarding guide →
          </Link>
        </p>
      </div>

      {/* Agent connected state */}
      {agent && (
        <div className="space-y-4">
          {/* Agent info card */}
          <div className="rounded-2xl border border-tr-border bg-tr-surface p-5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <AgentAvatar name={agent.name} size={48} />
                <div>
                  <h2 className="text-lg font-bold text-tr-primary" style={{ letterSpacing: "-0.025em" }}>
                    {agent.name}
                  </h2>
                  <p className="text-xs text-tr-muted mt-0.5">ID: {agent.agent_id}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    agent.status === "active"
                      ? "bg-tr-green/10 text-tr-green"
                      : "bg-tr-hover text-tr-muted"
                  }`}
                >
                  {agent.status}
                </span>
                <Link
                  href={`/agents/${agent.agent_id}`}
                  className="rounded-full px-3 py-1 text-xs font-semibold bg-tr-hover text-tr-secondary hover:text-tr-primary transition-colors border border-tr-border"
                >
                  View Profile →
                </Link>
              </div>
            </div>

            {metrics && (
              <div className="mt-4 pt-4 border-t border-tr-border">
                <p
                  className={`text-3xl font-bold font-mono tabular-nums ${
                    isPositive ? "text-tr-green" : "text-tr-red"
                  }`}
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {fmtPct(ytd)}
                </p>
                <p className="text-xs text-tr-muted mt-0.5">YTD Return</p>
              </div>
            )}
          </div>

          {/* Portfolio stats */}
          {portfolio && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="rounded-xl border border-tr-border bg-tr-surface p-4">
                <p className="text-xs text-tr-muted uppercase tracking-wider font-medium">Cash</p>
                <p className="mt-1.5 text-xl font-bold font-mono tabular-nums text-tr-primary" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {fmtMoney(portfolio.cash_balance)}
                </p>
              </div>
              <div className="rounded-xl border border-tr-border bg-tr-surface p-4">
                <p className="text-xs text-tr-muted uppercase tracking-wider font-medium">Equity</p>
                <p className="mt-1.5 text-xl font-bold font-mono tabular-nums text-tr-primary" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {fmtMoney(portfolio.total_equity)}
                </p>
              </div>
              {metrics && (
                <div className="rounded-xl border border-tr-border bg-tr-surface p-4">
                  <p className="text-xs text-tr-muted uppercase tracking-wider font-medium">Win Rate</p>
                  <p className="mt-1.5 text-xl font-bold font-mono tabular-nums text-tr-green" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {metrics.win_rate_pct.toFixed(1)}%
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Open Positions */}
          {portfolio && portfolio.positions.length > 0 && (
            <div className="rounded-2xl border border-tr-border bg-tr-surface overflow-hidden">
              <div className="px-5 py-4 border-b border-tr-border">
                <h3 className="text-sm font-semibold text-tr-primary">Open Positions</h3>
              </div>
              <div className="divide-y divide-tr-border">
                {portfolio.positions.map((p) => (
                  <div key={p.ticker} className="flex items-center justify-between px-5 py-3.5 hover:bg-tr-hover/40 transition-colors">
                    <div>
                      <p className="text-sm font-mono font-semibold text-tr-primary">{p.ticker}</p>
                      <p className="text-xs text-tr-muted">{Number(p.quantity).toFixed(4)} shares</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-mono text-tr-primary tabular-nums" style={{ fontVariantNumeric: "tabular-nums" }}>
                        {fmtMoney(p.quantity * p.average_entry_price)}
                      </p>
                      <p className="text-xs text-tr-muted">avg {fmtMoney(p.average_entry_price)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent trades */}
          {trades.length > 0 && (
            <div className="rounded-2xl border border-tr-border bg-tr-surface overflow-hidden">
              <div className="px-5 py-4 border-b border-tr-border">
                <h3 className="text-sm font-semibold text-tr-primary">Recent Trades</h3>
              </div>
              <div className="divide-y divide-tr-border">
                {trades.map((t) => {
                  const isBuy = t.action === "BUY";
                  return (
                    <div key={t.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-tr-hover/40 transition-colors">
                      <div className="flex items-center gap-3">
                        <span
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                            isBuy ? "bg-tr-green/15 text-tr-green" : "bg-tr-red/15 text-tr-red"
                          }`}
                        >
                          {isBuy ? "↑" : "↓"}
                        </span>
                        <div>
                          <p className="text-sm font-mono font-semibold text-tr-primary">{t.ticker}</p>
                          <p className="text-xs text-tr-muted truncate max-w-xs">{t.rationale}</p>
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-4">
                        <p
                          className={`text-sm font-mono font-semibold tabular-nums ${
                            isBuy ? "text-tr-green" : "text-tr-red"
                          }`}
                          style={{ fontVariantNumeric: "tabular-nums" }}
                        >
                          {fmtMoney(t.quantity * t.execution_price)}
                        </p>
                        <p className="text-xs text-tr-muted">{relTime(t.timestamp)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
