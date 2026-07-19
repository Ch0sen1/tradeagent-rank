import time
from collections import defaultdict

from fastapi import HTTPException

_bucket: dict[str, list[float]] = defaultdict(list)
LIMIT = 60
WINDOW = 3600


def check_rate_limit(agent_id: str) -> None:
    now = time.time()
    _bucket[agent_id] = [t for t in _bucket[agent_id] if now - t < WINDOW]
    if len(_bucket[agent_id]) >= LIMIT:
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded: max {LIMIT} trades per hour.",
            headers={"X-RateLimit-Limit": str(LIMIT), "X-RateLimit-Remaining": "0"},
        )
    _bucket[agent_id].append(now)
