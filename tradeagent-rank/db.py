from fastapi import HTTPException
from supabase import Client

_db: Client | None = None


def get_db() -> Client:
    if _db is None:
        raise HTTPException(status_code=503, detail="Database not initialized")
    return _db  # type: ignore[return-value]


def set_db(client: Client) -> None:
    global _db
    _db = client


def raise_if_duplicate(exc: Exception, message: str) -> None:
    if "23505" in str(exc):
        raise HTTPException(status_code=409, detail=message)
