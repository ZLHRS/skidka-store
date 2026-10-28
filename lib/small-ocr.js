// Conservative browser-compatible extraction helpers. Uncertain fields return null.
export function positivePrice(text){
 const clean=String(text||'').normalize('NFKC').replace(/[\u00a0\u202f]/g,' ').trim().replace(/\s*(?:₸|тг\.?|tg|kzt|т|t)\s*$/iu,'').trim();
 if(!/^(?:\d{2,6}|\d{1,3}(?: +\d{3}))$/.test(clean))return null;
 const value=Number(clean.replace(/ /g,''));return Number.isSafeInteger(value)&&value>=50&&value<=500000?value:null;
}
function smallValidDate(day,month,year){
 const d=new Date(Date.UTC(year,month-1,day));return d.getUTCFullYear()===year&&d.getUTCMonth()===month-1&&d.getUTCDate()===day?d.toISOString().slice(0,10):null;
}
export function parseSmallCover(text,modifiedAt){
 const clean=String(text||'').normalize('NFKC').toLowerCase().replace(/[\u2010-\u2015−]/g,'-');
 if(!/(?:^|[^а-яёa-z])астан[аa](?:[^а-яёa-z]|$)/u.test(clean))return null;
 const match=clean.match(/(\d{1,2})\s*[./]\s*(\d{1,2})(?:\s*[./]\s*(20\d{2}))?\s*-\s*(\d{1,2})\s*[./]\s*(\d{1,2})(?:\s*[./]\s*(20\d{2}))?/);
 const uploaded=new Date(modifiedAt);if(!match||!Number.isFinite(uploaded.valueOf()))return null;
 const startDay=+match[1],startMonth=+match[2],endDay=+match[4],endMonth=+match[5],cross=startMonth>endMonth;
 let startYear=match[3]?+match[3]:null,endYear=match[6]?+match[6]:null;
 if(startYear&& !endYear)endYear=startYear+(cross?1:0);
 if(endYear&& !startYear)startYear=endYear-(cross?1:0);
 if(!startYear&&!endYear){startYear=uploaded.getUTCFullYear()-(cross&&uploaded.getUTCMonth()+1<=endMonth?1:0);if(!cross&&uploaded.getUTCMonth()===11&&startMonth===1)startYear++;endYear=startYear+(cross?1:0);}
 const start=smallValidDate(startDay,startMonth,startYear),end=smallValidDate(endDay,endMonth,endYear);if(!start||!end)return null;
 const duration=(Date.parse(end)-Date.parse(start))/86400000;if(duration<0||duration>62||Math.abs(startYear-uploaded.getUTCFullYear())>1)return null;
 return {city:'astana',start,end};
}
export function findSmallPriceBadges(image){
 const {data,width:w,height:h}=image||{};if(!data||!Number.isInteger(w)||!Number.isInteger(h)||w<100||h<100||w*h>16000000||data.length!==w*h*4)return [];
 const mask=new Uint8Array(w*h),stack=new Int32Array(w*h),result=[];
 for(let i=0,p=0;i<mask.length;i++,p+=4)mask[i]=data[p]>210&&data[p+1]>=70&&data[p+1]<=180&&data[p+2]<90&&data[p+3]>=200?1:0;
 for(let index=0;index<mask.length;index++){
  if(!mask[index])continue;let count=0,minX=w,maxX=0,minY=h,maxY=0,head=0,tail=1;stack[0]=index;mask[index]=0;
  while(head<tail){const p=stack[head++],x=p%w,y=(p-x)/w;count++;if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;
   if(x&&mask[p-1]){mask[p-1]=0;stack[tail++]=p-1;}if(x<w-1&&mask[p+1]){mask[p+1]=0;stack[tail++]=p+1;}
   if(y&&mask[p-w]){mask[p-w]=0;stack[tail++]=p-w;}if(y<h-1&&mask[p+w]){mask[p+w]=0;stack[tail++]=p+w;}
  }
  const width=maxX-minX+1,height=maxY-minY+1,fill=count/(width*height),ratio=width/height;
  if(width>=w*.04&&width<=w*.24&&height>=h*.01&&height<=h*.07&&ratio>=1.25&&ratio<=6.5&&fill>=.46)result.push({x:minX,y:minY,width,height,pixels:count,fill});
 }
 return result.sort((a,b)=>a.y-b.y||a.x-b.x);
}
export function prepareSmallPriceBitmap(image,badge){
 const {data,width:iw,height:ih}=image||{};if(!data||!badge||data.length!==iw*ih*4)return null;
 const x0=Math.max(0,Math.round(badge.x)),y0=Math.max(0,Math.round(badge.y)),w=Math.min(iw-x0,Math.round(badge.width)),h=Math.min(ih-y0,Math.round(badge.height));if(w<8||h<8)return null;
 const mask=new Uint8Array(w*h),stack=new Int32Array(w*h),glyphs=[];
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const p=((y+y0)*iw+x+x0)*4;mask[y*w+x]=data[p]>210&&data[p+1]>210&&data[p+2]>195?1:0;}
 for(let i=0;i<mask.length;i++){
  if(!mask[i])continue;let head=0,tail=1,minX=w,minY=h,maxX=0,maxY=0;stack[0]=i;mask[i]=0;const pixels=[];
  while(head<tail){const p=stack[head++],x=p%w,y=(p-x)/w;pixels.push(p);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
   if(x&&mask[p-1]){mask[p-1]=0;stack[tail++]=p-1;}if(x<w-1&&mask[p+1]){mask[p+1]=0;stack[tail++]=p+1;}if(y&&mask[p-w]){mask[p-w]=0;stack[tail++]=p-w;}if(y<h-1&&mask[p+w]){mask[p+w]=0;stack[tail++]=p+w;}
  }
  const gw=maxX-minX+1,gh=maxY-minY+1;
  // Digits are taller than the small ₸ glyph. The old-price white capsule
  // touches the top of the badge and is excluded independently of OCR.
  if(minY>=h*.15&&maxY<h*.85&&gh>=h*.30&&gh<=h*.75&&gw>=2&&gw<=h*.9&&pixels.length>=gh*1.1)glyphs.push({minX,minY,maxX,maxY,pixels});
 }
 glyphs.sort((a,b)=>a.minX-b.minX);if(glyphs.length<2||glyphs.length>6||glyphs.some((g,i)=>i&&g.minX-glyphs[i-1].maxX>h*.8))return null;
 const left=Math.min(...glyphs.map(g=>g.minX)),top=Math.min(...glyphs.map(g=>g.minY)),right=Math.max(...glyphs.map(g=>g.maxX)),bottom=Math.max(...glyphs.map(g=>g.maxY)),scale=4,pad=16,width=(right-left+1)*scale+pad*2,height=(bottom-top+1)*scale+pad*2,output=new Uint8ClampedArray(width*height*4);output.fill(255);
 for(const glyph of glyphs)for(const p of glyph.pixels){const x=p%w,y=(p-x)/w;for(let dy=0;dy<scale;dy++)for(let dx=0;dx<scale;dx++){const at=((pad+(y-top)*scale+dy)*width+pad+(x-left)*scale+dx)*4;output[at]=output[at+1]=output[at+2]=0;}}
 return {data:output,width,height,digits:glyphs.length};
}
export function validateSmallPricePair(priceBefore,price){
 const before=positivePrice(priceBefore),current=positivePrice(price);if(!before||!current||before<=current)return null;
 const discount=Math.round((before-current)/before*100);return discount>=1&&discount<=95?{priceBefore:before,discount}:null;
}
export function chooseSmallOldPrice(readings,price){
 const rgb=readings?.rgb,blue=readings?.blue,four=['rgb','blue'].flatMap(variant=>['7','13'].map(mode=>readings?.[variant]?.[mode]));
 if(four.some(r=>!r||!Number.isFinite(r.confidence)))return null;
 const raw=positivePrice(rgb['13'].text??rgb['13'].value),contrast=positivePrice(blue['13'].text??blue['13'].value);if(!raw||raw!==contrast||rgb['13'].confidence<75||blue['13'].confidence<75)return null;
 const strong=[rgb,blue].some(variant=>variant['7'].confidence>=85&&variant['13'].confidence>=85&&positivePrice(variant['7'].text??variant['7'].value)===raw);if(!strong)return null;
 if(four.some(r=>r.confidence>=85&&positivePrice(r.text??r.value)&&positivePrice(r.text??r.value)!==raw))return null;
 return validateSmallPricePair(raw,price);
}
function smallCubicWeight(value){const x=Math.abs(value);return x<=1?(1.5*x-2.5)*x*x+1:x<2?((-.5*x+2.5)*x-4)*x+2:0;}
function smallOldScale(raw,rw,rh){
 const scale=5,pad=20,width=rw*scale+pad*2,height=rh*scale+pad*2,out=new Uint8ClampedArray(width*height*4);out.fill(255);
 const xs=Array.from({length:rw*scale},(_,x)=>{const at=(x+.5)/scale-.5,base=Math.floor(at);return Array.from({length:4},(_,i)=>({pos:Math.max(0,Math.min(rw-1,base+i-1)),weight:smallCubicWeight(at-(base+i-1))}));});
 const ys=Array.from({length:rh*scale},(_,y)=>{const at=(y+.5)/scale-.5,base=Math.floor(at);return Array.from({length:4},(_,i)=>({pos:Math.max(0,Math.min(rh-1,base+i-1)),weight:smallCubicWeight(at-(base+i-1))}));});
 for(let y=0;y<rh*scale;y++)for(let x=0;x<rw*scale;x++){const to=((y+pad)*width+x+pad)*4;for(let channel=0;channel<3;channel++){let total=0;for(const sy of ys[y])for(const sx of xs[x])total+=raw[(sy.pos*rw+sx.pos)*4+channel]*sy.weight*sx.weight;out[to+channel]=Math.round(Math.max(0,Math.min(255,total)));}}
 return {data:out,width,height};
}
export function prepareSmallOldPriceBitmap(image,badge,variant='rgb'){
 const {data,width:iw,height:ih}=image||{};if(!data||!badge||data.length!==iw*ih*4||![badge.x,badge.y,badge.width,badge.height].every(Number.isFinite))return null;
 // The old price is orange text inside a white capsule immediately above the
 // right side of the current-price badge. An orange badge alone is rejected.
 const x0=Math.max(0,Math.floor(badge.x+badge.width*.22)),y0=Math.max(0,Math.floor(badge.y-badge.height*.5)),w=Math.min(iw-x0,Math.ceil(badge.x+badge.width+4)-x0),h=Math.min(ih-y0,Math.ceil(badge.y+badge.height*.15)-y0);if(w<8||h<8)return null;
 const mask=new Uint8Array(w*h),stack=new Int32Array(w*h),parts=[];
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const p=((y+y0)*iw+x+x0)*4,r=data[p],g=data[p+1],b=data[p+2];mask[y*w+x]=r>175&&r-g>45&&g-b>20&&g<210?1:0;}
 for(let i=0;i<mask.length;i++){
  if(!mask[i])continue;let head=0,tail=1,minX=w,minY=h,maxX=0,maxY=0,count=0;stack[0]=i;mask[i]=0;
  while(head<tail){const p=stack[head++],x=p%w,y=(p-x)/w;count++;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
   if(x&&mask[p-1]){mask[p-1]=0;stack[tail++]=p-1;}if(x<w-1&&mask[p+1]){mask[p+1]=0;stack[tail++]=p+1;}if(y&&mask[p-w]){mask[p-w]=0;stack[tail++]=p-w;}if(y<h-1&&mask[p+w]){mask[p+w]=0;stack[tail++]=p+w;}
  }
  const height=maxY-minY+1;if(minX>0&&maxX<w-1&&minY>0&&maxY<h-1&&height>=badge.height*.12&&height<=badge.height*.4&&count>=8)parts.push({minX,minY,maxX,maxY});
 }
 if(!parts.length)return null;const left=Math.min(...parts.map(p=>p.minX)),top=Math.min(...parts.map(p=>p.minY)),right=Math.max(...parts.map(p=>p.maxX)),bottom=Math.max(...parts.map(p=>p.maxY));
 const rw=right-left+1,rh=bottom-top+1;if(rw<badge.width*.16||rw>badge.width*.85||rh>badge.height*.42)return null;
 if(!['rgb','blue'].includes(variant))return null;const raw=new Uint8ClampedArray(rw*rh*4);
 // Keep one unmodified RGB reading and one blue-channel contrast reading.
 // Cross-variant consensus is checked by chooseSmallOldPrice. Erasing a strike
 // line can turn a 5 into a plausible 6, so no reconstructed digits are used.
 for(let y=0;y<rh;y++)for(let x=0;x<rw;x++){const p=((y0+top+y)*iw+x0+left+x)*4,to=(y*rw+x)*4,r=data[p],g=data[p+1],b=data[p+2],v=r>175?Math.max(0,Math.min(255,(b-65)*4)):255;
  raw[to]=variant==='rgb'?r:v;raw[to+1]=variant==='rgb'?g:v;raw[to+2]=variant==='rgb'?b:v;raw[to+3]=255;
 }
 return {...smallOldScale(raw,rw,rh),source:{x:x0+left,y:y0+top,width:rw,height:rh}};
}
function smallTSVWords(tsv){
 return String(tsv||'').split(/\r?\n/).map(line=>line.split('\t')).filter(c=>c.length>=12&&c[0]==='5'&&Number(c[10])>=30).map(c=>({x:+c[6],y:+c[7],width:+c[8],height:+c[9],confidence:+c[10],text:c.slice(11).join('\t').trim()})).filter(w=>w.text&&[w.x,w.y,w.width,w.height].every(Number.isFinite));
}
function smallRussianLine(text){
 let value=String(text).replace(/[|]/g,' | ').replace(/\s+/g,' ').trim();
 if(value.includes(' | ')){const parts=value.split(' | ');value=parts.at(-1).trim();}
 // Distinct Kazakh letters identify the bilingual line above the Russian name.
 if(/[әғқңөұүһі]/iu.test(value)||/(?:^|\s)(?:сут|сусын|кургак|тангы|таңғы|шай|iшетiн|ішетін|уыздык)(?:\s|$)/iu.test(value))return '';
 if(/(?:%|₸|тг|^[-−–]\s*\d|^\d{3,6}$)/iu.test(value)||/^(?:и|с|со)\s+/iu.test(value))return '';
 return value.replace(/^[•©®*.,:;\-–—\s]+/,'').replace(/[|+]/g,' ').replace(/\b[a-z]{1,2}\b/gi,' ').replace(/(\d+)r\b/gi,'$1г').trim();
}
export function OCRnameFromTSV(tsv,badge,w,h){
 if(!badge||!w||!h)return null;const scale=w/953,x=badge.x??badge.x0,y=badge.y??badge.y0,bw=badge.width??(badge.x1-badge.x0);if(![x,y,bw].every(Number.isFinite))return null;
 // The upper part of a page can still contain four product columns. A wider
 // name region is permitted only when the caller identified a two-column row.
 const left=Number.isFinite(badge.nameLeft)?Math.max(0,Math.min(x,badge.nameLeft)):x-145*scale,right=x+bw+3*scale,top=y-90*scale,bottom=y-3*scale;
 const words=smallTSVWords(tsv).filter(a=>a.x>=left&&a.x+a.width<=right&&a.y>=top&&a.y+a.height<=bottom&&a.height<=34*scale).sort((a,b)=>a.y-b.y||a.x-b.x),lines=[];
 for(const word of words){let line=lines.find(l=>Math.abs(l.y-word.y)<=4*scale);if(!line){line={y:word.y,words:[]};lines.push(line);}line.words.push(word);}
 const clean=lines.sort((a,b)=>a.y-b.y).map(l=>smallRussianLine(l.words.sort((a,b)=>a.x-b.x).map(a=>a.text).join(' '))).filter(Boolean);
 const seen=new Set(),dedup=clean.filter(s=>{const key=s.toLowerCase();if(seen.has(key))return false;seen.add(key);return true;});
 const full=dedup.filter((s,i)=>!dedup.some((other,j)=>j!==i&&other.length>s.length&&other.toLowerCase().includes(s.toLowerCase())));const name=full.join(' ').replace(/\s+/g,' ').trim();return /[а-яёa-z]{3}/iu.test(name)&&name.split(' ').length>=2&&name.length>=4&&name.length<=180?name:null;
}
export const SMALL_OCR_CLIENT=[positivePrice,smallValidDate,parseSmallCover,findSmallPriceBadges,prepareSmallPriceBitmap,prepareSmallOldPriceBitmap,validateSmallPricePair,chooseSmallOldPrice,smallCubicWeight,smallOldScale,smallTSVWords,smallRussianLine,OCRnameFromTSV].map(fn=>fn.toString()).join('\n');
