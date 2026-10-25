from collections import deque
from threading import Lock, BoundedSemaphore
from time import monotonic

from fastapi import APIRouter, HTTPException, Request
from pydantic import Field
from backend.app.alignment_routes import AlignmentBirthRequest, calculate_alignment_chart
from backend.app.services import alignment_ai_service as ai
from backend.app.settings import settings
from backend.app.services.alignment_work_style import VERSION as WORK_VERSION, immediate_result

router = APIRouter(prefix="/api/alignment", tags=["alignment"])
_lock = Lock()
_global_calls = deque()
_client_calls = {}
_slots = BoundedSemaphore(3)


class AnalysisRequest(ai.AnswersRequest):
    birth: AlignmentBirthRequest
    conversation: list[ai.Conversation] = Field(default_factory=list,max_length=3)
    revisions: list[ai.Revision] = Field(default_factory=list, max_length=10)
    previous: ai.GeneratedReport | None = None


def reserve(request, *, subject=None):
    if not settings.money_ai_config()[0]:
        raise HTTPException(503, "金運AI専用のAPIキーが未設定です。")
    now = monotonic()
    host = subject if subject is not None else request.client.host if request.client else "unknown"
    with _lock:
        while _global_calls and _global_calls[0] <= now - 3600:
            _global_calls.popleft()
        for key in list(_client_calls):
            while _client_calls[key] and _client_calls[key][0] <= now - 3600:
                _client_calls[key].popleft()
            if not _client_calls[key]:
                del _client_calls[key]
        calls = _client_calls.setdefault(host, deque())
        if len(calls) >= 12 or len(_global_calls) >= 60:
            raise HTTPException(429, "利用回数の上限に達しました。時間を置いてお試しください。", headers={"Retry-After": "3600"})
        if not _slots.acquire(blocking=False):
            raise HTTPException(429, "ただいま回答中の方がいます。少し待ってお試しください。", headers={"Retry-After": "15"})
        calls.append(now)
        _global_calls.append(now)


@router.post("/questions")
def questions(payload: ai.AnswersRequest, request: Request):
    reserve(request)
    try:
        result = ai.generate_questions(payload)
        return {"questions": [dict(id=f"ai-{i+1}", text=text) for i, text in enumerate(result.questions)]}
    finally:
        _slots.release()


@router.post("/analysis")
def analysis(payload: AnalysisRequest, request: Request):
    # Never trust chart positions sent from the browser. Recalculate on every analysis.
    chart = calculate_alignment_chart(payload.birth)
    reserve(request)
    try:
        result = ai.generate_report(payload, chart)
        result["chart"] = chart
        return result
    finally:
        _slots.release()


@router.post('/result')
def instant_result(payload: AnalysisRequest):
    if payload.question_version != WORK_VERSION:
        raise HTTPException(422,'設問のバージョンを確認してください。')
    chart=calculate_alignment_chart(payload.birth)
    return immediate_result(payload.answers,chart)


@router.post('/ready')
def ready():
    # Wakes an idle test instance while the user is answering, without an AI call.
    return {'question_version':WORK_VERSION,'ready':True}
