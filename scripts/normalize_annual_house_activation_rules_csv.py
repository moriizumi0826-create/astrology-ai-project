"""Normalize the activation-rule CSV for Windows spreadsheet readers."""

from __future__ import annotations

import csv
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
CSV_PATH = PROJECT_ROOT / "database" / "M_Annual_House_Activation_Rules.csv"


def main() -> None:
    with CSV_PATH.open("r", encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))
        fieldnames = list(rows[0].keys()) if rows else []
    with CSV_PATH.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, lineterminator="\r\n")
        writer.writeheader()
        writer.writerows(rows)
    print({"path": str(CSV_PATH), "rows": len(rows), "encoding": "utf-8-sig", "line_ending": "CRLF"})


if __name__ == "__main__":
    main()
