import test from 'node:test';
import assert from 'node:assert/strict';
import {hasUnreadContent, markContentRead, updateHistory, announcements} from '../v3/update-content.mjs';

function memoryStorage() {
  const values = new Map();
  return {getItem:key=>values.get(key) ?? null, setItem:(key,value)=>values.set(key,value)};
}

test('history is unread initially, empty announcements are not',()=>{
  const storage=memoryStorage();
  assert.equal(hasUnreadContent('history',updateHistory,storage),true);
  assert.equal(hasUnreadContent('news',announcements,storage),false);
});
test('opening one category does not mark the other read; persists across checks',()=>{
  const storage=memoryStorage();
  const news=[{date:'2026-10-04',title:'お知らせ',body:'本文'}];
  markContentRead('history',updateHistory,storage);
  assert.equal(hasUnreadContent('history',updateHistory,storage),false);
  assert.equal(hasUnreadContent('news',news,storage),true);
  markContentRead('news',news,storage);
  assert.equal(hasUnreadContent('news',news,storage),false);
});
test('new and revised entries become unread without relying on build version',()=>{
  const storage=memoryStorage();
  markContentRead('history',updateHistory,storage);
  assert.equal(hasUnreadContent('history',[{date:'2026-10-05',title:'追加',body:'本文'},...updateHistory],storage),true);
  assert.equal(hasUnreadContent('history',updateHistory.map((e,i)=>i===0?{...e,body:'修正本文'}:e),storage),true);
  assert.equal(hasUnreadContent('history',updateHistory.slice(1),storage),false);
});
test('invalid or unavailable browser storage does not break menu',()=>{
  const broken={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}};
  assert.equal(hasUnreadContent('history',updateHistory,broken),true);
  assert.doesNotThrow(()=>markContentRead('history',updateHistory,broken));
  assert.equal(hasUnreadContent('history',updateHistory,{getItem:()=>'{invalid'}),true);
});
