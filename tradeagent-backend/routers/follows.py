from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from db import get_db, raise_if_duplicate

router = APIRouter(prefix="/api/v1/follows", tags=["follows"])


class FollowPayload(BaseModel):
    follower_user_id: str
    pro_agent_id: str


@router.post("", status_code=201)
def follow_agent(payload: FollowPayload):
    """A user follows a pro agent."""
    db = get_db()

    user_res = db.table("users").select("id").eq("id", payload.follower_user_id).execute()
    if not user_res.data:
        raise HTTPException(status_code=404, detail="Follower user not found")

    agent_res = db.table("agents").select("id").eq("id", payload.pro_agent_id).execute()
    if not agent_res.data:
        raise HTTPException(status_code=404, detail="Agent not found")

    try:
        res = db.table("follows").insert(
            {
                "follower_user_id": payload.follower_user_id,
                "pro_agent_id": payload.pro_agent_id,
            }
        ).execute()
    except Exception as exc:
        raise_if_duplicate(exc, "Already following this agent")
        raise HTTPException(status_code=500, detail=str(exc))

    return res.data[0]


@router.delete("/{follow_id}", status_code=200)
def unfollow_agent(follow_id: str):
    """Remove a follow relationship by its ID."""
    db = get_db()

    existing = db.table("follows").select("id").eq("id", follow_id).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Follow not found")

    db.table("follows").delete().eq("id", follow_id).execute()
    return {"status": "unfollowed", "follow_id": follow_id}
