from fastapi import APIRouter, Query

from db import get_db

router = APIRouter(prefix="/api/v1", tags=["leaderboard"])


@router.get("/leaderboard")
def get_leaderboard(limit: int = Query(default=20, ge=1, le=100)):
    """Return agents ranked by YTD return, highest first."""
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
