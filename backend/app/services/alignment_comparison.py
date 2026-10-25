"""Separate answer/natal profiles and compare them without blending."""
from backend.app.services.alignment_scoring import rounded

TYPE_NAMES = {
    "resources": {
        "daily": "精度を磨く探究者",
        "role": "知識で道を拓く戦略家",
        "creation": "深掘りする作り手",
        "clients": "本質をほどく相談役",
        "shared": "仕組みを読み解く分析家",
        "network": "知をつなぐ橋渡し役"
    },
    "daily": {
        "resources": "知識で整える改善家",
        "role": "着実に進める実行家",
        "creation": "使いやすさを磨く職人",
        "clients": "日々を支える伴走者",
        "shared": "運用を守る整備士",
        "network": "協働を支える仕組み役"
    },
    "role": {
        "resources": "根拠で導く企画家",
        "daily": "実現まで運ぶ推進者",
        "creation": "発想を動かす企画者",
        "clients": "相手を導く調整役",
        "shared": "条件を整える運営者",
        "network": "仲間と進める旗振り役"
    },
    "creation": {
        "resources": "問いを形にする表現者",
        "daily": "工夫を重ねる作り手",
        "role": "アイデアを育てる企画家",
        "clients": "想いを届ける表現者",
        "shared": "価値を形にする設計者",
        "network": "共創を広げる作り手"
    },
    "clients": {
        "resources": "理解を深める対話者",
        "daily": "暮らしを整える支援者",
        "role": "一歩を支える提案者",
        "creation": "気持ちを形にする翻訳者",
        "shared": "信頼を守る相談役",
        "network": "人に寄り添うつなぎ役"
    },
    "shared": {
        "resources": "根拠を確かめる管理者",
        "daily": "安心を積み重ねる実務家",
        "role": "責任を引き受ける運営者",
        "creation": "条件を形にする設計者",
        "clients": "合意を育てる調整者",
        "network": "協働の土台を築く支援者"
    },
    "network": {
        "resources": "学びを広げる交流家",
        "daily": "活動を続ける場づくり役",
        "role": "仲間と進める企画家",
        "creation": "出会いを生む共創者",
        "clients": "関係を育てる橋渡し役",
        "shared": "資源をつなぐ連携者"
    }
}


def classify_profile(profiles, field):
    known = sorted((p for p in profiles if p.get(field) is not None), key=lambda p: p[field], reverse=True)
    if not known:
        return dict(code='unanswered', label='これから持ち味を探すタイプ', style='探索中')
    if len(known)<2:
        return dict(code=known[0]['id']+'-exploring',label=known[0]['label']+'を探しているタイプ',style='探索中')
    if known[0][field]<25:
        return dict(code='exploring',label='これから持ち味を探すタイプ',style='探索中')
    top,second=known[:2]
    spread=top[field]-known[-1][field]
    gap=top[field]-second[field]
    style,style_id=('バランス型','balanced') if spread<=12 else ('集中型','focused') if gap>=18 else ('複合型','mixed')
    return dict(code=f"{top['id']}-{second['id']}-{style_id}",label=TYPE_NAMES[top['id']][second['id']],style=style)


def compare_profiles(profiles):
    pairs=[p for p in profiles if p.get('answerScore') is not None and p.get('chartScore') is not None]
    mean_gap=sum(abs(p['answerScore']-p['chartScore']) for p in pairs)/len(pairs) if pairs else None
    level=rounded(99*(1-mean_gap/100)) if mean_gap is not None else None
    return dict(level=level,maxLevel=99,comparedDimensions=len(pairs),totalDimensions=len(profiles),
        meanGap=round(mean_gap,4) if mean_gap is not None else None,ruleVersion='profile-distance-1')
