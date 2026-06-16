// SmartRescue PWA Service Worker
const CACHE_NAME = 'smart-rescue-cache-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/api.js',
  '/js/socket.js',
  '/js/app.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

// Install Service Worker and cache shell assets
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing Cache Shell assets...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Use addAll to fetch and cache all specified static files
      // Ignore failures for CDN items to make cache activation robust
      return cache.addAll(STATIC_ASSETS).catch(err => {
        console.warn('[Service Worker] Static caching warning (some assets failed):', err.message);
      });
    })
  );
  // Force immediate activation
  self.skipWaiting();
});

// Clean up old caches on Activation
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating and cleaning old caches...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  // Claim all active clients
  return self.clients.claim();
});

// Fetch Interceptor: Cache-First for static resources, Network-First for others
self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  // Bypass service worker caching for WebSockets (Socket.IO) and API endpoints
  if (requestUrl.pathname.startsWith('/socket.io/') || requestUrl.pathname.startsWith('/api/')) {
    // Network only (do not intercept)
    return;
  }

  // Intercept other requests (HTML, CSS, JS, Icons, Fonts)
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Return cached shell asset
        return cachedResponse;
      }

      // Fallback to Network
      return fetch(event.request).then((networkResponse) => {
        // Check valid response before caching
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }

        // Cache the newly fetched static resource
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return networkResponse;
      }).catch(() => {
        // Offline Fallback for html requests
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});
