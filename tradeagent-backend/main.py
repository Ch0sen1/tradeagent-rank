import logging
import os
import secrets
from contextlib import asynccontextmanager
from decimal import Decimal

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, EmailStr, field_validator
from supabase import Client, create_client

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
)
log = logging.getLogger(__name__)

MOCK_PRICE = Decimal("100.00")
STARTING_EQUITY = Decimal("100000.00")

# ─────────────────────────────────────────────
# Supabase client — created once at startup
# ─────────────────────────────────────────────

_db: Client | None = None


def get_db() -> Client:
    return _db  # type: ignore[return-value]


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _db
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_KEY")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_KEY must be set in .env")
    _db = create_client(url, key)
    log.info("Supabase client initialized")
    yield
    log.info("Shutting down")


app = FastAPI(title="TradeRank API", version="0.1.0", lifespan=lifespan)


# ─────────────────────────────────────────────
# Health
# ─────────────────────────────────────────────

@app.get("/health")
def health_check():
    return {"status": "ok"}


# ═════════════════════════════════════════════
# USERS
# ═════════════════════════════════════════════

class CreateUserPayload(BaseModel):
    email: EmailStr


@app.post("/api/v1/users", status_code=201)
def create_user(payload: CreateUserPayload):
    """Register a new user account."""
    db = get_db()
    try:
        res = db.table("users").insert({"email": str(payload.email)}).execute()
    except Exception as exc:
        _raise_if_duplicate(exc, "Email is already registered")
        raise HTTPException(status_code=500, detail=str(exc))
    return res.data[0]


# ═════════════════════════════════════════════
# AGENTS
# ═════════════════════════════════════════════

class CreateAgentPayload(BaseModel):
    user_id: str
    name: str


@app.post("/api/v1/agents", status_code=201)
def create_agent(payload: CreateAgentPayload):
    """
    Register a new trading agent for a user.
    Auto-generates a webhook_api_key and bootstraps a $100k portfolio.
    """
    db = get_db()

    # Verify the user exists
    user_res = db.table("users").select("id").eq("id", payload.user_id).execute()
    if not user_res.data:
        raise HTTPException(status_code=404, detail="User not found")

    webhook_api_key = secrets.token_urlsafe(32)

    agent_res = db.table("agents").insert(
        {
            "user_id": payload.user_id,
            "name": payload.name,
            "webhook_api_key": webhook_api_key,
            "status": "active",
        }
    ).execute()
    agent = agent_res.data[0]
    agent_id: str = agent["id"]

    # Bootstrap portfolio with $100k starting cash
    portfolio_res = db.table("portfolios").insert({"agent_id": agent_id}).execute()
    portfolio_id: str = portfolio_res.data[0]["id"]

    # Bootstrap agent_metrics row so the leaderboard always has a row to update
    db.table("agent_metrics").insert({"agent_id": agent_id}).execute()

    log.info("Agent created — agent_id=%s  name=%s", agent_id, payload.name)

    return {
        "agent_id": agent_id,
        "name": agent["name"],
        "status": agent["status"],
        "webhook_api_key": webhook_api_key,
        "portfolio_id": portfolio_id,
        "starting_cash": float(STARTING_EQUITY),
    }


@app.get("/api/v1/agents/{agent_id}")
def get_agent(agent_id: str):
    """Fetch agent details and their current metrics."""
    db = get_db()

    agent_res = db.table("agents").select("id, name, status, created_at").eq("id", agent_id).execute()
    if not agent_res.data:
        raise HTTPException(status_code=404, detail="Agent not found")

    metrics_res = (
        db.table("agent_metrics")
        .select("win_rate_pct, ytd_return_pct, max_drawdown_pct, total_trades, updated_at")
        .eq("agent_id", agent_id)
        .execute()
    )

    return {
        **agent_res.data[0],
        "metrics": metrics_res.data[0] if metrics_res.data else None,
    }


# ═════════════════════════════════════════════
# PORTFOLIO
# ═════════════════════════════════════════════

