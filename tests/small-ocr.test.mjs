import {test} from 'node:test';
import assert from 'node:assert/strict';
import {positivePrice,parseSmallCover,findSmallPriceBadges,prepareSmallPriceBitmap,prepareSmallOldPriceBitmap,validateSmallPricePair,chooseSmallOldPrice,OCRnameFromTSV,SMALL_OCR_CLIENT} from '../lib/small-ocr.js';
import vm from 'node:vm';
test('OCR price parser rejects uncertain punctuation, percentages and multiple lines',()=>{
 for(const text of ['1 289 ₸','1289','1\u202f289тг'])assert.equal(positivePrice(text),1289);
 for(const text of ['-25%','1.289','1,289','1\n289','89 95','500001','49','foo295','2+1','995 -1497'])assert.equal(positivePrice(text),null);
});
test('catalogue cover must explicitly say Astana and provide valid dated range',()=>{
 assert.deepEqual(parseSmallCover('21.10–03.11.№21 SMALL FOOD Астана қ.','2026-10-21T11:51:43Z'),{city:'astana',start:'2026-10-21',end:'2026-11-03'});
 assert.deepEqual(parseSmallCover('Астана 21.10—03.11.2026','2026-10-21'),{city:'astana',start:'2026-10-21',end:'2026-11-03'});
 assert.deepEqual(parseSmallCover('Астана 25.12—05.01.2027','2026-12-20'),{city:'astana',start:'2026-12-25',end:'2027-01-05'});
 assert.deepEqual(parseSmallCover('Астана 25.12—05.01','2027-01-01'),{city:'astana',start:'2026-12-25',end:'2027-01-05'});
 for(const text of ['Алматы 21.10—03.11','Астана 31.02—03.03','Астана 03.11—21.10','Астана 01.01—30.11'])assert.equal(parseSmallCover(text,'2026-10-21'),null);
});
test('orange connected components isolate price badges from decorations and small price text',()=>{
 const width=953,height=1348,data=new Uint8ClampedArray(width*height*4);function box(x,y,w,h){for(let j=y;j<y+h;j++)for(let i=x;i<x+w;i++){let p=(j*width+i)*4;data.set([241,100,14,255],p);}}
 box(207,412,96,45);box(10,10,300,70);box(30,500,4,8);const badges=findSmallPriceBadges({data,width,height});assert.equal(badges.length,1);assert.equal(badges[0].x,207);assert.equal(badges[0].height,45);
});
test('price bitmap excludes the smaller currency symbol and previous-price capsule',()=>{
 const width=80,height=45,data=new Uint8ClampedArray(width*height*4);for(let p=0;p<data.length;p+=4)data.set([241,100,14,255],p);
 const white=(x,y,w,h)=>{for(let j=y;j<y+h;j++)for(let i=x;i<x+w;i++)data.set([255,255,255,255],(j*width+i)*4);};
 white(35,0,45,6);white(13,13,10,18);white(28,13,10,18);white(43,13,10,18);white(60,17,11,2);white(64,21,3,10);
 const bitmap=prepareSmallPriceBitmap({data,width,height},{x:0,y:0,width,height});assert.equal(bitmap.digits,3);assert.equal(bitmap.height,104);assert.equal(bitmap.width,192);
 assert.equal(prepareSmallPriceBitmap({data,width,height},{x:0,y:0,width:5,height}),null);
});
test('old-price extractor rejects an orange badge with no printed previous price',()=>{
 const width=100,height=100,data=new Uint8ClampedArray(width*height*4);data.fill(255);const rect=(x,y,w,h,color)=>{for(let j=y;j<y+h;j++)for(let i=x;i<x+w;i++)data.set(color,(j*width+i)*4);};const orange=[241,100,14,255],badge={x:20,y:55,width:60,height:30};
 rect(20,55,60,30,orange);assert.equal(prepareSmallOldPriceBitmap({data,width,height},badge),null);
 rect(49,44,32,17,[255,255,255,255]);for(let i=0;i<3;i++)rect(55+i*5,48,3,8,[219,125,61,255]);
 const bitmap=prepareSmallOldPriceBitmap({data,width,height},badge,'rgb');assert.ok(bitmap);assert.ok(bitmap.source.y<badge.y);assert.equal(prepareSmallOldPriceBitmap({data,width,height},badge,'unsupported'),null);
});
test('discounts require an actual higher previous price and sensible discount bounds',()=>{
 assert.deepEqual(validateSmallPricePair(1090,890),{priceBefore:1090,discount:18});assert.deepEqual(validateSmallPricePair(1602,1315),{priceBefore:1602,discount:18});
 for(const [before,price] of [[null,890],[890,890],[800,890],[100000,50],[500001,100]])assert.equal(validateSmallPricePair(before,price),null);
});
const reading=(value,confidence)=>({text:String(value??''),confidence});
test('old prices need agreement across colour variants and a strong pair of segmentation modes',()=>{
 const accepted={rgb:{7:reading(1090,95),13:reading(1090,95)},blue:{7:reading(1090,91),13:reading(1090,90)}};assert.deepEqual(chooseSmallOldPrice(accepted,890),{priceBefore:1090,discount:18});
 const cross={rgb:{7:reading(840,94),13:reading(840,88)},blue:{7:reading(540,62),13:reading(840,80)}};assert.deepEqual(chooseSmallOldPrice(cross,679),{priceBefore:840,discount:19});
 // Real failure: RGB alone confidently read 1669 instead of the printed 1569.
 const conflict={rgb:{7:reading(1669,86),13:reading(1669,86)},blue:{7:reading(1569,92),13:reading(1569,87)}};assert.equal(chooseSmallOldPrice(conflict,899),null);
 const highConflict={...cross,blue:{7:reading(540,91),13:reading(840,80)}};assert.equal(chooseSmallOldPrice(highConflict,679),null);
 const weak={rgb:{7:reading(1090,79),13:reading(1090,80)},blue:{7:reading(1090,84),13:reading(1090,80)}};assert.equal(chooseSmallOldPrice(weak,890),null);
 assert.equal(chooseSmallOldPrice(accepted,1200),null);
});
const row=(x,y,text,confidence=90)=>['5','1','1','1','1','1',x,y,Math.min(text.length*6,110),12,confidence,text].join('\t');
test('names combine brand, Russian product description and weight near the matching badge',()=>{
 const tsv=[row(108,335,'Jacobs'),row(108,359,'Кофе'),row(108,380,'95г'),row(108,396,'monarch'),row(510,340,'Другой товар'),row(108,350,'Қазақша')].join('\n');assert.equal(OCRnameFromTSV(tsv,{x:207,y:412,width:96,height:45},953,1348),'Jacobs Кофе 95г monarch');
 assert.equal(OCRnameFromTSV(row(108,359,'-25%'),{x:207,y:412,width:96,height:45},953,1348),null);
});
test('upper-page four-column names do not include products in the neighbouring column',()=>{
 const tsv=[row(508,335,'Ferrero'),row(508,359,'Конфеты'),row(686,335,'Dep'),row(686,359,'Батончик'),row(686,380,'50г')].join('\n');
 assert.equal(OCRnameFromTSV(tsv,{x:766,y:413,width:79,height:45},953,1348),'Dep Батончик 50г');
});
test('caller can explicitly extend the name region for a confirmed two-column row',()=>{
 const tsv=[row(507,363,'Яичница'),row(576,366,'на'),row(598,366,'гренках'),row(507,380,'200г')].join('\n');
 assert.equal(OCRnameFromTSV(tsv,{x:766,y:413,width:79,height:45},953,1348),null);
 assert.equal(OCRnameFromTSV(tsv,{x:766,y:413,width:79,height:45,nameLeft:476.5},953,1348),'Яичница на гренках 200г');
});
test('browser helper bundle is valid standalone JavaScript',()=>{new vm.Script(SMALL_OCR_CLIENT);});
