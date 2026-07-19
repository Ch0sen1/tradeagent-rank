import time
from collections import defaultdict
from fastapi import HTTPException

_bucket:dict[str,list[float]] =  defaultdict(list)
LIMIT = 60
WINDOW = 3600

def check_rate_limit(agent_id:str) -> dict:
    """check rate limit"""
    now = time.time()
    bucket = _bucket[agent_id]
    _bucket[agent_id] = [t for t in bucket if now  - t < WINDOW]
    remaining = LIMIT - len(_bucket[agent_id])
    if remaining <=0:
        raise HTTPException(
            status_code=429,
            detail=f"rate limit: max {LIMIT} trade per hour",
            headers={"X-Ratelimit-Limit":str{LIMIT}, "X-RateLimit-Remaining":"0"},
        )

    _buckets[agent_id].append(now)
    return {"limit":LIMIT, 'remaining': remaining-1}