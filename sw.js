/* Service Worker: macht die Workstation offline-fähig.
   Bei Änderungen an den Dateien VERSION hochzählen, damit Nutzer die neue Version bekommen. */
const VERSION = 'tws-v3';
const FILES = ['./','index.html','style.css','data.js','engine.js','ui.js','manifest.webmanifest',
  'icons/icon.svg','icons/icon-192.png','icons/icon-512.png','icons/apple-touch-icon.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Netzwerk zuerst (damit Updates sofort ankommen), Cache als Offline-Fallback
self.addEventListener('fetch', e => {
  if(e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => {
    if(r.ok){ const cp = r.clone(); caches.open(VERSION).then(c => c.put(e.request, cp)); }
    return r;
  }).catch(() => caches.match(e.request, {ignoreSearch:true}).then(r => r || caches.match('index.html'))));
});
