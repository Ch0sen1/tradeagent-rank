from decimal import Decimal

from fastapi import APIRouter, HTTPException, Query

from db import get_db
from pricing import get_price

router = APIRouter(prefix="/api/v1/portfolio", tags=["portfolio"])


@router.get("/{agent_id}")
def get_portfolio(agent_id: str):
    """Fetch cash balance and open positions, with total equity marked to current market prices."""
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

    cash = Decimal(str(portfolio["cash_balance"]))
    positions = positions_res.data

    # Mark-to-market: price each position at current live price
    enriched = []
    positions_value = Decimal("0")
    for p in positions:
        try:
            current_price = get_price(p["ticker"])
        except HTTPException:
            current_price = Decimal(str(p["average_entry_price"]))
        qty = Decimal(str(p["quantity"]))
        market_value = qty * current_price
        positions_value += market_value
        enriched.append({
            **p,
            "current_price": float(current_price),
            "market_value": float(market_value),
            "unrealized_pnl": float(market_value - qty * Decimal(str(p["average_entry_price"]))),
        })

    live_equity = cash + positions_value

    return {
        "agent_id": agent_id,
        "portfolio_id": portfolio["id"],
        "cash_balance": float(cash),
        "total_equity": float(live_equity),
        "positions": enriched,
    }


@router.get("/{agent_id}/snapshots")
def get_portfolio_snapshots(
    agent_id: str,
    limit: int = Query(default=90, ge=1, le=365),
):
    """Return daily equity snapshots for an agent, most recent first."""
    db = get_db()

    portfolio_res = (
        db.table("portfolios").select("id").eq("agent_id", agent_id).execute()
    )
    if not portfolio_res.data:
        raise HTTPException(
            status_code=404,
            detail=f"No portfolio found for agent_id '{agent_id}'",
        )

    portfolio_id = portfolio_res.data[0]["id"]

    snapshots_res = (
        db.table("portfolio_snapshots")
        .select("timestamp, total_equity")
        .eq("portfolio_id", portfolio_id)
        .order("timestamp", desc=True)
        .limit(limit)
        .execute()
    )

    return {
        "agent_id": agent_id,
        "portfolio_id": portfolio_id,
        "count": len(snapshots_res.data),
        "snapshots": snapshots_res.data,
    }


@router.get("/{agent_id}/trades")
def get_trades(
    agent_id: str,
    limit: int = Query(default=50, ge=1, le=200),
):
    """Return trade history for an agent, most recent first."""
    db = get_db()

    portfolio_res = (
        db.table("portfolios").select("id").eq("agent_id", agent_id).execute()
    )
    if not portfolio_res.data:
        raise HTTPException(
            status_code=404,
            detail=f"No portfolio found for agent_id '{agent_id}'",
        )

    portfolio_id = portfolio_res.data[0]["id"]

    trades_res = (
        db.table("trades")
        .select("id, ticker, action, quantity, execution_price, rationale, signal_id, timestamp")
        .eq("portfolio_id", portfolio_id)
        .order("timestamp", desc=True)
        .limit(limit)
        .execute()
    )

    return {
        "agent_id": agent_id,
        "portfolio_id": portfolio_id,
        "count": len(trades_res.data),
        "trades": trades_res.data,
    }
