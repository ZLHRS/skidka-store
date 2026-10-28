export const PWA_MANIFEST={id:'/',name:'По скидке',short_name:'По скидке',description:'Акции Magnum и SMALL в твоих магазинах',lang:'ru',start_url:'/?source=pwa',scope:'/',display:'standalone',background_color:'#f7f7f2',theme_color:'#f7f7f2',orientation:'any',categories:['shopping','food'],icons:[{src:'/icons/icon-192-v2.png',sizes:'192x192',type:'image/png',purpose:'any'},{src:'/icons/icon-512-v2.png',sizes:'512x512',type:'image/png',purpose:'any maskable'}],prefer_related_applications:false,related_applications:[{platform:'webapp',url:'/manifest.webmanifest?v=2',id:'/'}]};
export const PWA_OFFLINE = '<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#f7f7f2"><title>По скидке · Нет подключения</title><style>body{background:#f7f7f2;color:#283324;font:17px/1.5 system-ui;margin:0;min-height:100vh;display:grid;place-items:center}main{max-width:360px;padding:30px}a{display:inline-block;background:#547638;color:white;text-decoration:none;border-radius:12px;padding:12px 20px}h1{line-height:1.1}</style><main><h1>Нет подключения</h1><p>Подключись к интернету, чтобы открыть аккаунт и проверить свежие скидки.</p><a href="/">Попробовать снова</a></main></html>';
export const PWA_WORKER = `const PWA_CACHE='deals-pwa-v2';
const PWA_STATIC=['/manifest.webmanifest','/icons/icon-180-v2.png','/icons/icon-192-v2.png','/icons/icon-512-v2.png'];
const PWA_OFFLINE_HTML=${JSON.stringify(PWA_OFFLINE)};
self.addEventListener('install',event=>{self.skipWaiting()});
self.addEventListener('activate',event=>{event.waitUntil(Promise.all([self.clients.claim(),caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('deals-pwa-')&&k!==PWA_CACHE).map(k=>caches.delete(k))))]))});
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);if(request.method!=='GET'||url.origin!==self.location.origin)return;
 // Never cache account HTML, API responses, catalogue data or authentication.
 if(request.mode==='navigate'&&url.pathname==='/'){event.respondWith(fetch(request).catch(()=>new Response(PWA_OFFLINE_HTML,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}})));return;}
 if(!PWA_STATIC.includes(url.pathname))return;
 event.respondWith((async()=>{const cache=await caches.open(PWA_CACHE),cached=await cache.match(request);if(cached)return cached;const response=await fetch(request);const type=response.headers.get('content-type')||'';if(response.ok&&!response.redirected&&(type.includes('image/png')||type.includes('application/manifest+json')))await cache.put(request,response.clone());return response;})());
});`;
export function pwaIsStandalone(displayModes,iosStandalone=false){return !!iosStandalone||displayModes.some(Boolean)}
export const PWA_CLIENT = String.raw`
(()=>{
 let pendingInstall=null,installedHere=false,relatedInstalled=false;
 const modes=['(display-mode: standalone)','(display-mode: minimal-ui)','(display-mode: fullscreen)'].map(q=>window.matchMedia(q));
 const runningAsApp=()=>!!navigator.standalone||modes.some(q=>q.matches);
 function drawInstall(){const hide=runningAsApp()||installedHere||relatedInstalled;document.querySelectorAll('[data-install-container]').forEach(el=>el.hidden=hide);if(hide){const help=document.getElementById('installHelp');if(help?.open)help.close()}}
 function showInstallHelp(){
  const ios=/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1),android=/Android/i.test(navigator.userAgent),list=document.getElementById('installSteps');
  const steps=ios?['Открой этот сайт в Safari на телефоне.','Нажми «Поделиться», затем «На экран Домой».','Подтверди добавление и открывай приложение с главного экрана.']:android?['Открой этот сайт в Chrome или Edge на телефоне.','Нажми меню ⋮ и выбери «Установить приложение» или «Добавить на главный экран».','Подтверди установку — значок появится на телефоне.']:['На телефоне открой эту же ссылку в Chrome, Edge или Safari.','На Android: меню ⋮ → «Установить приложение». На iPhone: «Поделиться» → «На экран Домой».','На компьютере приложение можно установить через меню браузера, если он поддерживает установку.'];
  list.replaceChildren(...steps.map(text=>{const li=document.createElement('li');li.textContent=text;return li}));document.getElementById('installHelp').showModal();
 }
 window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();pendingInstall=event;drawInstall()});
 window.addEventListener('appinstalled',()=>{installedHere=true;pendingInstall=null;drawInstall()});
 modes.forEach(mode=>mode.addEventListener?.('change',drawInstall));
 document.querySelectorAll('[data-install-app]').forEach(button=>button.onclick=async()=>{if(runningAsApp()){drawInstall();return}if(pendingInstall){const event=pendingInstall;pendingInstall=null;try{await event.prompt();const choice=await event.userChoice;if(choice.outcome==='accepted')installedHere=true;drawInstall()}catch{showInstallHelp()}}else showInstallHelp()});
 document.getElementById('closeInstallHelp').onclick=()=>document.getElementById('installHelp').close();
 drawInstall();
 if(navigator.getInstalledRelatedApps)navigator.getInstalledRelatedApps().then(apps=>{relatedInstalled=apps.some(app=>app.platform==='webapp'&&((app.url&&new URL(app.url,location.href).origin===location.origin)||(app.id&&new URL(app.id,location.href).origin===location.origin)));drawInstall()}).catch(()=>{});
 if('serviceWorker'in navigator&&window.isSecureContext)navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'}).then(()=>document.documentElement.dataset.pwaReady='true').catch(error=>console.warn('PWA registration:',error.message));
})();
`;
