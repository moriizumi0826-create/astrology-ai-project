import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const script=readFileSync(new URL('../v3/auth-callback.js',import.meta.url),'utf8')
  .replace(/^import .*;\r?\n/gm,'')
  .replace('import("./account-birth-editor.jsx")','loadEditor()');
async function setup({saved=false,recovery=false,invalid=false,profileError=false}={}) {
  const elements=new Map();
  const el=s=>{if(!elements.has(s))elements.set(s,{hidden:true,textContent:'',value:'new-password-123',handlers:{},addEventListener(k,v){this.handlers[k]=v;}});return elements.get(s);};
  const calls=[];let editor;
  const auth={verifyOtp:async()=>({error:invalid?Error('invalid'):null}),updateUser:async()=>{calls.push('password');return{};},signOut:async()=>{calls.push('signOut');return{};}};
  vm.runInNewContext(script,{document:{querySelector:el},URLSearchParams,
    location:{search:recovery?'?token_hash=test&type=recovery':'?token_hash=test&type=email',hash:'',pathname:'/auth-callback.html',replace:url=>calls.push(url)},history:{replaceState(){}},
    authClient:async()=>({auth}),authMessage:error=>error.message,getJson:async()=>({user_id:'supabase:test'}),configureStorage(){},getStoredReadingForm:()=>saved?{birth_date:'2000-01-01'}:null,
    finishMemberLogin:async(form,transfer)=>{assert.equal(form,null);assert.equal(transfer,false);if(profileError)throw Error('profile offline');calls.push('hydrate');},
    loadEditor:async()=>({mountBirthEditor:async(container,options)=>{editor=options;calls.push('editor');}}),
  });
  await new Promise(resolve=>setImmediate(resolve));
  return {el,calls,editor,submit:()=>el('#callback-form').handlers.submit({preventDefault(){}})};
}
test('verified member without profile enters explicit birth registration, never imports device data',async()=>{
  const ui=await setup();assert.equal(ui.editor.purpose,'onboarding');
  assert.equal(ui.el('#profile-editor').hidden,false);assert.equal(ui.el('#callback-form').hidden,true);
  ui.editor.onSaved();assert.equal(ui.calls.at(-1),'/index.html#horoscope');
});
test('saved profile bypasses registration and proceeds to horoscope',async()=>{
  const ui=await setup({saved:true});assert.equal(ui.editor,undefined);assert.equal(ui.el('#callback-form').hidden,false);
  await ui.submit();assert.equal(ui.calls.at(-1),'/index.html#horoscope');
});
test('invalid confirmation and failed profile reads do not show a registration form',async()=>{
  for(const options of [{invalid:true},{profileError:true}]){const ui=await setup(options);assert.equal(ui.editor,undefined);assert.equal(ui.el('#error').hidden,false);assert.equal(ui.el('#callback-form').hidden,true);}
});
test('password recovery keeps password flow, without birth registration',async()=>{
  const ui=await setup({recovery:true});assert.equal(ui.editor,undefined);assert.equal(ui.el('#password-row').hidden,false);
  await ui.submit();assert.deepEqual(ui.calls,['password','signOut','/login.html']);
});
test('normal login and confirmation pages have no device transfer checkbox',()=>{
  for(const page of ['login.html','auth-callback.html'])assert.doesNotMatch(readFileSync(new URL('../v3/'+page,import.meta.url),'utf8'),/id="transfer/);
});
