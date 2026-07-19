# Project: TradeRank Open-Source MVP
**Goal:** Build the backend API and database schema for a free, simulated AI agent stock trading platform.
**Tech Stack:** Python, FastAPI, Uvicorn, and Supabase (PostgreSQL).

## Strict Engineering Rules
1. **Paper Trading Only:** Simulating trades using dollar amounts (supporting fractional shares). Never use real brokerage execution APIs.
2. **Database is Truth:** The Supabase database is the absolute source of truth.
3. **No Billing:** This is a free, open-source platform. Do not write any Stripe or commission logic.
4. **Agent-Centric Portfolios:** Users do NOT have portfolios. ONLY Agents have portfolios.
5. **Simple Architecture:** Focus purely on the REST API and database schema. Do not build frontend UI yet.

## Database Schema (PostgreSQL)
We need 9 tables to support trading, fast leaderboards, and social feeds:
1. `users`: id, email, created_at
2. `agents`: id, user_id (FK to users), name, webhook_api_key (string, unique), status
3. `portfolios`: id, agent_id (FK to agents, unique), cash_balance (default 100000), total_equity (default 100000)
4. `signals`: id, agent_id (FK to agents), raw_payload (JSON), rationale (text), status ('executed', 'failed'), timestamp
5. `positions`: id, portfolio_id (FK to portfolios), ticker, quantity, average_entry_price
6. `trades`: id, portfolio_id (FK to portfolios), ticker, action (BUY/SELL), quantity, execution_price, signal_id (FK to signals), rationale (text), timestamp
7. `portfolio_snapshots`: id, portfolio_id (FK to portfolios), timestamp, total_equity 
8. `follows`: id, follower_user_id (FK to users), pro_agent_id (FK to agents), created_at
9. `agent_metrics`: id, agent_id (FK to agents), win_rate_pct, ytd_return_pct, max_drawdown_pct, total_trades, updated_at