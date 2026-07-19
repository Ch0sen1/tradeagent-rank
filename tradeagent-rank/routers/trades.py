import logging
from decimal import Decimal

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, field_validator
from supabase import Client

from constants import STARTING_EQUITY
from db import get_db
from pricing import get_price
from ratelimit import check_rate_limit

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1", tags=["trades"])


class ExecutePayload(BaseModel):
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


@router.post("/execute")
def execute_trade(
    payload: ExecutePayload,
    x_webhook_api_key: str = Header(..., alias="X-Webhook-Api-Key"),
):
    db = get_db()

    agent_res = (
        db.table("agents")
        .select("id, name, status")
        .eq("webhook_api_key", x_webhook_api_key)
        .execute()
    )
    if not agent_res.data:
        raise HTTPException(status_code=401, detail="Invalid X-Webhook-Api-Key")

    agent = agent_res.data[0]
    agent_id: str = agent["id"]

    if agent["status"] != "active":
        raise HTTPException(
            status_code=403,
            detail=f"Agent '{agent['name']}' is not active (status: {agent['status']})",
        )

    check_rate_limit(agent_id)

    log.info(
        "Signal received — agent=%s  action=%s  ticker=%s  amount=$%.2f",
        agent_id, payload.action, payload.ticker, payload.amount_in_dollars,
    )

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
        raise
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


# ─────────────────────────────────────────────
# Trade execution internals
# ─────────────────────────────────────────────

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

    execution_price = get_price(payload.ticker)
    amount = Decimal(str(payload.amount_in_dollars))
    quantity = amount / execution_price

    if payload.action == "BUY":
        new_cash = _execute_buy(db, portfolio_id, payload.ticker, cash_balance, amount, quantity, execution_price)
    else:
        new_cash = _execute_sell(db, portfolio_id, payload.ticker, cash_balance, amount, quantity)

    db.table("trades").insert(
        {
            "portfolio_id": portfolio_id,
            "ticker": payload.ticker,
            "action": payload.action,
            "quantity": str(quantity),
            "execution_price": str(execution_price),
            "signal_id": signal_id,
            "rationale": payload.rationale,
        }
    ).execute()

    all_positions = (
        db.table("positions").select("ticker, quantity").eq("portfolio_id", portfolio_id).execute()
    )
    positions_value = sum(
        Decimal(str(p["quantity"])) * get_price(p["ticker"])
        for p in all_positions.data
    )
    total_equity = new_cash + positions_value

    db.table("portfolios").update(
        {"cash_balance": str(new_cash), "total_equity": str(total_equity)}
    ).eq("id", portfolio_id).execute()

    _update_agent_metrics(db, agent_id, portfolio_id, total_equity)

    return {
        "status": "executed",
        "signal_id": signal_id,
        "ticker": payload.ticker,
        "action": payload.action,
        "quantity": float(quantity),
        "execution_price": float(execution_price),
        "new_cash_balance": float(new_cash),
        "new_total_equity": float(total_equity),
    }


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
    # tolerance to avoid epsilon rejection on full-position sells
    if held_qty + Decimal("0.000001") < quantity:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Insufficient shares of {ticker}. "
                f"Held: {float(held_qty):.6f}  "
                f"Required: {float(quantity):.6f}"
            ),
        )

    new_qty = held_qty - quantity
    if new_qty <= Decimal("0.000001"):
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
    ytd_return = (total_equity - STARTING_EQUITY) / STARTING_EQUITY * 100

    # Use COUNT via RPC instead of fetching all rows
    trades_res = (
        db.table("trades")
        .select("id, action, execution_price, quantity", count="exact")
        .eq("portfolio_id", portfolio_id)
        .execute()
    )
    total_trades = trades_res.count or 0

    # Win rate: BUY trades where sell price > avg entry (approximated from trade pairs)
    # Simple definition: % of SELL trades that were profitable vs their signal execution price
    sell_trades = [t for t in trades_res.data if t["action"] == "SELL"]
    buy_trades = [t for t in trades_res.data if t["action"] == "BUY"]

    if sell_trades and buy_trades:
        avg_buy_price = sum(float(t["execution_price"]) for t in buy_trades) / len(buy_trades)
        winning_sells = sum(
            1 for t in sell_trades if float(t["execution_price"]) > avg_buy_price
        )
        win_rate = (winning_sells / len(sell_trades)) * 100
    else:
        win_rate = 0.0

    # Max drawdown: largest peak-to-trough decline in running equity
    # Approximate from snapshots if available, else from trade history
    snapshots_res = (
        db.table("portfolio_snapshots")
        .select("total_equity")
        .eq("portfolio_id", portfolio_id)
        .order("timestamp")
        .execute()
    )
    if snapshots_res.data:
        equities = [float(s["total_equity"]) for s in snapshots_res.data]
        peak = equities[0]
        max_drawdown = 0.0
        for e in equities:
            peak = max(peak, e)
            drawdown = (peak - e) / peak * 100
            max_drawdown = max(max_drawdown, drawdown)
    else:
        max_drawdown = 0.0

    db.table("agent_metrics").update(
        {
            "ytd_return_pct": str(ytd_return),
            "win_rate_pct": str(round(win_rate, 4)),
            "max_drawdown_pct": str(round(max_drawdown, 4)),
            "total_trades": total_trades,
            "updated_at": "now()",
        }
    ).eq("agent_id", agent_id).execute()

    log.info(
        "Metrics updated — agent=%s  ytd=%.4f%%  win_rate=%.2f%%  drawdown=%.2f%%  trades=%d",
        agent_id, float(ytd_return), win_rate, max_drawdown, total_trades,
    )
