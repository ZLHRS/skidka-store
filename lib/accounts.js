import {STORES,CHAINS,CITIES} from './parser.js';
import {CATEGORIES,categoryForProduct} from './categories.js';
const SESSION_COOKIE='magnum_session',SESSION_DAYS=30;
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const randomHex=size=>hex(crypto.getRandomValues(new Uint8Array(size)));
export async function digest(value){return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))))}
export async function hashPassword(password,salt){const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);return hex(new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt:new TextEncoder().encode(salt),iterations:100000,hash:'SHA-256'},material,256)))}
function constantEqual(a,b){if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0}
function json(data,status=200,headers={}){return Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}})}
function fail(message,status=400){return json({error:message},status)}
async function body(request){if(!request.headers.get('content-type')?.includes('application/json'))throw new Error('Нужен JSON');const reader=request.body?.getReader();if(!reader)throw new Error('Пустой запрос');let size=0,text='';const decoder=new TextDecoder();while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>16384){await reader.cancel();throw new Error('Слишком большой запрос')}text+=decoder.decode(value,{stream:true})}return JSON.parse(text+decoder.decode())}
function sessionCookie(token,request,seconds=SESSION_DAYS*86400){return SESSION_COOKIE+'='+token+'; Path=/; HttpOnly; SameSite=Lax; Max-Age='+seconds+(new URL(request.url).protocol==='https:'?'; Secure':'')}
export function favoriteKey(p){if(p.chain==='small')return 'small:name:'+p.name.normalize('NFKC').toLocaleLowerCase('ru').replace(/\s+/g,' ').trim();const file=p.image?.split('/').pop()||'',ean=file.match(/^(\d{8,14})(?:_|\.)/);return ean?'ean:'+ean[1]:'name:'+p.name.normalize('NFKC').toLocaleLowerCase('ru').replace(/\s+/g,' ').trim()}
export async function getAccount(request,db){const token=request.headers.get('cookie')?.match(/(?:^|;\s*)magnum_session=([a-f0-9]{64})(?:;|$)/)?.[1];if(!token)return null;const row=await db.prepare('SELECT accounts.id, accounts.username FROM sessions JOIN accounts ON accounts.id=sessions.user_id WHERE token_hash=? AND expires_at>?').bind(await digest(token),Date.now()).first();return row?{id:row.id,username:row.username}:null}
function cleanPreferences(value){const valid=new Set(STORES.map(s=>s.id)),categoryIds=new Set(CATEGORIES.filter(c=>c.id!=='all').map(c=>c.id)),raw=Array.isArray(value.categories)?value.categories:(value.category&&value.category!=='all'?[value.category]:[]),categories=[...new Set(raw.filter(id=>categoryIds.has(id)))],chains=Array.isArray(value.chains)?[...new Set(value.chains.filter(id=>CHAINS.some(c=>c.id===id)))]:[];return {city:CITIES.some(c=>c.id===value.city)?value.city:'astana',categories,chains,category:categories.length===1?categories[0]:'all',stores:Array.isArray(value.stores)?[...new Set(value.stores.filter(id=>valid.has(id)))]:[],search:typeof value.search==='string'?value.search.slice(0,150):'',sort:['discount','price','end','name'].includes(value.sort)?value.sort:'discount',favoritesOnlySale:value.favoritesOnlySale!==false}}
async function profile(db,user){const [prefs,favs]=await Promise.all([db.prepare('SELECT value FROM preferences WHERE user_id=?').bind(user.id).first(),db.prepare('SELECT product_key,snapshot,created_at FROM favorites WHERE user_id=? ORDER BY created_at DESC').bind(user.id).all()]);return {user:{username:user.username},preferences:cleanPreferences(prefs?JSON.parse(prefs.value):{}),favorites:(favs.results||[]).map(f=>{const p=JSON.parse(f.snapshot);return {key:f.product_key,...p,chain:p.chain||'magnum',category:categoryForProduct(p),savedAt:f.created_at}})}}
async function loginLimit(db,request,username){const now=Date.now(),ip=request.headers.get('cf-connecting-ip')||'local',window=Math.floor(now/900000),buckets=['ip:'+ip,'user:'+username];for(const value of buckets){const key=await digest(value)+':'+window;const count=await db.prepare('INSERT INTO auth_limits(bucket,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET attempts=attempts+1 RETURNING attempts').bind(key,now+900000).first();if(count.attempts>20)return false}await db.prepare('DELETE FROM auth_limits WHERE expires_at<?').bind(now).run();return true}
export async function accountRoute(request,env,loadDeals){
 const path=new URL(request.url).pathname,db=env?.DB;
 if(!db)return fail('Хранилище аккаунтов временно недоступно',503);
 if(!['GET','POST','PUT','DELETE'].includes(request.method))return fail('Метод не поддерживается',405);
 if(request.method!=='GET'&&request.headers.get('origin')!==new URL(request.url).origin)return fail('Недопустимый источник запроса',403);
 try{
  if(path==='/api/auth/register'||path==='/api/auth/login'){
   if(request.method!=='POST')return fail('Метод не поддерживается',405);
   const input=await body(request),username=String(input.username||'').trim().toLowerCase(),password=input.password;
   if(!/^[a-z0-9_.-]{3,32}$/.test(username)||typeof password!=='string'||password.length<8||password.length>128)return fail('Логин: 3–32 символа латиницей, цифры, точка, дефис или _. Пароль: 8–128 символов.');
   if(!await loginLimit(db,request,username))return fail('Слишком много попыток. Попробуй через 15 минут.',429);
   let account=await db.prepare('SELECT id,username,password_hash,salt FROM accounts WHERE username=?').bind(username).first();
   if(path.endsWith('/register')){
    if(account)return fail('Этот логин уже занят',409);
    const id=crypto.randomUUID(),salt=randomHex(16),hash=await hashPassword(password,salt);
    try{await db.prepare('INSERT INTO accounts(id,username,password_hash,salt,created_at) VALUES(?,?,?,?,?)').bind(id,username,hash,salt,Date.now()).run()}catch(e){if(/unique/i.test(e.message))return fail('Этот логин уже занят',409);throw e}account={id,username};
   }else{const hash=await hashPassword(password,account?.salt||'dummy-salt-for-unknown-user');if(!account||!constantEqual(hash,account.password_hash))return fail('Неверный логин или пароль',401)}
   const token=randomHex(32);await db.batch([db.prepare('DELETE FROM sessions WHERE expires_at<?').bind(Date.now()),db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(await digest(token),account.id,Date.now()+SESSION_DAYS*86400000)]);
   return json(await profile(db,account),200,{'Set-Cookie':sessionCookie(token,request)});
  }
  const user=await getAccount(request,db);if(!user)return fail('Войди в аккаунт',401);
  if(path==='/api/auth/logout'&&request.method==='POST'){const token=request.headers.get('cookie')?.match(/magnum_session=([a-f0-9]{64})/)?.[1];if(token)await db.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await digest(token)).run();return json({ok:true},200,{'Set-Cookie':sessionCookie('',request,0)})}
  if(path==='/api/profile'&&request.method==='GET')return json(await profile(db,user));
  if(path==='/api/preferences'&&request.method==='PUT'){const prefs=cleanPreferences(await body(request));await db.prepare('INSERT INTO preferences(user_id,value) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET value=excluded.value').bind(user.id,JSON.stringify(prefs)).run();return json({preferences:prefs})}
  if(path==='/api/favorites'&&request.method==='PUT'){
   const input=await body(request);if(!Number.isInteger(input.productId)&&!(typeof input.productId==='string'&&/^(?:[1-9][0-9]{0,12}|small-[a-z0-9-]{1,80})$/.test(input.productId)))return fail('Неверный товар');const data=await loadDeals(),p=data.products.find(p=>String(p.id)===String(input.productId));if(!p)return fail('Товар больше не участвует в акции. Обнови каталог.',409);
   const count=await db.prepare('SELECT COUNT(*) AS n FROM favorites WHERE user_id=?').bind(user.id).first();const key=favoriteKey(p),saved=await db.prepare('SELECT product_key FROM favorites WHERE user_id=? AND product_key=?').bind(user.id,key).first();if(!saved&&count.n>=500)return fail('В избранном уже 500 товаров',409);
   const snapshot={name:p.name,image:p.image,url:p.url,chain:p.chain||'magnum',scope:p.scope||'store',city:p.city||'astana',category:categoryForProduct(p)};await db.prepare('INSERT INTO favorites(user_id,product_key,snapshot,created_at) VALUES(?,?,?,?) ON CONFLICT(user_id,product_key) DO UPDATE SET snapshot=excluded.snapshot').bind(user.id,key,JSON.stringify(snapshot),Date.now()).run();return json({key,...snapshot});
  }
  if(path==='/api/favorites'&&request.method==='DELETE'){const input=await body(request);if(typeof input.key!=='string'||input.key.length>500)return fail('Неверный товар');await db.prepare('DELETE FROM favorites WHERE user_id=? AND product_key=?').bind(user.id,input.key).run();return json({ok:true})}
  return fail('Не найдено',404);
 }catch(e){if(e instanceof SyntaxError||['Нужен JSON','Пустой запрос','Слишком большой запрос'].includes(e.message))return fail('Неверный формат запроса');console.error('Account request failed',e.message);return fail('Не удалось сохранить данные. Попробуй ещё раз.',503)}
}
