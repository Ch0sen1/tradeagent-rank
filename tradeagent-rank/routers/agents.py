import logging
import secrets

from fastapi import APIRouter, Header, HTTPException, Query
from pydantic import BaseModel

from constants import STARTING_EQUITY
from db import get_db
from tier import get_tier_progress

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1", tags=["agents"])


class CreateAgentPayload(BaseModel):
    user_id: str
    name: str


@router.get("/agents")
def list_agents(
    limit: int = Query(default=20, ge=1, le=100),
    status: str | None = Query(default=None, pattern="^(active|inactive)$"),
):
    """List all agents, optionally filtered by status."""
    db = get_db()
    query = db.table("agents").select("id, name, status, created_at")
    if status:
        query = query.eq("status", status)
    res = query.order("created_at", desc=True).limit(limit).execute()
    return {"count": len(res.data), "agents": res.data}


@router.post("/agents", status_code=201)
def create_agent(payload: CreateAgentPayload):
    """Register a new trading agent. Auto-generates a webhook_api_key and bootstraps a $100k portfolio."""
    db = get_db()

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

    portfolio_res = db.table("portfolios").insert({"agent_id": agent_id}).execute()
    portfolio_id: str = portfolio_res.data[0]["id"]

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


@router.get("/agents/me")
def get_me(x_webhook_api_key: str = Header(..., alias="X-Webhook-Api-Key")):
    """
    Resolve agent identity from webhook_api_key and return full state:
    agent info, metrics, portfolio balance, and open positions.
    This is the primary entry point for an AI agent on each decision cycle.
    """
    db = get_db()

    agent_res = (
        db.table("agents")
        .select("id, name, status, created_at")
        .eq("webhook_api_key", x_webhook_api_key)
        .execute()
    )
    if not agent_res.data:
        raise HTTPException(status_code=401, detail="Invalid X-Webhook-Api-Key")

    agent = agent_res.data[0]
    agent_id: str = agent["id"]

    metrics_res = (
        db.table("agent_metrics")
        .select("win_rate_pct, ytd_return_pct, max_drawdown_pct, total_trades, updated_at")
        .eq("agent_id", agent_id)
        .execute()
    )

    portfolio_res = (
        db.table("portfolios")
        .select("id, cash_balance, total_equity")
        .eq("agent_id", agent_id)
        .execute()
    )

    portfolio = portfolio_res.data[0] if portfolio_res.data else None
    positions = []

    if portfolio:
        positions_res = (
            db.table("positions")
            .select("ticker, quantity, average_entry_price")
            .eq("portfolio_id", portfolio["id"])
            .execute()
        )
        positions = positions_res.data

    return {
        "agent_id": agent_id,
        "name": agent["name"],
        "status": agent["status"],
        "created_at": agent["created_at"],
        "metrics": metrics_res.data[0] if metrics_res.data else None,
        "portfolio": {
            "portfolio_id": portfolio["id"],
            "cash_balance": float(portfolio["cash_balance"]),
            "total_equity": float(portfolio["total_equity"]),
            "positions": positions,
        } if portfolio else None,
    }


@router.get("/agents/{agent_id}")
def get_agent(agent_id: str):
    """Fetch agent details and their current metrics."""
    db = get_db()

    agent_res = (
        db.table("agents")
        .select("id, name, status, created_at")
        .eq("id", agent_id)
        .execute()
    )
    if not agent_res.data:
        raise HTTPException(status_code=404, detail="Agent not found")

    metrics_res = (
        db.table("agent_metrics")
        .select("win_rate_pct, ytd_return_pct, max_drawdown_pct, total_trades, updated_at")
        .eq("agent_id", agent_id)
        .execute()
    )

    follower_count = db.table("portfolios").select("total_equity").eq("agent_id", agent_id).execute()
    equity = flaot(portfolio_res.data[0]["total_equity"]) if portfolio_res.data else 100000

    return {
        **agent_res.data[0],
        "metrics": metrics_res.data[0] if metrics_res.data else None,
        "follower_count": follower_count,
        "tier": get_tier_progress
    }


@router.get("/agents/{agent_id}/status")
def update_agent_status(agent_id: str, status:str =Query(pattern=^(active|inactive)$)):
    """Activate or deactivate an agent"""
   
    db = get_db()
    agent_res = db.table("agents").select("id").eq("id", agent_id).execute
    if not agent_res.data:
        raise HTTPException(status_code=404, detial="Agent not found")
    db.table("agents").update({"status":status}).eq("id",agent_id).execute()
    return {"agent_id": agent_id, "status": status}


@router.delete("/agents/{agent_id}", status_code=200)
def delete_agent_(agent_id: str, status:str =Query(pattern=^(active|inactive)$)):
    """Delete an agent"""
   
    db = get_db()
    agent_res = db.table("agents").select("id").eq("id", agent_id).execute
    if not agent_res.data:
        raise HTTPException(status_code=404, detial="Agent not found")
    db.table("agents").update({"status":status}).eq("id",agent_id).execute()
    return {"agent_id": agent_id, "status": status}
