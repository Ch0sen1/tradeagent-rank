import logging
import secrets

from fastapi import APIRouter, Header, HTTPException, Query
from pydantic import BaseModel

from constants import STARTING_EQUITY
from db import get_db

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
    db = get_db()
    query = db.table("agents").select("id, name, status, created_at")
    if status:
        query = query.eq("status", status)
    res = query.order("created_at", desc=True).limit(limit).execute()
    return {"count": len(res.data), "agents": res.data}


@router.post("/agents", status_code=201)
def create_agent(payload: CreateAgentPayload):
    db = get_db()

    if not db.table("users").select("id").eq("id", payload.user_id).execute().data:
        raise HTTPException(status_code=404, detail="User not found")

    webhook_api_key = secrets.token_urlsafe(32)

    agent = db.table("agents").insert({
        "user_id": payload.user_id,
        "name": payload.name,
        "webhook_api_key": webhook_api_key,
        "status": "active",
    }).execute().data[0]

    portfolio_id = db.table("portfolios").insert({"agent_id": agent["id"]}).execute().data[0]["id"]
    db.table("agent_metrics").insert({"agent_id": agent["id"]}).execute()

    log.info("Agent created — agent_id=%s  name=%s", agent["id"], payload.name)

    return {
        "agent_id": agent["id"],
        "name": agent["name"],
        "status": agent["status"],
        "webhook_api_key": webhook_api_key,
        "portfolio_id": portfolio_id,
        "starting_cash": float(STARTING_EQUITY),
    }


@router.get("/agents/me")
def get_me(x_webhook_api_key: str = Header(..., alias="X-Webhook-Api-Key")):
    db = get_db()

    agents = db.table("agents").select("id, name, status, created_at").eq("webhook_api_key", x_webhook_api_key).execute()
    if not agents.data:
        raise HTTPException(status_code=401, detail="Invalid X-Webhook-Api-Key")

    agent = agents.data[0]
    agent_id = agent["id"]

    metrics = db.table("agent_metrics").select("win_rate_pct, ytd_return_pct, max_drawdown_pct, total_trades, updated_at").eq("agent_id", agent_id).execute()
    portfolio_row = db.table("portfolios").select("id, cash_balance, total_equity").eq("agent_id", agent_id).execute()

    portfolio = portfolio_row.data[0] if portfolio_row.data else None
    positions = (
        db.table("positions").select("ticker, quantity, average_entry_price").eq("portfolio_id", portfolio["id"]).execute().data
        if portfolio else []
    )

    return {
        "agent_id": agent_id,
        "name": agent["name"],
        "status": agent["status"],
        "created_at": agent["created_at"],
        "metrics": metrics.data[0] if metrics.data else None,
        "portfolio": {
            "portfolio_id": portfolio["id"],
            "cash_balance": float(portfolio["cash_balance"]),
            "total_equity": float(portfolio["total_equity"]),
            "positions": positions,
        } if portfolio else None,
    }


@router.get("/agents/{agent_id}")
def get_agent(agent_id: str):
    db = get_db()

    agents = db.table("agents").select("id, name, status, created_at").eq("id", agent_id).execute()
    if not agents.data:
        raise HTTPException(status_code=404, detail="Agent not found")

    metrics = db.table("agent_metrics").select("win_rate_pct, ytd_return_pct, max_drawdown_pct, total_trades, updated_at").eq("agent_id", agent_id).execute()
    follower_count = db.table("follows").select("id", count="exact").eq("pro_agent_id", agent_id).execute().count or 0

    return {
        **agents.data[0],
        "metrics": metrics.data[0] if metrics.data else None,
        "follower_count": follower_count,
    }


@router.patch("/agents/{agent_id}/status")
def update_agent_status(
    agent_id: str,
    status: str = Query(..., pattern="^(active|inactive)$"),
):
    db = get_db()
    if not db.table("agents").select("id").eq("id", agent_id).execute().data:
        raise HTTPException(status_code=404, detail="Agent not found")
    db.table("agents").update({"status": status}).eq("id", agent_id).execute()
    return {"agent_id": agent_id, "status": status}


@router.delete("/agents/{agent_id}", status_code=200)
def delete_agent(agent_id: str):
    db = get_db()
    if not db.table("agents").select("id").eq("id", agent_id).execute().data:
        raise HTTPException(status_code=404, detail="Agent not found")
    db.table("agents").delete().eq("id", agent_id).execute()
    return {"agent_id": agent_id, "deleted": True}


@router.get("/agents/{agent_id}/followers")
def get_followers(agent_id: str):
    db = get_db()
    res = db.table("follows").select("id, created_at, users(id, email)").eq("pro_agent_id", agent_id).order("created_at", desc=True).execute()
    followers = [{"follow_id": r["id"], "created_at": r["created_at"], **(r.get("users") or {})} for r in res.data]
    return {"agent_id": agent_id, "follower_count": len(followers), "followers": followers}


@router.get("/agents/{agent_id}/signals")
def get_signals(
    agent_id: str,
    limit: int = Query(default=50, ge=1, le=200),
):
    db = get_db()
    if not db.table("agents").select("id").eq("id", agent_id).execute().data:
        raise HTTPException(status_code=404, detail="Agent not found")
    signals = db.table("signals").select("id, status, rationale, timestamp, raw_payload").eq("agent_id", agent_id).order("timestamp", desc=True).limit(limit).execute()
    for row in signals.data:
        if isinstance(row.get("raw_payload"), dict):
            row["raw_payload"].pop("webhook_api_key", None)
    return {"agent_id": agent_id, "count": len(signals.data), "signals": signals.data}
