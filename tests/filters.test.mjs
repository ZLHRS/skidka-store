import {test} from 'node:test';
import assert from 'node:assert/strict';
import {matchesCategories,matchesChainStores,selectChain} from '../lib/filters.js';
import {STORES} from '../lib/parser.js';
import {smallCatalog} from '../lib/small.js';
test('категории объединяются по ИЛИ, пустой выбор означает все',()=>{
 const products=[{category:'sweets'},{category:'drinks'},{category:'dairy'}];
 assert.equal(products.filter(p=>matchesCategories(p,['sweets','drinks'])).length,2);
 assert.equal(products.filter(p=>matchesCategories(p,[])).length,3);
});
test('выбор сети не зависит от скрытых фильтров магазинов другой сети',()=>{
 const magnum={chain:'magnum',scope:'store',storeIds:[781605]},small={chain:'small',scope:'city',storeIds:[]};
 assert.equal(matchesChainStores(magnum,STORES,['small'],[]),false);
 assert.equal(matchesChainStores(small,STORES,['small'],[781605]),true);
 assert.equal(matchesChainStores(magnum,STORES,['magnum'],[781415]),false);
 assert.equal(matchesChainStores(small,STORES,['small'],['small-e36-9-1']),true);
 assert.deepEqual(small.storeIds,[]);
});
test('SMALL показывает датированный городской каталог и скрывает истёкший',()=>{
 const active=smallCatalog(new Date('2026-10-27T12:00:00Z'));
 assert.equal(active.products.length,60);assert.equal(active.metadata.scope,'city');
 for(const p of active.products){assert.deepEqual(p.storeIds,[]);assert.equal(p.scope,'city');assert.equal(p.chain,'small');assert.ok(p.price>0);if(p.priceBefore)assert.ok(p.priceBefore>p.price);}
 assert.equal(smallCatalog(new Date('2026-11-03T19:00:00Z')).products.length,0);
});
test('переключение сети заменяет предыдущую сеть, все сети сбрасывают выбор',()=>{
 assert.deepEqual(selectChain('small'),['small']);
 assert.deepEqual(selectChain('magnum'),['magnum']);
 assert.deepEqual(selectChain('all'),[]);
});
test('выбор только точек SMALL скрывает Magnum даже в режиме всех сетей',()=>{
 const magnum={chain:'magnum',storeIds:[781605]},small={chain:'small',scope:'city',storeIds:[]};
 assert.equal(matchesChainStores(magnum,STORES,[],['small-e36-9-1']),false);
 assert.equal(matchesChainStores(small,STORES,[],['small-e36-9-1']),true);
 assert.equal(matchesChainStores(magnum,STORES,['magnum'],['small-e36-9-1']),true);
 assert.equal(matchesChainStores(small,STORES,[],[781605]),false);
 assert.equal(matchesChainStores(magnum,STORES,[],[781605,'small-e36-9-1']),true);
 assert.equal(matchesChainStores(small,STORES,[],[781605,'small-e36-9-1']),true);
});
