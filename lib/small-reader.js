export const SMALL_READER = String.raw`
/*OCR_HELPERS*/
const smallApi=async(path,method='GET',value)=>{const r=await fetch(path,{method,credentials:'same-origin',cache:'no-store',headers:value?{'Content-Type':'application/json'}:{},body:value?JSON.stringify(value):undefined});const j=await r.json();if(!r.ok)throw new Error(j.error||'SMALL: ошибка обновления');return j};
let smallOcrLibrary;
async function loadSmallOCR(){
 if(!smallOcrLibrary)smallOcrLibrary=new Promise((resolve,reject)=>{if(window.Tesseract){resolve(window.Tesseract);return}const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js';script.onload=()=>resolve(window.Tesseract);script.onerror=()=>{smallOcrLibrary=null;reject(new Error('Не загрузился модуль распознавания SMALL'))};document.head.append(script)});return smallOcrLibrary;
}
async function smallCanvas(key){const r=await fetch('/api/small/asset?key='+encodeURIComponent(key));if(!r.ok)throw new Error('Не загрузилась страница SMALL');const bitmap=await createImageBitmap(await r.blob());const c=document.createElement('canvas'),scale=Math.min(1,1400/bitmap.width);c.width=Math.round(bitmap.width*scale);c.height=Math.round(bitmap.height*scale);c.getContext('2d').drawImage(bitmap,0,0,c.width,c.height);bitmap.close();return c}
function smallCrop(canvas,x,y,width,height){const c=document.createElement('canvas');x=Math.max(0,Math.round(x));y=Math.max(0,Math.round(y));width=Math.max(1,Math.min(canvas.width-x,Math.round(width)));height=Math.max(1,Math.min(canvas.height-y,Math.round(height)));c.width=width;c.height=height;c.getContext('2d').drawImage(canvas,x,y,width,height,0,0,width,height);return c}
function smallPriceImage(canvas,badge){
 const ctx=canvas.getContext('2d'),local=ctx.getImageData(badge.x,badge.y,badge.width,badge.height),bitmap=prepareSmallPriceBitmap(local,{x:0,y:0,width:local.width,height:local.height});if(!bitmap)return null;
 const out=document.createElement('canvas');out.width=bitmap.width;out.height=bitmap.height;out.getContext('2d').putImageData(new ImageData(bitmap.data,bitmap.width,bitmap.height),0,0);return out;
}
function smallOldPriceImage(pixels,badge,variant){const bitmap=prepareSmallOldPriceBitmap(pixels,badge,variant);if(!bitmap)return null;const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;canvas.getContext('2d').putImageData(new ImageData(bitmap.data,bitmap.width,bitmap.height),0,0);return canvas;}
async function smallReadOldPrice(worker,pixels,badge,current){
 const readings={};for(const variant of ['rgb','blue']){const image=smallOldPriceImage(pixels,badge,variant);if(!image)return null;readings[variant]={};for(const mode of ['7','13']){await worker.setParameters({tessedit_pageseg_mode:mode,tessedit_char_whitelist:'0123456789'});const result=await worker.recognize(image,{}, {text:true});readings[variant][mode]={text:result.data.text,confidence:result.data.confidence};}}
 return chooseSmallOldPrice(readings,current);
}
function smallProductImage(canvas,badge,badges){
 const row=badges.filter(b=>Math.abs(b.y-badge.y)<canvas.height*.035).sort((a,b)=>a.x-b.x),gaps=row.slice(1).map((b,i)=>b.x-row[i].x).filter(g=>g>canvas.width*.1),step=gaps.length?gaps.sort((a,b)=>a-b)[Math.floor(gaps.length/2)]:canvas.width*.23;
 const wide=row.length===2&&step>canvas.width*.4,top=wide?Math.max(0,badge.y-canvas.height*.34):badge.y-step*1.7;const c=wide?smallCrop(canvas,badge.x>canvas.width*.5?canvas.width*.5:0,top,canvas.width*.5,badge.y-top+badge.height+15):smallCrop(canvas,badge.x+badge.width/2-step*.85,top,step*1.03,step*1.7+badge.height+15),out=document.createElement('canvas');out.width=220;out.height=270;const x=out.getContext('2d');x.fillStyle='white';x.fillRect(0,0,220,270);const scale=Math.min(220/c.width,270/c.height);x.drawImage(c,(220-c.width*scale)/2,(270-c.height*scale)/2,c.width*scale,c.height*scale);return out.toDataURL('image/jpeg',.6);
}
export async function refreshSmallCatalog(progress,options={}){
 progress('SMALL: ищем новые каталоги…');const discovery=await smallApi('/api/small/discover');const seen={...(discovery.state.seen||{})};seen[discovery.baseline.key]={city:'astana',start:discovery.baseline.start,end:discovery.baseline.end};let snapshot=discovery.state.snapshot||null,best= snapshot&&snapshot.start>=discovery.baseline.start?{key:snapshot.catalogKey,start:snapshot.start,end:snapshot.end}:discovery.baseline,worker=null,chosen=null,coverCanvas=null;
 const needsUpgrade=!!snapshot&&(snapshot.readerVersion||1)<2;
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Almaty',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const candidates=discovery.candidates.filter(c=>(needsUpgrade&&c.key===snapshot.catalogKey)||!seen[c.key]||(seen[c.key].city==='astana'&&seen[c.key].start>=best.start&&seen[c.key].start<=today&&seen[c.key].end>=today&&c.key!==best.key)).sort((a,b)=>b.modifiedAt.localeCompare(a.modifiedAt));
 try{
  for(let i=0;i<candidates.length;i++){
   const candidate=candidates[i];progress('SMALL: проверяем выпуск '+(i+1)+' из '+candidates.length+'…');if(!worker){const T=await loadSmallOCR();worker=await T.createWorker('rus+eng',1,{workerPath:'https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/worker.min.js',corePath:'https://cdn.jsdelivr.net/npm/tesseract.js-core@6.0.0',langPath:'https://tessdata.projectnaptha.com/4.0.0'});await worker.setParameters({tessedit_pageseg_mode:'11'})}
   const canvas=await smallCanvas(candidate.pages[0].key),result=await worker.recognize(canvas,{}, {text:true}),cover=parseSmallCover(result.data.text,candidate.modifiedAt);
   // A different city or unreadable cover is never treated as Astana.
   if(!cover){if(/астан/i.test(result.data.text))throw new Error('Найден выпуск Астаны, но срок акции не читается. Открой оригинал каталога.');seen[candidate.key]={city:'other-or-unreadable'};continue}seen[candidate.key]=cover;
   if(cover.start<=today&&((needsUpgrade&&candidate.key===snapshot.catalogKey)||cover.start>best.start||(cover.start===best.start&&candidate.key!==best.key&&candidate.modifiedAt>(discovery.candidates.find(c=>c.key===best.key)?.modifiedAt||'')))&&cover.end>=today){best={key:candidate.key,...cover};chosen=candidate;coverCanvas=canvas;break}
  }
  if(chosen){
   const products=[];for(let page=0;page<chosen.pages.length;page++){
    progress('SMALL: распознаём страницу '+(page+1)+' из '+chosen.pages.length+'…');const canvas=page===0?coverCanvas:await smallCanvas(chosen.pages[page].key),ctx=canvas.getContext('2d'),pixels=ctx.getImageData(0,0,canvas.width,canvas.height),badges=findSmallPriceBadges(pixels);
    await worker.setParameters({tessedit_pageseg_mode:'11',tessedit_char_whitelist:''});const full=await worker.recognize(canvas,{}, {text:true,tsv:true});
    for(let i=0;i<badges.length;i++){
     const badge=badges[i],row=badges.filter(b=>Math.abs(b.y-badge.y)<canvas.height*.035).sort((a,b)=>a.x-b.x),wide=row.length===2&&row[1].x-row[0].x>canvas.width*.4,nameBadge=wide?{...badge,nameLeft:badge.x>canvas.width*.5?canvas.width*.5:0}:badge,name=OCRnameFromTSV(full.data.tsv,nameBadge,canvas.width,canvas.height);if(!name)continue;
     progress('SMALL: страница '+(page+1)+'/'+chosen.pages.length+', цена '+(i+1)+'/'+badges.length+'…');const image=smallPriceImage(canvas,badge);if(!image)continue;await worker.setParameters({tessedit_pageseg_mode:'7',tessedit_char_whitelist:'0123456789'});const a=await worker.recognize(image,{}, {text:true}),price=positivePrice(a.data.text);if(!price||a.data.confidence<80)continue;
     await worker.setParameters({tessedit_pageseg_mode:'13'});const b=await worker.recognize(image,{}, {text:true});if(positivePrice(b.data.text)!==price||b.data.confidence<75)continue;
     const old=await smallReadOldPrice(worker,pixels,badge,price);products.push({name,price,priceBefore:old?.priceBefore||null,image:smallProductImage(canvas,badge,badges),sourcePage:page+1});
    }
   }
   if(!products.length)throw new Error('Новый каталог найден, но цены не удалось уверенно распознать. Сохранён предыдущий выпуск.');
   snapshot={readerVersion:2,city:'Астана',catalogKey:chosen.key,start:best.start,end:best.end,products};
  }
  progress('SMALL: сохраняем результат…');const result=await smallApi('/api/small/state','PUT',{seen,snapshot});return {changed:!!chosen,count:snapshot?.products.length,checkedAt:result.checkedAt,message:chosen?'SMALL: новый каталог распознан. Цены можно сверить с оригиналом.':'SMALL: каталог проверен, новых действующих выпусков Астаны нет.'};
 }finally{if(worker)await worker.terminate()}
}
`;
