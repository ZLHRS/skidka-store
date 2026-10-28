import {scrape,currentSnapshot} from './parser.js';
import {SNAPSHOT} from '../data/snapshot.js';
import {PETRO_SNAPSHOT} from '../data/petro-snapshot.js';

const defaultLoad=(city,signal)=>scrape((url,options={})=>fetch(url,{...options,signal:AbortSignal.any([signal,options.signal].filter(Boolean))}),new Date(),city);
export function createMagnumCache({load=defaultLoad,clock=Date.now,timeoutMs=12000}={}){
 const snapshots=new Map([['astana',SNAPSHOT],['petropavlovsk',PETRO_SNAPSHOT]]),pending=new Map(),attempts=new Map(),failed=new Set();
 let save=()=>{};
 function view(city){const snapshot=snapshots.get(city);return {...currentSnapshot(snapshot,new Date(clock())),stale:failed.has(city)||clock()-Date.parse(snapshot.fetchedAt)>600000,refreshing:pending.has(city)}}
 function restore(city,snapshot){
  if(!snapshots.has(city)||snapshot?.cityId!==city||!Array.isArray(snapshot.products)||!Number.isFinite(Date.parse(snapshot.fetchedAt))||snapshot.products.some(p=>typeof p.start!=='string'||typeof p.end!=='string'||!Number.isFinite(p.price)||p.price<=0||!Array.isArray(p.storeIds)))return false;
  snapshots.set(city,snapshot);return true;
 }
 function refresh(city,force=false){
  if(pending.has(city))return pending.get(city);
  if(clock()-(attempts.get(city)??-Infinity)<(force?30000:60000))return Promise.resolve(view(city));
  attempts.set(city,clock());
  const signal=AbortSignal.timeout(timeoutMs);
  const task=Promise.resolve().then(()=>load(city,signal)).then(async result=>{
   if(!restore(city,result))throw new Error('Некорректный каталог Magnum');
   failed.delete(city);try{await save(city,result)}catch(e){console.warn('Catalogue persistence failed:',e.message)}
  }).catch(e=>{failed.add(city);console.warn('Magnum refresh failed:',city,e.message)}).finally(()=>pending.delete(city)).then(()=>view(city));
  pending.set(city,task);return task;
 }
 function read(city,force=false){
  if(force)return refresh(city,true);
  if(clock()-Date.parse(snapshots.get(city).fetchedAt)>600000)void refresh(city);
  return view(city);
 }
 return {read,refresh,restore,setPersistence(callback){save=callback}};
}
export const magnumCache=createMagnumCache();
