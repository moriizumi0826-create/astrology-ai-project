import csv
import os
from pathlib import Path
from openai import OpenAI
from dotenv import load_dotenv

base_dir = Path(__file__).resolve().parent.parent
load_dotenv(base_dir / ".env")

api_key = os.getenv("OPENAI_API_KEY")
if not api_key:
    raise ValueError("OPENAI_API_KEY is not set.")

client = OpenAI(api_key=api_key)

# フォルダ位置
base_dir = Path(__file__).resolve().parent.parent
database_dir = base_dir / "database"

prompt_file = database_dir / "ai_prompt.csv"

# ホロスコープデータ
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

# CSV読み込み
with open(prompt_file, "r", encoding="utf-8-sig") as f:
    reader = csv.DictReader(f)
    prompts = list(reader)

# 生成結果保存
results = {}

# 各テンプレ処理
for row in prompts:

    prompt_type = row["type"]
    template = row["prompt"]

    # テンプレ差し込み
    final_prompt = template.format(**chart_data)

    print("生成中:", prompt_type)

    # AI送信
    response = client.responses.create(
        model="gpt-4.1",
        input=final_prompt
    )

    text = response.output_text

    results[prompt_type] = text


# 結果表示
print("\n=========================")

for k, v in results.items():

    print("\n【", k, "】")
    print(v)
