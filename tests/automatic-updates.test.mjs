import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {startCatalogueScheduler,MAGNUM_INTERVAL,SMALL_INTERVAL} from '../lib/catalogue-scheduler.mjs';
import {readSmallOnServer} from '../lib/small-server-reader.mjs';
import {setSharedSmallState,chooseSmallSnapshot} from '../lib/small-service.js';
import {SMALL_SNAPSHOT} from '../data/small-snapshot.js';
import {CLIENT} from '../client.js';
import {HTML} from '../ui.js';

test('background jobs run without visitors, never overlap, retry failures and cancel on shutdown',async()=>{
 const timers=new Map();let id=0,finish,smallRuns=0;
 const stop=startCatalogueScheduler({setTimer:(fn,delay)=>{const key=++id;timers.set(key,{fn,delay});return key},clearTimer:key=>timers.delete(key),refreshMagnum:()=>new Promise(resolve=>finish=resolve),refreshSmall:async()=>{smallRuns++;throw Error('offline')},onError:()=>{}});
 async function fire(delay){const [key,t]=[...timers].find(([,t])=>t.delay===delay);timers.delete(key);t.fn();await new Promise(resolve=>setImmediate(resolve))}
 await fire(1000);assert.ok(![...timers.values()].some(t=>t.delay===MAGNUM_INTERVAL));finish();await new Promise(resolve=>setImmediate(resolve));assert.ok([...timers.values()].some(t=>t.delay===MAGNUM_INTERVAL));
 await fire(30000);assert.equal(smallRuns,1);assert.ok([...timers.values()].some(t=>t.delay===3600000));assert.equal(SMALL_INTERVAL,21600000);stop();assert.equal(timers.size,0);
});
test('server SMALL check persists without account or browser when no new issue exists',async()=>{
 let saved;await readSmallOnServer({seen:{},snapshot:null},{discover:async()=>({candidates:[]}),save:next=>saved=next,progress:()=>{},makeWorker:()=>{throw Error('OCR must not start without new pages')}});
 assert.ok(saved.checkedAt);assert.equal(saved.snapshot,null);
});
test('public SMALL update survives restore and keeps newer account catalogues isolated',()=>{
 const snapshot={...SMALL_SNAPSHOT,start:'2026-11-04',end:'2026-11-17',catalogKey:new URL(SMALL_SNAPSHOT.catalogUrl).pathname.replace('/small-union/',''),importedAt:'2026-11-04T00:00:00Z'};
 try{setSharedSmallState({seen:{},snapshot,checkedAt:snapshot.importedAt});assert.equal(chooseSmallSnapshot().start,snapshot.start);const privateSnapshot={...snapshot,start:'2026-11-18'};assert.equal(chooseSmallSnapshot({snapshot:privateSnapshot}),privateSnapshot);assert.equal(chooseSmallSnapshot().start,snapshot.start)}finally{setSharedSmallState({})}
 assert.doesNotMatch(HTML,/id="refresh"/);assert.doesNotMatch(CLIENT,/Обновить цены|small-reader\.js|\$\('refresh'\)/);new vm.Script(CLIENT.replace('/*FILTER_HELPERS*/',''));
});
