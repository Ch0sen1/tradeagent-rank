from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr

from db import get_db, raise_if_duplicate

router = APIRouter(prefix="/api/v1/users", tags=["users"])


class CreateUserPayload(BaseModel):
    email: EmailStr


@router.post("", status_code=201)
def create_user(payload: CreateUserPayload):
    """Register a new user account."""
    db = get_db()
    try:
        res = db.table("users").insert({"email": str(payload.email)}).execute()
    except Exception as exc:
        raise_if_duplicate(exc, "Email is already registered")
        raise HTTPException(status_code=500, detail=str(exc))
    return res.data[0]
