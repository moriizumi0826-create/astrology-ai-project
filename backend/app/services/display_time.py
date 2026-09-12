"""Request-local transit timezone; never changes the natal chart's offset."""
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

_ZONE = ContextVar("display_timezone", default=None)


def validate_zone(name):
    if name is None:
        return None
    try:
        ZoneInfo(name)
    except (ValueError, ZoneInfoNotFoundError, TypeError) as exc:
        raise ValueError("表示用のタイムゾーンを確認してください。") from exc
    return name


@contextmanager
def display_scope(name):
    token = _ZONE.set(validate_zone(name))
    try:
        yield
    finally:
        _ZONE.reset(token)


def zone_name():
    return _ZONE.get()


def local_now():
    return datetime.now(ZoneInfo(zone_name() or "Asia/Tokyo")).replace(tzinfo=None)


def transit_offset(local_dt, legacy_offset):
    if local_dt.tzinfo is not None:
        return local_dt.utcoffset().total_seconds() / 3600
    if not zone_name():
        return float(legacy_offset)
    return local_dt.replace(tzinfo=ZoneInfo(zone_name())).utcoffset().total_seconds() / 3600


def transit_utc(local_dt, legacy_offset):
    if local_dt.tzinfo is not None:
        return local_dt.astimezone(timezone.utc).replace(tzinfo=None)
    return local_dt - timedelta(hours=transit_offset(local_dt, legacy_offset))


def transit_midpoint(start_dt, end_dt, legacy_offset):
    """Bisect elapsed time, not the discontinuous wall clock at DST changes."""
    if not zone_name():
        return start_dt + (end_dt - start_dt) / 2
    start_utc = transit_utc(start_dt, legacy_offset)
    end_utc = transit_utc(end_dt, legacy_offset)
    midpoint = start_utc + (end_utc - start_utc) / 2
    return midpoint.replace(tzinfo=timezone.utc).astimezone(ZoneInfo(zone_name())).replace(tzinfo=None)


def event_times(payload):
    """Attach offsets after internal calculations, preserving local date labels."""
    if not zone_name():
        return payload
    if isinstance(payload, list):
        return [event_times(item) for item in payload]
    if not isinstance(payload, dict):
        return payload
    result = {}
    for key, value in payload.items():
        if key in {"event_datetime", "impact_start_datetime", "impact_end_datetime"} and isinstance(value, str):
            if not value:
                result[key] = value
                continue
            source = (payload.get("event_utc_datetime") or value) if key == "event_datetime" else value
            dt = datetime.fromisoformat(source)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=ZoneInfo(zone_name()), fold=0)
            dt = dt.astimezone(timezone.utc).astimezone(ZoneInfo(zone_name()))
            result[key] = dt.isoformat()
        else:
            result[key] = event_times(value)
    if result.get("event_datetime") and "event_date" in result:
        result["event_date"] = result["event_datetime"][:10]
    return result


def local_calendar_row(row):
    result = dict(row)
    if not zone_name():
        return result
    raw = str(row.get("Event_DateTime_JST") or "")
    if not raw:
        return result
    try:
        dt = datetime.fromisoformat(raw)
    except ValueError:
        return result
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=ZoneInfo("Asia/Tokyo"))
    local = dt.astimezone(ZoneInfo(zone_name()))
    result["Event_Date"] = local.date().isoformat()
    result["Event_DateTime_Local"] = local.replace(tzinfo=None).isoformat()
    return result
