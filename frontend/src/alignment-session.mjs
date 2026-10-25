import { QUESTIONS, answerText, validateBirth } from './alignment-flow.mjs';

export const FORMAT = 'atelier-alignment-v2';
export const STORAGE_KEY = 'atelier-alignment-v2';
export const EMPTY_BIRTH = { date: '', time: '', place: '', unknownTime: false, latitude: '', longitude: '', timezone: 'Asia/Tokyo', fold: '' };
export const SECTION_LABELS = { wish: 'あなたが望んでいること', experience: '回答から見えた経験・傾向', overlap: '重なりを探す手がかり', tension: '違い・条件を確かめたいところ', action: '小さく試すなら', unknown: 'まだ判断できないこと' };

const has = (a, q, value) => Array.isArray(a[q]) && a[q].includes(value);
export function followups(answers) {
  const questions = [];
  if (has(answers, 'wish', 'product')) questions.push({ id: 'product', text: '作ったものを、誰のどんな場面で使ってもらえたらうれしいですか？ 届け方で気になることも教えてください。' });
  else if (has(answers, 'wish', 'assets') || has(answers, 'wish', 'cooperate')) questions.push({ id: 'resources', text: 'その稼ぎ方に惹かれる理由と、実際に経験したことを教えてください。自由、安定、人との関わりなど、何を大切にしたいですか？' });
  else questions.push({ id: 'motivation', text: '選んだ稼ぎ方の、どんなところに惹かれていますか？ 過去の具体的な経験があれば教えてください。' });
  if (has(answers, 'value', 'change') || has(answers, 'boundary', 'support')) questions.push({ id: 'boundary', text: '相手の変化を願うとき、どこまでを自分の役割と考えますか？ 追加の助力や、対応を終える条件を教えてください。' });
  else if (has(answers, 'offer', 'avoid') || has(answers, 'offer', 'partner')) questions.push({ id: 'delivery', text: '作る・考えること以外で、自分が引き受けたい工程と、人に任せたい工程はどこですか？' });
  else questions.push({ id: 'conditions', text: '回答だけでは伝わらなかった条件や、例外はありますか？ まだ経験していないことも、そのまま教えてください。' });
  return questions;
}

