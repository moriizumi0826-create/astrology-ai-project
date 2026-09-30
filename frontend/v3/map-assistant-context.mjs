export const MAX_ASSISTANT_ASPECTS = 24;
const round = value => Number.isFinite(Number(value)) && value != null && value !== '' ? Math.round(Number(value) * 100) / 100 : null;
const point = (layer, planet) => /^[A-Z_0-9]{1,24}$/.test(planet || '') ? `${layer}:${planet}` : null;
const longitudeOf = value => value != null && value !== '' && Number.isFinite(Number(value)) ? ((Number(value)%360)+360)%360 : null;
export function assistantHouse(longitude, source) {
  if (longitude == null || !Array.isArray(source) || source.length !== 12) return null;
  const cusps = source.map(item => longitudeOf(typeof item === 'object' ? item?.longitude ?? item?.cusp ?? item?.degree : item));
  if (cusps.some(value=>value === null)) return null;
  const spans=cusps.map((start,i)=>(cusps[(i+1)%12]-start+360)%360);
  if (spans.some(span=>span===0) || Math.abs(spans.reduce((a,b)=>a+b,0)-360)>0.001) return null;
  const index=cusps.findIndex((start,i)=>(longitude-start+360)%360 < spans[i]);
  return index<0 ? null : index+1;
}
export function compactBirth(form) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form?.birth_date || '')) return undefined;
  return {
    date: form.birth_date,
    ...(/^\d{2}:\d{2}(:\d{2})?$/.test(form.birth_time || '') ? {time: form.birth_time.slice(0,5)} : {}),
    ...(form.timezone_name ? {timezone: String(form.timezone_name).slice(0,64)} : {}),
    ...(round(form.timezone_offset) !== null ? {utc_offset: round(form.timezone_offset)} : {}),
  };
}
export function buildMapAssistantContext({date='',time='',timezone='',mode='',planet='',planetMode='both',aspects=[],natal=[],transits=[],natalCusps,transitCusps,memberForm,chartForm,isSelected=()=>false}) {
  const unique = new Map();
  for (const a of aspects) {
    const first = a.scope === 'transitTransit' ? point('T', a.transitPlanet) : point('N', a.natalPlanet);
    const second = a.scope === 'natalNatal' ? point('N', a.natalPlanetB) : point('T', a.scope === 'transitTransit' ? a.transitPlanetB : a.transitPlanet);
    const angle = round(a.angle);
    if (!first || !second || angle === null) continue;
    const key = [first,second].sort().join('/') + ':' + angle;
    const previous = unique.get(key);
    unique.set(key,{row:[first,second,angle,round(a.orb)], selected:isSelected(a)||previous?.selected, patterns:[...new Set([...(previous?.patterns||[]),...(a.compoundKind ? [`${a.compoundKind}:${(a.compoundGroupIds||[]).join(',')}`] : [])])]});
  }
  const ordered = [...unique.values()].sort((a,b)=>Number(Boolean(b.selected))-Number(Boolean(a.selected)) || (a.row[3]??999)-(b.row[3]??999));
  const rows = ordered.slice(0,MAX_ASSISTANT_ASPECTS);
  const endpoints = new Set(rows.flatMap(a=>a.row.slice(0,2)));
  const sun=natal.find(item=>(item.planet||item.name)==='SUN' && !item.estimated);
  const sunLongitude=longitudeOf(sun?.longitude);
  const sunSign=sunLongitude === null ? null : Math.floor(sunLongitude/30);
  const positions = [];
  const houses = [];
  for (const [layer,items] of [['N',natal],['T',transits]]) {
    for (const item of items) {
      const id = point(layer,item.planet || item.name);
      const longitude = longitudeOf(item.longitude);
      const visible=planetMode==='both' || (layer==='N' ? planetMode==='natal' : planetMode==='transit');
      if (id && longitude !== null && !item.estimated && (visible || endpoints.has(id)) && !positions.some(row=>row[0]===id)) {
        positions.push([id,round(longitude)]);
        const sign=Math.floor(longitude/30);
        houses.push([id,sign,assistantHouse(longitude,natalCusps),layer==='T' ? assistantHouse(longitude,transitCusps) : null,
          layer==='T' && sunSign !== null ? (sign-sunSign+12)%12+1 : null]);
      }
    }
  }
  return {date,time,timezone,aspect_mode:mode,selected_planet:planet,
    selected_aspect: rows.filter(a=>a.selected).map(a=>a.row.slice(0,3).join(' ')).join(';').slice(0,160),
    aspects:rows.map(a=>a.row),aspects_total:unique.size,aspects_omitted:Math.max(0,unique.size-rows.length),
    patterns:[...new Set(rows.flatMap(a=>a.patterns))].slice(0,8).map(s=>s.slice(0,200)),
    positions:positions.slice(0,32),houses:houses.slice(0,32),planet_mode:planetMode,chart_natal_sun_sign:sunSign,
    member_birth:compactBirth(memberForm),chart_birth:compactBirth(chartForm)};
}
