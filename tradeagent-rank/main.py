import logging
import os
from contextlib import asynccontextmanager

from apscheduler.triggers.cron import CronTrigger
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from supabase import create_client

from db import set_db
from routers import agents, follows, leaderboard, portfolio, trades, users
from scheduler import get_scheduler, snapshot_all_portfolios

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
)
log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_KEY")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_KEY must be set in .env")
    set_db(create_client(url, key))
    log.info("Supabase client initialized")

    scheduler = get_scheduler()
    scheduler.add_job(
        snapshot_all_portfolios,
        CronTrigger(hour=0, minute=0),
        id="daily_portfolio_snapshot",
        replace_existing=True,
    )
    scheduler.start()
    log.info("Snapshot scheduler started — runs daily at 00:00 UTC")

    yield

    scheduler.shutdown(wait=False)
    log.info("Shutting down")


app = FastAPI(title="TradeRank API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check():
    return {"status": "ok"}


app.include_router(users.router)
app.include_router(agents.router)
app.include_router(portfolio.router)
app.include_router(trades.router)
app.include_router(leaderboard.router)
app.include_router(follows.router)
