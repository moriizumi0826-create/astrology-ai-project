import csv
from pathlib import Path

# プロジェクトフォルダの場所
base_dir = Path(__file__).resolve().parent.parent

# databaseフォルダ
database_dir = base_dir / "database"

# テンプレートファイル
prompt_file = database_dir / "ai_prompt.csv"


# ここにホロスコープデータを書く
chart_data = {
    "sun": "Aries 10H",
    "moon": "Virgo 3H",
    "asc": "Libra",
    "mercury": "Pisces 9H",
    "venus": "Taurus 8H",
    "mars": "Leo 5H",
    "jupiter": "Gemini 11H",
    "saturn": "Capricorn 4H",
    "house7": "Aries",
    "mc": "Cancer",
    "house10": "Cancer",
    "transit": "Jupiter",
    "house": "10"
}

# CSVを読む
with open(prompt_file, "r", encoding="utf-8-sig") as f:
    reader = csv.DictReader(f)
    prompts = list(reader)


# personalityテンプレを取得
personality_template = None

for row in prompts:
    if row["type"] == "personality":
        personality_template = row["prompt"]
        break


# テンプレが見つからなかった場合
if personality_template is None:
    print("personalityテンプレが見つかりません")
    exit()


# テンプレにデータを差し込む
final_prompt = personality_template.format(**chart_data)


# 結果表示
print("完成したプロンプト")
print("-------------------")
print(final_prompt)