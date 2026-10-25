// Proposed bank, deliberately separate from the live v1 questionnaire/API contract.
// Choice answers describe wishes and experience; they are never aptitude scores.
const option = (id, label) => [id, label];
const unknown = option('unknown', 'まだわからない');
const question = (id, title, options, purpose, multiple = false) => ({
  id, title, options, purpose, multiple,
  allowSupplement: true,
  exclusiveValues: ['unknown', 'unexperienced', 'none', 'skip'],
});

export const BANK_VERSION = '2-draft-1';

export const MODULES = [
  {
    id: 'resources', label: '自分の資源と対価',
    chartFocus: ['2ハウス・支配星・在室天体', '金星'],
    questions: [
      question('resources.offer', '自分の何に、対価を受け取ってみたいですか？', [
        option('skill', '技能や、実際に手を動かした成果'),
        option('insight', '知識・見方・問題を整理する力'),
        option('taste', '感性や、よいものを選ぶ目'),
        option('presence', '自分らしい表現や、関わることで生まれる価値'), unknown,
      ], '本人が価値にしたい資源を把握する。出生図の資源候補とは後で比較する。', true),
      question('resources.evidence', 'それについて、すでに起きていることはありますか？', [
        option('paid', '実際に対価を受け取ったことがある'),
        option('requested', '繰り返し頼まれたり、紹介されたりしている'),
        option('thanks', '役に立ったと感謝されるが、有料では提供していない'),
        option('self', '自分では価値を感じているが、人の反応はまだ確かめていない'),
        option('unexperienced', 'まだ試していない'), unknown,
      ], '希望・自己評価・他者の評価・有料の実績を混同しない。', true),
      question('resources.grow', '対価を受け取るために、今いちばん整えたいのは？', [
        option('skill', '技能や品質を磨くこと'),
        option('value', '誰の何に役立つのかを、はっきりさせること'),
        option('price', '価格や提供範囲を決めること'),
        option('reach', '必要とする人に届くこと'), unknown,
      ], '能力不足と決めつけず、技能・価値の説明・価格・接点のどこを試すか分ける。'),
    ],
  },
  {
    id: 'daily', label: '日々の仕事と継続',
    chartFocus: ['6ハウス・支配星', '水星', '土星'],
    questions: [
      question('daily.style', '同じことをしばらく続けるなら、どの進め方が心地よさそうですか？', [
        option('routine', '手順を決めて、着実に積み重ねる'),
        option('improve', 'やりながら、よりよい方法に改良する'),
        option('variety', '扱う課題や内容に、ある程度の変化がある'),
        option('concentrate', '集中して取り組む期間と、休む期間を分ける'), unknown,
      ], '継続できる働き方の希望を聞く。変化を好むことを継続力不足と扱わない。', true),
      question('daily.experience', '頼まれなくても続いたり、繰り返すうちに上達したことは？', [
        option('precision', '細部を整え、間違いや手戻りを減らすこと'),
        option('practice', '手を動かして、技術を身につけること'),
        option('solve', '困りごとの原因を調べ、解決すること'),
        option('care', '人や場の状態に気を配り、支えること'),
        option('unexperienced', 'まだ思い当たらない'), unknown,
      ], '仕事以外の生活経験も含めて、続けられた行動の証拠を探す。', true),
      question('daily.condition', '続けるために、いちばん大切な条件は？', [
        option('pace', '時間やペースを自分で調整できる'),
        option('scope', '担当する範囲や終わりが明確'),
        option('feedback', '役に立ったことや上達が見える'),
        option('support', '無理な負担を抱えず、相談や分担ができる'), unknown,
      ], '不得意と環境不適合を区別し、継続条件を具体化する。'),
    ],
  },
  {
    id: 'role', label: '社会的役割と評価',
    chartFocus: ['10ハウス・MC・支配星', '太陽', '土星'],
    questions: [
      question('role.wish', '仕事を通じて、どんな立場で認められたいですか？', [
        option('expert', '特定の分野を任せられる専門家'),
        option('leader', '方針を決め、全体を動かす人'),
        option('creator', '自分の仕事や作品で知られる人'),
        option('support', '表に出るより、確かな仕事で信頼される人'), unknown,
      ], '肩書きへの憧れと、実際に望む役割を分けて聞く。', true),
      question('role.responsibility', 'これまで、比較的引き受けやすかったのは？', [
        option('quality', '専門部分の品質に責任を持つこと'),
        option('decision', '判断し、方針を決めること'),
        option('coordinate', '人や予定を調整して、完了させること'),
        option('delivery', '決めた範囲の成果を、きちんと仕上げること'),
        option('unexperienced', 'まだそうした経験がない'), unknown,
      ], '経験した責任の種類を確認する。管理職を上位の適性と扱わない。', true),
      question('role.proof', '今後、どんな実績が増えたら「育っている」と感じますか？', [
        option('difficulty', '難しい課題にも対応できる'),
        option('trust', '継続して任されたり、紹介されたりする'),
        option('impact', '自分の仕事による具体的な成果が残る'),
        option('autonomy', '望む条件や裁量で仕事を選べる'), unknown,
      ], '本人が納得する成長の目印を置く。収入や知名度だけを成功にしない。'),
    ],
  },
  {
    id: 'creation', label: '創作・発信・販売',
    chartFocus: ['5ハウス・3ハウスと支配星', '金星', '水星'],
    questions: [
      question('creation.enjoy', '作って届ける過程で、特に楽しめそうなのは？', [
        option('idea', '発想したり、テーマを掘り下げたりする'),
        option('make', '作品や商品、ツールを形にする'),
        option('explain', '文章や説明を工夫して伝える'),
        option('sell', '届け方や売り方を試す'), unknown,
      ], '制作・発信・販売をひとつの得意不得意にまとめない。', true),
      question('creation.response', '作ったものを人に見せたとき、近かったのは？', [
        option('used', '使われたり、具体的に役立ったりした'),
        option('resonated', '好意的な反応や、共感があった'),
        option('continued', 'もう一度見たい・使いたいと求められた'),
        option('little', '公開したが、反応はまだ少ない'),
        option('unexperienced', 'まだ人に見せていない'), unknown,
      ], '反応が少ないことだけで作品の価値を否定しない。接触数や対象は自由質問で確認する。', true),
      question('creation.delivery', '制作以外の発信や販売は、どうしたいですか？', [
        option('own', '自分で試しながら取り組みたい'),
        option('share', '得意な人と分担したい'),
        option('system', '少ない負担で続く仕組みを作りたい'),
        option('focus', '制作を中心にして、届け方はこれから考えたい'), unknown,
      ], '発信したくないという希望を、創作の資質がないという結論にしない。'),
    ],
  },
  {
    id: 'clients', label: '顧客・契約・協働',
    chartFocus: ['7ハウス・支配星', '2ハウス・8ハウスとの関係'],
    questions: [
      question('clients.style', '誰かの依頼に応えるなら、どんな形がよさそうですか？', [
        option('live', '対話しながら、その場で考える'),
        option('prepare', '事前に聞いて、じっくり考えてから渡す'),
        option('both', '準備と対話を組み合わせる'),
        option('standard', '提供内容を決めて、必要な人に選んでもらう'), unknown,
      ], '個別対応と定型提供、即時応答と準備型の希望を把握する。'),
      question('clients.boundary', '提供したものが相手の行動につながらなかったら、どう関わりたいですか？', [
        option('follow', '変化につながるところまで継続して支えたい'),
        option('limited', 'できる範囲で助力し、最終的な選択は相手に委ねたい'),
        option('deliver', '約束した内容を渡すところまでを役割にしたい'),
        option('case', '依頼内容や事前の約束によって変えたい'), unknown,
      ], '変化を望む気持ちと責任範囲を別に扱う。本人の補足で境界の見立てを更新する。'),
      question('clients.agreement', '依頼や協働で、今いちばん整えたいのは？', [
        option('matching', '誰のどんな依頼を受けるか'),
        option('scope', '対応範囲・納期・終了条件'),
        option('payment', '料金・支払い・分配の決め方'),
        option('established', 'すでに約束は整っており、運用をよくしたい'),
        option('unexperienced', 'まだ依頼や協働の経験がない'), unknown,
      ], '境界を決めていないと推定しない。未経験と運用上の問題も区別する。'),
    ],
  },
  {
    id: 'shared', label: '他者や共同体の資源',
    chartFocus: ['8ハウス・支配星', '2ハウスとの関係'],
    questions: [
      question('shared.source', 'ここで気になっているのは、どのようなお金との関わりですか？', [
        option('support', '援助や資金提供を受けて、活動すること'),
        option('joint', '共同事業や共同資産の、利益・負担を分けること'),
        option('inheritance', '贈与や相続など、受け継ぐ資源との関わり'),
        option('investment', '自分の資金を運用し、その収益を受け取ること'), unknown,
      ], '援助・共有・承継・運用を分離する。資産運用は8ハウスだけで判断しない。', true),
      question('shared.conditions', 'お金や資源が関わるとき、特に大切にしたいのは？', [
        option('independence', '受け取ることで、自分の選択を縛られない'),
        option('clarity', '権利・責任・分配がはっきりしている'),
        option('understand', '仕組みや負担を、自分でも理解できる'),
        option('bounded', '失ったり負担したりしてよい範囲を守れる'), unknown,
      ], '関係性・理解・負担の条件を聞く。投資リスク許容度の判定には使わない。', true),
      question('shared.experience', 'これまでの経験として、近いものは？', [
        option('managed', '条件を確認し、納得して受け取ったり管理したりした'),
        option('adjusted', '他の人と、お金や負担について調整した'),
        option('troubled', '条件や責任が曖昧で、困ったことがある'),
        option('learning', '経験は少なく、仕組みを知るところから始めたい'),
        option('unexperienced', 'まだそうした場面がない'), unknown,
      ], '受け取り方や管理の実経験を確認する。運用成績・相続額・当せん可能性は推定しない。', true),
    ],
  },
  {
    id: 'network', label: '仲間・支援・活動の広がり',
    chartFocus: ['11ハウス・支配星', '木星'],
    questions: [
      question('network.wish', '人とのつながりから、どんな広がりがあるとうれしいですか？', [
        option('peers', '同じ関心を持つ人と、考えや経験を交換する'),
        option('collaboration', '得意なことを持ち寄って、一緒に作る'),
        option('referral', '必要としている人や、仕事の機会につながる'),
        option('support', '活動を理解し、応援してくれる人がいる'), unknown,
      ], '人脈の数と、本人が望むつながりの質を区別する。', true),
      question('network.role', '人が集まる場で、自然にやっていたことは？', [
        option('connect', '人や情報をつなぐ'),
        option('share', '自分の知識や制作物を持ち寄る'),
        option('organize', '活動の進め方や場を整える'),
        option('small', '少人数と深く話し、互いに助け合う'),
        option('unexperienced', 'まだそうした経験がない'), unknown,
      ], '主催者や社交的な人だけがつながりを活用できるという前提を置かない。', true),
      question('network.sustain', '無理なく関われそうなのは、どんな距離感ですか？', [
        option('regular', '定期的にやり取りし、活動に関わる'),
        option('project', '目的や期間が決まったときに参加する'),
        option('small', '少数の相手と、自分のペースで関わる'),
        option('publish', '日常の交流は少なめにして、成果や発信を通じてつながる'), unknown,
      ], '付き合いを増やすことを一律の改善策にせず、続けられる条件を聞く。'),
    ],
  },
];

