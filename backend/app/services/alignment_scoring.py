"""Versioned symbolic matching rubric. No LLM scoring or financial predictions."""
from decimal import Decimal, ROUND_HALF_UP

VERSION = "alignment-match-2"
# Index = house number - 1. These are authored symbolic weights, not statistics.
HOUSE_WEIGHTS = {
    "expertise": (.65, .9, .85, .55, .65, 1, .8, .55, .9, .85, .65, .6),
    "product": (.65, .8, .9, .5, 1, .85, .6, .4, .7, .75, .85, .6),
    "cooperate": (.5, .55, .75, .65, .6, .75, 1, .85, .65, .8, 1, .6),
    "assets": (.5, .9, .85, .65, .5, .85, .7, 1, .8, .7, .65, .55),
    "freedom": (1, .75, .85, .8, .85, .6, .6, .55, .9, .65, .85, .9),
}
INTEREST_WEIGHTS = {
    "expertise": dict(explore=100, make=80, explain=90, organize=85),
    "product": dict(explore=80, make=100, explain=75, organize=65),
    "cooperate": dict(explore=60, make=60, explain=85, organize=100),
    "assets": dict(explore=100, make=60, explain=65, organize=90),
    "freedom": dict(explore=90, make=90, explain=80, organize=85),
}
EXPERIENCE_WEIGHTS = {
    "expertise": dict(perspective=100, clarity=90, suggestion=90, craft=80),
    "product": dict(perspective=70, clarity=75, suggestion=70, craft=100),
    "cooperate": dict(perspective=65, clarity=85, suggestion=100, craft=65),
    "assets": dict(perspective=85, clarity=80, suggestion=75, craft=60),
    "freedom": dict(perspective=85, clarity=85, suggestion=80, craft=90),
}
WISH_LABELS = dict(expertise="技能や専門性を対価にする", product="商品やツールを作って届ける", cooperate="人と組んで価値を届ける", assets="資金を理解し、自分で管理・運用する", freedom="自由な時間を守りながら働く")
INTEREST_TYPES = dict(explore="深掘りして、自分なりの答えを見つける人", make="アイデアを、使える形にする人", explain="わかりやすく伝えて、人の役に立つ人", organize="物事を整えて、前に進める人")


