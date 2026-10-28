export const MAGNUM_INTERVAL=15*60*1000, SMALL_INTERVAL=6*60*60*1000;

// Completion-based scheduling prevents overlapping OCR runs and bounds retries.
export function startCatalogueScheduler({refreshMagnum,refreshSmall,smallCheckedAt,now=Date.now,setTimer=setTimeout,clearTimer=clearTimeout,onError=console.warn}){
 let stopped=false;const timers=new Set();
 function later(fn,delay){const timer=setTimer(()=>{timers.delete(timer);if(!stopped)void fn()},delay);timer.unref?.();timers.add(timer)}
 async function magnum(){try{await refreshMagnum()}catch(e){onError('Magnum automatic update:',e.message)}finally{if(!stopped)later(magnum,MAGNUM_INTERVAL)}}
 async function small(){let delay=SMALL_INTERVAL;try{await refreshSmall()}catch(e){delay=60*60*1000;onError('SMALL automatic update:',e.message)}finally{if(!stopped)later(small,delay)}}
 later(magnum,1000);
 const checked=Date.parse(smallCheckedAt||'');later(small,Number.isFinite(checked)?Math.max(30000,SMALL_INTERVAL-(now()-checked)):30000);
 return ()=>{stopped=true;for(const timer of timers)clearTimer(timer);timers.clear()};
}
