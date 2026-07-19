-- TradeRank MVP Schema (9 tables)
-- Paste this entire file into the Supabase SQL Editor and click Run.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────────
-- 1. users
-- ─────────────────────────────────────────────
CREATE TABLE users (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    email      TEXT        NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- 2. agents  (belongs to a user)
-- ─────────────────────────────────────────────
CREATE TABLE agents (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            TEXT        NOT NULL,
    webhook_api_key TEXT        NOT NULL UNIQUE,
    status          TEXT        NOT NULL DEFAULT 'active'
                                CHECK (status IN ('active', 'inactive'))
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- 3. portfolios  (one per agent)
-- ─────────────────────────────────────────────
CREATE TABLE portfolios (
    id           UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id     UUID           NOT NULL UNIQUE REFERENCES agents(id) ON DELETE CASCADE,
    cash_balance NUMERIC(18, 6) NOT NULL DEFAULT 100000 CHECK (cash_balance >=0),
    total_equity NUMERIC(18, 6) NOT NULL DEFAULT 100000
);

-- ─────────────────────────────────────────────
-- 4. signals  (raw webhook call log)
-- ─────────────────────────────────────────────
CREATE TABLE signals (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id    UUID        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    raw_payload JSONB       NOT NULL,
    rationale   TEXT        NOT NULL DEFAULT '',
    status      TEXT        NOT NULL DEFAULT 'failed'
                            CHECK (status IN ('executed', 'failed')),
    timestamp   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- 5. positions  (open holdings per portfolio)
-- ─────────────────────────────────────────────
CREATE TABLE positions (
    id                  UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    portfolio_id        UUID           NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
    ticker              TEXT           NOT NULL,
    quantity            NUMERIC(18, 6) NOT NULL DEFAULT 0,
    average_entry_price NUMERIC(18, 6) NOT NULL DEFAULT 0,
    UNIQUE (portfolio_id, ticker)
);

-- ─────────────────────────────────────────────
-- 6. trades  (immutable execution ledger)
-- ─────────────────────────────────────────────
CREATE TABLE trades (
    id              UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    portfolio_id    UUID           NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
    ticker          TEXT           NOT NULL,
    action          TEXT           NOT NULL CHECK (action IN ('BUY', 'SELL', 'HOLD')),
    quantity        NUMERIC(18, 6) NOT NULL,
    execution_price NUMERIC(18, 6) NOT NULL,
    signal_id       UUID           NOT NULL REFERENCES signals(id),
    rationale       TEXT           NOT NULL DEFAULT '',
    timestamp       TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- 7. portfolio_snapshots  (equity history for charts)
-- ─────────────────────────────────────────────
CREATE TABLE portfolio_snapshots (
    id           UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    portfolio_id UUID           NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
    timestamp    TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    total_equity NUMERIC(18, 6) NOT NULL
);

-- ─────────────────────────────────────────────
-- 8. follows  (social: user follows a pro agent)
-- ─────────────────────────────────────────────
CREATE TABLE follows (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    follower_user_id UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pro_agent_id     UUID        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (follower_user_id, pro_agent_id)
);

-- ─────────────────────────────────────────────
-- 9. agent_metrics  (pre-computed leaderboard stats)
-- ─────────────────────────────────────────────
CREATE TABLE agent_metrics (
    id               UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id         UUID           NOT NULL UNIQUE REFERENCES agents(id) ON DELETE CASCADE,
    win_rate_pct     NUMERIC(7, 4)  NOT NULL DEFAULT 0,
    ytd_return_pct   NUMERIC(10, 4) NOT NULL DEFAULT 0,
    max_drawdown_pct NUMERIC(10, 4) NOT NULL DEFAULT 0,
    total_trades     INTEGER        NOT NULL DEFAULT 0,
    updated_at       TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);


-- Performance indexex for leaderboard and snapshot queries
CREATE INDEX idx_agent_metric_ytd ON agent_metrics(ytd_return_pct DESC);
CREATE INDEX idx_snapshots_porfolio_time ON portfolio_snapshots(portfolio_id, timestamp DESC)