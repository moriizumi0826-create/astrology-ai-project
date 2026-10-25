"""Anonymous, calculation-only chart endpoint. No readings, LLM calls or storage."""
from datetime import date
from threading import Lock

from fastapi import APIRouter, HTTPException
from pydantic import Field, model_validator

from backend.app.schemas import ReadingRequest
from backend.app.services.birth_timezone import request_birth_offset
from backend.app.services.chart_calculator import BirthInput, build_chart_rows, ASPECT_DEFS, SIGNS
from backend.app.services.alignment_scoring import validate_chart_for_scores

router = APIRouter(prefix="/api/alignment", tags=["alignment"])
_chart_lock = Lock()
# Traditional rulers are explicit so a later interpreter cannot choose silently.
RULERS = dict(zip(SIGNS, ["火星", "金星", "水星", "月", "太陽", "水星", "金星", "火星", "木星", "土星", "土星", "木星"]))
PLANETS = {"太陽", "月", "水星", "金星", "火星", "木星", "土星", "天王星", "海王星", "冥王星"}


class AlignmentBirthRequest(ReadingRequest):
    full_name: str = Field(default="匿名", min_length=1, max_length=100)

    @model_validator(mode="after")
    def supported_date(self):
        if self.birth_time_unknown or self.birth_time is None:
            raise ValueError("この体験ではハウスを使うため、出生時刻が必要です。")
        if not date(1900, 1, 1) <= self.birth_date <= date.today():
            raise ValueError("生年月日は1900年以降、今日以前を指定してください。")
        return self


@router.post("/chart")
def calculate_alignment_chart(payload: AlignmentBirthRequest):
    try:
        offset = request_birth_offset(payload)
        birth = BirthInput(
            full_name="匿名", birth_date=payload.birth_date.isoformat(),
            birth_time="" if payload.birth_time_unknown else payload.birth_time.strftime("%H:%M"),
            birth_time_unknown=payload.birth_time_unknown, birthplace=payload.birthplace,
            latitude=payload.latitude, longitude=payload.longitude, timezone_offset=offset,
        )
        with _chart_lock:
            rows = build_chart_rows(birth)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(503, "出生図計算を利用できません。後でもう一度お試しください。") from exc
    except Exception as exc:
        # Do not leak birth details or internal exceptions into a public response.
        raise HTTPException(422, "この出生条件では計算できませんでした。日時・座標を確認してください。高緯度ではハウス計算を利用できない場合があります。") from exc
    planets = [dict(name=r[0], longitude=r[1], sign=r[2], degree=r[3], motion=r[4],
                    house=None if payload.birth_time_unknown else r[5],
                    approximate=payload.birth_time_unknown) for r in rows["planets"] if r[0] in PLANETS]
    houses = [] if payload.birth_time_unknown else [dict(number=r[0], longitude=r[1], sign=r[2],
                  degree=r[3], ruler=RULERS[r[2]]) for r in rows["houses"]]
    aspects = [dict(planet1=r[0], planet2=r[1], separation=r[4], name=r[5], angle=r[6], orb=r[7])
               for r in rows["aspects"] if r[0] in PLANETS and r[1] in PLANETS]
    chart = dict(schema_version=1, source="Swiss Ephemeris", house_system="Placidus",
                ruler_system="traditional", timezone_offset=offset,
                birth_time_unknown=payload.birth_time_unknown, planets=planets, houses=houses,
                aspects=aspects, aspect_rules=ASPECT_DEFS,
                limitations=["出生時刻不明のため現地正午の概算。ハウス・ASC・MC・月のアスペクトは使用しません。"] if payload.birth_time_unknown else [])
    try:
        validate_chart_for_scores(chart)
    except ValueError as exc:
        raise HTTPException(503, str(exc)) from exc
    return chart
