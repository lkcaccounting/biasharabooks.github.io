// Smart Books — Service Worker
// Version: bump this string any time you deploy a new index.html
// so users get the latest version automatically
const CACHE_NAME = 'smartbooks-v3';

// Files to cache for offline use
const CORE_FILES = [
  './',
  './index.html',
];

// ── INSTALL: cache the app shell ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(CORE_FILES))
      .then(() => self.skipWaiting()) // activate immediately, don't wait for old SW to die
  );
});

// ── ACTIVATE: delete old caches from previous versions ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(cacheNames => Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      ))
      .then(() => self.clients.claim()) // take control of all open tabs immediately
  );
});

// ── FETCH: serve from cache, fall back to network, cache new responses ──
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Always go to network for Supabase, Groq, EmailJS, fonts — never cache API calls
  const networkOnly = [
    'supabase.co',
    'groq.com',
    'googleapis.com',
    'emailjs.com',
    'api.safaricom.co.ke',
    'sandbox.safaricom.co.ke',
    'wa.me',
    'fonts.googleapis.com',
  ];
  if (networkOnly.some(domain => url.hostname.includes(domain))) {
    return; // let browser handle normally
  }

  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        if (cachedResponse) {
          // Serve cached version immediately
          // Also fetch fresh version in background to update cache
          fetch(event.request)
            .then(freshResponse => {
              if (freshResponse && freshResponse.ok) {
                caches.open(CACHE_NAME)
                  .then(cache => cache.put(event.request, freshResponse));
              }
            })
            .catch(() => {}); // ignore network errors in background update

          return cachedResponse;
        }

        // Not in cache — fetch from network
        return fetch(event.request)
          .then(response => {
            // Cache successful GET responses for the app itself
            if (response && response.ok && event.request.url.includes(self.location.origin)) {
              const responseClone = response.clone();
              caches.open(CACHE_NAME)
                .then(cache => cache.put(event.request, responseClone));
            }
            return response;
          })
          .catch(() => {
            // Network failed and not in cache
            // For navigation requests, serve the app shell
            if (event.request.mode === 'navigate') {
              return caches.match('./index.html');
            }
            // For everything else, just fail gracefully
            return new Response('Offline', { status: 503, statusText: 'Offline' });
          });
      })
  );
});

// ── MESSAGE: allow app to trigger cache update ──
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
