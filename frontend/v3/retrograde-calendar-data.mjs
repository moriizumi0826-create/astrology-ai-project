// Compile the complete master into the UI; never filter it by today's date.
export function parseRetrogradeCalendar(csv) {
  const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<csv.length;i++) {
    const ch=csv[i];
    if(ch==='"') {
      if(quoted && csv[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;
    } else if(!quoted && (ch===',' || ch==='\n')) {
      row.push(cell.replace(/\r$/,''));cell='';
      if(ch==='\n'){if(row.some(Boolean))rows.push(row);row=[];}
    } else cell+=ch;
  }
  if(quoted)throw new Error('Invalid retrograde calendar CSV');
  if(cell || row.length){row.push(cell.replace(/\r$/,''));rows.push(row);}
  const header=(rows.shift() || []).map(value=>value.replace(/^\uFEFF/,''));
  for(const name of ['Planet','Event_Type','Event_Date','Event_DateTime_JST'])if(!header.includes(name))throw new Error(`Missing calendar column: ${name}`);
  return rows.map(values=>{
    const source=Object.fromEntries(header.map((key,index)=>[key,values[index] || '']));
    if(!/^\d{4}-\d{2}-\d{2}$/.test(source.Event_Date) || !['RETROGRADE_START','DIRECT_START'].includes(source.Event_Type))throw new Error('Invalid retrograde calendar event');
    return {planet:source.Planet,planet_label:source.Planet_Label,event_type:source.Event_Type,
      event_label:source.Event_Type==='RETROGRADE_START'?'逆行開始':'順行開始',
      event_date:source.Event_Date,event_datetime_jst:source.Event_DateTime_JST,degree_display:source.Degree_Display};
  });
}

export function localRetrogradeCalendar(events,timeZone) {
  const formatter=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'});
  return events.map(event=>{
    const raw=String(event.event_datetime_jst || '').replace(' ','T');
    const instant=new Date(raw+(/(?:Z|[+-]\d{2}:\d{2})$/.test(raw)?'':'+09:00'));
    if(!Number.isFinite(instant.getTime()))return {...event};
    const parts=Object.fromEntries(formatter.formatToParts(instant).map(p=>[p.type,p.value]));
    return {...event,event_date:`${parts.year}-${parts.month}-${parts.day}`};
  });
}