export function birthPayload(birth, today) {
  const error = validateBirth(birth, today);
  if (error) throw new Error(error);
  const lat = Number(birth.latitude), lon = Number(birth.longitude);
  if (String(birth.latitude).trim() === '' || String(birth.longitude).trim() === '' || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new Error('出生地を検索して選ぶか、正しい緯度・経度を入力してください。');
  if (!birth.timezone.trim()) throw new Error('出生地のタイムゾーンを入力してください。');
  return { birth_date: birth.date, birth_time: birth.unknownTime ? null : birth.time, birth_time_unknown: birth.unknownTime,
    birthplace: birth.place, latitude: lat, longitude: lon, timezone_name: birth.timezone,
    birth_time_fold: birth.fold === '' ? null : Number(birth.fold) };
}

export function chartEvidence(chart) {
  if (!chart) return [];
  const facts = [];
  for (const number of [2, 6, 10, 8]) {
    const house = chart.houses.find(h => h.number === number);
    if (!house) continue;
    const ruler = chart.planets.find(p => p.name === house.ruler);
    const residents = chart.planets.filter(p => p.house === number).map(p => p.name);
    facts.push({ id: `house-${number}`, text: `${number}ハウス：${house.sign}／支配星 ${house.ruler}${ruler ? `（${ruler.sign}・${ruler.house}ハウス）` : ''}／在室 ${residents.join('・') || 'なし'}` });
  }
  for (const name of ['水星', '金星', '土星']) {
    const p = chart.planets.find(item => item.name === name);
    if (p) facts.push({ id: `planet-${name}`, text: `${name}：${p.sign} ${p.degree}°${p.house ? `／${p.house}ハウス` : '／ハウス不明'}${chart.birth_time_unknown ? '（正午の概算）' : ''}` });
  }
  return facts;
}

export function reflect(answers, chart, revisions = []) {
  const text = id => answerText(QUESTIONS.find(q => q.id === id), answers);
  const evidence = ids => ids.map(id => `${QUESTIONS.find(q => q.id === id).label}：${text(id)}`);
  const shared = [], tension = [], steps = [];
  if (has(answers, 'wish', 'product') && has(answers, 'interest', 'make')) shared.push('「商品やツールを届けたい」という望みと、「形にすることを楽しめる」という回答は重なっています。');
  if (has(answers, 'wish', 'expertise') && (has(answers, 'interest', 'explore') || has(answers, 'experience', 'perspective'))) shared.push('専門性を対価にしたい望みに対し、探究への関心や、視点を評価された経験が手がかりになります。');
  if (has(answers, 'wish', 'product') && (has(answers, 'offer', 'avoid') || has(answers, 'offer', 'partner'))) tension.push('制作と、届ける・販売する工程を分けて考える余地があります。制作への関心の低さとは判断しません。');
  if (has(answers, 'value', 'change') && has(answers, 'boundary', 'limit')) shared.push('相手の変化を願うことと、最後の選択を相手に委ねることは両立する回答です。');
  else if (has(answers, 'value', 'change') || has(answers, 'boundary', 'support')) tension.push('相手の変化を価値とする場合、約束する成果と、追加対応の条件を分けて確かめたいところです。境界がないとは判断しません。');
  if (has(answers, 'style', 'prepare') || has(answers, 'style', 'both')) steps.push('事前に考える時間を含む小さな提供を一度試し、準備・対話・対応後にかかった時間を記録する。');
  if (has(answers, 'wish', 'product')) steps.push('具体的な一人に試してもらい、「どの場面で役に立ったか」と「使いづらかった工程」を聞く。');
  if (has(answers, 'offer', 'partner')) steps.push('分担したい工程と、自分で担いたい工程を書き分ける。');
  const facts = chartEvidence(chart);
  if (chart) {
    const ruler2 = chart.houses.find(h => h.number === 2)?.ruler;
    const p = chart.planets.find(p => p.name === ruler2);
    if (p) shared.push(`出生図では2ハウスの支配星${ruler2}が${p.house}ハウスにあります。対価の入口と「${HOUSE_THEMES[p.house] || 'その領域'}」のつながりを、経験と照らしてみる手がかりです。適性の確定ではありません。`);
    else shared.push('水星を伝え方、金星を価値や対価の象徴として、表示した配置と自分の経験を並べて検討できます。時刻不明のためハウスを使った照合は行いません。');
  }
  let sections = [
    { id: 'wish', body: [text('wish'), answers.theme ? `大切にしたいこと：${answers.theme}` : '大切にしたいテーマは、まだ言葉にしていません。'], evidence: evidence(['wish', 'theme']) },
    { id: 'experience', body: [`自然な関心：${text('interest')}`, `役に立ったと言われること：${text('experience')}`, `心地よい進め方：${text('style')}`, `関わる範囲：${text('boundary')}`, 'これは本人の自己申告として整理したものです。能力や実績の客観評価とは分けて扱います。'], evidence: evidence(['interest', 'experience', 'style', 'value', 'boundary', 'offer']) },
    { id: 'overlap', body: shared.length ? shared : ['今の材料だけでは、望みと経験の重なりを絞れません。具体的な経験を一つ足して考えてみましょう。'], evidence: [...evidence(['wish', 'interest', 'experience', 'value', 'boundary']), ...facts.map(f => f.text)] },
    { id: 'tension', body: tension.length ? tension : ['現時点で、明確な食い違いを示す回答はありません。一致が証明されたという意味ではなく、条件や実際の経験は引き続き確認が必要です。'], evidence: evidence(['wish', 'value', 'boundary', 'offer']) },
    { id: 'action', body: steps.length ? steps : ['対象・渡す内容・対応範囲を一つずつ決め、小さく試した経験を記録してみる。'], evidence: evidence(['wish', 'style', 'offer']) },
    { id: 'unknown', body: [!chart ? '出生図は未計算です。占星術的な重なり・違いは未判断です。' : chart.birth_time_unknown ? '出生時刻不明のため、ハウス・ASC・MC・月のアスペクトによる判断はしません。' : '出生図の配置は計算済みですが、配置だけで稼ぎ方の優劣は決めません。', '収益性・需要・継続しやすさは、実際の経験が必要です。投資・贈与等の適性比較と、自由記述の意味の解釈は未判断です。'], evidence: [] },
  ];
  sections = sections.map(section => {
    const updates = revisions.filter(r => r.section === section.id);
    const last = updates.at(-1);
    return { ...section, title: SECTION_LABELS[section.id], original: section.body,
      body: last && ['different', 'conditional'].includes(last.kind) ? ['元の仮説は保留し、本人の補足・訂正を優先して記録しています。文章の意味をAIが再解釈する処理は未接続です。'] : section.body,
      update: last || null };
  });
  return sections;
}
const HOUSE_THEMES = { 1: '自分から動くこと', 2: '自分の資源・価値', 3: '学習・伝達', 4: '生活の基盤', 5: '創作・表現', 6: '日々の仕事・実務', 7: '顧客・協働', 8: '共有する資源', 9: '探究・専門知識', 10: '社会的役割', 11: '仲間・活動の場', 12: '表に出ない活動' };

export function restoreSession(raw) {
  if (!raw || raw.format !== FORMAT || !raw.answers || typeof raw.answers !== 'object') throw new Error('対応する保存ファイルではありません。');
  const string = (v, max = 2000) => typeof v === 'string' ? v.slice(0, max) : '';
  const answers = {}, supplements = {};
  for (const q of QUESTIONS) {
    answers[q.id] = q.text ? string(raw.answers[q.id], 600) : (Array.isArray(raw.answers[q.id]) ? [...new Set(raw.answers[q.id].filter(id => q.options.some(o => o[0] === id)))] : []);
    if (!q.text && answers[q.id].includes('unknown')) answers[q.id] = ['unknown'];
    if (!q.text && !q.multiple) answers[q.id] = answers[q.id].slice(0, 1);
    supplements[q.id] = string(raw.supplements?.[q.id], 600);
  }
  const birth = { ...EMPTY_BIRTH };
  for (const key of Object.keys(birth)) birth[key] = key === 'unknownTime' ? raw.birth?.[key] === true : string(raw.birth?.[key], 150);
  const openAnswers = {};
  for (const q of followups(answers)) openAnswers[q.id] = string(raw.openAnswers?.[q.id]);
  const revisions = (Array.isArray(raw.revisions) ? raw.revisions : []).slice(0, 50).filter(r => r && Object.hasOwn(SECTION_LABELS, r.section) && ['agree', 'different', 'conditional', 'add'].includes(r.kind)).map((r, i) => ({ number: i + 1, section: r.section, kind: r.kind, note: string(r.note), at: string(r.at, 40) }));
  const history = (Array.isArray(raw.history) ? raw.history : []).slice(-20).filter(h => h && Array.isArray(h.sections)).map(h => ({
    at: Number.isFinite(Date.parse(h.at)) ? new Date(h.at).toISOString() : new Date(0).toISOString(),
    sections: h.sections.slice(0, 6).filter(s => s && Object.hasOwn(SECTION_LABELS, s.id)).map(s => ({ id: s.id, title: SECTION_LABELS[s.id], body: Array.isArray(s.body) ? s.body.slice(0, 12).map(v => string(v)) : [] })),
  }));
  const index = QUESTIONS.findIndex(q => !q.text && !answers[q.id]?.length);
  const phase = ['questions', 'birth', 'open', 'summary'].includes(raw.phase) ? raw.phase : 'questions';
  return { answers, supplements, birth, openAnswers, revisions, history, chart: null, birthSkipped: true,
    phase: index < 0 ? phase : 'questions', index: index < 0 && Number.isInteger(raw.index) ? Math.max(0, Math.min(QUESTIONS.length - 1, raw.index)) : Math.max(0, index),
    openIndex: Number.isInteger(raw.openIndex) ? Math.max(0, Math.min(followups(answers).length - 1, raw.openIndex)) : 0,
    feedback: string(raw.feedback), feedbackSection: Object.hasOwn(SECTION_LABELS, raw.feedbackSection) ? raw.feedbackSection : 'tension',
    feedbackKind: ['agree', 'different', 'conditional', 'add'].includes(raw.feedbackKind) ? raw.feedbackKind : 'add' };
}
