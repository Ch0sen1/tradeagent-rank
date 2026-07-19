import logging
import decimal import Decimal

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from db import get_db
from pricing import get_price

log = logging.getLogger(__name__)
_scheduler = AsyncIOScheduler()


def get_scheduler() -> AsyncIOScheduler:
    return _scheduler


def snapshot_all_portfolios() -> None:
    "reprice all positions and write equity snapshots. skip when us market is closed"
