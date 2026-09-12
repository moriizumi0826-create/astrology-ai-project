"""Resolve a birth wall-clock time using the rules in force at the birthplace."""
from datetime import datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


def resolve_birth_timezone(name, birth_date, birth_time=None, unknown=False, fold=None):
    try:
        zone = ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError, TypeError) as exc:
        raise ValueError("出生地のタイムゾーン名を確認してください（例: America/New_York）。") from exc
    naive = datetime.fromisoformat(f"{birth_date}T{'12:00' if unknown or not birth_time else birth_time}")
    if naive.tzinfo is not None:
        raise ValueError("出生時刻は出生地の現地時刻で入力してください。")
    candidates = {}
    for candidate_fold in (0, 1):
        candidate = naive.replace(tzinfo=zone, fold=candidate_fold)
        restored = candidate.astimezone(timezone.utc).astimezone(zone)
        if restored.replace(tzinfo=None) == naive:
            candidates[candidate_fold] = candidate
    if not candidates:
        raise ValueError("この出生時刻は夏時間などの時計変更により存在しません。現地の記録を確認してください。")
    ambiguous = len({dt.utcoffset() for dt in candidates.values()}) > 1
    if ambiguous and fold is None:
        raise ValueError("この出生時刻は時計変更により2回存在します。「時計変更で時刻が重複する場合」で1回目か2回目を選択してください。")
    localized = candidates[fold if ambiguous else min(candidates)]
    return localized.utcoffset().total_seconds() / 3600, localized


def request_birth_offset(payload):
    # A saved numerical offset may belong to another season/date. The named
    # zone is authoritative; offset-only legacy input remains supported.
    if payload.timezone_name:
        offset, _ = resolve_birth_timezone(
            payload.timezone_name,
            payload.birth_date.isoformat(),
            payload.birth_time.strftime("%H:%M") if payload.birth_time else None,
            payload.birth_time_unknown,
            payload.birth_time_fold,
        )
        return offset
    if payload.timezone_offset is None:
        raise ValueError("出生地のタイムゾーンを指定してください。")
    return payload.timezone_offset
