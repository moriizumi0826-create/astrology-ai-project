"""Anonymous browser/day counts. No account, URL, referrer or IP is persisted."""
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict, UUID4

from backend.v3.deployment import require_allowed_origin
from backend.v3.rate_limit import check_request_limit

router = APIRouter(prefix="/api/v3")


class Visit(BaseModel):
    model_config = ConfigDict(extra="forbid")
    visitor_id: UUID4


@router.post("/visits")
def record_visit(payload: Visit, request: Request):
    require_allowed_origin(request)
    check_request_limit(request, "visit")
    if request.app.state.v3_environment != "production":
        return {"recorded": False}
    store = getattr(getattr(request.app.state, "billing", None), "store", None)
    if not store or not store.configured:
        raise HTTPException(503, "Access counter unavailable")
    try:
        store.request("POST", "rpc/v3_record_visit", json={"p_visitor_id": str(payload.visitor_id)})
    except HTTPException:
        raise HTTPException(503, "Access counter unavailable") from None
    return {"recorded": True}
