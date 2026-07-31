"""Add narrative metadata to monthly-peak rules and generate prose templates."""

from __future__ import annotations

import csv
from collections import Counter
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATABASE_DIR = PROJECT_ROOT / "database"
RULES_PATH = DATABASE_DIR / "M_Monthly_Peak_Rules.csv"
TEMPLATES_PATH = DATABASE_DIR / "monthly_peak_narrative_templates.csv"
NARRATIVE_COLUMNS = ("Narrative_Key", "Narrative_Priority")

KEY_BY_PEAK_TYPE = {
    "general_health": {
        "life_rhythm": "routine",
        "vitality": "self_pace",
        "pressure": "pressure",
        "mental_focus": "cognitive_load",
        "body_condition": "self_pace",
        "rest": "recovery",
        "reset": "transition",
        "home_base": "recovery",
    },
    "work": {
        "workflow": "workflow",
        "evaluation": "evaluation",
        "pressure": "capacity",
        "communication": "negotiation",
        "action": "role",
        "network": "network",
        "income_work": "visibility",
        "role_change": "role",
    },
    "love": {
        "relationship": "relationship_review",
        "romance": "attraction",
        "emotional_pressure": "boundary",
        "communication": "conversation",
        "intimacy": "intimacy",
        "encounter": "contact",
        "attraction": "attraction",
        "reunion_review": "relationship_review",
    },
    "money": {
        "asset_review": "budget",
        "income": "income",
        "reward": "reward",
        "shared_money": "shared_money",
        "spending": "spending",
        "deal": "contract",
        "unexpected_change": "volatility",
        "investment": "asset_review",
    },
}

NARRATIVE_DEFINITIONS = {
    "general_health": {
        "self_pace": ("自分のペース", "体力と意欲の配分", "予定と休息の配分を今の体感に合わせる"),
        "recovery": ("休息と回復", "休める余白と回復の手順", "回復を後回しにせず、休む時間を先に確保する"),
        "routine": ("生活リズムと日課", "睡眠・食事・日々の段取り", "続けられる量に日課を整え直す"),
        "cognitive_load": ("思考量と情報の整理", "連絡・判断・考え事の負荷", "判断を急がず、情報と予定を小分けにする"),
        "pressure": ("負荷のかかり方", "責任と無理の重なり", "抱える範囲を絞り、回復の余地を残す"),
        "transition": ("生活の切り替え", "環境や習慣の移行", "変えることを一度に増やさず、順番を決めて進める"),
    },
    "work": {
        "role": ("役割と担当範囲", "自分が担う仕事と決裁範囲", "担当と優先順位を言葉にして進める"),
        "evaluation": ("評価と成果の見せ方", "成果の伝え方と評価の受け止め方", "結果と根拠を整理して共有する"),
        "workflow": ("作業の進め方と優先順位", "日々の実務と段取り", "締切と順番を先に決め、作業を分けて進める"),
        "negotiation": ("連絡・交渉・調整", "依頼、確認、関係者とのすり合わせ", "条件と担当を曖昧にせず確認する"),
        "visibility": ("存在感と発信", "仕事ぶりの見せ方と提案", "伝える要点を絞って、自分の考えを出す"),
        "network": ("協力関係と人脈", "助けを求める先と共同作業", "一人で抱えず、必要な相手と役割を分ける"),
        "capacity": ("業務量と持続力", "作業量、責任、消耗の配分", "増やす仕事と保留する仕事を分ける"),
    },
    "love": {
        "contact": ("出会いと接点", "人と会う機会と関係の入口", "無理のない頻度で接点を増やす"),
        "attraction": ("好意の表現と惹かれ合い", "魅力の出し方と相手への関心", "気持ちを急いで結論にせず、やり取りを重ねる"),
        "conversation": ("会話と連絡", "言葉の往復と理解の作り方", "確認したいことを短く率直に伝える"),
        "boundary": ("距離感と境界線", "期待、欲求、相手とのペース", "自分と相手の無理な点を言葉にする"),
        "intimacy": ("親密さと信頼", "深い共有と安心感", "急がず、信頼できる行動を積み重ねる"),
        "relationship_review": ("関係の見直し", "今の関係の続け方と約束", "曖昧な点を整理し、続け方を選び直す"),
    },
    "money": {
        "income": ("収入と報酬の入口", "収入源、単価、受け取る対価", "条件と成果を整理して、受け取る形を明確にする"),
        "reward": ("対価と評価", "仕事や貢献に対する見返り", "実績と条件を照らして見直す"),
        "spending": ("支出と買い方", "使う目的と優先順位", "必要性と継続負担を確認してから決める"),
        "contract": ("契約と条件", "金額、期限、合意内容", "数字と条件を読み直してから進める"),
        "budget": ("予算と固定費", "日々の支出と資金配分", "固定費と優先支出を並べて調整する"),
        "shared_money": ("共有資金と金銭のやり取り", "相手や制度を介したお金", "負担と条件を文面で確認する"),
        "asset_review": ("資産と長期的な配分", "持ち物、積立、長期の価値判断", "短期の気分で動かさず、目的と期間を確認する"),
        "volatility": ("収支の変動", "予定外の出入りと変化", "余裕資金を残し、急な判断を避ける"),
    },
}

