import {createCanvas,loadImage,ImageData} from '@napi-rs/canvas';
import {createWorker} from 'tesseract.js';
import {SMALL_READER} from './small-reader.js';
import {SMALL_OCR_CLIENT} from './small-ocr.js';
import {SMALL_SNAPSHOT} from '../data/small-snapshot.js';
import {discoverSmall,fetchSmallAsset} from './small-discovery.js';
import {validateSmallState} from './small-service.js';

export async function readSmallOnServer(state,{cachePath,save,progress=console.log,discover=discoverSmall,asset=fetchSmallAsset,makeWorker=createWorker}={}){
 const discovery=await discover();
 const api=async(path,options={})=>{
  const url=new URL(path,'http://internal');
  if(url.pathname==='/api/small/discover')return Response.json({...discovery,state,baseline:{key:new URL(SMALL_SNAPSHOT.catalogUrl).pathname.replace('/small-union/',''),start:SMALL_SNAPSHOT.start,end:SMALL_SNAPSHOT.end,city:'astana'}});
  if(url.pathname==='/api/small/asset')return asset(url.searchParams.get('key'));
  if(url.pathname==='/api/small/state'&&options.method==='PUT'){const next=validateSmallState(JSON.parse(options.body),discovery);await save(next);return Response.json({ok:true,checkedAt:next.checkedAt})}
  throw Error('Unexpected internal OCR route');
 };
 const Tesseract={async createWorker(languages,mode){const worker=await makeWorker(languages,mode,{cachePath,langPath:'https://tessdata.projectnaptha.com/4.0.0'});return {setParameters:p=>worker.setParameters(p),recognize:(image,...args)=>worker.recognize(image.toBuffer('image/png'),...args),terminate:()=>worker.terminate()}}};
 // Run the same price/name recognition algorithm as the browser with a small
 // canvas adapter. This is application source, never code from a catalogue.
 const run=new Function('document','window','fetch','createImageBitmap','ImageData',SMALL_READER.replace('/*OCR_HELPERS*/',()=>SMALL_OCR_CLIENT).replace('export async function refreshSmallCatalog','async function refreshSmallCatalog')+'\nreturn refreshSmallCatalog;')(
  {createElement(tag){if(tag!=='canvas')throw Error('Unsupported OCR element');return createCanvas(1,1)}},{Tesseract},api,
  async blob=>{const image=await loadImage(Buffer.from(await blob.arrayBuffer()));image.close=()=>{};return image},ImageData);
 return run(progress);
}
