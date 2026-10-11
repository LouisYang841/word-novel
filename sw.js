// sw.js — 网络优先的 service worker：保证刷新后总是拿到最新静态资源，
// 断网时回退缓存。跨域请求（AI API）不拦截。
const CACHE = 'wn-cache-v1';

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c =>
    c.addAll(['./', './index.html']).catch(() => {})
  ));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) {
      if (k !== CACHE) await caches.delete(k);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // AI API 等跨域请求直连
  e.respondWith((async () => {
    try {
      const fresh = await fetch(e.request);
      caches.open(CACHE).then(c => c.put(e.request, fresh.clone())).catch(() => {});
      return fresh;
    } catch {
      const cached = await caches.match(e.request);
      if (cached) return cached;
      throw new Error('offline');
    }
  })());
});
