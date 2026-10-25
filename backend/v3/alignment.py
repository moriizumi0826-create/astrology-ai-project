"""Anonymous LP trial, separate from paid horoscope and map-chat permissions."""
from fastapi import APIRouter, HTTPException, Request

from backend.app.alignment_routes import AlignmentBirthRequest, calculate_alignment_chart
from backend.app import alignment_ai_routes as bounded_ai
from backend.app.services import alignment_ai_service as ai
from backend.app.services.alignment_work_style import VERSION, immediate_result
from backend.v3.deployment import require_allowed_origin
from backend.v3.rate_limit import check_request_limit, rate_limit_subject

router=APIRouter(prefix='/api/v3/alignment',tags=['alignment'])


def validate_version(payload):
    if payload.question_version != VERSION:
        raise HTTPException(422,'設問のバージョンを確認してください。')


def calculation_limit(request):
    require_allowed_origin(request)
    check_request_limit(request,'alignment_calculation')


def reserve_ai(request):
    require_allowed_origin(request)
    check_request_limit(request,'alignment_ai')
    bounded_ai.reserve(request,subject=rate_limit_subject(request))


@router.post('/ready')
def ready(request: Request):
    require_allowed_origin(request)
    return {'question_version':VERSION,'ready':True}


@router.post('/chart')
def chart(payload: AlignmentBirthRequest,request: Request):
    calculation_limit(request)
    return calculate_alignment_chart(payload)


@router.post('/result')
def result(payload: bounded_ai.AnalysisRequest,request: Request):
    validate_version(payload)
    calculation_limit(request)
    chart=calculate_alignment_chart(payload.birth)
    return immediate_result(payload.answers,chart)


@router.post('/questions')
def questions(payload: ai.AnswersRequest,request: Request):
    validate_version(payload)
    reserve_ai(request)
    try:
        generated=ai.generate_questions(payload)
        return {'questions':[dict(id=f'ai-{i+1}',text=text) for i,text in enumerate(generated.questions)]}
    finally:
        bounded_ai._slots.release()


@router.post('/analysis')
def analysis(payload: bounded_ai.AnalysisRequest,request: Request):
    validate_version(payload)
    calculation_limit(request)
    chart=calculate_alignment_chart(payload.birth)
    reserve_ai(request)
    try:
        generated=ai.generate_report(payload,chart)
        return {**generated,'chart':chart}
    finally:
        bounded_ai._slots.release()