STATE_CONTEXT = {
    "general_health": {
        "mixed": "生活のペースが乱れやすい",
        "caution": "無理の重なりや疲れの残り方が気になりやすい",
        "review": "今の生活ペースを振り返る",
        "caution_action": "予定を増やす前に、疲れの残り方を確認してください。",
    },
    "work": {
        "mixed": "業務の負荷や調整事項も増えやすい",
        "caution": "期限、担当、連絡の見落としが出やすい",
        "review": "今の進め方と優先順位を振り返る",
        "caution_action": "期限、担当、確認事項を曖昧にしないでください。",
    },
    "love": {
        "mixed": "期待やペースの違いも表れやすい",
        "caution": "気持ちの行き違いと距離感のずれが出やすい",
        "review": "関係の続け方と約束を振り返る",
        "caution_action": "相手の意思と自分の無理な点を確認してから進めてください。",
    },
    "money": {
        "mixed": "金額や条件の見落としも出やすい",
        "caution": "出費や契約の判断がぶれやすい",
        "review": "今の配分と条件を振り返る",
        "caution_action": "金額、期限、継続条件を確認してから決めてください。",
    },
}

DIRECT_ROLES = {
    "general_health": {"self_body", "recovery", "emotion_moon", "mental_nerves", "emotional_body", "daily_order", "daily_load"},
    "work": {"career_ruler", "career_axis", "work_ruler", "public_role", "task_process", "public_message", "public_drive"},
    "love": {"love_style", "relationship_axis", "romance_ruler", "partner_ruler", "partner", "romance", "intimacy", "dialogue"},
    "money": {"money_ruler", "shared_asset_ruler", "earning_power", "shared_assets", "commerce", "assets", "career_income", "network_gain"},
}
DIRECT_HOUSES = {
    "general_health": {"1", "4", "6", "12"},
    "work": {"2", "3", "6", "10", "11"},
    "love": {"1", "3", "5", "7", "8", "11"},
    "money": {"2", "5", "6", "8", "10", "11"},
}


def narrative_priority(row: dict[str, str]) -> int:
    category = row["Category"]
    if row.get("Target_Role") in DIRECT_ROLES[category] or row.get("Target_House") in DIRECT_HOUSES[category]:
        return 3
    if row.get("Target_Role") == "core_theme" or row.get("Factor_Type") == "transit_to_transit":
        return 1
    return 2


def narrative_key(row: dict[str, str]) -> str:
    category = row["Category"]
    peak_type = row.get("Peak_Type", "")
    try:
        return KEY_BY_PEAK_TYPE[category][peak_type]
    except KeyError as exc:
        raise ValueError(f"No narrative key for {category}/{peak_type}: {row['Rule_ID']}") from exc


def build_template_row(category: str, key: str, state: str, index: int) -> dict[str, str]:
    subject, focus, action = NARRATIVE_DEFINITIONS[category][key]
    context = STATE_CONTEXT[category]
    if state == "active":
        title = f"{subject}に追い風が出る時期"
        summary = f"{focus}に意識を向けることで、今の流れを使いやすい時期です。"
        description = f"{focus}が動きやすい時です。{action}ことで、無理なく手応えにつなげやすくなります。"
        caution = f"{subject}を一度に広げすぎず、今の余力を確かめながら進めてください。"
    elif state == "caution":
        title = f"{subject}の負担を減らす時期"
        summary = f"{focus}で{context['caution']}ため、先に調整を入れたい時期です。"
        description = f"{focus}に無理が重なりやすい時です。{action}ことで、消耗や行き違いを抑えやすくなります。"
        caution = context["caution_action"]
    elif state == "mixed":
        title = f"{subject}に変化と調整が重なる時期"
        summary = f"{focus}が動きやすい一方で、{context['mixed']}時期です。"
        description = f"{focus}に変化が重なる時です。{action}ことで、進展を保ちながら無理を減らせます。"
        caution = context["caution_action"]
    elif state == "review":
        title = f"{subject}を見直す時期"
        summary = f"{focus}について、{context['review']}時期です。"
        description = f"{focus}で立ち止まって確認したい点が出やすい時です。{action}ことで、次の動きを安定させやすくなります。"
        caution = context["caution_action"]
    else:
        raise ValueError(f"Unknown state: {state}")
    return {
        "Template_ID": f"{category.upper()}_{key.upper()}_{state.upper()}",
        "Category": category,
        "Narrative_Key": key,
        "Narrative_Label": subject,
        "State": state,
        "Title": title,
        "Summary": summary,
        "Description": description,
        "Caution": caution,
        "Priority": str(index),
        "Active_Flag": "1",
    }


def main() -> None:
    with RULES_PATH.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        rows = list(reader)
        source_fields = reader.fieldnames or []
    if len(rows) != 3260 or len({row["Rule_ID"] for row in rows}) != 3260:
        raise ValueError("Monthly peak rules must contain 3260 unique Rule_ID values")

    fields = [field for field in source_fields if field not in NARRATIVE_COLUMNS] + list(NARRATIVE_COLUMNS)
    for row in rows:
        row["Narrative_Key"] = narrative_key(row)
        row["Narrative_Priority"] = (
            "0"
            if row.get("Transit_State") == "stay"
            else str(narrative_priority(row))
        )

    with RULES_PATH.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)

    templates = []
    for category, definitions in NARRATIVE_DEFINITIONS.items():
        for key in definitions:
            for state in ("active", "caution", "mixed", "review"):
                templates.append(build_template_row(category, key, state, len(templates) + 1))
    with TEMPLATES_PATH.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(templates[0]))
        writer.writeheader()
        writer.writerows(templates)

    key_counts = Counter((row["Category"], row["Narrative_Key"]) for row in rows)
    expected_keys = {(category, key) for category, values in NARRATIVE_DEFINITIONS.items() for key in values}
    missing = expected_keys.difference(key_counts)
    if missing:
        raise ValueError(f"Narrative keys without rules: {sorted(missing)}")
    print({
        "rules": len(rows),
        "rule_ids": len({row["Rule_ID"] for row in rows}),
        "templates": len(templates),
        "keys": len(key_counts),
    })


if __name__ == "__main__":
    main()
