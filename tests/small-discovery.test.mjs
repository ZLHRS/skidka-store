import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseSmallListing,latestSmallPDFs,smallRevisionPages,allowedSmallKey,discoverSmall,requestSmall} from '../lib/small-discovery.js';
const pdfKey=(id,time='20261021165143')=>'catalog-pdf/'+id+'/images/catalog-pdf_'+time+'_63366.pdf';
const imageKey=(id,n)=>'catalog/'+id+'/images/catalog_20261021165142_'+n+'.jpg';
const item=(key,date,size=200000)=>({key,modifiedAt:date,size,etag:'test'});
const xml=(objects,{truncated=false,token=''}={})=>'<ListBucketResult>'+objects.map(o=>'<Contents><Key>'+o.key+'</Key><LastModified>'+o.modifiedAt+'</LastModified><Size>'+o.size+'</Size><ETag>&#34;abc&#34;</ETag></Contents>').join('')+'<IsTruncated>'+truncated+'</IsTruncated><NextContinuationToken>'+token+'</NextContinuationToken></ListBucketResult>';
test('SMALL retries connection errors and transient HTTP responses, but not access denial',async()=>{
 let attempts=0;
 const response=await requestSmall('https://example.test',async()=>{attempts++;if(attempts===1)throw new TypeError('fetch failed');return new Response('ok',{status:attempts===2?503:200});});
 assert.equal(response.status,200);assert.equal(attempts,3);
 attempts=0;assert.equal((await requestSmall('https://example.test',async()=>{attempts++;return new Response('',{status:403});})).status,403);assert.equal(attempts,1);
 attempts=0;await assert.rejects(requestSmall('https://example.test',async()=>{attempts++;throw new TypeError('fetch failed');}),/после трёх попыток/);assert.equal(attempts,3);
});
test('SMALL listing decodes tokens and ignores tiny placeholder PDF revisions',()=>{
 const p=parseSmallListing(xml([item(pdfKey(1044),'2026-10-21T11:51:43.548Z')],{truncated:true,token:'abc&amp;def'}));assert.equal(p.token,'abc&def');assert.equal(p.objects[0].etag,'abc');
 const chosen=latestSmallPDFs([...p.objects,item(pdfKey(1044,'20261021170000'),'2026-10-21T12:00:00.000Z',953),item(pdfKey(1049),'2026-10-21T11:52:12.686Z')]);assert.deepEqual(chosen.map(x=>x.id),[1049,1044]);assert.equal(chosen[1].modifiedAt,p.objects[0].modifiedAt);
});
test('SMALL only joins JPEG pages from a coherent replacement upload in actual upload order',()=>{
 const pdf=item(pdfKey(1044),'2026-10-21T11:51:43.548Z');pdf.id=1044;
 const pages=smallRevisionPages([item(imageKey(1044,1),'2026-10-21T03:04:42.000Z'),item(imageKey(1044,99999),'2026-10-21T11:51:41.989Z'),item(imageKey(1044,1),'2026-10-21T11:51:42.110Z'),item(imageKey(1049,2),'2026-10-21T11:51:42.264Z')],pdf);
 assert.equal(pages.length,2);assert.equal(pages[0].key,imageKey(1044,99999));assert.equal(pages[1].page,2);
});
test('SMALL asset proxy cannot address private prefixes or arbitrary URLs',()=>{
 for(const key of ['feedback/a.pdf','resumes/a.pdf','https://example.com/a.jpg','catalog/../a.jpg','catalog/1044/images/a.jpg'])assert.equal(allowedSmallKey(key),false);
 assert.equal(allowedSmallKey(pdfKey(1044)),true);assert.equal(allowedSmallKey(imageKey(1044,9)),true);
});
test('SMALL discovery follows continuation tokens and fetches only discovered catalogue page prefixes',async()=>{
 const calls=[],pdf=item(pdfKey(1044),'2026-10-21T11:51:43.548Z');
 const fetcher=async url=>{const u=new URL(url);calls.push(u);const p=u.searchParams.get('prefix');return new Response(p==='catalog/1044/'?xml([item(imageKey(1044,1),'2026-10-21T11:51:42.000Z')]):u.searchParams.has('continuation-token')?xml([pdf]):xml([],{truncated:true,token:'next&amp;part'}));};
 const result=await discoverSmall(fetcher);assert.equal(result.candidates[0].pages.length,1);assert.equal(calls[1].searchParams.get('continuation-token'),'next&part');assert.equal(calls.length,3);
});
