export const SIGNS = ['牡羊座', '牡牛座', '双子座', '蟹座', '獅子座', '乙女座', '天秤座', '蠍座', '射手座', '山羊座', '水瓶座', '魚座'];
export const STAGES = [
  { number: 2, badge: '①', title: '何を武器にするか', label: '2ハウス', tone: 'teal' },
  { number: 6, badge: '②', title: 'どう鍛えるか', label: '6ハウス', tone: 'teal' },
  { number: 10, badge: '③', title: '何で評価されるか', label: '10ハウス・MC', tone: 'gold' },
];

const RESOURCES = [
  '自分で判断して動き、顔が見える形で価値を届ける力',
  '手持ちの技能や道具を磨き、安定した品質を届ける力',
  '情報を集め、相手が使える言葉や知識にする力',
  '暮らしや居場所を整え、安心して過ごせる土台を作る力',
  '着想を作品やサービスにして、人を楽しませる力',
  '現場の困りごとを見つけ、手順や仕組みを改善する力',
  '相手の要望を聞き、状況に合う解決策を組み立てる力',
  '込み入った事情を扱い、信頼が必要な問題を解く力',
  '専門知識を深め、教えたり体系にしたりする力',
  '責任を引き受け、結果を積み重ねる力',
  '人をつなぎ、チームや仲間とできることを広げる力',
  '表から見えにくい問題を拾い、裏方で支える力',
];
// Indexed by the house occupied by the second-house ruler, as in Part 1.
const JOBS = [
  ['先陣を切る開拓者', '自分で判断して、最初の形を作る', '新サービスの試作品づくり、個人で受ける制作'],
  ['品質を磨く職人', '素材や工程を調整して、品質を揃える', '製品づくり、検品や品質改善'],
  ['情報を編む編集者', '散らばった情報を、相手が使える形にまとめる', '記事編集、マニュアルやFAQづくり'],
  ['居場所を整える拠点づくり役', '人が落ち着いて過ごせる環境を整える', '住まいの提案、施設や居場所の運営'],
  ['発想を形にするクリエイター', '着想を、人が楽しめる形にする', 'コンテンツ制作、イベント企画'],
  ['仕事の詰まりをほどく改善役', 'つまずく箇所を見つけ、誰でも回せる手順にする', '業務改善、運用マニュアルづくり'],
  ['相手に合わせる相談役', '要望を聞いて、条件に合う解決策を組み立てる', '顧客への提案、要件整理'],
  ['難題の奥を読む調査役', '表に出にくい事情を聞き、問題の根を見つける', '原因調査、難しい案件の調整'],
  ['知識を渡す専門家', '専門知識を、学ぶ人が使える順番に組み直す', '教材づくり、研修設計'],
  ['結果まで運ぶ指揮役', '優先順位をつけ、関係者と成果まで持っていく', 'プロジェクト進行、運用責任者'],
  ['人と人をつなぐ仲介役', '得意分野が違う人をつなぎ、協力の場を作る', 'コミュニティ運営、協業の企画'],
  ['見えない穴を埋める裏方', '表から見えにくい詰まりを見つけ、先回りして整える', '制作進行、チームの運用支援'],
];
const TRAINING_SKILLS = [
  '素早く試して改善する力', '同じ品質を再現する力', '相手に伝わる言葉を選ぶ力',
  '安心して話せる聞き方', '人の反応を見て見せ方を変える力', 'ミスを減らす手順設計',
  '意見の違いを整理する力', '複雑な問題の原因を絞る力', '知識を教えられる形にする力',
  '締切と品質を両立する進め方', 'ツールや仕組みを試して定着させる力', '曖昧な要望を形にする力',
];
const WORK = [
  ['試作品を作り、反応を見てすぐ手を入れる', '新企画の立ち上げ', '試した案と、採用を決めた根拠'],
  ['材料や工程を調整し、同じ品質を出せる条件を探る', '製品づくり・品質設計', '品質のばらつきを抑えた工程や基準'],
  ['問い合わせに答え、伝わりやすい順番や言葉を試す', '編集・情報設計', '情報を整理して、探す時間を減らした実績'],
  ['相談を受け、相手が話しやすい聞き方と対応を磨く', '利用者支援・サポート設計', '相談者が使い続けやすくなった仕組み'],
  ['発表や制作を重ね、反応が得られる見せ方を試す', '企画を立ち上げ、人を巻き込む役割', '企画の狙いを伝え、実行まで進めた実績'],
  ['ミスが起きる工程を調べ、再現できる手順に整える', '品質管理・業務改善', '不良や手戻りを減らした実績'],
  ['要望が違う相手同士の話を聞き、共通点と違いを整理する', '編集・案内設計・調整', '相手に伝わる形に整え、迷いや行き違いを減らした実績'],
  ['込み入った案件の経緯をたどり、問題の原因を絞る', '難しい顧客案件の調整', '話が止まっていた案件で合意まで進めた実績'],
  ['事例を調べ、学んだことを人に教えながら理解を深める', '研修設計・専門分野の発信', '知識を体系化し、人が使える形にした教材'],
  ['計画と進捗を比べ、締切や品質を守れる進め方に整える', '業務改善・運用責任', '個人の工夫をチームで再現できる仕組みにした実績'],
  ['既存のやり方を見直し、ツールや手順を小さく試す', '仕組みづくり・技術企画', '新しい仕組みがチームに定着した実績'],
  ['言葉になりにくい要望を聞き、見本を作ってすり合わせる', '制作・相談支援', '曖昧だった要望を使える形にした成果物'],
];

