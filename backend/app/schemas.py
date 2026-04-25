from datetime import date, time, datetime

from pydantic import BaseModel, Field, field_validator, model_validator


class ReadingRequest(BaseModel):
    full_name: str = Field(min_length=1, max_length=100)
    birth_date: date
    birth_time: time | None = None
    birth_time_unknown: bool = False
    birthplace: str = Field(min_length=1, max_length=100)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    timezone_offset: float | None = Field(default=None, ge=-12, le=14)
    timezone_name: str | None = Field(default=None, min_length=1, max_length=100)

    @field_validator("full_name", "birthplace")
    @classmethod
    def strip_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("blank values are not allowed")
        return value

    @model_validator(mode="after")
    def validate_birth_time(self) -> "ReadingRequest":
        if not self.birth_time_unknown and self.birth_time is None:
            raise ValueError("birth_time is required unless birth_time_unknown is true")
        if self.timezone_offset is None and not self.timezone_name:
            raise ValueError("timezone_offset or timezone_name is required")
        return self


class ReadingSection(BaseModel):
    type: str
    title: str
    content: str


class ReadingMeta(BaseModel):
    full_name: str
    birthplace: str
    birth_date: str
    birth_time: str
    birth_time_unknown: bool
    timezone_offset: float
    timezone_name: str | None = None


class ReadingResponse(BaseModel):
    meta: ReadingMeta
    chart_data: dict[str, str]
    readings: list[ReadingSection]
    transit_ready: bool
    dashboard_data: dict | None = None


class LocationLookupResponse(BaseModel):
    query: str
    display_name: str
    latitude: float
    longitude: float
    timezone_name: str
    timezone_offset: float | None = None
    resolved_at: datetime | None = None


class LocationSearchResponse(BaseModel):
    results: list[LocationLookupResponse]
