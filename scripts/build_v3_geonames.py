"""Build the V3 read-only place index from official GeoNames gazetteer extracts.

Download cities500.zip, JP.zip, admin1CodesASCII.txt and countryInfo.txt from
https://download.geonames.org/export/dump/ into --source-dir first.
GeoNames data is CC BY 4.0: https://www.geonames.org/export/
"""

import argparse
from collections import Counter
from contextlib import closing
import hashlib
import json
from pathlib import Path
import sqlite3
import tempfile
import zipfile

from backend.v3.location_search import JAPANESE_PREFECTURES, normalize_name


SOURCE_FILES = ("cities500.zip", "JP.zip", "admin1CodesASCII.txt", "countryInfo.txt")


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as data:
        for chunk in iter(lambda: data.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _country_names(path: Path) -> dict[str, str]:
    countries = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.startswith("#") or not line.strip():
            continue
        fields = line.split("\t")
        countries[fields[0]] = fields[4]
    countries["JP"] = "日本"
    return countries


def _admin_names(path: Path) -> dict[str, str]:
    names = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        fields = line.split("\t")
        if len(fields) < 2:
            continue
        country = fields[0].split(".", 1)[0]
        name = fields[1]
        if country == "JP":
            name = JAPANESE_PREFECTURES.get(fields[2].casefold(), name)
        names[fields[0]] = name
    return names


def _japanese_display(name: str, aliases: list[str]) -> str:
    choices = [alias for alias in aliases if any("\u4e00" <= ch <= "\u9fff" for ch in alias)]
    if not choices:
        return name
    return min(choices, key=lambda alias: (not alias.endswith(("市", "区", "町", "村")), len(alias), alias))


def _source_rows(source_dir: Path):
    for archive_name, member_name in (("cities500.zip", "cities500.txt"), ("JP.zip", "JP.txt")):
        with zipfile.ZipFile(source_dir / archive_name) as archive:
            with archive.open(member_name) as data:
                for raw in data:
                    fields = raw.decode("utf-8").rstrip("\n\r").split("\t")
                    if len(fields) < 19:
                        continue
                    if fields[6] != "P" and not (archive_name == "JP.zip" and fields[6:8] == ["A", "ADM2"]):
                        continue
                    if fields[17]:
                        yield fields


def build(source_dir: Path, output: Path) -> dict:
    for filename in SOURCE_FILES:
        if not (source_dir / filename).is_file():
            raise FileNotFoundError(source_dir / filename)
    countries = _country_names(source_dir / "countryInfo.txt")
    admin_names = _admin_names(source_dir / "admin1CodesASCII.txt")
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(prefix="geonames-", suffix=".sqlite", dir=output.parent, delete=False) as temp:
        temporary = Path(temp.name)
    counts = Counter()
    try:
        with closing(sqlite3.connect(temporary)) as connection:
            connection.execute("PRAGMA journal_mode=OFF")
            connection.execute("PRAGMA synchronous=OFF")
            connection.execute("PRAGMA page_size=8192")
            connection.executescript("""
                CREATE TABLE places (
                    id INTEGER PRIMARY KEY, name TEXT NOT NULL, display_name TEXT NOT NULL,
                    country_code TEXT NOT NULL, country_name TEXT NOT NULL,
                    admin1_code TEXT, admin1_name TEXT,
                    latitude REAL NOT NULL, longitude REAL NOT NULL,
                    timezone_name TEXT NOT NULL, population INTEGER NOT NULL,
                    feature_rank INTEGER NOT NULL
                );
                CREATE TABLE names (term TEXT NOT NULL, place_id INTEGER NOT NULL);
            """)
            seen = set()
            for fields in _source_rows(source_dir):
                place_id = int(fields[0])
                if place_id in seen:
                    continue
                seen.add(place_id)
                country = fields[8]
                aliases = fields[3].split(",") if fields[3] else []
                admin_code = fields[10]
                admin = admin_names.get(f"{country}.{admin_code}", "")
                name = fields[1]
                display = _japanese_display(name, aliases) if country == "JP" else name
                feature_rank = (0 if fields[7].startswith("PPLA") or fields[7] == "PPLC" else
                                1 if fields[7] == "PPL" else 2 if fields[6] == "P" else 3)
                connection.execute(
                    "INSERT INTO places VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                    (place_id, name, display, country, countries.get(country, country),
                     admin_code, admin, float(fields[4]), float(fields[5]),
                     fields[17], int(fields[14] or 0), feature_rank),
                )
                terms = {normalize_name(alias) for alias in (name, fields[2], *aliases)
                         if alias and len(alias) <= 100}
                connection.executemany(
                    "INSERT INTO names VALUES (?,?)",
                    ((term, place_id) for term in sorted(terms) if term),
                )
                counts["places"] += 1
                counts["names"] += len(terms)
                counts[f"country_{country}"] += 1
            connection.execute("CREATE INDEX names_term_idx ON names(term, place_id)")
            connection.execute("ANALYZE")
            connection.commit()
        temporary.replace(output)
    finally:
        if temporary.exists():
            temporary.unlink()
    manifest = {
        "places": counts["places"],
        "names": counts["names"],
        "japan_places": counts["country_JP"],
        "database_bytes": output.stat().st_size,
        "database_sha256": _sha256_file(output),
        "source_sha256": {name: _sha256_file(source_dir / name)
                          for name in SOURCE_FILES},
        "license": "GeoNames CC BY 4.0",
        "source": "https://download.geonames.org/export/dump/",
    }
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(build(args.source_dir, args.output), ensure_ascii=False, indent=2))
