/**
 * MNH RCH - Service Worker (offline shell)
 * Network-first for pages (so updates still arrive),
 * cache fallback when the connection is lost (Safari resilience).
 */
var CACHE = 'mnh-shell-v1';

var SHELL = [
    '/index.html',
    '/style.css',
    '/responsive.css',
    '/mega-brain.js',
    '/manifest.json',
    '/register.html',
    '/mother-login.html',
    '/mother-dashboard.html',
    '/patient-actions.js'
];

self.addEventListener('install', function (event) {
    event.waitUntil(
        caches.open(CACHE).then(function (cache) {
            return cache.addAll(SHELL);
        }).then(function () {
            return self.skipWaiting();
        })
    );
});

self.addEventListener('activate', function (event) {
    event.waitUntil(
        caches.keys().then(function (keys) {
            return Promise.all(keys.filter(function (k) {
                return k !== CACHE;
            }).map(function (k) {
                return caches.delete(k);
            }));
        }).then(function () {
            return self.clients.claim();
        })
    );
});

self.addEventListener('fetch', function (event) {
    var request = event.request;
    if (request.method !== 'GET') return;

    var url = new URL(request.url);
    // Never intercept Supabase API or cross-origin fonts
    if (url.origin !== self.location.origin) return;

    // Page navigations: try network first, fall back to cache on connection loss
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request).then(function (response) {
                var copy = response.clone();
                caches.open(CACHE).then(function (cache) { cache.put(request, copy); });
                return response;
            }).catch(function () {
                return caches.match(request).then(function (matched) {
                    return matched || caches.match('/index.html');
                });
            })
        );
        return;
    }

    // Static assets: cache first, refresh in background
    event.respondWith(
        caches.match(request).then(function (matched) {
            if (matched) return matched;
            return fetch(request).then(function (response) {
                var copy = response.clone();
                caches.open(CACHE).then(function (cache) { cache.put(request, copy); });
                return response;
            });
        })
    );
});
