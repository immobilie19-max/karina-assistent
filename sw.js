/* Karina Assistent — Service Worker: App-Dateien für Offline-Betrieb cachen.
   Daten liegen NICHT hier, sondern in localStorage — der Cache betrifft nur den App-Code. */
const CACHE = 'karina-assistent-v1';
const FILES = [
  './',
  './index.html',
  './style.css',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './manifest.webmanifest',
  './js/util.js',
  './js/zip.js',
  './js/store.js',
  './js/app.js',
  './js/dictate.js',
  './js/inbox.js',
  './js/overview.js',
  './js/tasks.js',
  './js/kanban.js',
  './js/calendar.js',
  './js/notes.js',
  './js/timer.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Netz zuerst (damit Updates ankommen), Cache als Offline-Fallback
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
