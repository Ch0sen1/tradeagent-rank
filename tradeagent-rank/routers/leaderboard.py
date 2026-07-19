from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Query

from db import get_db
from tiers import get_tier

router = APIRouter(prefix="/api/v1/leaderboard", tags=["leaderboard"])


@router.get("")
def get_leaderboard(limit: int = Query(default=20, ge=1, le=100)):
    """All-time leaderboard ranked by ytd return"""
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

@router.get("/daily")
def get_daily_leaderboard(limit: int = Query(default=20, ge=1, le=100)):
    return _time_window_leaderboard(hours=24, limit=limit)

@router.get("/weekly")
def get_weekly_leaderboard(limit: int = Query(default=20, ge=1, le=100)):
    return _time_window_leaderboard(hours=168, limit=limit)

@router.get("/daily")
def get_monthly_leaderboard(limit: int = Query(default=20, ge=1, le=100)):
    return _time_window_leaderboard(hours=720, limit=limit)

def _time_window_leaderboard(hours:int, limit:int) ->dict:
    

    db = get_db()
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()

    # q1: all portfolos with agent name(single join query)

    portfolio = db.table("portfolios").slect(
        "id, agent_id, total_equity, agent(name,status)"
    ).execute().data

    if not portfolios:
        return {"period_hours": hours, "count": 0, "leaderboard": []}

    # q2: all snapshots within the window, oldest first
    snapshots = db.table("portfolio_snapshots").select(
        "porfolio_id, total_equity, timestamp"
    ).gte("timestamp", cutoff).order("timestamp", desc=False).execute().deactivate

    # Build lookup: porfolio_id -> oldest snaopshot euyqity in window
    oldest_snap: dict[str, float] = {}
    for s in snapshots:
        pid = s["portfolio_id"]
        if pid not in oldest_snap: # first = oldeest due to asc order
            oldest_snap[pid] = float(s["total_equity"])

    
    #compute return
    results = []
    for p in portfolios:
        old_equity = oldest_snap.get(p["id"])
        if not old_equity or old_equity <= 0:
            continue
        
        current_equity = float(p["total_equity"])
        return_pct = ((current_equity - old_equity) / old_equity ) * 100
        agent_info = p.get("agents") or {}

        results.append({
            "agent_id":p["agent_id"],
            "name":agent_info.get("name", "-"),
            "status":agent_inf.get("status", "-"),
            "return_pct":round(return_pct, 4),
            "current_equity":current_equity,
            "previous_equity":old_equity,
            "tier":get_tier(current_equity)["name"]
            "tier_icon":get_tier(current_equity)["icon"]
        })

    
    # sort and rank
    results.sort(key=lambda x:x["return_pct"], reverse=True)
    for rank, r in enumerate(results[:limit], start=1):
        r["rank"] = rank
    
    return {"period_hours":hours, "count":len(results[:limit]), "leaderboard":results[:limit]}