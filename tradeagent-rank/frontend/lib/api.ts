const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "Request failed");
  }
  return res.json();
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AgentMetrics {
  win_rate_pct: number;
  ytd_return_pct: number;
  max_drawdown_pct: number;
  total_trades: number;
  updated_at: string;
}

export interface Position {
  ticker: string;
  quantity: number;
  average_entry_price: number;
}

export interface Portfolio {
  portfolio_id: string;
  cash_balance: number;
  total_equity: number;
  positions: Position[];
}

export interface Agent {
  agent_id: string;
  name: string;
  status: "active" | "inactive";
  created_at: string;
  metrics: AgentMetrics | null;
}

export interface AgentMe extends Agent {
  portfolio: Portfolio | null;
}

export interface Trade {
  id: string;
  ticker: string;
  action: "BUY" | "SELL";
  quantity: number;
  execution_price: number;
  rationale: string;
  signal_id: string;
  timestamp: string;
}

export interface Signal {
  id: string;
  status: "executed" | "failed";
  rationale: string;
  timestamp: string;
  raw_payload: Record<string, unknown>;
}

export interface Snapshot {
  timestamp: string;
  total_equity: number;
}

export interface LeaderboardEntry {
  rank: number;
  agent_id: string;
  name: string;
  status: string;
  ytd_return_pct: number;
  win_rate_pct: number;
  max_drawdown_pct: number;
  total_trades: number;
  updated_at: string;
}

// ─── Leaderboard ─────────────────────────────────────────────────────────────

export const getLeaderboard = (limit = 20) =>
  request<{ count: number; leaderboard: LeaderboardEntry[] }>(
    `/api/v1/leaderboard?limit=${limit}`
  );

// ─── Agents ───────────────────────────────────────────────────────────────────

export const listAgents = (limit = 20, status?: "active" | "inactive") =>
  request<{ count: number; agents: Agent[] }>(
    `/api/v1/agents?limit=${limit}${status ? `&status=${status}` : ""}`
  );

export const getAgent = (agentId: string) =>
  request<Agent>(`/api/v1/agents/${agentId}`);

export const getMe = (webhookApiKey: string) =>
  request<AgentMe>("/api/v1/agents/me", {
    headers: { "X-Webhook-Api-Key": webhookApiKey },
  });

export const getFollowers = (agentId: string) =>
  request<{ agent_id: string; follower_count: number; followers: unknown[] }>(
    `/api/v1/agents/${agentId}/followers`
  );

// ─── Portfolio ────────────────────────────────────────────────────────────────

export const getPortfolio = (agentId: string) =>
  request<Portfolio & { agent_id: string }>(`/api/v1/portfolio/${agentId}`);

export const getTrades = (agentId: string, limit = 50) =>
  request<{ agent_id: string; count: number; trades: Trade[] }>(
    `/api/v1/portfolio/${agentId}/trades?limit=${limit}`
  );

export const getSnapshots = (agentId: string, limit = 90) =>
  request<{ agent_id: string; count: number; snapshots: Snapshot[] }>(
    `/api/v1/portfolio/${agentId}/snapshots?limit=${limit}`
  );

// ─── Signals ──────────────────────────────────────────────────────────────────

export const getSignals = (agentId: string, limit = 50) =>
  request<{ agent_id: string; count: number; signals: Signal[] }>(
    `/api/v1/agents/${agentId}/signals?limit=${limit}`
  );
