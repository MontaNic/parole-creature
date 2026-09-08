/**
 * Caricamento dei dati esterni: contenuti didattici, testi UI e sprite SVG.
 * Tutto viene letto una volta sola all'avvio e tenuto in memoria.
 */

import { CONFIG } from './config.js';

export const content = {
  raw: null,
  words: [],
  phrases: [],
  worlds: [],
  creatures: [],
  phases: [],
  missions: [],
  ebooks: [],
  media: [],
  mascotStages: [],
  structures: [],
  /** structureId -> struttura linguistica */
  structureById: new Map(),
  /** id -> parola o frase, per accesso diretto */
  byId: new Map(),
  /** worldId -> mondo */
  worldById: new Map()
};

export let strings = {};

/** Insieme dei file audio realmente presenti in assets/audio/. */
export const audioIndex = { files: new Set(), loaded: false };

/**
 * Sprite che hanno un'illustrazione in assets/img/art/.
 * Gli altri — numeri, colori, icone, plurali — restano simboli SVG.
 */
export const artIndex = { sprites: new Set(), loaded: false };

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

export async function loadAll() {
  const [contentJson, stringsJson] = await Promise.all([
    fetchJson(CONFIG.contentUrl),
    fetchJson(CONFIG.stringsUrl)
  ]);

  strings = stringsJson;

  content.raw = contentJson;
  content.words = contentJson.words || [];
  content.phrases = contentJson.phrases || [];
  content.worlds = (contentJson.worlds || []).slice().sort((a, b) => a.order - b.order);
  content.creatures = contentJson.creatures || [];
  content.phases = contentJson.phases || [];
  content.missions = contentJson.dailyMissions || [];
  content.ebooks = (contentJson.miniEbooks || []).slice().sort((a, b) => a.order - b.order);
  content.media = contentJson.mediaRecommendations || [];
  content.mascotStages = (contentJson.mascotStages || []).slice().sort((a, b) => a.level - b.level);
  content.story = contentJson.story || null;
  content.stickers = contentJson.stickers || null;
  content.dialogues = (contentJson.dialogues && contentJson.dialogues.items) || [];
  content.structures = contentJson.structures || [];

  content.byId.clear();
  for (const w of content.words) content.byId.set(w.id, { ...w, kind: 'word' });
  for (const p of content.phrases) content.byId.set(p.id, { ...p, kind: 'phrase' });

  content.worldById.clear();
  for (const w of content.worlds) content.worldById.set(w.id, w);

  content.structureById.clear();
  for (const st of content.structures) content.structureById.set(st.id, st);

  // Lo sprite e' opzionale: se manca, il gioco resta usabile (senza disegni).
  await injectSprites().catch(err => console.warn('[content] sprite non caricato:', err));

  // L'indice audio e' opzionale: se manca si usa sempre la sintesi vocale.
  await loadAudioIndex().catch(() => { /* nessun audio pre-generato */ });

  // Anche l'indice delle illustrazioni e' opzionale: senza, si disegna tutto
  // con i simboli SVG, che restano nel progetto come rete di sicurezza.
  await loadArtIndex().catch(() => { /* nessuna illustrazione generata */ });

  return { content, strings };
}

async function injectSprites() {
  const res = await fetch(CONFIG.spritesUrl, { cache: 'force-cache' });
  if (!res.ok) throw new Error(`sprites: HTTP ${res.status}`);
  const svgText = await res.text();
  const host = document.getElementById('sprite-host');
  if (host) host.innerHTML = svgText;
}

async function loadAudioIndex() {
  const res = await fetch(CONFIG.audioIndexUrl, { cache: 'no-cache' });
  if (!res.ok) throw new Error('nessun indice audio');
  const data = await res.json();
  const files = Array.isArray(data) ? data : (data.files || []);
  audioIndex.files = new Set(files);
  audioIndex.loaded = true;
}

async function loadArtIndex() {
  const res = await fetch(CONFIG.artIndexUrl, { cache: 'no-cache' });
  if (!res.ok) throw new Error('nessun indice illustrazioni');
  const data = await res.json();
  artIndex.sprites = new Set(data.sprites || []);
  artIndex.loaded = true;
}

/* ------------------------------------------------------------------ */
/* Accesso ai testi UI                                                 */
/* ------------------------------------------------------------------ */

/**
 * Legge una stringa con notazione a punti, es. t('parents.title').
 * Se manca restituisce la chiave stessa: gli errori restano visibili
 * in sviluppo senza rompere il gioco.
 */
export function t(path, fallback) {
  const parts = path.split('.');
  let node = strings;
  for (const p of parts) {
    if (node && typeof node === 'object' && p in node) node = node[p];
    else return fallback !== undefined ? fallback : path;
  }
  return node;
}

/**
 * Popola tutti gli elementi con attributo data-str nel markup statico.
 * Se strings.json non e' stato caricato non tocca nulla: nel markup c'e'
 * gia' un testo italiano di ripiego (serve alla schermata di errore).
 */
export function applyStaticStrings(root = document) {
  if (!strings || !strings.ui) return;
  root.querySelectorAll('[data-str]').forEach(el => {
    el.textContent = t(el.getAttribute('data-str'));
  });
}

/* ------------------------------------------------------------------ */
/* Selezione di contenuti                                              */
/* ------------------------------------------------------------------ */

export function getItem(id) {
  return content.byId.get(id) || null;
}

/** Testo inglese di una parola o frase. */
export function englishOf(item) {
  return item ? item.en : '';
}

/**
 * Nota: quali unita' siano giocabili, quali item entrino in una partita e
 * quando si apre una fase NON si decide qui. Sono regole di curriculum e
 * stanno in js/curriculum.js.
 */

/** Struttura linguistica per id. */
export function getStructure(id) {
  return content.structureById.get(id) || null;
}

/** Le strutture linguistiche insegnate da un'unita'. */
export function structuresOf(world) {
  return (world.structureIds || []).map(getStructure).filter(Boolean);
}

/** Descrizione della fase. */
export function getPhase(id) {
  return content.phases.find(p => p.id === id) || null;
}

/** Elenco dei temi presenti nei contenuti (per l'area genitori). */
export function allThemes() {
  const set = new Set();
  for (const w of content.words) if (w.theme) set.add(w.theme);
  return [...set];
}
