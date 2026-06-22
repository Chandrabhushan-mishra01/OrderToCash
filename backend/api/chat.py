from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List
from database.postgres import get_db
from api.staff_deps import get_current_staff

router = APIRouter()

class ChatMessageCreate(BaseModel):
    message: str

@router.get("")
async def get_chat_messages(limit: int = 50, db=Depends(get_db), staff=Depends(get_current_staff)):
    q = """
        SELECT id, username, role, message, created_at 
        FROM internal_chat 
        ORDER BY created_at DESC 
        LIMIT $1
    """
    rows = await db.fetch(q, limit)
    # Return chronologically by reversing the results
    return {"messages": [dict(r) for r in reversed(rows)]}

@router.post("")
async def post_chat_message(
    payload: ChatMessageCreate,
    db=Depends(get_db),
    staff=Depends(get_current_staff)
):
    if not payload.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")
        
    q = """
        INSERT INTO internal_chat (username, role, message)
        VALUES ($1, $2, $3)
        RETURNING id, username, role, message, created_at
    """
    row = await db.fetchrow(q, staff["username"], staff["role"], payload.message.strip())
    return dict(row)