const SIGN_STYLES = [
  '先に試して反応を確かめる', '手触りや品質を揃える', '情報を集め、比べて伝える',
  '相手が安心できる条件を整える', '自分の発想を見える形にする', '細部を見て精度を上げる',
  '相手の視点を取り入れて整える', '背景を掘り下げて原因を見つける', '広く学び、知識を人に届ける',
  '計画を立てて結果を積み重ねる', '既存の枠を見直して仕組みを作る', '言葉になりにくい要望を形にする',
];
const WORK_PATHS = {
  '双子座/天秤座': '問い合わせ対応で説明力を磨き、よくある質問を案内にまとめる。同じ問い合わせが減った実績を、編集や案内設計の仕事につなげる。',
  '乙女座/山羊座': '作業のたびにミスが起きる工程を記録し、誰でも使える手順を作る。チーム全体の手戻りが減った実績を、品質管理や業務改善につなげる。',
  '牡羊座/獅子座': '試作品を作り、反応を見て改善する。採用案とその判断の根拠を示し、企画全体の立ち上げにつなげる。',
  '蟹座/蠍座': '相談のたびに聞き方を工夫し、要望の奥にある問題を整理する。話が止まっていた案件を合意まで進めた経験を、難しい顧客案件の調整につなげる。',
};
const TRAINING_SCENES = [
  '新しい案を試作するとき', '材料や工程を調整するとき', '問い合わせに答えるとき',
  '相談を受けるとき', '作ったものを人に見せるとき', '検品や事務処理をするとき',
  '意見の違う人の話を聞くとき', '込み入った案件を調べるとき', '学んだことを人に教えるとき',
  '計画や進捗を見直すとき', '新しい道具や手順を試すとき', '言葉になりにくい要望を聞くとき',
];

export function angularDistance(a, b) {
  return Math.abs(((a - b + 540) % 360) - 180);
}

export function readCareer(chart) {
  const houses = new Map(chart.houses.map(house => [house.number, house]));
  const planets = new Map(chart.planets.map(planet => [planet.name, planet]));
  const stages = STAGES.map(stage => {
    const cusp = houses.get(stage.number);
    const ruler = planets.get(cusp?.ruler);
    if (!cusp || !ruler || !RESOURCES[ruler.house - 1] || !SIGNS.includes(cusp.sign) || !SIGNS.includes(ruler.sign)) {
      throw new Error('出生図の配置を読み取れませんでした。もう一度お試しください。');
    }
    const occupants = chart.planets.filter(planet => planet.house === stage.number);
    return { ...stage, cusp, ruler, occupants };
  });
  const [second, sixth, tenth] = stages;
  const sixthSign = SIGNS.indexOf(sixth.cusp.sign);
  const [task] = WORK[sixthSign];
  const [, role, outcome] = WORK[SIGNS.indexOf(tenth.cusp.sign)];
  const [job, signature, workExamples] = JOBS[second.ruler.house - 1];
  const steps = [
    { ...second, result: RESOURCES[second.ruler.house - 1], detail: `${SIGN_STYLES[SIGNS.indexOf(second.ruler.sign)]}やり方を試す。` },
    { ...sixth, result: task, detail: `支配星の${sixth.ruler.name}がいる${sixth.ruler.house}ハウスも、練習の場を探す手がかり。` },
    { ...tenth, result: role, detail: `実績にするなら、${outcome}。` },
  ];

  const connections = [[second, sixth], [sixth, tenth]].map(([from, to]) => {
    const facts = [];
    if (from.ruler.name === to.ruler.name) {
      facts.push(`両方の支配星は${from.ruler.name}`);
    }
    if (from.ruler.house === to.number) {
      facts.push(`${from.label}の支配星・${from.ruler.name}が${to.number}ハウスにある`);
    }
    if (to.ruler.house === from.number && to.ruler.name !== from.ruler.name) {
      facts.push(`${to.label}の支配星・${to.ruler.name}が${from.number}ハウスにある`);
    }
    const aspect = chart.aspects.find(({ planet1, planet2 }) =>
      (planet1 === from.ruler.name && planet2 === to.ruler.name) ||
      (planet2 === from.ruler.name && planet1 === to.ruler.name));
    if (aspect) {
      facts.push(`${from.ruler.name}と${to.ruler.name}は${aspect.name}（${aspect.angle}°・オーブ ${aspect.orb}°）`);
    }
    return { label: `${from.label} → ${to.label}`, facts };
  });
  // In Placidus, the tenth cusp is the MC. This proximity is a separate geometric check.
  const nearMc = chart.planets.map(planet => ({ ...planet, distance: angularDistance(planet.longitude, tenth.cusp.longitude) }))
    .filter(planet => planet.distance <= 3)
    .sort((a, b) => a.distance - b.distance);
  return {
    steps, connections, nearMc,
    profile: { job, signature, workExamples, trainingSkill: TRAINING_SKILLS[sixthSign], task, role, outcome },
    example: WORK_PATHS[`${sixth.cusp.sign}/${tenth.cusp.sign}`] ||
      `${TRAINING_SCENES[sixthSign]}、得意技の「${signature}」を一度試してみる。工夫する前と後で何が変わったかを記録し、${role}の実績として伝えられる材料を集める。`,
  };
}
