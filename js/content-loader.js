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
  /** id -> parola o frase, per accesso diretto */
  byId: new Map(),
  /** worldId -> mondo */
  worldById: new Map()
};

export let strings = {};

/** Insieme dei file audio realmente presenti in assets/audio/. */
export const audioIndex = { files: new Set(), loaded: false };

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

  content.byId.clear();
  for (const w of content.words) content.byId.set(w.id, { ...w, kind: 'word' });
  for (const p of content.phrases) content.byId.set(p.id, { ...p, kind: 'phrase' });

  content.worldById.clear();
  for (const w of content.worlds) content.worldById.set(w.id, w);

  // Lo sprite e' opzionale: se manca, il gioco resta usabile (senza disegni).
  await injectSprites().catch(err => console.warn('[content] sprite non caricato:', err));

  // L'indice audio e' opzionale: se manca si usa sempre la sintesi vocale.
  await loadAudioIndex().catch(() => { /* nessun audio pre-generato */ });

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

/** Mondi effettivamente disponibili viste le impostazioni dei genitori. */
export function availableWorlds(settings) {
  const disabled = new Set(settings.themesDisabled || []);
  return content.worlds.filter(w => {
    if (settings.phasesEnabled && settings.phasesEnabled[w.phase] === false) return false;
    // Un mondo e' nascosto se tutti i suoi item appartengono a temi disattivati.
    const items = w.items.map(getItem).filter(Boolean);
    if (!items.length) return false;
    return items.some(it => !disabled.has(it.theme));
  });
}

/** Item di un mondo, filtrati per temi attivi. */
export function worldItems(world, settings) {
  const disabled = new Set(settings.themesDisabled || []);
  return world.items
    .map(getItem)
    .filter(Boolean)
    .filter(it => !it.theme || !disabled.has(it.theme));
}

/** Elenco dei temi presenti nei contenuti (per l'area genitori). */
export function allThemes() {
  const set = new Set();
  for (const w of content.words) if (w.theme) set.add(w.theme);
  return [...set];
}
