// Public SMALL catalogue storage. No account, cookie or access token is used.
export const SMALL_STORAGE='https://minio.skiftrade.kz:9000/small-union';
const SMALL_BASELINE_ID=1044,SMALL_LIST_LIMIT=6,SMALL_CANDIDATE_LIMIT=20;
export async function requestSmall(url,fetcher=fetch,timeout=20000){
 for(let attempt=0;attempt<3;attempt++){
  try{
   const response=await fetcher(url,{signal:AbortSignal.timeout(timeout)});
   if(attempt<2&&[408,429,500,502,503,504].includes(response.status)){await response.body?.cancel();continue;}
   return response;
  }catch(error){
   if(attempt<2)continue;
   const code=error.cause?.code||error.code||error.name;
   console.warn('SMALL connection failed:',code);
   throw new Error('Нет соединения с хранилищем каталогов SMALL после трёх попыток. Попробуй обновить позже.',{cause:error});
  }
 }
}
function smallXML(value){return String(value||'').replace(/&#(?:x([0-9a-f]+)|(\d+));|&(amp|lt|gt|quot|apos);/gi,(_,hex,dec,name)=>hex||dec?String.fromCodePoint(parseInt(hex||dec,hex?16:10)):({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[name.toLowerCase()]));}
function smallXMLTag(xml,name){return smallXML(xml.match(new RegExp('<'+name+'>([\\s\\S]*?)<\\/'+name+'>'))?.[1]||'');}
export function parseSmallListing(xml){
 if(!xml.includes('<ListBucketResult'))throw new Error('SMALL: неверный ответ списка каталогов');
 const objects=[...xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)].map(m=>({key:smallXMLTag(m[1],'Key'),modifiedAt:smallXMLTag(m[1],'LastModified'),size:Number(smallXMLTag(m[1],'Size')),etag:smallXMLTag(m[1],'ETag').replace(/^"|"$/g,'')}));
 if(objects.some(o=>!Number.isFinite(Date.parse(o.modifiedAt))||!Number.isFinite(o.size)))throw new Error('SMALL: повреждены даты или размеры файлов');
 return {objects,truncated:smallXMLTag(xml,'IsTruncated')==='true',token:smallXMLTag(xml,'NextContinuationToken')};
}
export function allowedSmallKey(key){return typeof key==='string'&&/^(?:catalog-pdf\/\d+\/images\/catalog-pdf_\d{14}_\d+\.pdf|catalog\/\d+\/images\/catalog_\d{14}_\d+\.(?:jpg|jpeg|png))$/.test(key);}
export function smallAssetURL(key){if(!allowedSmallKey(key))throw new Error('SMALL: недопустимый файл каталога');return SMALL_STORAGE+'/'+key;}
async function listSmallPrefix(prefix,fetcher){
 let token='',objects=[];const seen=new Set();
 for(let page=0;page<SMALL_LIST_LIMIT;page++){
  const u=new URL(SMALL_STORAGE);u.searchParams.set('list-type','2');u.searchParams.set('prefix',prefix);u.searchParams.set('max-keys','1000');if(token)u.searchParams.set('continuation-token',token);
  const response=await requestSmall(u.href,fetcher);if(!response.ok)throw new Error('SMALL: список каталогов HTTP '+response.status);
  const xml=await response.text();if(xml.length>2000000)throw new Error('SMALL: слишком большой список каталогов');
  const parsed=parseSmallListing(xml);objects.push(...parsed.objects);
  if(!parsed.truncated)return objects;
  if(!parsed.token||seen.has(parsed.token))throw new Error('SMALL: неполная пагинация каталогов');
  seen.add(parsed.token);token=parsed.token;
 }
 throw new Error('SMALL: превышен предел страниц каталога');
}
export function latestSmallPDFs(objects){
 const byId=new Map();
 for(const o of objects){
  const match=o.key.match(/^catalog-pdf\/(\d+)\/images\/catalog-pdf_\d{14}_\d+\.pdf$/);
  // The storage also contains tiny blank PDF placeholders from revisions.
  if(!match||o.size<100000||o.size>30000000)continue;
  const id=Number(match[1]);if(id<SMALL_BASELINE_ID)continue;
  const previous=byId.get(id);if(!previous||previous.modifiedAt<o.modifiedAt)byId.set(id,{...o,id,pdfUrl:smallAssetURL(o.key)});
 }
 const sorted=[...byId.values()].sort((a,b)=>b.id-a.id),chosen=sorted.slice(0,SMALL_CANDIDATE_LIMIT);
 const baseline=byId.get(SMALL_BASELINE_ID);if(baseline&&!chosen.some(c=>c.id===SMALL_BASELINE_ID))chosen.push(baseline);
 return chosen;
}
export function smallRevisionPages(objects,pdf){
 const stamp=Date.parse(pdf.modifiedAt),prefix='catalog/'+pdf.id+'/';
 // A replacement upload writes its JPEG pages immediately before its PDF.
 // Never combine pages from older upload batches. Milliseconds preserve upload
 // order; random filename suffixes cannot serve as page numbers.
 const eligible=objects.filter(o=>o.key.startsWith(prefix)&&allowedSmallKey(o.key)&&!o.key.endsWith('.pdf')&&o.size>10000&&o.size<15000000&&Date.parse(o.modifiedAt)<=stamp+5000&&Date.parse(o.modifiedAt)>=stamp-120000).sort((a,b)=>a.modifiedAt.localeCompare(b.modifiedAt)||a.key.localeCompare(b.key));
 if(!eligible.length)return [];
 let start=eligible.length-1;while(start>0&&Date.parse(eligible[start].modifiedAt)-Date.parse(eligible[start-1].modifiedAt)<10000)start--;
 const pages=eligible.slice(start);if(pages.length>40)throw new Error('SMALL: слишком много страниц в выпуске');
 return pages.map((o,index)=>({...o,url:smallAssetURL(o.key),page:index+1}));
}
export async function discoverSmall(fetcher=fetch){
 const candidates=latestSmallPDFs(await listSmallPrefix('catalog-pdf/',fetcher));
 // Bounded parallel requests keep the refresh responsive without overloading
 // SMALL; all paths are from the public catalogue listing and validated above.
 for(let i=0;i<candidates.length;i+=2)await Promise.all(candidates.slice(i,i+2).map(async pdf=>{pdf.pages=smallRevisionPages(await listSmallPrefix('catalog/'+pdf.id+'/',fetcher),pdf);}));
 return {checkedAt:new Date().toISOString(),candidates:candidates.filter(c=>c.pages.length)};
}
export async function fetchSmallAsset(key,fetcher=fetch){
 const response=await requestSmall(smallAssetURL(key),fetcher,30000);
 if(!response.ok)throw new Error('SMALL: файл HTTP '+response.status);
 const declared=Number(response.headers.get('Content-Length'));if(declared>30000000)throw new Error('SMALL: слишком большой файл');
 const bytes=await response.arrayBuffer();if(bytes.byteLength>30000000)throw new Error('SMALL: слишком большой файл');
 return new Response(bytes,{headers:{'Content-Type':key.endsWith('.pdf')?'application/pdf':key.endsWith('.png')?'image/png':'image/jpeg','X-Content-Type-Options':'nosniff','Cache-Control':'private, max-age=3600'}});
}