@app.get("/api/v1/portfolio/{agent_id}")
def get_portfolio(agent_id: str):
    """Fetch cash balance and all open positions for an agent."""
    db = get_db()

    portfolio_res = (
        db.table("portfolios")
        .select("id, cash_balance, total_equity")
        .eq("agent_id", agent_id)
        .execute()
    )
    if not portfolio_res.data:
        raise HTTPException(
            status_code=404,
            detail=f"No portfolio found for agent_id '{agent_id}'",
        )

    portfolio = portfolio_res.data[0]

    positions_res = (
        db.table("positions")
        .select("ticker, quantity, average_entry_price")
        .eq("portfolio_id", portfolio["id"])
        .execute()
    )

    return {
        "agent_id": agent_id,
        "portfolio_id": portfolio["id"],
        "cash_balance": float(portfolio["cash_balance"]),
        "total_equity": float(portfolio["total_equity"]),
        "positions": positions_res.data,
    }


# ═════════════════════════════════════════════
# TRADE EXECUTION
# ═════════════════════════════════════════════

class ExecutePayload(BaseModel):
    webhook_api_key: str
    action: str
    ticker: str
    amount_in_dollars: float
    rationale: str

    @field_validator("action")
    @classmethod
    def normalize_action(cls, v: str) -> str:
        v = v.strip().upper()
        if v not in ("BUY", "SELL"):
            raise ValueError("action must be 'BUY' or 'SELL'")
        return v

    @field_validator("ticker")
    @classmethod
    def normalize_ticker(cls, v: str) -> str:
        return v.strip().upper()

    @field_validator("amount_in_dollars")
    @classmethod
    def validate_amount(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("amount_in_dollars must be a positive number")
        return v


@app.post("/api/v1/execute")
def execute_trade(payload: ExecutePayload):
    db = get_db()

    # A. Verify webhook_api_key and resolve agent
    agent_res = (
        db.table("agents")
        .select("id, name, status")
        .eq("webhook_api_key", payload.webhook_api_key)
        .execute()
    )
    if not agent_res.data:
        raise HTTPException(status_code=401, detail="Invalid webhook_api_key")

    agent = agent_res.data[0]
    agent_id: str = agent["id"]

    if agent["status"] != "active":
        raise HTTPException(
            status_code=403,
            detail=f"Agent '{agent['name']}' is not active (status: {agent['status']})",
        )

    log.info(
        "Signal received — agent=%s  action=%s  ticker=%s  amount=$%.2f",
        agent_id, payload.action, payload.ticker, payload.amount_in_dollars,
    )

    # B. Log the incoming signal immediately.
    #    Status starts as 'failed' and is only flipped to 'executed' on full success,
    #    so any mid-flight crash is self-auditing in the signals table.
    signal_res = (
        db.table("signals")
        .insert(
            {
                "agent_id": agent_id,
                "raw_payload": payload.model_dump(),
                "rationale": payload.rationale,
                "status": "failed",
            }
        )
        .execute()
    )
    signal_id: str = signal_res.data[0]["id"]
    log.info("Signal logged — signal_id=%s", signal_id)

    try:
        result = _run_trade(db, agent_id, signal_id, payload)
    except HTTPException:
        raise  # business-rule 400s bubble up; signal stays 'failed'
    except Exception:
        log.exception("Unexpected error executing signal %s", signal_id)
        raise HTTPException(status_code=500, detail="Internal error during trade execution")

    db.table("signals").update({"status": "executed"}).eq("id", signal_id).execute()
    log.info(
        "Trade executed — signal=%s  ticker=%s  %s  qty=%.6f  cash=$%.2f  equity=$%.2f",
        signal_id, payload.ticker, payload.action,
        result["quantity"], result["new_cash_balance"], result["new_total_equity"],
    )
    return result


def _run_trade(db: Client, agent_id: str, signal_id: str, payload: ExecutePayload) -> dict:
    portfolio_res = (
        db.table("portfolios")
        .select("id, cash_balance, total_equity")
        .eq("agent_id", agent_id)
        .execute()
    )
    if not portfolio_res.data:
        raise HTTPException(status_code=404, detail="Agent has no portfolio")

    portfolio = portfolio_res.data[0]
    portfolio_id: str = portfolio["id"]
    cash_balance = Decimal(str(portfolio["cash_balance"]))

    # C. Mock execution price
    mock_price = MOCK_PRICE

    # D. Calculate quantity (fractional shares supported)
    amount = Decimal(str(payload.amount_in_dollars))
    quantity = amount / mock_price

    # E / F. Apply BUY or SELL
    if payload.action == "BUY":
        new_cash = _execute_buy(db, portfolio_id, payload.ticker, cash_balance, amount, quantity, mock_price)
    else:
        new_cash = _execute_sell(db, portfolio_id, payload.ticker, cash_balance, amount, quantity)

    # Insert trade record linked to its originating signal
    db.table("trades").insert(
        {
            "portfolio_id": portfolio_id,
            "ticker": payload.ticker,
            "action": payload.action,
            "quantity": str(quantity),
            "execution_price": str(mock_price),
            "signal_id": signal_id,
            "rationale": payload.rationale,
        }
    ).execute()

    # Recalculate total equity: cash + all open positions at mock price
    all_positions = (
        db.table("positions").select("quantity").eq("portfolio_id", portfolio_id).execute()
    )
    positions_value = sum(Decimal(str(p["quantity"])) * mock_price for p in all_positions.data)
    total_equity = new_cash + positions_value

    # Persist updated portfolio balances
    db.table("portfolios").update(
        {"cash_balance": str(new_cash), "total_equity": str(total_equity)}
    ).eq("id", portfolio_id).execute()

    # Keep agent_metrics current so the leaderboard reflects this trade immediately
    _update_agent_metrics(db, agent_id, portfolio_id, total_equity)

    return {
        "status": "executed",
        "signal_id": signal_id,
        "ticker": payload.ticker,
        "action": payload.action,
        "quantity": float(quantity),
        "execution_price": float(mock_price),
        "new_cash_balance": float(new_cash),
        "new_total_equity": float(total_equity),
    }


# ═════════════════════════════════════════════
# LEADERBOARD
# ═════════════════════════════════════════════

@app.get("/api/v1/leaderboard")
def get_leaderboard(limit: int = Query(default=20, ge=1, le=100)):
    """
    Return agents ranked by YTD return, highest first.
    Includes agent name via FK join.
    """
    db = get_db()

    res = (
        db.table("agent_metrics")
        .select("agent_id, ytd_return_pct, win_rate_pct, max_drawdown_pct, total_trades, updated_at, agents(name, status)")
        .order("ytd_return_pct", desc=True)
        .limit(limit)
        .execute()
    )

    leaderboard = []
    for rank, row in enumerate(res.data, start=1):
        agent_info = row.pop("agents", {}) or {}
        leaderboard.append(
            {
                "rank": rank,
                "agent_id": row["agent_id"],
                "name": agent_info.get("name", "—"),
                "status": agent_info.get("status", "—"),
                "ytd_return_pct": float(row["ytd_return_pct"]),
                "win_rate_pct": float(row["win_rate_pct"]),
                "max_drawdown_pct": float(row["max_drawdown_pct"]),
                "total_trades": row["total_trades"],
                "updated_at": row["updated_at"],
            }
        )

    return {"count": len(leaderboard), "leaderboard": leaderboard}


# ═════════════════════════════════════════════
# FOLLOWS
# ═════════════════════════════════════════════

class FollowPayload(BaseModel):
    follower_user_id: str
    pro_agent_id: str


@app.post("/api/v1/follows", status_code=201)
def follow_agent(payload: FollowPayload):
    """A user follows a pro agent."""
    db = get_db()

    # Verify both entities exist
    user_res = db.table("users").select("id").eq("id", payload.follower_user_id).execute()
    if not user_res.data:
        raise HTTPException(status_code=404, detail="Follower user not found")

    agent_res = db.table("agents").select("id").eq("id", payload.pro_agent_id).execute()
    if not agent_res.data:
        raise HTTPException(status_code=404, detail="Agent not found")

    try:
        res = db.table("follows").insert(
            {
                "follower_user_id": payload.follower_user_id,
                "pro_agent_id": payload.pro_agent_id,
            }
        ).execute()
    except Exception as exc:
        _raise_if_duplicate(exc, "Already following this agent")
        raise HTTPException(status_code=500, detail=str(exc))

    return res.data[0]


@app.delete("/api/v1/follows/{follow_id}", status_code=200)
def unfollow_agent(follow_id: str):
    """Remove a follow relationship by its ID."""
    db = get_db()

    existing = db.table("follows").select("id").eq("id", follow_id).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Follow not found")

    db.table("follows").delete().eq("id", follow_id).execute()
    return {"status": "unfollowed", "follow_id": follow_id}


@app.get("/api/v1/agents/{agent_id}/followers")
def get_followers(agent_id: str):
    """Return all users following a given agent."""
    db = get_db()

    res = (
        db.table("follows")
        .select("id, created_at, users(id, email)")
        .eq("pro_agent_id", agent_id)
        .order("created_at", desc=True)
        .execute()
    )

    followers = [
        {
            "follow_id": row["id"],
            "created_at": row["created_at"],
            **( row.get("users") or {} ),
        }
        for row in res.data
    ]
    return {"agent_id": agent_id, "follower_count": len(followers), "followers": followers}


# ═════════════════════════════════════════════
# INTERNAL HELPERS
# ═════════════════════════════════════════════

def _execute_buy(
    db: Client,
    portfolio_id: str,
    ticker: str,
    cash_balance: Decimal,
    amount: Decimal,
    quantity: Decimal,
    price: Decimal,
) -> Decimal:
    if cash_balance < amount:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Insufficient cash. "
                f"Available: ${float(cash_balance):,.2f}  "
                f"Required: ${float(amount):,.2f}"
            ),
        )

    new_cash = cash_balance - amount
    existing = _get_position(db, portfolio_id, ticker)

    if existing:
        old_qty = Decimal(str(existing["quantity"]))
        old_avg = Decimal(str(existing["average_entry_price"]))
        new_qty = old_qty + quantity
        new_avg = ((old_qty * old_avg) + (quantity * price)) / new_qty
        db.table("positions").update(
            {"quantity": str(new_qty), "average_entry_price": str(new_avg)}
        ).eq("id", existing["id"]).execute()
    else:
        db.table("positions").insert(
            {
                "portfolio_id": portfolio_id,
                "ticker": ticker,
                "quantity": str(quantity),
                "average_entry_price": str(price),
            }
        ).execute()

    return new_cash


