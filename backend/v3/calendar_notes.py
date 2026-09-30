"""Private dated notes. Expired members retain read/delete access."""
from datetime import date
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from backend.v3.access import require_paid_access
from backend.v3.profiles import identity
from backend.v3.deployment import require_allowed_origin

router = APIRouter(prefix="/api/v3/calendar-notes")

class SaveNote(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: UUID | None = None
    note_date: date
    content: str = Field(min_length=1, max_length=1000)
    revision: int | None = Field(default=None, ge=1)

    @field_validator("content")
    @classmethod
    def nonblank(cls, value):
        if not value.strip():
            raise ValueError("メモを入力してください。")
        return value

    @model_validator(mode="after")
    def update_revision(self):
        if (self.id is None) != (self.revision is None):
            raise ValueError("更新するメモとリビジョンを指定してください。")
        return self

@router.get("")
def list_notes(request: Request, owner=Depends(identity)):
    subject, token = owner
    rows = request.app.state.supabase_auth.request("GET", "/rest/v1/v3_calendar_notes", token,
        params={"user_id": f"eq.{subject}", "select": "id,note_date,content,revision,updated_at",
                "order": "note_date.asc,id.asc", "limit": "100"})
    return {"notes": rows}

@router.put("")
def save_note(payload: SaveNote, request: Request, owner=Depends(identity), paid=Depends(require_paid_access)):
    require_allowed_origin(request)
    service = getattr(request.app.state, "billing", None)
    store = getattr(service, "store", None)
    if not store or not store.configured:
        raise HTTPException(503, "メモ保存の設定が完了していません。")
    result = store.request("POST", "rpc/v3_save_calendar_note", json={
        "p_user_id": owner[0], "p_id": str(payload.id) if payload.id else None,
        "p_date": payload.note_date.isoformat(), "p_content": payload.content, "p_revision": payload.revision})
    if not isinstance(result, dict) or not result.get("saved"):
        error = result.get("error") if isinstance(result, dict) else None
        raise HTTPException(409 if error in ("limit", "conflict") else 503,
            "保存は100件までです。不要なメモを削除してください。" if error == "limit"
            else "保存できませんでした。再読み込みして確認してください。")
    return result

@router.delete("/{note_id}")
def delete_note(note_id: UUID, request: Request, owner=Depends(identity)):
    require_allowed_origin(request)
    subject, token = owner
    rows = request.app.state.supabase_auth.request("DELETE", "/rest/v1/v3_calendar_notes", token,
        params={"user_id": f"eq.{subject}", "id": f"eq.{note_id}", "select": "id"})
    return {"deleted": bool(rows)}
