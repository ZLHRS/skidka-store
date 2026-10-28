import {SMALL_SNAPSHOT} from '../data/small-snapshot.js';
import {localDate} from './parser.js';
export function smallCatalog(now=new Date(),snapshot=SMALL_SNAPSHOT){
 const today=localDate(now),active=snapshot.start<=today&&snapshot.end>=today;
 return {products:active?snapshot.products:[],metadata:{chain:'small',scope:'city',start:snapshot.start,end:snapshot.end,importedAt:snapshot.importedAt,url:snapshot.catalogUrl,key:snapshot.catalogKey||new URL(snapshot.catalogUrl).pathname.replace('/small-union/',''),active,automatic:!!snapshot.automatic,note:snapshot.note}};
}
