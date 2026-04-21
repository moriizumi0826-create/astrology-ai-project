import csv
from pathlib import Path

# プロジェクトフォルダの場所
base_dir = Path(__file__).resolve().parent.parent

# databaseフォルダ
database_dir = base_dir / "database"

# 読むファイル
prompt_file = database_dir / "ai_prompt.csv"

# CSVを読む
with open(prompt_file, "r", encoding="utf-8-sig") as f:
    reader = csv.DictReader(f)
    prompts = list(reader)

# データ数を表示
print("テンプレ数:", len(prompts))

# 中身を表示
for row in prompts:
    print("type:", row["type"])
    print("prompt:", row["prompt"][:50], "...")  # 最初50文字だけ表示
    print("----------------------")