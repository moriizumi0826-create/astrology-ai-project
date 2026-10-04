// Preserve the event instant; the AI receives data, never an ephemeris tool.
export function calendarMapNavigation(event, timezone = Intl.DateTimeFormat().resolvedOptions().timeZone) {
  const raw = event?.event_utc_datetime || event?.event_datetime;
  let date, time, utc_datetime;
  if (raw && /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw)) {
    const instant = new Date(raw);
    if (!Number.isFinite(instant.getTime())) throw new Error('イベントの日時を確認できません。');
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone, year:'numeric', month:'2-digit', day:'2-digit',
      hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23',
    }).formatToParts(instant).map(p=>[p.type,p.value]));
    date = `${parts.year}-${parts.month}-${parts.day}`;
    time = `${parts.hour}:${parts.minute}:${parts.second}`;
    if (parts.second === '00') time = time.slice(0,5);
    utc_datetime = instant.toISOString();
  } else if (raw && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(raw)) {
    date = raw.slice(0,10); time = raw.slice(11);
    if (time.length === 8 && time.endsWith(':00')) time = time.slice(0,5);
  } else if (!raw) {
    date = event?.event_date; time = '12:00';
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(time || '') || !Number.isFinite(Date.parse(date+'T'+time+'Z'))) throw new Error('イベントの日時を確認できません。');
  if (new Date(date+'T00:00:00Z').toISOString().slice(0,10) !== date) throw new Error('イベントの日時を確認できません。');
  return {date,time,timezone,utc_datetime,approximate:!raw,
    title:String(event?.title || '天体イベント').slice(0,160),type:String(event?.event_type || '').slice(0,40)};
}
export function eventAssistantNotice(event) {
  return `「${event.title}」の${event.date} ${event.time}（${event.timezone}）の配置を表示します。${event.approximate ? '時刻が未提供のため、正午の参考配置です。' : ''}出生図との関係について、ここから質問できます。`;
}
export function eventAssistantQuestions(event) {
  if (!event) return [];
  if (event.type === 'full_moon' || event.type === 'new_moon') {
    const name = event.type === 'full_moon' ? '満月' : '新月';
    return [`この${name}は私にどう関係する？`, 'どんなテーマを意識するとよい？', '出生図との関係で注目する配置は？'];
  }
  if (event.type === 'sign_ingress') return ['この天体の移動は私にどう関係する？', '出生・ソーラーハウスではどんな意味がある？', '世の中全体ではどんな傾向？'];
  if (event.type === 'natal_house_ingress') return ['このハウスに入ると、どんなテーマが強まる？', '出生図基準とソーラー基準ではどう違う？', 'どんな過ごし方を意識するとよい？'];
  if (event.type === 'transit_natal_aspect') return ['このアスペクトは私にどう関係する？', '追い風と注意点を教えて', '他の表示中の配置と合わせるとどう読める？'];
  if (event.type === 'retrograde_start' || event.type === 'direct_start') {
    const name = event.type === 'retrograde_start' ? '逆行' : '順行';
    return [`この${name}への切り替わりは私にどう関係する？`, '見直すとよさそうなテーマは？', '出生図との関係で注目する配置は？'];
  }
  return ['このイベントは私にどう関係する？', 'どんなテーマ・過ごし方を意識するとよい？', '表示中の配置で、その根拠を教えて'];
}
export function mapAssistantHistory(messages) {
  return messages.filter(message=>!message.eventNotice).slice(-6).map(({role,content})=>({role,content:content.slice(0,600)}));
}
