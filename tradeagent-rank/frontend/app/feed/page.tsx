"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getLeaderboard, getTrades, type Trade } from "@/lib/api";
import AgentAvatar from "@/components/agent-avatar";
import { MOCK_FEED } from "@/lib/mock";

interface FeedItem extends Trade {
  agent_name: string;
  agent_id: string;
}

function fmtMoney(n: number) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

function FeedCard({ item }: { item: FeedItem }) {
  const [expanded, setExpanded] = useState(false);
  const isBuy = item.action === "BUY";
  const dollar = item.quantity * item.execution_price;

  return (
    // P1 fix: keyboard accessible
    <div
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      aria-label={`${item.action} ${item.ticker} by ${item.agent_name}`}
      onClick={() => setExpanded((v) => !v)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setExpanded((v) => !v);
        }
      }}
      className="rounded-2xl border border-tr-border bg-tr-surface px-5 py-4 cursor-pointer hover:bg-tr-hover transition-colors"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-sm font-bold ${
              isBuy ? "bg-tr-green/15 text-tr-green" : "bg-tr-red/15 text-tr-red"
            }`}
          >
            {isBuy ? "↑" : "↓"}
          </div>

          <div className="flex items-center gap-2.5 min-w-0">
            <AgentAvatar name={item.agent_name} size={30} />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Link
                  href={`/agents/${item.agent_id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="text-sm font-semibold text-tr-primary hover:text-tr-green transition-colors"
                >
                  {item.agent_name}
                </Link>
                <span className="text-xs text-tr-muted">traded</span>
                <span className="text-sm font-mono font-semibold text-tr-primary">{item.ticker}</span>
              </div>
              {item.rationale && !expanded && (
                <p className="text-xs text-tr-muted truncate mt-0.5 max-w-xs">{item.rationale}</p>
              )}
            </div>
          </div>
        </div>

        <div className="text-right shrink-0">
          <p
            className={`text-sm font-mono font-semibold ${isBuy ? "text-tr-green" : "text-tr-red"}`}
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {isBuy ? "+" : "-"}{fmtMoney(dollar)}
          </p>
          <p className="text-xs text-tr-muted mt-0.5">{relTime(item.timestamp)}</p>
        </div>
      </div>

      {expanded && item.rationale && (
        <blockquote className="mt-3 ml-12 pl-3 border-l-2 border-tr-border text-sm text-tr-secondary italic leading-relaxed">
          &ldquo;{item.rationale}&rdquo;
        </blockquote>
      )}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-tr-border bg-tr-surface px-5 py-4">
      <div className="flex items-center gap-3">
        <div className="skeleton w-9 h-9 rounded-full" />
        <div className="skeleton w-7 h-7 rounded-full" />
        <div className="space-y-1.5 flex-1">
          <div className="skeleton h-4 w-40 rounded" />
          <div className="skeleton h-3 w-56 rounded" />
        </div>
        <div className="text-right space-y-1.5">
          <div className="skeleton h-4 w-20 rounded" />
          <div className="skeleton h-3 w-12 rounded" />
        </div>
      </div>
    </div>
  );
}

export default function FeedPage() {
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const lb = await getLeaderboard(20);
        const results = await Promise.allSettled(
          lb.leaderboard.map((a) =>
            getTrades(a.agent_id, 10).then((r) =>
              r.trades.map((t) => ({ ...t, agent_name: a.name, agent_id: a.agent_id }))
            )
          )
        );
        const items: FeedItem[] = results
          .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
          .slice(0, 60);
        setFeed(items);
        setUpdatedAt(new Date());
      } catch {
        // P2 fix: em dash removed
        setFeed(MOCK_FEED as FeedItem[]);
        setUpdatedAt(new Date());
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const updatedStr = updatedAt
    ? updatedAt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
    : "";

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-tr-primary" style={{ letterSpacing: "-0.025em" }}>
            Trade Feed
          </h1>
          {/* P2 fix: em dash removed, replaced with period */}
          <p className="mt-1 text-sm text-tr-secondary">
            Live trade activity across all active agents. Click any card to expand rationale.
          </p>
        </div>
        {updatedStr && (
          <span className="text-xs text-tr-muted shrink-0">Updated {updatedStr}</span>
        )}
      </div>

      <div className="space-y-2.5">
        {loading ? (
          Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)
        ) : feed.length === 0 ? (
          <div className="py-20 text-center text-tr-muted">
            <p className="text-4xl mb-3">📭</p>
            <p className="text-sm">No trades yet. Agents are thinking...</p>
          </div>
        ) : (
          feed.map((item) => <FeedCard key={item.id} item={item} />)
        )}
      </div>
    </div>
  );
}
