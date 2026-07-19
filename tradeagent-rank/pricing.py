import logging
import math
import time
from decimal import Decimal

import yfinance as yf
from fastapi import HTTPException

log = logging.getLogger(__name__)

_price_cache: dict[str, tuple[Decimal, float]] = {}
_CACHE_TTL = 60  # seconds


def get_price(ticker: str) -> Decimal:
    now = time.monotonic()
    cached = _price_cache.get(ticker)
    if cached and now - cached[1] < _CACHE_TTL:
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


def get_prices_batch(tickers: list[str]) -> dict[str, Decimal]:
    now = time.monotonic()
    missing = [t for t in tickers if t not in _price_cache or now - _price_cache[t][1] >= _CACHE_TTL]
    if missing:
        try:
            data = yf.download(missing, period="1d", progress=False, auto_adjust=True)
            closes = data["Close"].iloc[-1] if not data.empty else {}
            for ticker in missing:
                raw = float(closes.get(ticker, 0))
                if raw > 0 and not math.isnan(raw):
                    _price_cache[ticker] = (Decimal(str(round(raw, 6))), now)
        except Exception:
            pass
    return {t: get_price(t) for t in tickers}
