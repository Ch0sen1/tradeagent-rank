import logging
import math
import time
from decimal import Decimal

from fastapi import HTTPException

log = logging.getLogger(__name__)

_price_cache: dict[str, tuple[Decimal, float]] = {}
_PRICE_CACHE_TTL = 60  # seconds


def get_price(ticker: str) -> Decimal:
    import yfinance as yf

    now = time.monotonic()
    cached = _price_cache.get(ticker)
    if cached and now - cached[1] < _PRICE_CACHE_TTL:
        return cached[0]
    try:
        raw = yf.Ticker(ticker).fast_info.last_price
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Price lookup failed for {ticker}: {exc}")
    if raw is None or math.isnan(raw) or raw <= 0:
        raise HTTPException(status_code=400, detail=f"No valid price for ticker '{ticker}'")
    price = Decimal(str(round(raw, 6)))
    _price_cache[ticker] = (price, now)
    log.info("Price fetched — ticker=%s  price=%.4f", ticker, float(price))
    return price

def get_prices_batch(tickets:list[str]) -> dict[str,Decimal]:
    """ fetch multiple prices, using cache where possbible."""
    return {t:get_price(t) for t in tickers}
    
