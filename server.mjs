import http from 'node:http';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {setPriority,constants as osConstants} from 'node:os';
import {startCatalogueScheduler} from './lib/catalogue-scheduler.mjs';
import {setSharedSmallState,publicSmallState} from './lib/small-service.js';
import {isIP} from 'node:net';
import {mkdirSync,readFileSync,writeFileSync,renameSync,statSync} from 'node:fs';
import {dirname,resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import worker from './worker/index.js';
import {localDB} from './lib/local-db.mjs';
import {magnumCache} from './lib/magnum-cache.js';

export function configureCataloguePersistence(dbPath){
 const folder=dirname(dbPath);mkdirSync(folder,{recursive:true,mode:0o700});
 const file=city=>join(folder,'catalogue-'+city+'.json');
 for(const city of ['astana','petropavlovsk'])try{if(statSync(file(city)).size<6000000)magnumCache.restore(city,JSON.parse(readFileSync(file(city),'utf8')))}catch(e){if(e.code!=='ENOENT')console.warn('Catalogue restore failed:',e.message)}
 magnumCache.setPersistence((city,snapshot)=>{writeFileSync(file(city)+'.tmp',JSON.stringify(snapshot),{mode:0o600});renameSync(file(city)+'.tmp',file(city))});
 for(const city of ['astana','petropavlovsk'])void magnumCache.read(city);
}

export function configureAutomaticUpdates(dbPath){
 const file=join(dirname(dbPath),'catalogue-small.json');
 const restore=()=>{try{if(statSync(file).size>10000000)throw Error('Saved SMALL catalogue too large');setSharedSmallState(JSON.parse(readFileSync(file,'utf8')))}catch(e){if(e.code!=='ENOENT')throw e}};
 try{restore()}catch(e){console.warn('SMALL restore failed:',e.message)}
 let child;
 const stop=startCatalogueScheduler({smallCheckedAt:publicSmallState().checkedAt,
  refreshMagnum:async()=>{for(const city of ['astana','petropavlovsk'])await magnumCache.refresh(city)},
  refreshSmall:()=>new Promise((resolve,reject)=>{
   child=spawn(process.execPath,['--max-old-space-size=256',fileURLToPath(new URL('./small-update.mjs',import.meta.url)),file],{stdio:['ignore','inherit','inherit'],windowsHide:true,timeout:20*60*1000});
   try{setPriority(child.pid,osConstants.priority.PRIORITY_BELOW_NORMAL)}catch{}
   child.once('error',reject);child.once('exit',(code,signal)=>{child=null;if(code!==0){reject(Error('OCR worker stopped: '+(signal||code)));return}try{restore();console.log('SMALL automatic catalogue checked:',publicSmallState().checkedAt);resolve()}catch(e){reject(e)}});
  })
 });
 return ()=>{stop();child?.kill()};
}

export function configFromEnv(env=process.env){
 if(!env.PUBLIC_ORIGIN)throw new Error('Set PUBLIC_ORIGIN, for example https://your-domain.kz');
 const url=new URL(env.PUBLIC_ORIGIN);
 if(url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('PUBLIC_ORIGIN must contain only scheme and domain');
 if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))throw new Error('PUBLIC_ORIGIN must use HTTPS');
 const port=Number(env.PORT||4173);if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid PORT');
 return {origin:url.origin,port,dbPath:resolve(env.DB_PATH||'/var/lib/po-skidke/accounts.sqlite')};
}

export function createVpsServer(config){
 mkdirSync(dirname(config.dbPath),{recursive:true,mode:0o700});
 const DB=localDB(config.dbPath);
 const server=http.createServer(async(req,res)=>{
  try{
   if(!req.url?.startsWith('/')){res.writeHead(400);res.end('Invalid request target');return;}
   const url=new URL(config.origin+req.url),limit=url.pathname==='/api/small/state'?1500000:16384;
   const chunks=[];let size=0;
   for await(const chunk of req){size+=chunk.length;if(size>limit){res.writeHead(413,{'Connection':'close'});res.end('Request too large');return;}chunks.push(chunk);}
   const headers=new Headers();
   for(const [name,value] of Object.entries(req.headers)){if(value!==undefined)headers.set(name,Array.isArray(value)?value.join(', '):value);}
   headers.delete('host');
   // Caddy overwrites X-Real-IP. This server binds to loopback only.
   const realIP=req.headers['x-real-ip'];
   headers.set('cf-connecting-ip',typeof realIP==='string'&&isIP(realIP)?realIP:(req.socket.remoteAddress||'127.0.0.1'));
   const method=req.method==='HEAD'?'GET':req.method,init={method,headers};
   if(!['GET','HEAD'].includes(req.method))init.body=Buffer.concat(chunks);
   const response=await worker.fetch(new Request(url,init),{DB});
   const responseHeaders=Object.fromEntries(response.headers);if(response.headers.getSetCookie)responseHeaders['set-cookie']=response.headers.getSetCookie();
   res.writeHead(response.status,responseHeaders);
   res.end(req.method==='HEAD'?undefined:Buffer.from(await response.arrayBuffer()));
  }catch(error){console.error('Request failed:',error.message);if(!res.headersSent)res.writeHead(500,{'Cache-Control':'no-store'});res.end('Server error');}
 });
 server.requestTimeout=120000;server.headersTimeout=15000;server.keepAliveTimeout=65000;
 server.maxHeadersCount=100;server.on('close',()=>DB.close());
 return server;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 if(Number(process.versions.node.split('.')[0])!==24)throw new Error('This package is tested with Node.js 24.x');
 process.umask(0o077);
 const config=configFromEnv(),server=createVpsServer(config);
 configureCataloguePersistence(config.dbPath);
 const stopUpdates=configureAutomaticUpdates(config.dbPath);
 server.listen(config.port,'127.0.0.1',()=>console.log('По скидке:',config.origin,'upstream 127.0.0.1:'+config.port));
 for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{stopUpdates();server.close(()=>process.exit(0));setTimeout(()=>{server.closeAllConnections();process.exit(1);},35000).unref();});
}
