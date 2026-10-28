import {test} from 'node:test';
import assert from 'node:assert/strict';
import {categoryForProduct} from '../lib/categories.js';
test('простые категории различают еду, вкусовые добавки и бытовые товары',()=>{
 for(const [name,expected] of [
 ['ШОКОЛАД «РАХАТ» МОЛОЧНЫЙ','sweets'],['ПАСТА «MILKA» ОРЕХОВАЯ С КАКАО','sweets'],
 ['МЫЛО С МОЛОЧНЫМИ ПРОТЕИНАМИ','home'],['КОРМ ДЛЯ КОШЕК С ГОВЯДИНОЙ','home'],
 ['МОЛОКО «LACTEL»','dairy'],['КОКТЕЙЛЬ МОЛОЧНЫЙ','dairy'],
 ['КОФЕ С КАРАМЕЛЬЮ','drinks'],['НАПИТОК ШОКОЛАДНЫЙ','drinks'],
 ['ФИЛЕ ЦЫПЛЕНКА','meat'],['ПЕЧЕНЬ ГОВЯЖЬЯ','meat'],
 ['ЛАПША СО ВКУСОМ ГОВЯДИНЫ','food'],['ЗАВТРАК ШОКОЛАДНЫЙ','food'],['БАНАН КГ','food']
 ])assert.equal(categoryForProduct({name}),expected,name);
});

 test('замороженная пицца не попадает в сладости',()=>assert.equal(categoryForProduct({name:'ЗАМОРОЖЕННАЯ МЯСНАЯ ПИЦЦА 600 Г'}),'food'));
