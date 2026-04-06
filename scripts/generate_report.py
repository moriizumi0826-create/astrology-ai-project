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

# フォルダ設定
base_dir = Path(__file__).resolve().parent.parent
database_dir = base_dir / "database"
output_dir = base_dir / "output"

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

results = {}

# AI生成
for row in prompts:

    prompt_type = row["type"]
    template = row["prompt"]

    final_prompt = template.format(**chart_data)

    print("生成中:", prompt_type)

    response = client.responses.create(
        model="gpt-4.1",
        input=final_prompt
    )

    text = response.output_text

    results[prompt_type] = text


# レポート作成
report_text = ""

for k, v in results.items():

    report_text += f"\n\n【{k.upper()}】\n"
    report_text += v


# ファイル保存
report_path = output_dir / "reading.txt"

with open(report_path, "w", encoding="utf-8") as f:
    f.write(report_text)

print("\nレポート保存完了")
print(report_path)
