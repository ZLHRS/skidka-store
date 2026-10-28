export function matchesCategories(product,categories){return !categories.length||categories.includes(product.category)}
export function selectChain(id){return id==='all'?[]:[id]}
export function matchesChainStores(product,stores,chains,selectedStores){
 const chain=product.chain||'magnum';if(chains.length&&!chains.includes(chain))return false;
 const visibleSelected=stores.filter(s=>selectedStores.includes(s.id)&&(!chains.length||chains.includes(s.chain||'magnum')));
 if(!visibleSelected.length)return true;
 const local=visibleSelected.filter(s=>(s.chain||'magnum')===chain).map(s=>s.id);
 if(!local.length)return false;
 // A city catalogue is a separate, explicitly labelled scope, not a branch confirmation.
 if(product.scope==='city')return true;
 return product.storeIds?.some(id=>local.includes(id))||false;
}
export const FILTER_CLIENT=matchesCategories.toString()+'\n'+matchesChainStores.toString()+'\n'+selectChain.toString();
