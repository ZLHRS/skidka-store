import {validateSmallPricePair} from './small-ocr.js';
import {discoverSmall,allowedSmallKey,fetchSmallAsset} from './small-discovery.js';
import {SMALL_SNAPSHOT} from '../data/small-snapshot.js';
import {getAccount} from './accounts.js';
let smallDiscoveryCache=null,smallDiscoveryPending=null;
export async function smallDiscovery(force=false){
 if(smallDiscoveryCache&&Date.now()-Date.parse(smallDiscoveryCache.checkedAt)<(force?15000:300000))return smallDiscoveryCache;
 if(!smallDiscoveryPending)smallDiscoveryPending=discoverSmall().then(r=>smallDiscoveryCache=r).finally(()=>smallDiscoveryPending=null);
 return smallDiscoveryPending;
}
export async function userSmallState(db,user){
 const row=await db.prepare('SELECT value FROM user_catalogs WHERE user_id=?').bind(user.id).first();return row?JSON.parse(row.value):{seen:{},snapshot:null,checkedAt:null};
}
export function chooseSmallSnapshot(state){const s=state?.snapshot;return s&&s.start>=SMALL_SNAPSHOT.start?s:SMALL_SNAPSHOT}
export function validateSmallState(value,discovery){
 const keys=new Set(discovery.candidates.map(c=>c.key)),seen={};
 for(const [key,info] of Object.entries(value.seen||{}).slice(-80)){if(!allowedSmallKey(key)||!keys.has(key))continue;if(!info||typeof info.city!=='string')continue;seen[key]={city:info.city.slice(0,40),start:String(info.start||'').slice(0,10),end:String(info.end||'').slice(0,10)}}
 let snapshot=null;const s=value.snapshot;
 if(s){
  const date=v=>typeof v==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v));
  const source=discovery.candidates.find(c=>c.key===s.catalogKey);
  if(!source||s.city!=='Астана'||!date(s.start)||!date(s.end)||s.end<s.start||Date.parse(s.end)-Date.parse(s.start)>62*86400000||!Array.isArray(s.products)||!s.products.length||s.products.length>250)throw new Error('Некорректный распознанный выпуск');
  const products=s.products.map((p,i)=>{
   if(typeof p.name!=='string'||p.name.length<3||p.name.length>250||!Number.isInteger(p.price)||p.price<50||p.price>500000||typeof p.image!=='string'||!/^data:image\/jpeg;base64,[a-zA-Z0-9+/=]+$/.test(p.image)||p.image.length>40000)throw new Error('Некорректный товар каталога');
   const pair=Number.isInteger(p.priceBefore)?validateSmallPricePair(p.priceBefore,p.price):null,before=pair?.priceBefore||null;
   return {id:'small-'+source.id+'-'+(i+1),name:p.name,price:p.price,priceBefore:before,discount:before?Math.round((before-p.price)/before*100):null,image:p.image,start:s.start,end:s.end,chain:'small',scope:'city',city:'astana',storeIds:[],url:source.pdfUrl+'#page='+Math.max(1,Math.min(source.pages.length,Number(p.sourcePage)||1)),sourcePage:Number(p.sourcePage)||1,ocr:true};
  });
  snapshot={readerVersion:s.readerVersion===2?2:1,city:'Астана',catalogKey:source.key,catalogUrl:source.pdfUrl,start:s.start,end:s.end,importedAt:new Date().toISOString(),automatic:true,products,note:'Автоматически распознано из городского каталога SMALL. Цены требуют проверки по оригиналу; участие конкретного филиала и наличие не подтверждены.'};
 }
 return {seen,snapshot,checkedAt:new Date().toISOString()};
}
export async function smallRoute(request,env){
 const user=env?.DB&&await getAccount(request,env.DB);if(!user)return Response.json({error:'Войди в аккаунт'},{status:401});
 const url=new URL(request.url),json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
 try{
  if(url.pathname==='/api/small/asset'&&request.method==='GET')return await fetchSmallAsset(url.searchParams.get('key'));
  if(url.pathname==='/api/small/discover'&&request.method==='GET'){const [discovery,state]=await Promise.all([smallDiscovery(true),userSmallState(env.DB,user)]);return json({...discovery,state,baseline:{key:new URL(SMALL_SNAPSHOT.catalogUrl).pathname.replace('/small-union/',''),start:SMALL_SNAPSHOT.start,end:SMALL_SNAPSHOT.end,city:'astana'}})}
  if(url.pathname==='/api/small/state'&&request.method==='PUT'){
   if(request.headers.get('origin')!==url.origin)return json({error:'Недопустимый источник запроса'},403);
   if(!request.headers.get('content-type')?.includes('application/json'))return json({error:'Нужен JSON'},400);
   const reader=request.body.getReader();let size=0;const chunks=[];while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1500000){await reader.cancel();return json({error:'Каталог слишком большой'},413)}chunks.push(value)}
   const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length}
   const input=JSON.parse(new TextDecoder().decode(bytes)),next=validateSmallState(input,await smallDiscovery());
   // The OCR result belongs to this account only; another visitor cannot replace it.
   await env.DB.prepare('INSERT INTO user_catalogs(user_id,value) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET value=excluded.value').bind(user.id,JSON.stringify(next)).run();return json({ok:true,checkedAt:next.checkedAt});
  }
  return json({error:'Не найдено'},404);
 }catch(e){console.warn('SMALL refresh failed:',e.message);return json({error:'SMALL: '+e.message},503)}
}
