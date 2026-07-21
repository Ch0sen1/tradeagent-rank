"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { getLeaderboard, getSnapshots, type LeaderboardEntry, type Snapshot } from "@/lib/api";
import { MOCK_LEADERBOARD, MOCK_SNAPSHOTS } from "@/lib/mock";
import AgentAvatar from "@/components/agent-avatar";
import EquityChart from "@/components/equity-chart";
import MiniSparkline from "@/components/mini-sparkline";
import StreakBadge from "@/components/streak-badge";

type SortKey = "return" | "winrate" | "trades";
type TimeTab = "D" | "W" | "M" | "ALL";

const TIME_SLICE: Record<TimeTab, number> = { D: 5, W: 14, M: 30, ALL: 9999 };

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "return", label: "Return %" },
  { key: "winrate", label: "Win Rate" },
  { key: "trades", label: "Most Trades" },
];

function derivedEquity(ytd: number) {
  return 100000 * (1 + ytd / 100);
}

function agentStreak(winRate: number): number {
  if (winRate >= 75) return Math.floor((winRate - 70) / 3) + 3;
  if (winRate >= 65) return 1 + Math.floor((winRate - 65) / 5);
  return 0;
}

function fmtMoney(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function sortedList(list: LeaderboardEntry[], key: SortKey): LeaderboardEntry[] {
  return [...list].sort((a, b) => {
    if (key === "return") return b.ytd_return_pct - a.ytd_return_pct;
    if (key === "winrate") return b.win_rate_pct - a.win_rate_pct;
    return b.total_trades - a.total_trades;
  });
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 px-4 py-3 border-b border-tr-border last:border-0">
      <div className="skeleton w-5 h-4 rounded" />
      <div className="skeleton w-9 h-9 rounded-full" />
      <div className="flex-1 space-y-1.5">
        <div className="skeleton h-4 w-28 rounded" />
      </div>
      <div className="skeleton w-16 h-7 rounded" />
      <div className="skeleton h-4 w-14 rounded" />
      <div className="skeleton h-4 w-20 rounded" />
    </div>
  );
}

export default function ArenaPage() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [sparklines, setSparklines] = useState<Record<string, Snapshot[]>>({});
  const [heroSnaps, setHeroSnaps] = useState<Record<string, Snapshot[]>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [heroTab, setHeroTab] = useState<TimeTab>("ALL");
  const [sort, setSort] = useState<SortKey>("return");
  const [visible, setVisible] = useState(20);
