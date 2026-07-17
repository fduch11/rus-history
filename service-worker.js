'use strict';

const CACHE_PREFIX = 'rus-history-';
const CACHE_VERSION = 'v2';
const CACHE_NAME = `${CACHE_PREFIX}${CACHE_VERSION}`;

const LOCAL_RESOURCES = Object.freeze([
  './',
  './index.html',
  './manifest.webmanifest',
  './style.css',
  './daily-event.css',
  './quiz.css',
  './map.css',
  './reading-settings.css',
  './accessibility.css',
  './data.js',
  './event-details.js',
  './illustrations.js',
  './app.js',
  './navigation.js',
  './modal-details.js',
  './direct-links.js',
  './progress.js',
  './daily-event.js',
  './quiz.js',
  './map.js',
  './reading-settings.js',
  './accessibility.js',
  './pwa.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './images/fallback.svg',
  './images/history.svg',
  './images/862-rurik.svg',
  './images/988-baptism.svg',
  './images/1242-ice-battle.svg',
  './images/1380-kulikovo.svg',
  './images/1703-petersburg.svg',
  './images/1812-war.svg',
  './images/1945-victory.svg',
  './images/ancient-city.svg',
  './images/mongol-invasion.svg',
  './images/moscow-kremlin.svg',
  './images/kazan.svg',
  './images/time-of-troubles.svg',
  './images/empire.svg',
  './images/revolution.svg',
  './images/space.svg'
]);

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(LOCAL_RESOURCES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then(cached => {
      if (cached) return cached;
      if (event.request.mode === 'navigate') return caches.match('./index.html');
      return Response.error();
    })
  );
});
