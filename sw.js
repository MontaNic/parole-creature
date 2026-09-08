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

/*
 * Elenco delle illustrazioni, generato da tools/remove-bg.py.
 * importScripts e' sincrono e avviene prima dell'evento install: quando
 * serve, self.ART_ASSETS c'e' gia'.
 */
importScripts('sw-art.js');

const CACHE_VERSION = 'v1.7.8';
const SHELL_CACHE = `dp-shell-${CACHE_VERSION}`;
const AUDIO_CACHE = `dp-audio-${CACHE_VERSION}`;

const SHELL_ASSETS = [
  './',
  'index.html',
  'design-system.css',
  'style.css',
  'assets/fonts/fredoka-variable.woff2',
  'assets/fonts/andika-400.woff2',
  'assets/fonts/andika-700.woff2',
  'game.js',
  'manifest.webmanifest',
  'content.json',
  'strings.json',
  'assets/img/sprites.svg',
  'assets/img/art/index.json',
  'sw-art.js',
  'manifest.webmanifest',
  'assets/img/icon.svg',
  'assets/img/icons/apple-touch-icon.png',
  'assets/img/icons/icon-192.png',
  'assets/img/icons/icon-512.png',
  'assets/img/icons/icon-512-maskable.png',
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
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

/** Quante richieste tenere in volo insieme durante il precache. */
const PARALLELE = 6;

/**
 * Scarica in cache a piccoli gruppi invece che tutto insieme.
 *
 * Con una Promise.all su una settantina di file il browser apre decine di
 * connessioni contemporanee. Su un tablet in wifi, contro un server casalingo,
 * questo non solo rallenta l'installazione: affama anche le richieste che la
 * pagina sta facendo in quel momento per mostrare le sue immagini, che
 * scadono e diventano l'icona di immagine rotta.
 * Sei alla volta e' abbastanza per essere veloce e poco per dare fastidio.
 */
async function inCoda(cache, urls) {
  let falliti = 0;
  for (let i = 0; i < urls.length; i += PARALLELE) {
    await Promise.all(urls.slice(i, i + PARALLELE).map(url =>
      cache.add(url).catch(err => {
        falliti++;
        console.warn('[sw] non cachato:', url, err);
      })
    ));
  }
  return falliti;
}

async function precache() {
  const cache = await caches.open(SHELL_CACHE);

  // Prima la shell: senza, il gioco non parte proprio.
  await inCoda(cache, SHELL_ASSETS);

  /*
   * Poi le illustrazioni, tutte, dalla lista generata in sw-art.js.
   * Entrano in cache all'installazione e non al primo uso come gli audio: se
   * manca un audio il gioco ripiega sulla sintesi vocale, se manca
   * un'illustrazione la card resta vuota e la domanda diventa impossibile.
   */
  const arte = self.ART_ASSETS || [];
  const falliti = await inCoda(cache, arte);
  console.log(`[sw] illustrazioni in cache: ${arte.length - falliti}/${arte.length}`);
}

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
