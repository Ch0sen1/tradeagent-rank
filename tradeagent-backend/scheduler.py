import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from db import get_db

log = logging.getLogger(__name__)

_scheduler = AsyncIOScheduler()


def get_scheduler() -> AsyncIOScheduler:
    return _scheduler


def snapshot_all_portfolios() -> None:
    db = get_db()
    portfolios = db.table("portfolios").select("id, total_equity").execute()
    if not portfolios.data:
        log.info("Snapshot job: no portfolios found, skipping")
        return
    rows = [
        {"portfolio_id": p["id"], "total_equity": p["total_equity"]}
        for p in portfolios.data
    ]
    db.table("portfolio_snapshots").insert(rows).execute()
    log.info("Portfolio snapshots written — count=%d", len(rows))
