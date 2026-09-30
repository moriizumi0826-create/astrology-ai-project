// Actual callback, profile hydration and birth editor; local fake API only.
import {createServer} from 'vite';
import config from '../../vite.v3.config.mjs';
const base=config({mode:'development'});
const api=`const savedScenario=new URLSearchParams(location.search).has('saved');
const failSave=new URLSearchParams(location.search).has('fail');
const fixtureProfile={full_name:'確認用',birth_date:'2000-01-01',birth_time:'12:00',birthplace:'東京都',latitude:35.68,longitude:139.76,timezone_name:'Asia/Tokyo',timezone_offset:9};
export const getJson=async path=>path.endsWith('/session')?{user_id:'supabase:fixture',state:'free'}:{saved:savedScenario?{profile:fixtureProfile,revision:1}:null};
export const putJson=async(path,payload)=>{if(failSave)throw Error('確認用：保存失敗');sessionStorage.setItem('onboarding-fixture-saved',JSON.stringify(payload.profile));return{saved:{profile:payload.profile,revision:1}};};
export const deleteJson=async()=>({});
export const postJson=async()=>({});
export const searchBirthLocations=async()=>({results:[{display_name:'東京都 千代田区（確認用）',latitude:35.68,longitude:139.76,timezone_name:'Asia/Tokyo',country_code:'JP'}]});`;
const server=await createServer({...base,configFile:false,server:{...base.server,port:5192,strictPort:true},plugins:[...base.plugins,{
  name:'onboarding-fixture',enforce:'pre',
  load(id){const path=id.replaceAll('\\','/');
    if(path.endsWith('/v3/api.mjs'))return api;
    if(path.endsWith('/v3/auth-client.mjs'))return `export const initializeAuth=async()=>({mode:'supabase'});export const authMessage=e=>e.message;export const authClient=async()=>({auth:{verifyOtp:async()=>({}),getUser:async()=>({data:{user:{email:'fixture@example.com'}}}),updateUser:async()=>({}),signOut:async()=>({})}});`;
  },
  configureServer(server){server.middlewares.use((req,res,next)=>{if(req.url?.split('?')[0]!=='/index.html')return next();res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<h1>ホロスコープ（遷移確認）</h1><p id="saved"></p><script>document.querySelector("#saved").textContent=sessionStorage.getItem("onboarding-fixture-saved")?"出生データ保存済み":"既存プロフィールで遷移";</script>');});}
}]});await server.listen();console.log('http://127.0.0.1:5192/auth-callback.html');