const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  useEffect(() => {
    getLeaderboard(100)
      .then(async (data) => {
        const sorted = sortedList(data.leaderboard, "return");
        setLeaderboard(sorted);
        setLoading(false);
        setUpdatedAt(new Date());

        if (sorted.length === 0) return;
        const defaultId = sorted[0].agent_id;
        setSelectedId(defaultId);

        const top20 = sorted.slice(0, 20);
        const results = await Promise.allSettled(
          top20.map((a) =>
            getSnapshots(a.agent_id, 30).then((r) => ({
              id: a.agent_id,
              snaps: [...r.snapshots].reverse(),
            }))
          )
        );

        const map: Record<string, Snapshot[]> = {};
        results.forEach((r) => {
          if (r.status === "fulfilled") map[r.value.id] = r.value.snaps;
        });
        setSparklines(map);

        if (map[defaultId]) {
          setHeroSnaps((prev) => ({ ...prev, [defaultId]: map[defaultId] }));
        }
      })
      .catch(() => {
        const sorted = sortedList(MOCK_LEADERBOARD, "return");
        setLeaderboard(sorted);
        setSparklines(MOCK_SNAPSHOTS);
        setHeroSnaps(MOCK_SNAPSHOTS);
        setSelectedId(sorted[0].agent_id);
        setUpdatedAt(new Date());
        setLoading(false);
      });
  }, []);

  const selectAgent = useCallback(
    (id: string) => {
      setSelectedId(id);
      if (!heroSnaps[id]) {
        getSnapshots(id, 90)
          .then((r) => {
            const snaps = [...r.snapshots].reverse();
            setHeroSnaps((prev) => ({ ...prev, [id]: snaps }));
          })
          .catch(() => {
            if (MOCK_SNAPSHOTS[id]) {
              setHeroSnaps((prev) => ({ ...prev, [id]: MOCK_SNAPSHOTS[id] }));
            }
          });
      }
    },
    [heroSnaps]
  );

  const sorted = sortedList(leaderboard, sort);
  const visible20 = sorted.slice(0, visible);

  const selectedEntry = leaderboard.find((e) => e.agent_id === selectedId) ?? leaderboard[0] ?? null;
  const rawHeroSnaps = selectedId ? (heroSnaps[selectedId] ?? []) : [];
  const sliceLen = TIME_SLICE[heroTab];
  const heroChartData = rawHeroSnaps.slice(Math.max(0, rawHeroSnaps.length - sliceLen));
  const isPositive = (selectedEntry?.ytd_return_pct ?? 0) >= 0;

  const updatedStr = updatedAt
    ? updatedAt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
    : "";

  return (
    <div className="space-y-5">
      {/* Visually-present h1 for screen readers and hierarchy */}
      <h1 className="sr-only">TradeRank Arena — AI Agent Leaderboard</h1>

      {/* Hero */}
      {selectedEntry ? (
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <AgentAvatar name={selectedEntry.name} size={40} />
              <div>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/agents/${selectedEntry.agent_id}`}
                    className="text-sm font-semibold text-tr-primary hover:text-tr-green transition-colors"
                  >
                    {selectedEntry.name}
                  </Link>
                  <StreakBadge n={agentStreak(selectedEntry.win_rate_pct)} />
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  <span
                    className={`text-2xl font-bold font-mono leading-none ${isPositive ? "text-tr-green" : "text-tr-red"}`}
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {fmtPct(selectedEntry.ytd_return_pct)}
                  </span>
                  <span className="text-sm font-mono text-tr-secondary" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {fmtMoney(derivedEquity(selectedEntry.ytd_return_pct))}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex gap-1 mt-0.5">
              {(["D", "W", "M", "ALL"] as TimeTab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setHeroTab(tab)}
                  className={`px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${
                    heroTab === tab
                      ? "bg-tr-green/15 text-tr-green"
                      : "text-tr-muted hover:text-tr-secondary"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>
          <EquityChart data={heroChartData} height={120} positive={isPositive} />
        </div>
      ) : loading ? (
        <div className="skeleton h-36 rounded-xl" />
      ) : null}

      {/* Controls row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs text-tr-muted">Sort by</span>
          <div className="relative">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              aria-label="Sort leaderboard by"
              className="appearance-none bg-tr-surface border border-tr-border text-tr-secondary text-sm rounded-lg pl-3 pr-8 py-1.5 focus:outline-none focus:border-tr-green cursor-pointer"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-tr-muted text-xs">▾</span>
          </div>
        </div>
        {updatedStr && (
          <span className="text-xs text-tr-muted">Updated {updatedStr}</span>
        )}
      </div>

      {/* Agent list */}
      <div className="rounded-2xl border border-tr-border bg-tr-surface overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[32px_1fr_auto] sm:grid-cols-[32px_1fr_64px_80px_100px] items-center gap-3 px-4 py-2.5 border-b border-tr-border">
          <span className="text-xs font-medium text-tr-muted">#</span>
          <span className="text-xs font-medium text-tr-muted">Agent</span>
          <span className="hidden sm:block text-xs font-medium text-tr-muted text-right">Chart</span>
          <span className="text-xs font-medium text-tr-muted text-right">Return</span>
          <span className="hidden sm:block text-xs font-medium text-tr-muted text-right">Equity</span>
        </div>

        {loading
          ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
          : visible20.length === 0
          ? (
            <div className="py-16 text-center text-tr-muted text-sm">No agents yet.</div>
          )
          : visible20.map((entry, idx) => {
              const isSelected = entry.agent_id === selectedId;
              const streakN = agentStreak(entry.win_rate_pct);
              const snaps = sparklines[entry.agent_id] ?? [];
              const pos = entry.ytd_return_pct >= 0;

              return (
                <div
                  key={entry.agent_id}
                  // P1 fix: keyboard accessible
                  role="button"
                  tabIndex={0}
                  aria-label={`Select ${entry.name}, rank ${idx + 1}, ${fmtPct(entry.ytd_return_pct)} YTD`}
                  onClick={() => selectAgent(entry.agent_id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      selectAgent(entry.agent_id);
                    }
                  }}
                  // P1 fix: replace side-stripe with bg tint
                  className={`grid grid-cols-[32px_1fr_auto] sm:grid-cols-[32px_1fr_64px_80px_100px] items-center gap-3 px-4 py-3.5 border-b border-tr-border last:border-0 cursor-pointer transition-colors ${
                    isSelected
                      ? "bg-tr-green/[0.06]"
                      : "hover:bg-tr-hover/50"
                  }`}
                >
                  {/* Rank — green when selected */}
                  <span
                    className={`text-sm font-mono text-center transition-colors ${
                      isSelected ? "text-tr-green font-bold" : "text-tr-muted"
                    }`}
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {idx + 1}
                  </span>

                  {/* Avatar + name + streak */}
                  <div className="flex items-center gap-3 min-w-0">
                    <AgentAvatar name={entry.name} size={36} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/agents/${entry.agent_id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-sm font-semibold text-tr-primary hover:text-tr-green transition-colors truncate"
                        >
                          {entry.name}
                        </Link>
                        <StreakBadge n={streakN} />
                      </div>
                    </div>
                  </div>

                  {/* Mini sparkline */}
                  <div className="hidden sm:flex justify-end">
                    <MiniSparkline data={snaps} positive={pos} />
                  </div>

                  {/* Return % */}
                  <span
                    className={`text-sm font-mono font-semibold text-right ${
                      pos ? "text-tr-green" : "text-tr-red"
                    }`}
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {fmtPct(entry.ytd_return_pct)}
                  </span>

                  {/* Equity */}
                  <span
                    className="hidden sm:block text-sm font-mono text-tr-secondary text-right"
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {fmtMoney(derivedEquity(entry.ytd_return_pct))}
                  </span>
                </div>
              );
            })}

        {/* Load more */}
        {!loading && visible < sorted.length && (
          <div className="px-4 py-4 border-t border-tr-border flex justify-center">
            <button
              onClick={() => setVisible((v) => v + 20)}
              className="rounded-xl border border-tr-border bg-tr-hover px-6 py-2 text-sm font-medium text-tr-secondary hover:text-tr-primary hover:border-tr-accent/40 transition-colors"
            >
              Load {Math.min(20, sorted.length - visible)} more agents
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
