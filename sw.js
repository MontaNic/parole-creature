/**
 * Service worker: garantisce che il gioco resti giocabile senza connessione.
 *
 * Strategia:
 *  - shell dell'app (html/css/js/json/sprite): pre-cachata all'installazione,
 *    poi "stale-while-revalidate" cosi' un aggiornamento arriva al giro dopo
 *    senza mai lasciare il bambino davanti a una schermata bianca;
 *  - audio: cache-first e cachato al primo ascolto, perche' sono file
 *    immutabili e pesanti da riscaricare;
 *  - tutto il resto: rete, con fallback sulla cache.
 *
 * Alzare CACHE_VERSION a ogni release per invalidare le vecchie cache.
 */

const CACHE_VERSION = 'v1.1.0';
const SHELL_CACHE = `dp-shell-${CACHE_VERSION}`;
const AUDIO_CACHE = `dp-audio-${CACHE_VERSION}`;

const SHELL_ASSETS = [
  './',
  'index.html',
  'style.css',
  'game.js',
  'manifest.webmanifest',
  'content.json',
  'strings.json',
  'assets/img/sprites.svg',
  'js/config.js',
  'js/state.js',
  'js/content-loader.js',
  'js/audio.js',
  'js/srs.js',
  'js/curriculum.js',
  'js/mascot.js',
  'js/effects.js',
  'js/minigames.js',
  'js/missions.js',
  'js/screens.js',
  'js/parents.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      // addAll fallisce in blocco se un file manca: si aggiunge uno per uno.
      .then(cache => Promise.all(
        SHELL_ASSETS.map(url => cache.add(url).catch(err =>
          console.warn('[sw] non cachato:', url, err)))
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== SHELL_CACHE && k !== AUDIO_CACHE)
            .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.includes('/assets/audio/') && url.pathname.endsWith('.mp3')) {
    event.respondWith(cacheFirst(req, AUDIO_CACHE));
    return;
  }

  event.respondWith(staleWhileRevalidate(req, SHELL_CACHE));
});

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    return new Response('', { status: 504, statusText: 'offline' });
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);

  const network = fetch(req)
    .then(res => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => null);

  if (hit) {
    network;   // aggiornamento in sottofondo, senza attendere
    return hit;
  }

  const res = await network;
  if (res) return res;

  // Navigazione offline senza cache: si serve comunque la home.
  if (req.mode === 'navigate') {
    const shell = await cache.match('index.html');
    if (shell) return shell;
  }
  return new Response('', { status: 504, statusText: 'offline' });
}
