import React, {useEffect, useState} from 'react';
import {postJson} from './api.mjs';
import {useAccess} from './access-context.jsx';
import {featurePolicy} from './feature-policy.mjs';

// Mounted only when an interpretation is expanded. No chart recalculation.
export function MapAspectDescription({aspect,house,retrograde}) {
  const {session}=useAccess();
  const paid=featurePolicy(session).mapAssistant;
  const detailed=paid && !aspect.compoundKind && (aspect.scope||'transitNatal')==='transitNatal';
  const payload={transit_planet:aspect.transitPlanet,natal_planet:aspect.natalPlanet,angle:Number(aspect.angle),natal_house:house,retrograde:Boolean(retrograde),orb_status:['Applying','Separating','Exact'].includes(aspect.status)?aspect.status:'Applying'};
  const valid=Boolean(payload.transit_planet && payload.natal_planet && house>=1 && house<=12);
  const key=JSON.stringify([session?.user_id,payload]);
  const [result,setResult]=useState(null),[retry,setRetry]=useState(0);
  useEffect(()=>{
    if(!detailed||!valid)return;
    let active=true;
    setResult(null);
    postJson('/api/aspect-interpretation-detail',payload).then(data=>{
      if(active)setResult({key,text:data.description||'解釈文がありません。'});
    }).catch(error=>{if(active)setResult({key,error:error.message||'詳細解釈文を取得できませんでした。'});});
    return ()=>{active=false;};
  },[detailed,valid,key,retry]);
  if(!detailed)return <>{aspect.description||'解釈文がありません。'}</>;
  if(!valid)return <>出生天体のハウスを確認できないため、詳細解釈文を取得できません。</>;
  if(result?.key!==key)return <span role="status">詳細解釈文を読み込み中…</span>;
  if(result.error)return <span role="alert">{result.error}<button type="button" className="ml-3 text-gold underline" onClick={()=>setRetry(n=>n+1)}>再試行</button></span>;
  return <>{result.text}</>;
}