const areas = MODULES.map(module => option(module.id, module.label));
export const COMMON_QUESTIONS = [
  question('common.primary', 'お金との関わりで、まず考えてみたいのは？', [...areas, unknown],
    'いちばん気になる分野を本人が選ぶ。出生図から選ばない。'),
  question('common.secondary', 'あわせて考えたい分野はありますか？', [...areas, option('skip', '今はひとつでよい'), unknown],
    '追加は最大1分野。画面では第一希望と同じ選択肢を除く。'),
  question('common.outcome', 'お金を通じて、今いちばん実現したいのは？', [
    option('increase', '収入や使えるお金を増やす'),
    option('stability', '収入や生活を安定させる'),
    option('autonomy', '自分の軸や、自由に使える時間を守る'),
    option('meaning', '納得できる活動を、対価につなげる'),
    option('retain', '入ってきたお金を、無理なく残して生かす'), unknown,
  ], '収入最大化だけを目的としない。'),
  question('common.experience', 'これまで、仕事や生活で人に喜ばれたのは？', [
    option('craft', '作ることや、実際に手を動かすこと'),
    option('insight', '知識・説明・自分なりの見方'),
    option('solve', '問題を整理し、進め方を改善すること'),
    option('relate', '話を聞くことや、人と人の調整'),
    option('care', '人や場を支え、状態を整えること'),
    option('unexperienced', 'まだ思い当たらない'), unknown,
  ], '収入の有無とは別に、資質仮説と照合できる実例の入口を作る。', true),
  question('common.stage', '今回考えたいことは、今どの段階ですか？', [
    option('explore', '何をしたいか、探している'),
    option('try', '気になることがあり、これから試したい'),
    option('testing', 'すでに試していて、手応えを確かめたい'),
    option('paid', '対価を受け取っていて、さらに育てたい'),
    option('change', '今のやり方を見直したい'), unknown,
  ], '未経験の人と実績のある人に、同じ段階の助言をしない。'),
  question('common.conditions', '進めるうえで、特に大切にしたい条件は？', [
    option('pace', '生活や体調に無理のないペース'),
    option('freedom', '自分で方針や時間を決められること'),
    option('security', '収入の見通しや、負担の少なさ'),
    option('privacy', '表に出る範囲や、対人負担を選べること'),
    option('growth', '学んだり、技能を磨いたりできること'), unknown,
  ], '希望の稼ぎ方と実行条件を分ける。条件を直すべき欠点として扱わない。', true),
];

function singleChoice(answers, id) {
  const value = answers[id];
  return Array.isArray(value) && value.length === 1 ? value[0] : undefined;
}

// Only explicit interests route the fixed questions. No chart or inferred score input.
export function selectedModules(answers = {}) {
  const ids = ['common.primary', 'common.secondary'].map(id => singleChoice(answers, id));
  return [...new Set(ids)].map(id => MODULES.find(module => module.id === id)).filter(Boolean);
}

export function questionsFor(answers = {}) {
  return [...COMMON_QUESTIONS, ...selectedModules(answers).flatMap(module => module.questions)];
}

export function selectChoice(question, current = [], value) {
  if (!question.options.some(([id]) => id === value)) throw new Error('Unknown choice');
  if (!question.multiple || question.exclusiveValues.includes(value)) return [value];
  const next = current.filter(id => !question.exclusiveValues.includes(id));
  return next.includes(value) ? next.filter(id => id !== value) : [...next, value];
}
