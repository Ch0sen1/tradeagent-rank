import type { LeaderboardEntry, Snapshot, Agent, Portfolio, Trade } from "@/lib/api";

// Deterministic snapshot curve starting from $100k
function mockSnapshots(seed: number, days = 60): Snapshot[] {
  let equity = 100000;
  const snaps: Snapshot[] = [];
  const now = Date.now();
  for (let i = days; i >= 0; i--) {
    const noise = (Math.sin(seed * 7.3 + i * 1.7) + Math.cos(seed * 3.1 + i * 0.9)) * 0.008;
    const trend = seed > 4 ? -0.0008 : 0.0012 + (seed * 0.0003);
    equity = equity * (1 + trend + noise);
    snaps.push({
      timestamp: new Date(now - i * 86_400_000).toISOString(),
      total_equity: Math.round(equity * 100) / 100,
    });
  }
  return snaps;
}

const AGENTS_RAW = [
  { name: "AlphaQuant",    win: 71.4, ytd: 24.83, trades: 187, seed: 1 },
  { name: "MomentumBot",   win: 68.2, ytd: 18.47, trades: 142, seed: 2 },
  { name: "TrendFollower", win: 65.8, ytd: 14.21, trades: 203, seed: 3 },
  { name: "MeanRevert",    win: 63.1, ytd:  9.55, trades:  98, seed: 4 },
  { name: "SentimentAI",   win: 60.4, ytd:  6.32, trades: 312, seed: 5 },
  { name: "GrowthSeeker",  win: 57.9, ytd:  3.88, trades:  74, seed: 6 },
  { name: "VolArb",        win: 54.3, ytd:  1.44, trades: 421, seed: 7 },
  { name: "BetaNeutral",   win: 48.6, ytd: -2.17, trades:  55, seed: 8 },
  { name: "RiskParity",    win: 45.2, ytd: -5.63, trades:  89, seed: 9 },
  { name: "CrashHedge",    win: 41.0, ytd: -9.21, trades:  33, seed: 10 },
];

export const MOCK_LEADERBOARD: LeaderboardEntry[] = AGENTS_RAW.map((a, i) => ({
  rank: i + 1,
  agent_id: `mock-agent-${i + 1}`,
  name: a.name,
  status: i < 8 ? "active" : "inactive",
  ytd_return_pct: a.ytd,
  win_rate_pct: a.win,
  max_drawdown_pct: -(Math.abs(a.ytd) * 0.4 + 1.2),
  total_trades: a.trades,
  updated_at: new Date(Date.now() - Math.random() * 3_600_000).toISOString(),
}));

export const MOCK_SNAPSHOTS: Record<string, Snapshot[]> = Object.fromEntries(
  AGENTS_RAW.map((a, i) => [`mock-agent-${i + 1}`, mockSnapshots(a.seed)])
);

const TICKERS = ["AAPL", "NVDA", "MSFT", "TSLA", "GOOGL", "META", "AMZN", "AMD"];
const RATIONALES = [
  "RSI crossed below 30 — oversold signal with strong volume confirmation",
  "MACD bullish crossover on daily chart, momentum building",
  "Earnings beat expectations by 12%, upgrading position",
  "Sector rotation into tech — macro tailwinds align",
  "Breaking out of 3-month consolidation range with conviction",
  "Stop-loss triggered, risk management protocol activated",
  "Taking profit after 18% gain, rebalancing portfolio",
  "Sentiment score flipped positive, entering with 5% allocation",
];

export function mockAgent(id: string): Agent {
  const idx = parseInt(id.replace("mock-agent-", "")) - 1;
  const raw = AGENTS_RAW[idx] ?? AGENTS_RAW[0];
  return {
    agent_id: id,
    name: raw.name,
    status: idx < 8 ? "active" : "inactive",
    created_at: new Date(Date.now() - 90 * 86_400_000).toISOString(),
    metrics: {
      win_rate_pct: raw.win,
      ytd_return_pct: raw.ytd,
      max_drawdown_pct: -(Math.abs(raw.ytd) * 0.4 + 1.2),
      total_trades: raw.trades,
      updated_at: new Date().toISOString(),
    },
  };
}

export function mockPortfolio(id: string): Portfolio & { agent_id: string } {
  const idx = parseInt(id.replace("mock-agent-", "")) - 1;
  const raw = AGENTS_RAW[idx] ?? AGENTS_RAW[0];
  const equity = 100000 * (1 + raw.ytd / 100);
  const positions = TICKERS.slice(0, 3 + (idx % 4)).map((ticker, ti) => ({
    ticker,
    quantity: Math.round((equity * 0.08) / (150 + ti * 30) * 100) / 100,
    average_entry_price: 150 + ti * 30 + Math.sin(idx + ti) * 20,
  }));
  const invested = positions.reduce((s, p) => s + p.quantity * p.average_entry_price, 0);
  return {
    agent_id: id,
    portfolio_id: `portfolio-${id}`,
    cash_balance: Math.max(equity - invested, equity * 0.2),
    total_equity: equity,
    positions,
  };
}

export function mockTrades(id: string): Trade[] {
  const idx = parseInt(id.replace("mock-agent-", "")) - 1;
  return Array.from({ length: 12 }, (_, i) => ({
    id: `trade-${id}-${i}`,
    ticker: TICKERS[(idx + i) % TICKERS.length],
    action: (i % 3 === 2 ? "SELL" : "BUY") as "BUY" | "SELL",
    quantity: Math.round((2000 + i * 300) / (120 + i * 15) * 100) / 100,
    execution_price: 120 + i * 15 + Math.sin(i * 2.3) * 10,
    rationale: RATIONALES[i % RATIONALES.length],
    signal_id: `sig-${id}-${i}`,
    timestamp: new Date(Date.now() - i * 3_600_000 * (1 + i * 0.5)).toISOString(),
  }));
}

export const MOCK_FEED = AGENTS_RAW.flatMap((a, agentIdx) =>
  Array.from({ length: 4 }, (_, i) => ({
    id: `feed-${agentIdx}-${i}`,
    agent_id: `mock-agent-${agentIdx + 1}`,
    agent_name: a.name,
    ticker: TICKERS[(agentIdx + i) % TICKERS.length],
    action: (i % 3 === 2 ? "SELL" : "BUY") as "BUY" | "SELL",
    quantity: Math.round((1500 + i * 400) / (130 + i * 20) * 100) / 100,
    execution_price: 130 + i * 20 + Math.sin(agentIdx + i) * 15,
    rationale: RATIONALES[(agentIdx + i) % RATIONALES.length],
    signal_id: `sig-feed-${agentIdx}-${i}`,
    timestamp: new Date(Date.now() - (agentIdx * 4 + i) * 900_000).toISOString(),
  }))
).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
