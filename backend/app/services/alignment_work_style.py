"""24 shared fixed questions -> immediate, deterministic work-style examples."""
import json
from backend.app.settings import PROJECT_ROOT
from backend.app.services.alignment_scoring import calculate_scores, rounded, WISH_LABELS
from backend.app.services.alignment_comparison import classify_profile, compare_profiles

BANK = json.loads((PROJECT_ROOT / 'database/alignment_work_style_v3.json').read_text(encoding='utf-8'))
VERSION = BANK['version']
CATALOG = {q['id']: (q['title'], dict(q['options'])) for q in BANK['questions']}
DIMENSIONS = {d['id']: d for d in BANK['dimensions']}
# Symbolic correspondence only, not validated measurements of skill or job performance.
HOUSE_POINTS = {
    'resources': (65,90,85,55,65,100,80,55,90,85,65,60),
    'daily': (55,75,70,75,55,100,65,65,60,85,60,80),
    'role': (85,65,70,55,75,75,80,70,75,100,85,55),
    'creation': (80,75,95,60,100,70,65,45,80,75,85,75),
    'clients': (65,60,85,75,65,85,100,85,70,75,80,75),
    'shared': (50,90,75,75,45,85,85,100,65,85,75,65),
    'network': (65,55,85,65,80,60,90,75,85,85,100,60),
}
# Role examples, not employment selection or a claim that qualifications are held.
JOBS = [
    ('research','リサーチ・調査企画',dict(resources=.75,creation=.25),'調べたことを比較し、判断に使える資料へまとめる役割。','気になるテーマをひとつ選び、比較メモを1枚作る。'),
    ('editor','専門コンテンツの編集・執筆',dict(resources=.5,creation=.5),'得意分野を、読み手に伝わる文章や教材へ変える役割。','詳しいテーマを、初めての人向けに短く解説する。'),
    ('quality','業務改善・品質管理',dict(daily=.7,resources=.3),'ミスや手戻りの原因を見つけ、再現できる手順に整える役割。','繰り返している作業をひとつ選び、改善前後を比べる。'),
    ('operations','運用設計・バックオフィス',dict(daily=.6,shared=.4),'担当範囲やルールを整えて、日々の仕事を回しやすくする役割。','よく起きる確認漏れを防ぐチェックリストを作る。'),
    ('project','プロジェクトの進行管理',dict(role=.6,daily=.25,network=.15),'目的・予定・分担を整理し、完成まで進める役割。','小さな企画を、やること・担当・期限の3項目に分ける。'),
    ('planning','企画・プロダクト運営',dict(role=.5,creation=.35,resources=.15),'困りごとを企画に変え、試しながら改善する役割。','誰のどんな不便を解決したいか、企画を1枚にする。'),
    ('design','デザイン・制作',dict(creation=.8,resources=.2),'表現や使い勝手を工夫し、目に見える成果物にする役割。','使いにくいものをひとつ選び、改善案の試作品を作る。'),
    ('materials','教材・コンテンツ制作',dict(creation=.5,clients=.3,resources=.2),'相手が理解・活用しやすい形で、知識や体験を届ける役割。','ひとつの操作や知識を、3段階で学べる形にする。'),
    ('success','カスタマーサクセス',dict(clients=.6,daily=.4),'相手の状況を聞き、サービスを使いこなす助けをする役割。','困りごとをひとつ聞き、試せる手順を一緒に整理する。'),
    ('consultative','相談・提案型の顧客対応',dict(clients=.65,resources=.35),'相手に合う選択肢を整理し、納得して選べるよう支える役割。','答えを急がず、相手が大切にしたい条件を3つ聞く。'),
    ('budget','契約・予算管理の補助',dict(shared=.7,daily=.3),'費用や対応範囲を確認し、安心して進められる条件を整える役割。','身近な企画の費用と役割を、見える形に整理する。'),
    ('joint','共同事業の運営サポート',dict(shared=.45,network=.35,role=.2),'複数の人の役割・負担・分配を整理し、協働を支える役割。','共同作業で曖昧になっている担当と終了条件を確認する。'),
    ('community','コミュニティ運営',dict(network=.65,clients=.35),'共通の関心を持つ人が、交流や活動を続けられる場を作る役割。','同じ関心の人と、小さなテーマで意見を交換する。'),
    ('alliance','連携企画・パートナー対応',dict(network=.5,role=.3,clients=.2),'互いの得意を見つけ、一緒にできる企画や関係を作る役割。','自分と相手が得意なことを、ひとつずつ持ち寄る案を考える。'),
]


