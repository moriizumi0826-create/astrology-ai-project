// Versioned reflection questions. These are not a validated aptitude score.
export const QUESTIONS = [
  { id: 'wish', label: '望む稼ぎ方', title: 'どんな稼ぎ方に、心が向きますか？', hint: '同じくらいの収入が得られるとしたら。いちばん近いものを選んでください。', options: [
    ['expertise', '自分の技能や専門性を、対価にする'], ['product', '商品やツールを作って、届ける'], ['cooperate', '人と組んだり、支援を受けたりする'], ['assets', '資産を運用し、その収益を得る'], ['freedom', '方法より、自由に使える時間を大切にしたい'], ['unknown', 'まだ、わからない'],
  ] },
  { id: 'interest', label: '自然な関心', title: '評価や収入とは別に、楽しめることは？', hint: '複数選べます。今の自分に近いものを。', multiple: true, options: [
    ['explore', '調べたり考えたりして、自分なりの見方を深める'], ['make', 'アイデアを、形のあるものにする'], ['explain', '相手に伝わるように、説明を工夫する'], ['organize', '物事を整理して、進めやすくする'], ['unknown', 'まだ、わからない'],
  ] },
  { id: 'experience', label: 'これまでの経験', title: '人から「役に立った」と言われるのは？', hint: '複数選べます。経験がなくても大丈夫です。', multiple: true, options: [
    ['perspective', '自分では気づかなかった視点や、核心を突く指摘'], ['clarity', '複雑なことを整理した、わかりやすい説明'], ['suggestion', '相手の事情に合った、具体的な提案'], ['craft', '作ったものや、実際に手を動かした成果'], ['unknown', '経験がない・まだわからない'],
  ] },
  { id: 'style', label: '心地よい関わり方', title: '力を発揮しやすい進め方は？', hint: '無理をしなくてよいとしたら、どれを選びますか。', options: [
    ['dialogue', '相手と話しながら、その場で考える'], ['prepare', '時間をとって、じっくり考えてから返す'], ['both', '事前に考える時間と、対話を組み合わせる'], ['unknown', 'やってみないと、わからない'],
  ] },
  { id: 'value', label: '対価の受け取り方', title: '「価値を渡せた」と感じるのは、どんなとき？', hint: '複数選べます。正しい答えはありません。', multiple: true, options: [
    ['satisfaction', '相手が、納得や満足を伝えてくれたとき'], ['change', '相手の行動や状況に、実際の変化が出たとき'], ['quality', '自分として、十分に考えた内容を渡せたとき'], ['unknown', 'まだ、判断基準が決まっていない'],
  ] },
  { id: 'boundary', label: '関わる範囲', title: '渡したものが、相手の行動につながらなかったら？', hint: 'いちばん近いものを選んでください。条件は補足できます。', options: [
    ['support', '追加で支え、変化につながるところまで関わりたい'], ['limit', 'できる範囲で助力し、最後の選択は相手に委ねたい'], ['deliver', '約束した内容を渡すところまでを、自分の役割にしたい'], ['unknown', 'まだ、わからない'],
  ] },
  { id: 'offer', label: '届ける準備', title: '作る・考える以外の工程は、どうしたいですか？', hint: '発信、販売、価格の説明、問い合わせ対応などを思い浮かべてください。', options: [
    ['own', '自分で試しながら、ひと通り取り組みたい'], ['partner', '得意な人と分担したい'], ['avoid', 'できるだけ、作る・考えることに集中したい'], ['unknown', 'まだ、わからない'],
  ] },
  { id: 'theme', label: '大切にしたいこと', title: 'その活動を通じて、何を届けたいですか？', hint: '「自分の軸で生きること」など、ひと言でも。決まっていなければ、そのまま進めます。', text: true },
];

export const OPEN_QUESTIONS = [
  '選んだ稼ぎ方の、どんなところに惹かれていますか？ 大切にしたいことを、自分の言葉で教えてください。',
  '回答だけでは伝わらなかったことや、「この条件なら違う」と感じるところはありますか？',
];

export function selectAnswer(current = [], value, multiple = false) {
  if (!multiple || value === 'unknown') return [value];
  const previous = current.filter(item => item !== 'unknown');
  return previous.includes(value) ? previous.filter(item => item !== value) : [...previous, value];
}

export function canContinue(question, values) {
  return Boolean(question?.text || values?.length);
}

export function answerText(question, answers) {
  if (question.text) return String(answers[question.id] || '').trim() || '未記入';
  return (answers[question.id] || []).map(id => question.options.find(option => option[0] === id)?.[1]).filter(Boolean).join('／') || '未回答';
}

export function validateBirth(birth, today) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birth.date || '')) return '生年月日を入力してください。';
  const parsed = new Date(`${birth.date}T12:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== birth.date || birth.date < '1900-01-01' || birth.date > today) return '生年月日を確認してください。';
  if (!birth.unknownTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(birth.time || '')) return '出生時刻を入力するか、「出生時刻はわからない」を選んでください。';
  if (!String(birth.place || '').trim()) return '出生地を入力してください。';
  return '';
}

export function recordRevision(revisions, text) {
  const note = String(text || '').trim().slice(0, 2000);
  return note ? [...revisions, { number: revisions.length + 1, note }] : revisions;
}
