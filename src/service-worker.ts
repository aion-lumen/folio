/// <reference lib="webworker" />

import { build, files, version } from '$service-worker';

declare const self: ServiceWorkerGlobalScope;

const CACHE = `folio-static-${version}`;
const ASSETS = [...build, ...files].filter((path) => !path.endsWith('robots.txt'));

self.addEventListener('install', (event) => {
	event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches.keys().then((keys) =>
			Promise.all(keys.filter((key) => key.startsWith('folio-static-') && key !== CACHE).map((key) => caches.delete(key)))
		)
	);
});

self.addEventListener('fetch', (event) => {
	if (event.request.method !== 'GET') return;
	const url = new URL(event.request.url);
	if (url.origin !== self.location.origin) return;
	if (event.request.mode === 'navigate') {
		event.respondWith(fetch(event.request).catch(async () =>
			(await caches.match('/offline.html')) ?? new Response('Folio ist offline.', { status: 503 })
		));
		return;
	}
	if (!ASSETS.includes(url.pathname)) return;
	event.respondWith(caches.match(event.request).then((cached) => cached ?? fetch(event.request)));
});
