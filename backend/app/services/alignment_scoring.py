"""Versioned symbolic matching rubric. No LLM scoring or financial predictions."""
from decimal import Decimal, ROUND_HALF_UP

VERSION = "alignment-match-1"
# Index = house number - 1. These are authored symbolic weights, not statistics.
HOUSE_WEIGHTS = {
    "expertise": (.65, .9, .85, .55, .65, 1, .8, .55, .9, .85, .65, .6),
    "product": (.65, .8, .9, .5, 1, .85, .6, .4, .7, .75, .85, .6),
    "cooperate": (.5, .55, .75, .65, .6, .75, 1, .85, .65, .8, 1, .6),
}
INTEREST_WEIGHTS = {
    "expertise": dict(explore=100, make=80, explain=90, organize=85),
    "product": dict(explore=80, make=100, explain=75, organize=65),
    "cooperate": dict(explore=60, make=60, explain=85, organize=100),
}
EXPERIENCE_WEIGHTS = {
    "expertise": dict(perspective=100, clarity=90, suggestion=90, craft=80),
    "product": dict(perspective=70, clarity=75, suggestion=70, craft=100),
    "cooperate": dict(perspective=65, clarity=85, suggestion=100, craft=65),
}
WISH_LABELS = dict(expertise="技能や専門性を対価にする", product="商品やツールを作って届ける", cooperate="人と組んで価値を届ける")
INTEREST_TYPES = dict(explore="深掘りして、自分なりの答えを見つける人", make="アイデアを、使える形にする人", explain="わかりやすく伝えて、人の役に立つ人", organize="物事を整えて、前に進める人")


def rounded(value):
    return int(Decimal(str(value)).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def _values(answers, key):
    value = answers.get(key, [])
    return value if isinstance(value, list) else []


def calculate_scores(answers, chart):
    wish = next(iter(_values(answers, "wish")), "unknown")
    interests = _values(answers, "interest")
    experience = _values(answers, "experience")
    supported = wish in HOUSE_WEIGHTS
    components = []
    chart_score = None
    planets = {p["name"]: p for p in chart.get("planets", [])}
    houses = {h["number"]: h for h in chart.get("houses", [])}

    def add(label, house, weight, fact_ids):
        if isinstance(house, int) and 1 <= house <= 12:
            components.append(dict(label=label, house=house, weight=weight,
                value=HOUSE_WEIGHTS[wish][house - 1] * 100, factIds=fact_ids))

    if supported and not chart.get("birth_time_unknown"):
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
        if not supported or not values or "unknown" in values or any(v not in weights[wish] for v in values):
            return None
        # Average distinct selected items: selecting everything cannot inflate a sum.
        unique = set(values)
        return rounded(sum(weights[wish][v] for v in unique) / len(unique))

    interest_score = answer_component(interests, INTEREST_WEIGHTS)
    experience_score = answer_component(experience, EXPERIENCE_WEIGHTS)
    total = rounded(chart_score * .6 + interest_score * .4) if chart_score is not None and interest_score is not None else None
    if total is None:
        label = "まだ、ひとつの点数にはしない"
    elif total >= 80:
        label = "やりたい方向と、重なる手がかりが多そう"
    elif total >= 65:
        label = "やりたい方向に、生かせそうな持ち味がある"
    else:
        label = "やり方や役割を工夫すると、重なりが見つかりそう"
    result_type = INTEREST_TYPES.get(interests[0]) if len(interests) == 1 else None
    if not result_type:
        result_type = "いくつかの持ち味を、組み合わせて生かす人" if interests and "unknown" not in interests else "自分に合う形を、これから探す人"
    return dict(version=VERSION, total=total, label=label, typeLabel=result_type,
        wishLabel=WISH_LABELS.get(wish, "自分に合う稼ぎ方を探す"),
        unavailableReason=("この稼ぎ方は、今の設問だけでは採点できません。" if not supported else "出生図や関心の回答に、まだ確認したい点があります。") if total is None else None,
        metrics=[dict(id="chart", label="出生図との重なり", value=chart_score),
                 dict(id="interest", label="関心との重なり", value=interest_score),
                 dict(id="experience", label="経験との重なり", value=experience_score)],
        components=components,
        formula="重なりスコア＝出生図との重なり×60％＋関心との重なり×40％。経験は別に表示。",
        note="このツール独自の目安です。能力・成功率・金運の強さを測る点数ではありません。補足は文章の見立てに反映し、点数は選択回答や出生情報を変更したときに変わります。")
