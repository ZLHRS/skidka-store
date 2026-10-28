export const API = 'https://magnum.kz:1337/api';
export const MAGNUM_STORES = [
 {id:781605,label:'Сыганак, 16',name:'ЖК Шыгыс'},
 {id:781406,label:'Улы Дала, 11 / 47',name:'ЖК Камал',note:'В справочнике Magnum — Улы Дала, 11. Сопоставлен с Улы Дала, 47 по координатам; это не точка On Mart.'},
 {id:352380,label:'Туран, 55Д',name:'Леор'},
 {id:781415,label:'Кабанбай батыра, 43Б',name:'Highvill',note:'В картах также обозначен как 43, блок B.'}
];
MAGNUM_STORES.forEach(s=>{s.chain='magnum';s.city='astana'});
MAGNUM_STORES.push(
 {id:43,chain:'magnum',city:'petropavlovsk',label:'Шокана Уалиханова, 56',name:'ТРЦ City Mall · 1 этаж'},
 {id:781484,chain:'magnum',city:'petropavlovsk',label:'Неля Болатбаева, 3Г/4',name:'Болатбаева',note:'В справочнике Magnum — Болатбаева, 3Г. Точка сопоставлена по координатам.'},
 {id:781487,chain:'magnum',city:'petropavlovsk',label:'Андрея Хименко, 2',name:'Хименко',note:'В API Magnum номер дома не указан; точка сопоставлена по координатам.'},
 {id:781476,chain:'magnum',city:'petropavlovsk',label:'Ивана Шухова, 16',name:'Шухова — Набережная'}
);
export const CITIES=[{id:'astana',label:'Астана'},{id:'petropavlovsk',label:'Петропавловск'}];
export const SMALL_STORES=[
 {id:'small-kabanbay49a',chain:'small',city:'astana',label:'Кабанбай батыра, 49А',name:'SMALL',scope:'city',note:'Для этой точки показан городской каталог Астаны. Цена и участие магазина требуют уточнения.'},
 {id:'small-e36-9-1',chain:'small',city:'astana',label:'Е-36, 9/1',name:'SMALL',scope:'city',note:'Для этой точки показан городской каталог Астаны. Цена и участие магазина требуют уточнения.'}
];
export const STORES=[...MAGNUM_STORES,...SMALL_STORES];
export const CHAINS=[{id:'magnum',label:'Magnum'},{id:'small',label:'SMALL'}];
export function localDate(now=new Date()) {return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Almaty',year:'numeric',month:'2-digit',day:'2-digit'}).format(now)}
export function normalize(catalog,linked,now=new Date(),city='astana') {
 if(!Array.isArray(catalog)||!Array.isArray(linked))throw new Error('Изменился формат API Magnum');
 const today=localDate(now),activeIds=new Set(catalog.map(p=>p.id)),selected=new Set(MAGNUM_STORES.filter(s=>s.city===city).map(s=>s.id)),byId=new Map();
 for(const raw of linked){
  const p=raw.attributes,shops=p?.shops?.data;
  if(!p||!Array.isArray(shops))throw new Error('API не вернул привязку товаров к магазинам');
  if(!activeIds.has(raw.id)||p.locale!=='ru'||!p.action_start||!p.action_end||p.action_start>today||p.action_end<today)continue;
  const before=Number(p.start_price),price=Number(p.final_price);
  if(!Number.isFinite(before)||!Number.isFinite(price)||price<=0||before<=price)continue;
  const storeIds=[...new Set(shops.map(s=>s.id).filter(id=>selected.has(id)))];
  if(!storeIds.length)continue;
  const url=p.image?.data?.[0]?.attributes?.url,image=url?new URL(url,'https://magnum.kz:1337').href:null;
  if(image&&!image.startsWith('https://magnum.kz:1337/uploads/'))throw new Error('Неожиданный адрес фото');
  byId.set(raw.id,{id:raw.id,name:p.name,priceBefore:before,price,discount:Math.round((before-price)/before*100),image,start:p.action_start,end:p.action_end,storeIds,url:`https://magnum.kz/products/${raw.id}?city=${city}`});
 }
 return {city:CITIES.find(c=>c.id===city)?.label||city,cityId:city,fetchedAt:now.toISOString(),date:today,stores:MAGNUM_STORES.filter(s=>s.city===city),products:[...byId.values()].sort((a,b)=>b.discount-a.discount),catalogCount:catalog.length};
}
export async function fetchJSON(path,fetcher=fetch){const r=await fetcher(API+path,{headers:{Accept:'application/json','Accept-Language':'ru'},signal:AbortSignal.timeout(25000)});if(!r.ok)throw new Error(`Magnum HTTP ${r.status}`);return r.json()}
export async function scrape(fetcher=fetch,now=new Date(),city='astana'){
 if(!CITIES.some(c=>c.id===city))throw new Error('Неизвестный город');
 const query=new URLSearchParams({'filters[shops][city][slug][$eq]':city,'pagination[pageSize]':'500','populate[shops][fields][0]':'name','populate[shops][fields][1]':'address','populate[image][fields][0]':'url',locale:'ru'});
 const [catalog,first]=await Promise.all([fetchJSON('/new-product?city='+city+'&cunt=1500',fetcher),fetchJSON('/products?'+query,fetcher)]);
 if(!Array.isArray(first.data))throw new Error('Нет массива товаров Magnum');
 const linked=[...first.data],pageCount=Number(first.meta?.pagination?.pageCount||1);
 if(pageCount>20)throw new Error('Слишком много страниц');
 for(let page=2;page<=pageCount;page++){query.set('pagination[page]',String(page));const next=await fetchJSON('/products?'+query,fetcher);if(!Array.isArray(next.data)||!next.data.length)throw new Error('Неполная пагинация Magnum');linked.push(...next.data)}
 const ids=new Set(linked.map(p=>p.id));if(!Array.isArray(catalog)||catalog.some(p=>!ids.has(p.id)))throw new Error('Неполная привязка каталога к магазинам');
 return normalize(catalog,linked,now,city);
}
export function currentSnapshot(data,now=new Date()){const today=localDate(now);return {...data,products:data.products.filter(p=>p.start<=today&&p.end>=today)}}
