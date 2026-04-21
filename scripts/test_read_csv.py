import csv
from pathlib import Path

# プロジェクトのフォルダ位置を取得
base_dir = Path(__file__).resolve().parent.parent

# databaseフォルダ
database_dir = base_dir / "database"

# 読み込むCSVファイル
planet_sign_file = database_dir / "planet_sign.csv"

# CSVを読む
with open(planet_sign_file, "r", encoding="utf-8-sig") as f:
    reader = csv.DictReader(f)
    rows = list(reader)

# 行数を表示
print("行数:", len(rows))

# 最初の3行を表示
print("先頭3行:")

for row in rows[:3]:
    print(row)