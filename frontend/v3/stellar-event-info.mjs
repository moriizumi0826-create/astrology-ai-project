const planets={SUN:'太陽',MOON:'月',MERCURY:'水星',VENUS:'金星',MARS:'火星',JUPITER:'木星',SATURN:'土星',URANUS:'天王星',NEPTUNE:'海王星',PLUTO:'冥王星'};
const planetName=value=>planets[String(value||'').toUpperCase()]||String(value||'天体');
const houseName=value=>Number.isInteger(Number(value))&&Number(value)>=1&&Number(value)<=12 ? `第${Number(value)}ハウス` : '';

export function stellarEventInfo(event,remaining,completed=false,timezone=Intl.DateTimeFormat().resolvedOptions().timeZone){
  const planet=planetName(event.transit_planet||event.planet);
  const relative=Number.isFinite(remaining?.value) ? `約${remaining.value}${remaining.unit}後、` : '';
  const raw=event.event_utc_datetime||event.event_datetime;
  let when=event.event_date||'';
  if(raw && /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw) && Number.isFinite(Date.parse(raw))){
    when=new Intl.DateTimeFormat('ja-JP',{timeZone:timezone,year:'numeric',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(raw));
  }else if(raw){when=String(raw).replace('T',' ').slice(0,16);}
  const prefix=completed ? (when ? `${when}に、` : '') : relative;
  let label='イベントまで',action=completed?'イベントの時刻を迎えました。':'イベントの時刻を迎えます。';
  switch(event.event_type){
    case 'natal_house_ingress': {
      label=completed?'移動済み':'移動まで';
      const to=houseName(event.house),from=houseName(event.previous_house);
      action=to ? `${planet}が出生図基準の${from?`${from}から`:''}${to}へ移動${completed?'しました':'します'}。` : `${event.title||'ハウス移動'}の時刻を迎え${completed?'ました':'ます'}。`;
      break;
    }
    case 'sign_ingress':
      label=completed?'移動済み':'移動まで';
      action=event.sign ? `${planet}が${event.previous_sign?`${event.previous_sign}から`:''}${event.sign}へ移動${completed?'しました':'します'}。` : `${event.title||'星座移動'}の時刻を迎え${completed?'ました':'ます'}。`;break;
    case 'transit_natal_aspect':
      label=completed?'ピーク通過':'ピークまで';
      action=`${planet}と出生図の${planetName(event.natal_planet)}のアスペクトが最も正確になる時刻（ピーク）を迎え${completed?'ました':'ます'}。影響がこの瞬間だけに限られるわけではありません。`;break;
    case 'new_moon': case 'full_moon': {
      const name=event.event_type==='new_moon'?'新月':'満月';label=completed?`${name}通過`:`${name}まで`;
      action=`${name}の瞬間を迎え${completed?'ました':'ます'}。`;break;
    }
    case 'retrograde_start': case 'direct_start': {
      const motion=event.event_type==='retrograde_start'?'逆行':'順行';label=completed?`${motion}開始済み`:`${motion}開始まで`;
      action=`${planet}が${motion}に切り替わ${completed?'りました':'ります'}。`;break;
    }
  }
  return {label,description:prefix+action,datetime:when?`イベント日時：${when}（${timezone}）`:''};
}