def _execute_sell(
    db: Client,
    portfolio_id: str,
    ticker: str,
    cash_balance: Decimal,
    amount: Decimal,
    quantity: Decimal,
) -> Decimal:
    position = _get_position(db, portfolio_id, ticker)

    if not position:
        raise HTTPException(status_code=400, detail=f"No open position in {ticker}")

    held_qty = Decimal(str(position["quantity"]))
    if held_qty < quantity:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Insufficient shares of {ticker}. "
                f"Held: {float(held_qty):.6f}  "
                f"Required: {float(quantity):.6f}"
            ),
        )

    new_qty = held_qty - quantity
    if new_qty == 0:
        db.table("positions").delete().eq("id", position["id"]).execute()
    else:
        db.table("positions").update({"quantity": str(new_qty)}).eq("id", position["id"]).execute()

    return cash_balance + amount


def _get_position(db: Client, portfolio_id: str, ticker: str) -> dict | None:
    res = (
        db.table("positions")
        .select("id, quantity, average_entry_price")
        .eq("portfolio_id", portfolio_id)
        .eq("ticker", ticker)
        .execute()
    )
    return res.data[0] if res.data else None


def _update_agent_metrics(
    db: Client,
    agent_id: str,
    portfolio_id: str,
    total_equity: Decimal,
) -> None:
    """Recalculate and persist ytd_return_pct and total_trades after every trade."""
    ytd_return = (total_equity - STARTING_EQUITY) / STARTING_EQUITY * 100

    trades_res = (
        db.table("trades").select("id").eq("portfolio_id", portfolio_id).execute()
    )
    total_trades = len(trades_res.data)

    db.table("agent_metrics").update(
        {
            "ytd_return_pct": str(ytd_return),
            "total_trades": total_trades,
        }
    ).eq("agent_id", agent_id).execute()

    log.info(
        "Metrics updated — agent=%s  ytd=%.4f%%  trades=%d",
        agent_id, float(ytd_return), total_trades,
    )


def _raise_if_duplicate(exc: Exception, message: str) -> None:
    """Re-raises as 409 Conflict if the DB error indicates a unique constraint violation."""
    err = str(exc).lower()
    if "duplicate" in err or "unique" in err or "23505" in err:
        raise HTTPException(status_code=409, detail=message)
