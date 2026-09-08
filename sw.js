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

const CACHE_VERSION = 'v1.9.0';
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
const TENTATIVI = 3;
const pausa = (ms) => new Promise(r => setTimeout(r, ms));

/** Una promessa con un limite di tempo: se scade, rifiuta. */
function conTimeout(promessa, ms, cosa) {
  let timer;
  const limite = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`timeout ${cosa}`)), ms); });
  return Promise.race([promessa, limite]).finally(() => clearTimeout(timer));
}

/**
 * Un file, con tre tentativi. Tutto il lavoro (fetch + scrittura in cache)
 * ha un limite di tempo: sulla CDN un fetch, o la lettura del suo corpo,
 * puo' restare appeso per sempre, e con Promise.all un solo file appeso
 * bloccava l'intero rabbocco.
 */
async function aggiungi(cache, url) {
  let ultimo = null;
  for (let t = 1; t <= TENTATIVI; t++) {
    const ctrl = new AbortController();
    try {
      await conTimeout((async () => {
        const res = await fetch(url, { signal: ctrl.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await cache.put(url, res);
      })(), 15000, url);
      return true;
    } catch (err) {
      ctrl.abort();
      ultimo = err;
      self.__errori = self.__errori || [];
      if (self.__errori.length < 60) self.__errori.push(`${url}: ${err && err.message}`);
      await pausa(300 * t);
    }
  }
  console.warn('[sw] non cachato:', url, ultimo);
  return false;
}

async function inCoda(cache, urls) {
  let falliti = 0;
  for (let i = 0; i < urls.length; i += PARALLELE) {
    const esiti = await Promise.all(urls.slice(i, i + PARALLELE).map(url => aggiungi(cache, url)));
    falliti += esiti.filter(ok => !ok).length;
  }
  return falliti;
}

// Diagnostica: la pagina puo' chiedere al worker gli errori dell'ultimo precache.
self.addEventListener('message', (event) => {
  if (event.data === 'errori-precache') event.source?.postMessage({ erroriPrecache: self.__errori || [] });
});

async function precache() {
  const cache = await caches.open(SHELL_CACHE);
  // Solo la shell: senza, il gioco non parte proprio. E' poco e veloce, quindi
  // l'installazione non puo' fallire per durata. Le illustrazioni arrivano
  // subito dopo, a pezzi, con il rabbocco guidato dalla pagina.
  await inCoda(cache, SHELL_ASSETS);
}

/**
 * Rabbocco a pezzi.
 *
 * Perche' non tutto nell'install: con 200+ illustrazioni l'evento di
 * installazione durava troppo e Chrome lo abbatteva ("failed to install,
 * unknown reason"), lasciando la cache a meta' e la registrazione nulla.
 * Ora ogni chiamata scarica al massimo LOTTO file mancanti e risponde con
 * quanti ne restano; la pagina la richiama finche' non restano zero. Ogni
 * evento e' breve, ogni file ha tre tentativi, e un'apertura successiva
 * riprende da dove si era arrivati.
 */
const LOTTO = 24;
let rabboccoInCorso = null;
function topUp() {
  if (rabboccoInCorso) return rabboccoInCorso;
  rabboccoInCorso = (async () => {
    try {
      const cache = await caches.open(SHELL_CACHE);
      const voluti = [...SHELL_ASSETS, ...(self.ART_ASSETS || [])];
      const presenti = new Set((await cache.keys()).map(r => r.url));
      const mancanti = voluti.filter(u => !presenti.has(new URL(u, self.location.href).href));
      if (!mancanti.length) return { mancanti: 0, totale: voluti.length };
      let falliti = 0;
      try {
        falliti = await conTimeout(inCoda(cache, mancanti.slice(0, LOTTO)), 60000, 'giro di rabbocco');
      } catch (err) {
        console.warn('[sw]', err.message);
        falliti = LOTTO;   // non si sa quanti: si ricontera' al giro dopo
      }
      return { mancanti: Math.max(0, mancanti.length - LOTTO) + falliti, totale: voluti.length };
    } catch (err) {
      console.warn('[sw] rabbocco fallito:', err);
      return { mancanti: -1, totale: 0 };
    } finally {
      rabboccoInCorso = null;
    }
  })();
  return rabboccoInCorso;
}

/**
 * Il rabbocco completo: un giro dopo l'altro finche' non manca nulla, entro
 * un tetto di tempo. Sta dentro un solo evento del worker, cosi' non
 * dipende dai timer della pagina, che il browser rallenta quando la scheda
 * e' ferma o in secondo piano. Dopo ogni giro avvisa la pagina.
 */
async function topUpAll(client, tettoMs = 240000) {
  const inizio = Date.now();
  let esito = await topUp();
  while (esito.mancanti > 0 && Date.now() - inizio < tettoMs) {
    client?.postMessage({ rabbocco: esito });
    await pausa(150);
    const prima = esito.mancanti;
    esito = await topUp();
    // Se un giro non ha portato nulla (tutti falliti), una pausa prima del prossimo.
    if (esito.mancanti >= prima) await pausa(3000);
  }
  client?.postMessage({ rabbocco: esito });
  return esito;
}

self.addEventListener('message', (event) => {
  if (event.data === 'errori-precache') event.source?.postMessage({ erroriPrecache: self.__errori || [] });
  if (event.data === 'rabbocca') event.waitUntil(topUpAll(event.source));
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

  // A ogni apertura del gioco, un rabbocco in sottofondo: non blocca la pagina.
  if (req.mode === 'navigate') event.waitUntil(topUpAll(null));

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