def work_style_scores(answers, chart):
    # Reuse the already calculated, traceable house signals without changing legacy scores.
    signals = calculate_scores(dict(wish=['expertise'],interest=['unknown'],experience=['unknown']),chart)['components']
    profiles = []
    known_count = 0
    for key, dimension in DIMENSIONS.items():
        questions = [q for q in BANK['questions'] if q.get('dimension') == key]
        values, preference, experience = [], [], []
        for q in questions:
            selected = answers[q['id']][0]
            if selected == 'unknown':
                continue
            value = (int(selected)-1) * 100 / 3
            if q.get('reverse'):
                value = 100-value
            values.append(value)
            (experience if q['kind']=='experience' else preference).append(value)
        known_count += len(values)
        natal = rounded(sum(HOUSE_POINTS[key][c['house']-1]*c['weight'] for c in signals)/sum(c['weight'] for c in signals))
        self_score = rounded(sum(values)/len(values)) if values else None
        profiles.append(dict(id=key,label=dimension['label'],verb=dimension['verb'],description=dimension['description'],
            value=self_score,answerScore=self_score,chartScore=natal,known=len(values),totalQuestions=len(questions),
            preferenceScore=rounded(sum(preference)/len(preference)) if preference else None,
            experienceScore=rounded(sum(experience)/len(experience)) if experience else None,
            basis='answer_only' if values else 'unanswered',
            answerIds=[q['id'] for q in questions],chartSignals=[{**c,'value':HOUSE_POINTS[key][c['house']-1]} for c in signals]))
    # Keep both columns in the same canonical order. Rank only to name each side.
    ranked = profiles
    profile_map = {d['id']:d for d in profiles}
    careers=[]
    for job_id,title,weights,description,step in JOBS:
        score=rounded(sum(profile_map[key]['chartScore']*weight for key,weight in weights.items()))
        available={key:weight for key,weight in weights.items() if profile_map[key]['answerScore'] is not None}
        answer_score=rounded(sum(profile_map[key]['answerScore']*weight for key,weight in available.items())/sum(available.values())) if available else None
        strongest=sorted(weights,key=lambda key:profile_map[key]['chartScore']*weights[key],reverse=True)[:2]
        careers.append(dict(id=job_id,title=title,score=score,description=description,step=step,
            answerScore=answer_score,chartScore=score,
            reason='・'.join(DIMENSIONS[key]['label'] for key in strongest)+'を使う役割。',dimensions=list(weights)))
    careers.sort(key=lambda j:j['score'],reverse=True)
    wish=answers['wish'][0]
    comparison=compare_profiles(profiles)
    answer_type=classify_profile(profiles,'answerScore')
    chart_type=classify_profile(profiles,'chartScore')
    known_profiles=[p for p in profiles if p['answerScore'] is not None]
    top=max(known_profiles,key=lambda p:p['answerScore']) if known_profiles else max(profiles,key=lambda p:p['chartScore'])
    priority=answers['priority'][0]
    conditions=dict(autonomy='裁量や時間を自分で調整できる形',stability='担当範囲と見通しが明確な形',growth='学びと改善を重ねられる形',people='信頼できる相手と関われる形',impact='誰にどう役立ったかが見える形',unknown='負担や手応えを確かめられる小さな形')
    target=WISH_LABELS.get(wish,'まず試す方向を探す')
    return dict(version=VERSION,scoringVersion='separate-profiles-1',total=comparison['level'],scoreLabel='回答と出生図の一致度',
        comparison=comparison,answerType=answer_type,chartType=chart_type,
        label='回答と出生図を、別々の点数で比較',typeLabel=answer_type['label'],
        tagline=top['description'],wishLabel=target,wishId=wish,mode='selected' if wish!='unknown' else 'explore',
        basis='separate_profiles',coverage=rounded(known_count/21*100),
        profiles=ranked,careers=careers[:4],candidates=[],metrics=[],components=signals,
        condition=conditions[priority],nextStep=careers[0]['step'],unavailableReason=None,
        styleHint=dict(prepare='考える時間を取り、資料や成果物で渡す進め方。',dialogue='相手と話しながら組み立てる進め方。',both='準備と対話を組み合わせる進め方。',unknown='一人で進める形と対話する形を、小さく比べてみる。')[answers['style'][0]],
        formula='一致度Lv＝99×（1−比較できた項目の平均点差÷100）。左右の採点は混ぜません。',
        note='一致度は回答と出生図の近さで、資質の活用度や成功率の測定ではありません。未確認の回答は比較から除きます。仕事例は出生図側の点数で並べています。')


def immediate_result(answers, chart):
    scores=work_style_scores(answers,chart)
    available=[p for p in scores['profiles'] if p['answerScore'] is not None]
    top=max(available,key=lambda p:p['answerScore']) if available else scores['profiles'][0]
    unknown='未確認の回答は出生図の点数で埋めず、一致度の比較から除いています。' if scores['coverage']<100 else '続けやすさや需要は、小さく試した経験から確かめていきます。'
    sections=[]
    for key,text in [('overlap',scores['tagline']),('tension',f"{scores['condition']}で、その持ち味が生きるか試してみる。"),('action',scores['nextStep']),('unknown',unknown)]:
        sections.append(dict(id=key,title=key,body=[text],evidence=[CATALOG[q][0]+'：'+CATALOG[q][1][answers[q][0]] for q in top['answerIds']],
            chartNotes=[],original=[],change='initial',changeReason='',update=None))
    return dict(scores=scores,sections=sections,report=None,aiConnected=False,chart=chart)
