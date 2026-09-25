// Keeps La Boîte à Musique on the device so it opens and plays without a connection: the pages
// and scripts on install (fresh from the network when online, from the cache otherwise), the
// notes as they are used, or all of them when the listener asks for offline listening.
const VERSION = 'c454bd8'; // replaced by the deploy script, so a new version replaces the old cache
const SHELL = `lbam-shell-${VERSION}`;
const NOTES = 'lbam-notes'; // notes never change for a given file name: kept across versions

const ShellFiles = [
  './', 'index.html', 'manifest.webmanifest', 'css/fonts.css', 'css/style.css',
  'js/app.js', 'js/player.js', 'js/pieces.js', 'js/universes.js', 'js/i18n.js', 'js/visualizer.js', 'js/mp3-worker.js',
  'audio-worklet.js', 'engine/composer.js', 'engine/cinematic.js', 'engine/chiptune.js', 'engine/synth.js', 'engine/freeverb.js', 'engine/instruments.js', 'engine/mixer.js',
  'engine/notebank.js', 'engine/rng.js', 'engine/styles.js', 'engine/titles.js',
  'vendor/lamejs/lame.min.js', 'notes/manifest.json', 'icons/icon-192.png', 'icons/icon-512.png',
  'fonts/Fraunces-latin-63f165.woff2', 'fonts/Fraunces-latin-ext-1fba8b.woff2',
  'fonts/NunitoSans-latin-4c1772.woff2', 'fonts/NunitoSans-latin-ext-058c9d.woff2',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(ShellFiles)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('lbam-shell-') && key !== SHELL) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.includes('/notes/') && !url.pathname.endsWith('manifest.json')) {
    e.respondWith(cacheFirst(e.request, NOTES));
  } else {
    e.respondWith(networkFirst(e.request));
  }
});

async function cacheFirst(request, name) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) (await caches.open(name)).put(request, response.clone());
  return response;
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) (await caches.open(SHELL)).put(request, response.clone());
    return response;
  } catch {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    throw new Error('offline');
  }
}

// "Available offline": fetches every note not cached yet, reporting progress to the page.
self.addEventListener('message', (e) => {
  if (e.data?.type !== 'cache-all-notes') return;
  e.waitUntil((async () => {
    const manifest = await (await fetch('notes/manifest.json')).json();
    const files = Object.entries(manifest).flatMap(([name, list]) => list.map((f) => `notes/${name}/${f}`));
    const cache = await caches.open(NOTES);
    let done = 0;
    for (const file of files) {
      if (!(await cache.match(file))) {
        const response = await fetch(file);
        if (response.ok) await cache.put(file, response);
      }
      done++;
      e.source?.postMessage({ type: 'notes-progress', done, total: files.length });
    }
  })());
});
