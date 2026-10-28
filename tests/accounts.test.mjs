import {test} from 'node:test';
import assert from 'node:assert/strict';
import {localDB} from '../lib/local-db.mjs';
import {accountRoute,getAccount,favoriteKey} from '../lib/accounts.js';
const origin='https://example.test',product={id:123,name:'Молоко 1 л',image:'https://magnum.kz:1337/uploads/1234567890123_abcd.jpg',url:'https://magnum.kz/products/123',storeIds:[781605]};
function request(path,method='GET',body,cookie='',originValue=origin){return new Request(origin+path,{method,headers:{...(body===undefined?{}:{'Content-Type':'application/json',Origin:originValue}),Cookie:cookie,'CF-Connecting-IP':'127.0.0.1'},...(body===undefined?{}:{body:JSON.stringify(body)})})}
async function call(db,path,method='GET',body,cookie='',originValue){return accountRoute(request(path,method,body,cookie,originValue),{DB:db},async()=>({products:[product]}))}
test('аккаунты, сессии, избранное и фильтры изолированы между пользователями',async()=>{
 const db=localDB();
 try{
  const registration=await call(db,'/api/auth/register','POST',{username:'ALICE',password:'temporary-test-password'});assert.equal(registration.status,200);const cookie=registration.headers.get('set-cookie').split(';')[0];assert.match(registration.headers.get('set-cookie'),/HttpOnly; SameSite=Lax/);assert.match(registration.headers.get('set-cookie'),/Secure/);assert.equal((await registration.json()).user.username,'alice');
  const stored=await db.prepare('SELECT password_hash,salt FROM accounts WHERE username=?').bind('alice').first();assert.notEqual(stored.password_hash,'temporary-test-password');assert.equal(stored.password_hash.length,64);assert.equal(stored.salt.length,32);
  const prefs=await call(db,'/api/preferences','PUT',{stores:[781605,123,781605],search:'чай',sort:'price',category:'sweets',favoritesOnlySale:false,userId:'other'},cookie);assert.equal(prefs.status,200);assert.deepEqual((await prefs.json()).preferences.stores,[781605]);
  assert.equal((await call(db,'/api/favorites','PUT',{productId:123,name:'Injected'},cookie)).status,200);
  const alice=await(await call(db,'/api/profile','GET',undefined,cookie)).json();assert.equal(alice.preferences.search,'чай');assert.equal(alice.preferences.category,'sweets');assert.equal(alice.favorites.length,1);assert.equal(alice.favorites[0].name,product.name);assert.deepEqual(alice.preferences.categories,['sweets']);await call(db,'/api/preferences','PUT',{city:'petropavlovsk',categories:['sweets','drinks','fake','sweets'],chains:['small','magnum','unknown'],stores:['small-e36-9-1',781605],sort:'price'},cookie);const multi=await(await call(db,'/api/profile','GET',undefined,cookie)).json();assert.equal(multi.preferences.city,'petropavlovsk');assert.deepEqual(multi.preferences.categories,['sweets','drinks']);assert.deepEqual(multi.preferences.chains,['small','magnum']);assert.deepEqual(multi.preferences.stores,['small-e36-9-1',781605]);
  const bobResponse=await call(db,'/api/auth/register','POST',{username:'bob',password:'another-test-password'});const bobCookie=bobResponse.headers.get('set-cookie').split(';')[0];const bob=await bobResponse.json();assert.equal(bob.favorites.length,0);assert.deepEqual(bob.preferences.stores,[]);
  await call(db,'/api/favorites','DELETE',{key:favoriteKey(product)},bobCookie);assert.equal((await(await call(db,'/api/profile','GET',undefined,cookie)).json()).favorites.length,1);
  assert.equal((await call(db,'/api/preferences','PUT',{stores:[]},cookie,'https://evil.test')).status,403);
  assert.equal((await call(db,'/api/auth/login','POST',{username:'alice',password:'incorrect-test-password'})).status,401);
  const login=await call(db,'/api/auth/login','POST',{username:'alice',password:'temporary-test-password'});assert.equal(login.status,200);const logged=await login.json();assert.equal(logged.favorites.length,1);assert.equal(logged.preferences.sort,'price');
  await call(db,'/api/auth/logout','POST',{},cookie);assert.equal(await getAccount(request('/api/profile','GET',undefined,cookie),db),null);assert.equal((await call(db,'/api/profile','GET',undefined,cookie)).status,401);
 }finally{db.close()}
});
test('избранное узнаёт товар при смене идентификатора акции',()=>{
 assert.equal(favoriteKey(product),favoriteKey({...product,id:9999,image:'https://magnum.kz:1337/uploads/1234567890123_other-photo.jpg'}));
 assert.equal(favoriteKey({name:'  МОЛОКО   1 Л',image:null}),favoriteKey({name:'молоко 1 л',image:null}));
});
test('неавторизованные запросы и неверные данные отклоняются',async()=>{const db=localDB();try{
 assert.equal((await call(db,'/api/profile')).status,401);assert.equal((await call(db,'/api/favorites','PUT',{productId:123})).status,401);
 assert.equal((await call(db,'/api/auth/register','POST',{username:'ab',password:'short'})).status,400);
 assert.equal((await call(db,'/api/auth/register','POST',{username:'safe',password:'valid-test-password'})).status,200);
 assert.equal((await call(db,'/api/auth/register','POST',{username:'SAFE',password:'valid-test-password'})).status,409);
 }finally{db.close()}});
