import logging
from decimal import Decimal

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from db import get_db
from pricing import get_prices_batch

log = logging.getLogger(__name__)
_scheduler = AsyncIOScheduler()


def get_scheduler() -> AsyncIOScheduler:
    return _scheduler


def snapshot_all_portfolios() -> None:
    db = get_db()
    portfolios = db.table("portfolios").select("id, agent_id, cash_balance").execute()
    if not portfolios.data:
        return

    portfolio_ids = [p["id"] for p in portfolios.data]
    all_positions = (
        db.table("positions")
        .select("portfolio_id, ticker, quantity")
        .in_("portfolio_id", portfolio_ids)
        .execute()
    )

    tickers = list({p["ticker"] for p in all_positions.data})
    prices = get_prices_batch(tickers) if tickers else {}

    positions_by_portfolio: dict[str, list] = {pid: [] for pid in portfolio_ids}
    for pos in all_positions.data:
        positions_by_portfolio[pos["portfolio_id"]].append(pos)

    rows = []
    for p in portfolios.data:
        cash = Decimal(str(p["cash_balance"]))
        positions_value = sum(
            Decimal(str(pos["quantity"])) * prices.get(pos["ticker"], Decimal("0"))
            for pos in positions_by_portfolio[p["id"]]
        )
        rows.append({"portfolio_id": p["id"], "total_equity": str(cash + positions_value)})

    db.table("portfolio_snapshots").insert(rows).execute()
    log.info("Portfolio snapshots written — count=%d", len(rows))
