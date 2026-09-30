// Isolated, loopback-only UI fixture. No external authentication or email requests.
// Run: node tests/helpers/auth-ui-preview.mjs
import http from "node:http";
import fs from "node:fs";
const root = new URL("../../v3/", import.meta.url);
const mock = `
const scenario = new URLSearchParams(location.search).get('scenario');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const initializeAuth = async () => { await pause(1200); if(scenario === 'offline') throw Error('offline'); return {mode:'supabase'}; };
const response = async () => { await pause(700); return {error:scenario === 'error' ? {code:'invalid_credentials'} : null}; };
const authClient = async () => ({auth:{ signInWithPassword:response,signUp:response,resetPasswordForEmail:response,resend:response,signOut:response,getUser:async()=>({data:{user:{email:'preview@example.com'}}}) }});
const getJson = async () => scenario === 'member' ? {user_id:'preview'} : {};
const configureStorage = () => {};
const getStoredReadingForm = () => ({preview:true});
const finishMemberLogin = async () => {};
const initializeCaptcha = async container => { await pause(1000); container.hidden=false; container.textContent='認証欄（ローカル表示確認用）'; container.style.cssText='height:65px;border:1px solid #58606e;padding:16px;font-size:13px'; };
const captchaTokenForRequest = () => 'preview';
const resetCaptcha = () => {};
const authMessage = () => 'メールアドレスまたはパスワードが違います。';
const __APP_ENVIRONMENT__ = 'local';
`;
http.createServer((req,res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if(!['/login.html','/login.js','/auth.css'].includes(pathname)) {res.writeHead(404);res.end();return;}
  let body=fs.readFileSync(new URL(pathname.slice(1),root),'utf8');
  if(pathname.endsWith('.js')) body=mock+body.replace(/^import .*;\r?\n/gm,'');
  res.setHeader('Content-Type',pathname.endsWith('.js')?'text/javascript':pathname.endsWith('.css')?'text/css':'text/html');
  res.setHeader('Cache-Control','no-store');res.end(body);
}).listen(5189,'127.0.0.1',()=>console.log('Isolated auth UI: http://127.0.0.1:5189/login.html'));
