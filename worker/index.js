import {PWA_MANIFEST,PWA_WORKER,PWA_CLIENT} from '../lib/pwa.js';
import {PWA_ICONS} from '../lib/pwa-icons.js';
import {STORES,CHAINS,CITIES} from '../lib/parser.js';
import {HTML} from '../ui.js';
import {accountRoute,getAccount,favoriteKey} from '../lib/accounts.js';
import {CLIENT} from '../client.js';
import {CATEGORIES,categoryForProduct} from '../lib/categories.js';
import {smallCatalog} from '../lib/small.js';
import {smallRoute,userSmallState,chooseSmallSnapshot} from '../lib/small-service.js';
import {SMALL_READER} from '../lib/small-reader.js';
import {SMALL_OCR_CLIENT} from '../lib/small-ocr.js';
import {FILTER_CLIENT} from '../lib/filters.js';
import {magnumCache} from '../lib/magnum-cache.js';
const magnumDeals=(city,force=false)=>magnumCache.read(city,force);
async function deals(city='astana',force=false,state=null){const [magnum,small]=await Promise.all([magnumDeals(city,force),Promise.resolve(smallCatalog(new Date(),chooseSmallSnapshot(state)))]);return {...magnum,cityId:city,cities:CITIES,chains:CHAINS.filter(c=>STORES.some(s=>s.city===city&&s.chain===c.id)),stores:STORES.filter(s=>s.city===city),smallCatalog:city==='astana'?{...small.metadata,checkedAt:state?.checkedAt}:null,products:[...magnum.products.map(p=>({...p,city,chain:'magnum',scope:'store'})),...(city==='astana'?small.products.map(p=>({...p,city})):[])]}}
export default {async fetch(request,env){
 const url=new URL(request.url),city=CITIES.some(c=>c.id===url.searchParams.get('city'))?url.searchParams.get('city'):'astana';
 if(request.method==='GET'&&url.pathname==='/manifest.webmanifest')return Response.json({...PWA_MANIFEST,related_applications:[{platform:'webapp',url:url.origin+'/manifest.webmanifest?v=2',id:url.origin+'/'}]},{headers:{'Content-Type':'application/manifest+json; charset=utf-8','Cache-Control':'no-cache'}});
 if(request.method==='GET'&&url.pathname==='/sw.js')return new Response(PWA_WORKER,{headers:{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-cache','Service-Worker-Allowed':'/','X-Content-Type-Options':'nosniff'}});
 if(request.method==='GET'&&PWA_ICONS[url.pathname])return new Response(Uint8Array.from(atob(PWA_ICONS[url.pathname]),c=>c.charCodeAt(0)),{headers:{'Content-Type':'image/png','Cache-Control':'public, max-age=86400','X-Content-Type-Options':'nosniff'}});
 if(url.pathname.startsWith('/api/small/'))return smallRoute(request,env);
 if(['/api/profile','/api/preferences','/api/favorites'].includes(url.pathname)||url.pathname.startsWith('/api/auth/'))return accountRoute(request,env,async()=>{const user=await getAccount(request,env.DB);return deals(city,false,user?await userSmallState(env.DB,user):null)});
 if(request.method!=='GET')return new Response('Method not allowed',{status:405,headers:{Allow:'GET'}});
 if(url.pathname==='/api/deals'){
  const user=env?.DB&&await getAccount(request,env.DB),state=user?await userSmallState(env.DB,user):null;
  const data=await deals(city,url.searchParams.get('refresh')==='1',state),imageVersion=chooseSmallSnapshot(state).importedAt;
  return Response.json({...data,categories:CATEGORIES,products:data.products.map(p=>({...p,image:p.chain==='small'&&p.image?.startsWith('data:')?'/api/small-image?id='+encodeURIComponent(p.id)+'&v='+encodeURIComponent(imageVersion):p.image,key:favoriteKey(p),category:categoryForProduct(p)}))},{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 }
 if(url.pathname==='/api/small-image'){
  const user=env?.DB&&await getAccount(request,env.DB),snapshot=chooseSmallSnapshot(user?await userSmallState(env.DB,user):null);
  const product=snapshot.products.find(p=>String(p.id)===url.searchParams.get('id')),match=product?.image?.match(/^data:image\/(jpeg|png);base64,([a-zA-Z0-9+/=]+)$/);
  if(url.searchParams.get('v')!==snapshot.importedAt||!match)return new Response('Not found',{status:404});
  return new Response(Uint8Array.from(atob(match[2]),c=>c.charCodeAt(0)),{headers:{'Content-Type':'image/'+match[1],'Cache-Control':'private, max-age=86400','Vary':'Cookie','X-Content-Type-Options':'nosniff'}});
 }
 if(url.pathname==='/small-reader.js')return new Response(SMALL_READER.replace('/*OCR_HELPERS*/',()=>SMALL_OCR_CLIENT),{headers:{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 if(url.pathname==='/health')return Response.json({ok:true});
 if(url.pathname!=='/')return new Response('Not found',{status:404});
 return new Response(HTML.replace('<!--CLIENT-->',()=>'<script>'+PWA_CLIENT+'</script><script>'+CLIENT.replace('/*FILTER_HELPERS*/',()=>FILTER_CLIENT)+'</script>'),{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' https://magnum.kz:1337 data:; connect-src 'self' https://cdn.jsdelivr.net https://tessdata.projectnaptha.com; worker-src 'self' blob: https://cdn.jsdelivr.net; frame-ancestors 'none'; base-uri 'none'"}});
}};
