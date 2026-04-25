from __future__ import annotations

import csv
import re
from dataclasses import dataclass
from difflib import SequenceMatcher
from pathlib import Path
from typing import Iterable, List


PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATABASE_DIR = PROJECT_ROOT / "database"
INPUT_READING = PROJECT_ROOT / "output" / "reading.txt"
OUTPUT_READING = PROJECT_ROOT / "output" / "reading_with_sources.txt"
OUTPUT_READING_INSERTED = PROJECT_ROOT / "output" / "reading_inserted.txt"


TEXT_COLUMNS = {
    "テーマ",
    "核となる意味",
    "長所",
    "注意点",
    "対人での出方",
    "仕事での出方",
    "成長のコツ",
    "要約",
    "解釈文",
    "summary",
    "section2_text",
    "section5_text",
    "section8_text",
    "strength_text",
    "caution_text",
    "growth_text",
    "problem_text",
    "main_text",
    "work_text",
    "relationship_text",
    "main_role_text",
    "expansion_text",
    "意味",
    "サブテーマ1",
    "サブテーマ2",
    "サブテーマ3",
}


NON_DB_PREFIXES = (
    "■ エレメント",
    "■ モダリティ",
    "■ ハウス集中",
    "■ 支配天体",
    "■ ステリウム",
    "■ 複合アスペクト",
    "■ 成長軸",
)


@dataclass(frozen=True)
class SourceSnippet:
    sheet: str
    column: str
    text: str
    normalized: str


def normalize_text(text: str) -> str:
    value = text.strip()
    value = value.replace("　", " ")
    value = re.sub(r"\s+", "", value)
    value = value.replace("、", "")
    value = value.replace("。", "")
    value = value.replace("・", "")
    value = value.replace(":", "")
    value = value.replace("：", "")
    return value


def iter_text_fragments(value: str) -> Iterable[str]:
    for part in str(value).splitlines():
        text = part.strip()
        if not text:
            continue
        yield text


def load_source_snippets() -> List[SourceSnippet]:
    snippets: List[SourceSnippet] = []
    for path in sorted(DATABASE_DIR.glob("*.csv")):
        with path.open("r", encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                for column, raw_value in row.items():
                    if column not in TEXT_COLUMNS:
                        continue
                    for fragment in iter_text_fragments(raw_value or ""):
                        normalized = normalize_text(fragment)
                        if not normalized:
                            continue
                        snippets.append(
                            SourceSnippet(
                                sheet=path.stem,
                                column=column,
                                text=fragment,
                                normalized=normalized,
                            )
                        )
    return snippets


def is_heading_or_label(line: str) -> bool:
    stripped = line.strip()
    if not stripped:
        return True
    if stripped.startswith("【") and stripped.endswith("】"):
        return True
    if stripped.startswith("■ "):
        return True
    if stripped == "補足:":
        return True
    return False


def is_non_db_line(line: str) -> bool:
    stripped = line.strip()
    if any(stripped.startswith(prefix) for prefix in NON_DB_PREFIXES):
        return True
    return False


def format_source_label(sheet: str, column: str) -> str:
    return f"⇒{sheet}(sheet名), {column}(列名)"


def choose_source(line: str, snippets: List[SourceSnippet]) -> str:
    stripped = line.strip()
    if not stripped:
        return ""
    if is_non_db_line(stripped):
        return "⇒DBなし(チャート算出・集計行)"

    candidate = stripped[1:].strip() if stripped.startswith("・") else stripped
    normalized = normalize_text(candidate)
    if not normalized:
        return "⇒DBなし(判定不可)"

    exact_matches = [s for s in snippets if s.normalized == normalized]
    if len(exact_matches) == 1:
        match = exact_matches[0]
        return format_source_label(match.sheet, match.column)
    if exact_matches:
        match = sorted(exact_matches, key=lambda s: (s.sheet, s.column, len(s.text)))[0]
        return format_source_label(match.sheet, match.column)

    contained_matches = [
        s
        for s in snippets
        if normalized in s.normalized or s.normalized in normalized
    ]
    if contained_matches:
        match = sorted(
            contained_matches,
            key=lambda s: (
                0 if normalized in s.normalized else 1,
                abs(len(s.normalized) - len(normalized)),
                s.sheet,
                s.column,
            ),
        )[0]
        return format_source_label(match.sheet, match.column)

    best: SourceSnippet | None = None
    best_score = 0.0
    for snippet in snippets:
        score = SequenceMatcher(None, normalized, snippet.normalized).ratio()
        if normalized in snippet.normalized or snippet.normalized in normalized:
            score += 0.08
        if score > best_score:
            best_score = score
            best = snippet

    if best and best_score >= 0.74:
        return format_source_label(best.sheet, best.column)
    return "⇒DBなし(チャート算出または自動要約)"


def annotate_reading() -> str:
    snippets = load_source_snippets()
    lines = INPUT_READING.read_text(encoding="utf-8").splitlines()
    output_lines: List[str] = []

    for line in lines:
        output_lines.append(line)
        if is_heading_or_label(line):
            continue
        output_lines.append(choose_source(line, snippets))

    return "\n".join(output_lines) + "\n"


def main() -> None:
    annotated = annotate_reading()
    OUTPUT_READING.write_text(annotated, encoding="utf-8")
    OUTPUT_READING_INSERTED.write_text(annotated, encoding="utf-8")
    print(f"Annotated reading written to: {OUTPUT_READING}")
    print(f"Inserted reading written to: {OUTPUT_READING_INSERTED}")


if __name__ == "__main__":
    main()
