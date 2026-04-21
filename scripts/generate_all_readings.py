import csv
import os
from pathlib import Path
from openai import OpenAI
from dotenv import load_dotenv

try:
    from natal_loader import build_natal_chart_data
    from transit_loader import load_transit_support_data
except ModuleNotFoundError:
    from scripts.natal_loader import build_natal_chart_data
    from scripts.transit_loader import load_transit_support_data

# フォルダ位置
base_dir = Path(__file__).resolve().parent.parent
database_dir = base_dir / "database"
output_dir = base_dir / "output"
load_dotenv(base_dir / ".env")

# APIキー
api_key = os.getenv("OPENAI_API_KEY")
if not api_key:
    raise ValueError("OPENAI_API_KEY is not set.")

client = OpenAI(api_key=api_key)

prompt_file = database_dir / "ai_prompt.csv"
planets_file = output_dir / "planets.csv"
angles_file = output_dir / "angles.csv"
aspects_file = output_dir / "aspects.csv"
houses_file = output_dir / "houses.csv"

chart_data = build_natal_chart_data(planets_file, angles_file, houses_file)
transit_data = load_transit_support_data(aspects_file, houses_file)

# CSV読み込み
with open(prompt_file, "r", encoding="utf-8-sig") as f:
    reader = csv.DictReader(f)
    prompts = [row for row in reader if row["type"] != "transit"]

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