def rounded(value):
    return int(Decimal(str(value)).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def _values(answers, key):
    value = answers.get(key, [])
    return value if isinstance(value, list) else []


def validate_chart_for_scores(chart):
    planets = {p["name"]: p for p in chart.get("planets", [])}
    second = next((h for h in chart.get("houses", []) if h.get("number") == 2), {})
    house = planets.get(second.get("ruler"), {}).get("house")
    if chart.get("birth_time_unknown") or not isinstance(house, int) or not 1 <= house <= 12:
        raise ValueError("出生図の計算を完了できませんでした。入力は残っています。もう一度お試しください。")


def _score_for(answers, chart, wish):
    interests = _values(answers, "interest")
    experience = _values(answers, "experience")
    components = []
    chart_score = None
    planets = {p["name"]: p for p in chart.get("planets", [])}
    houses = {h["number"]: h for h in chart.get("houses", [])}

    def add(label, house, weight, fact_ids):
        if isinstance(house, int) and 1 <= house <= 12:
            components.append(dict(label=label, house=house, weight=weight,
                value=HOUSE_WEIGHTS[wish][house - 1] * 100, factIds=fact_ids))

    if not chart.get("birth_time_unknown"):
        # Omitted signals are reweighted, not scored as zero. A missing key ruler
        # makes the whole chart component unavailable instead of inventing it.
        for number, weight in [(2, 40), (6, 15), (10, 15)]:
            ruler = houses.get(number, {}).get("ruler")
            add(f"{number}ハウス支配星の所在", planets.get(ruler, {}).get("house"), weight,
                [f"house:{number}", f"planet:{ruler}"])
        occupants = [p for p in planets.values() if p.get("house") == 2]
        for p in occupants:
            add("2ハウス在室天体", 2, 20 / len(occupants), [f"planet:{p['name']}"])
        for name in ["水星", "金星"]:
            add(f"{name}の所在", planets.get(name, {}).get("house"), 5, [f"planet:{name}"])
        if any(c["label"] == "2ハウス支配星の所在" for c in components):
            chart_score = rounded(sum(c["value"] * c["weight"] for c in components) / sum(c["weight"] for c in components))

    def answer_component(values, weights):
        if not values or "unknown" in values or any(v not in weights[wish] for v in values):
            return None
        # Average distinct selected items: selecting everything cannot inflate a sum.
        unique = set(values)
        return rounded(sum(weights[wish][v] for v in unique) / len(unique))

    interest_score = answer_component(interests, INTEREST_WEIGHTS)
    experience_score = answer_component(experience, EXPERIENCE_WEIGHTS)
    # Unknown interest is not a score of zero: use the available chart signal
    # and explicitly change the score label/basis rather than claiming interest.
    total = rounded(chart_score * .6 + interest_score * .4) if interest_score is not None else chart_score
    if total >= 80:
        label = "やりたい方向と、重なる手がかりが多そう"
    elif total >= 65:
        label = "やりたい方向に、生かせそうな持ち味がある"
    else:
        label = "やり方や役割を工夫すると、重なりが見つかりそう"
    result_type = INTEREST_TYPES.get(interests[0]) if len(interests) == 1 else None
    if not result_type:
        result_type = "いくつかの持ち味を、組み合わせて生かす人" if interests and "unknown" not in interests else "自分に合う形を、これから探す人"
    return dict(version=VERSION, total=total, label=label, typeLabel=result_type,
        wishId=wish, wishLabel=WISH_LABELS[wish], unavailableReason=None,
        scoreLabel="重なりスコア" if interest_score is not None else "出生図からの仮スコア",
        basis="chart_and_interest" if interest_score is not None else "chart_only",
        metrics=[dict(id="chart", label="出生図との重なり", value=chart_score),
                 dict(id="interest", label="関心との重なり", value=interest_score),
                 dict(id="experience", label="経験との重なり", value=experience_score)],
        components=components,
        formula="重なりスコア＝出生図との重なり×60％＋関心との重なり×40％。経験は別に表示。" if interest_score is not None else "関心はまだ決まっていないため、出生図との重なりだけを仮スコアにしています。関心や経験を推測で埋めてはいません。",
        note="このツール独自の目安です。能力・成功率・金運の強さを測る点数ではありません。補足は文章の見立てに反映し、点数は選択回答や出生情報を変更したときに変わります。")


def calculate_scores(answers, chart):
    validate_chart_for_scores(chart)
    wish = next(iter(_values(answers, "wish")), "unknown")
    if wish != "unknown" and wish not in HOUSE_WEIGHTS:
        raise ValueError("選択した稼ぎ方を確認してください。")
    if wish == "unknown":
        candidates = [_score_for(answers, chart, key) for key in HOUSE_WEIGHTS]
        candidates.sort(key=lambda candidate: candidate["total"], reverse=True)
        result = dict(candidates[0])
        result.update(mode="explore", scoreLabel="出生図からの候補スコア" if result["basis"] == "chart_only" else "試す候補の重なり", label="決まっていなくても、試す方向は見つかる",
            candidates=[dict(id=c["wishId"], label=c["wishLabel"], score=c["total"]) for c in candidates[:3]])
    else:
        result = _score_for(answers, chart, wish)
        result.update(mode="selected", candidates=[])
        if wish == "assets":
            result["typeLabel"] = "仕組みを理解して、納得してお金を扱う方向へ"
        elif wish == "freedom":
            result["typeLabel"] = "自分のペースを守って、持ち味を生かす方向へ"
    if result["wishId"] == "assets":
        result["label"] = "運用成績ではなく、調べて管理する取り組み方を見る"
        result["note"] += " 資産運用の点数は、情報を調べ、条件を理解・整理する取り組み方との対応です。投資の適性、リスク許容度、利益、推奨商品を示すものではありません。"
    return result
