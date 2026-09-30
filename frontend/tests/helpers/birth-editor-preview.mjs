// Isolated UI fixture; real source modules, fake account/API, no external requests.
import { createServer } from "vite";
import config from "../../vite.v3.config.mjs";
const api = `
let saved={profile:{full_name:'確認用ユーザー',birth_date:'1990-01-01',birth_time:'12:00',birthplace:'Tokyo, Japan',birth_country:'JP',birth_prefecture:'Tokyo',latitude:35.68,longitude:139.76,timezone_name:'Asia/Tokyo',birth_time_unknown:false},revision:1};
export const getJson=async path=>path.includes('/session')?{user_id:'supabase:fixture',state:'free'}:path.includes('/profile')?{saved}:{};
export const postJson=async()=>({});
export const putJson=async(path,body)=>{if(body.expected_revision!==saved?.revision)throw Error('更新競合');saved={profile:body.profile,revision:(saved?.revision||0)+1};return {saved};};
export const deleteJson=async()=>{saved=null;return {deleted:true};};
export const searchBirthLocations=async()=>({results:[{display_name:'Paris, France',latitude:48.85,longitude:2.35,timezone_name:'Europe/Paris'}]});
`;
const auth = `export const initializeAuth=async()=>({mode:'supabase'});export const isMemberMode=()=>true;export const authClient=async()=>({auth:{getUser:async()=>({data:{user:{email:'fixture@example.com'}}}),signOut:async()=>({}),signInWithPassword:async()=>({})}});export const authMessage=()=> '確認用エラー';`;
const server = await createServer({ ...config({mode:'development'}), configFile:false,
  server:{host:'127.0.0.1',port:5188,strictPort:true},
  plugins:[{name:'isolated-birth-editor',enforce:'pre',load(id){
    const path=id.replaceAll('\\','/');
    if(path.endsWith('/v3/api.mjs'))return api;
    if(path.endsWith('/v3/auth-client.mjs'))return auth;
  }}],
});
await server.listen();console.log('Birth editor fixture: http://127.0.0.1:5188/account.html');
