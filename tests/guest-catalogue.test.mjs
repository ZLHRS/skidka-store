import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
import {createMagnumCache,magnumCache} from '../lib/magnum-cache.js';
import {SNAPSHOT} from '../data/snapshot.js';
import {SMALL_SNAPSHOT} from '../data/small-snapshot.js';
import {localDB} from '../lib/local-db.mjs';
import {HTML} from '../ui.js';

test('cold catalogue immediately returns a dated snapshot while one upstream refresh is pending',async()=>{
 const now=Date.parse(SNAPSHOT.fetchedAt)+3600000;let resolveLoad,calls=0;
 const cache=createMagnumCache({clock:()=>now,load:()=>{calls++;return new Promise(resolve=>resolveLoad=resolve)}});
 const first=cache.read('astana');assert.equal(first.refreshing,true);assert.ok(Array.isArray(first.products));assert.equal(typeof first.then,'undefined');
 const second=cache.read('astana');assert.equal(second.fetchedAt,first.fetchedAt);
 await Promise.resolve();assert.equal(calls,1);
 const pending=cache.refresh('astana');resolveLoad({...SNAPSHOT,cityId:'astana',fetchedAt:new Date(now).toISOString()});await pending;
 assert.equal(cache.read('astana').stale,false);assert.equal(cache.read('astana').refreshing,false);
});
test('failed refresh retains the cache, filters expired offers and backs off retries',async()=>{
 const now=Date.parse('2026-11-05T12:00:00Z');let calls=0;
 const cache=createMagnumCache({clock:()=>now,load:async(city,signal)=>{calls++;assert.ok(signal instanceof AbortSignal);throw Error('network unavailable')}});
 await cache.refresh('astana');assert.equal(cache.read('astana').stale,true);assert.equal(cache.read('astana').products.length,0);
 await cache.refresh('astana',true);assert.equal(calls,1);
 assert.equal(cache.restore('astana',{...SNAPSHOT,cityId:'petropavlovsk'}),false);
});
test('guest catalogue is small, photos load separately, private state and writes still require an account',async()=>{
 const db=localDB();magnumCache.restore('astana',{...SNAPSHOT,cityId:'astana',fetchedAt:new Date().toISOString()});
 const call=(path,{cookie='',method='GET',body}={})=>worker.fetch(new Request('https://example.test'+path,{method,headers:{Cookie:cookie,Origin:'https://example.test',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})}),{DB:db});
 try{
  const response=await call('/api/deals');assert.equal(response.status,200);const text=await response.text(),guest=JSON.parse(text);
  assert.ok(text.length<150000);assert.doesNotMatch(text,/data:image/);assert.ok(guest.products.length>0);
  const original=SMALL_SNAPSHOT.products[0],photo='/api/small-image?id='+encodeURIComponent(original.id)+'&v='+encodeURIComponent(SMALL_SNAPSHOT.importedAt);
  const image=await call(photo);assert.equal(image.status,200);assert.match(image.headers.get('content-type'),/^image\//);assert.ok((await image.arrayBuffer()).byteLength>100);assert.equal(image.headers.get('vary'),'Cookie');
  for(const path of ['/api/profile','/api/small/discover'])assert.equal((await call(path)).status,401);
  for(const path of ['/api/preferences','/api/favorites','/api/small/state'])assert.equal((await call(path,{method:'PUT',body:{}})).status,401);
  const registration=await call('/api/auth/register',{method:'POST',body:{username:'guest_test',password:'temporary-test-password'}}),cookie=registration.headers.get('set-cookie').split(';')[0];
  const account=await db.prepare('SELECT id FROM accounts WHERE username=?').bind('guest_test').first(),privateProduct={...original,id:'small-private-test-1',name:'ACCOUNT ONLY SAMPLE'},snapshot={...SMALL_SNAPSHOT,importedAt:'2026-10-28T12:00:00Z',products:[privateProduct]};
  await db.prepare('INSERT INTO user_catalogs(user_id,value) VALUES(?,?)').bind(account.id,JSON.stringify({snapshot})).run();
  assert.ok((await(await call('/api/deals',{cookie})).json()).products.some(p=>p.name==='ACCOUNT ONLY SAMPLE'));
  assert.ok(!(await(await call('/api/deals')).json()).products.some(p=>p.name==='ACCOUNT ONLY SAMPLE'));
  assert.equal((await call('/api/small-image?id=small-private-test-1&v='+encodeURIComponent(snapshot.importedAt))).status,404);
  assert.equal((await call('/api/small-image?id=small-private-test-1&v='+encodeURIComponent(snapshot.importedAt),{cookie})).status,200);
  assert.match(HTML,/id="auth" hidden/);assert.match(HTML,/id="app"><header/);assert.match(HTML,/id="guestBrowse"/);
 }finally{db.close()}
});
