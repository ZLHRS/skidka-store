import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalize,currentSnapshot,scrape,localDate} from '../lib/parser.js';
const now=new Date('2026-10-27T20:00:00Z');
function item(id,overrides={}){return {id,attributes:{name:'Товар',locale:'ru',start_price:1000,final_price:700,action_start:'2026-10-22',action_end:'2026-10-28',shops:{data:[{id:781605},{id:781415},{id:999}]},image:{data:[{attributes:{url:'/uploads/photo.jpg'}}]},...overrides}}}
test('сохраняет только действующие реальные скидки выбранных точек',()=>{
 const raw=[item(1),item(2,{action_end:'2026-10-27'}),item(3,{action_start:'2026-10-29'}),item(4,{final_price:1000}),item(5,{final_price:0,bonuses:100}),item(6,{shops:{data:[{id:999}]}}),item(7,{locale:'kk'}),item(8),item(1)];
 const result=normalize(raw.filter(p=>p.id!==8),raw,now);
 assert.equal(result.products.length,1);assert.deepEqual(result.products[0].storeIds,[781605,781415]);assert.equal(result.products[0].discount,30);assert.equal(result.products[0].image,'https://magnum.kz:1337/uploads/photo.jpg');
});
test('дата и граница окончания учитывают часовой пояс Казахстана',()=>{
 assert.equal(localDate(now),'2026-10-28');
 const p=item(1),data=normalize([p],[p],now);assert.equal(data.products.length,1);
 assert.equal(currentSnapshot(data,new Date('2026-10-28T19:00:00Z')).products.length,0);
});
test('неполная привязка не превращается в скидку во всех точках',()=>{
 assert.throws(()=>normalize([{id:1}],[item(1,{shops:null})],now),/привязку/);
});
test('обходит пагинацию и проверяет полноту каталога',async()=>{
 const calls=[];const fake=async url=>{calls.push(url);return Response.json(url.includes('new-product?')?[{id:1},{id:2}]:url.includes('pagination%5Bpage%5D=2')?{data:[item(2)]}:{data:[item(1)],meta:{pagination:{pageCount:2}}})};
 const result=await scrape(fake,now);assert.equal(result.products.length,2);assert.equal(calls.length,3);
 await assert.rejects(()=>scrape(async url=>Response.json(url.includes('new-product?')?[{id:999}]:{data:[item(1)]}),now),/Неполная привязка/);
});
