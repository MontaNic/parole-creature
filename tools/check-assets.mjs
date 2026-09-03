#!/usr/bin/env node
/**
 * Integrita' degli asset grafici.
 *
 * Verifica, senza browser e in un secondo, che ogni immagine che il gioco
 * puo' chiedere esista davvero e sia raggiungibile anche senza rete.
 *
 * Nasce da un bug trovato durante il playtest su iPad: card con l'icona di
 * immagine rotta. Un controllo del genere lo avrebbe fermato prima che
 * arrivasse a un bambino che pensa di aver sbagliato lui.
 *
 * Cinque controlli:
 *   1. ogni sprite citato nei contenuti si risolve — in un PNG o in un
 *      simbolo SVG, ma qualcosa deve esserci;
 *   2. l'indice delle illustrazioni e i file su disco coincidono, nei due sensi;
 *   3. i <use> dentro sprites.svg puntano a simboli che esistono;
 *   4. la lista di precache del service worker copre TUTTE le illustrazioni:
 *      e' cio' che rende vera la promessa "funziona offline";
 *   5. nessuno sprite e' rimasto a meta' strada, con il singolare in PNG e il
 *      plurale ancora in SVG, che romperebbe il confronto "la stessa cosa,
 *      ma tante" su cui si regge la lezione della -s.
 *
 * Uso:  node tools/check-assets.mjs
 * Esce con codice 1 se anche un solo riferimento e' rotto.
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ART = path.join(ROOT, 'assets', 'img', 'art');

const leggi = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const json = (p) => JSON.parse(leggi(p));

let problemi = 0;
const ok = (t, d = '') => console.log(`  ok  ${t}${d ? '  — ' + d : ''}`);
const ko = (t, d = '') => { problemi++; console.log(`  KO  ${t}${d ? '  — ' + d : ''}`); };

const contenuti = json('content.json');
const sprites = leggi('assets/img/sprites.svg');
// I commenti contengono esempi come <use href="#sp-...">: vanno tolti, o il
// controllo si allarma per un pezzo di documentazione.
const spritesSenzaCommenti = sprites.replace(/<!--[\s\S]*?-->/g, '');
// La lista di precache sta in sw-art.js, generato; sw.js la importa.
const sw = leggi('sw.js') + (existsSync(path.join(ROOT, 'sw-art.js')) ? leggi('sw-art.js') : '');

const simboli = new Set([...sprites.matchAll(/<symbol id="([^"]+)"/g)].map(m => m[1]));
const suDisco = new Set(
  existsSync(ART) ? readdirSync(ART).filter(f => f.endsWith('.png')).map(f => f.slice(0, -4)) : []
);
const indice = new Set(
  existsSync(path.join(ART, 'index.json')) ? json('assets/img/art/index.json').sprites : []
);

/* --- 1. ogni sprite citato nei contenuti si risolve ---------------- */

const citati = new Map();
const cita = (id, dove) => {
  if (id === undefined || id === null || id === '') { ko('sprite mancante', dove); return; }
  if (!citati.has(id)) citati.set(id, []);
  citati.get(id).push(dove);
};
for (const w of contenuti.words) cita(w.sprite, `parola ${w.id}`);
for (const p of contenuti.phrases) cita(p.sprite, `frase ${p.id}`);
for (const w of contenuti.worlds) cita(w.sprite, `unita' ${w.id}`);
for (const c of contenuti.creatures) cita(c.sprite, `creatura ${c.id}`);
for (const m of contenuti.dailyMissions) cita(m.sprite, `missione ${m.id}`);

const irrisolti = [...citati].filter(([id]) => !suDisco.has(id) && !simboli.has(id));
irrisolti.length
  ? ko('sprite citati ma inesistenti', irrisolti.map(([id, d]) => `${id} (${d[0]})`).join(', '))
  : ok(`tutti i ${citati.size} sprite citati nei contenuti si risolvono`);

/* --- 2. indice e disco coincidono --------------------------------- */

const soloIndice = [...indice].filter(i => !suDisco.has(i));
const soloDisco = [...suDisco].filter(i => !indice.has(i));
soloIndice.length ? ko('nell indice ma senza file', soloIndice.join(' ')) : ok('ogni voce dell indice ha il suo PNG');
soloDisco.length ? ko('PNG presenti ma fuori dall indice', soloDisco.join(' ')) : ok('ogni PNG e nell indice');

/* --- 3. i <use> interni allo sprite puntano a qualcosa ------------- */

const rottiInterni = [...spritesSenzaCommenti.matchAll(/<use href="#([^"]+)"/g)]
  .map(m => m[1]).filter(id => !simboli.has(id));
rottiInterni.length
  ? ko('<use> verso simboli inesistenti', [...new Set(rottiInterni)].join(' '))
  : ok('i riferimenti interni a sprites.svg sono validi');

/* --- 4. il service worker precacha TUTTE le illustrazioni ---------- */

const nelSw = new Set(
  [...sw.matchAll(/assets\/img\/art\/([A-Za-z0-9_-]+)\.png/g)].map(m => m[1])
);
const fuoriSw = [...suDisco].filter(i => !nelSw.has(i));
fuoriSw.length
  ? ko(`${fuoriSw.length} illustrazioni non sono nella lista di precache`,
       fuoriSw.slice(0, 8).join(' ') + (fuoriSw.length > 8 ? ' …' : ''))
  : ok(`la lista di precache copre tutte le ${suDisco.size} illustrazioni`);

/* --- 5. nessun plurale rimasto indietro rispetto al singolare ------ */

const PLURALI = {
  'sp-cats': 'sp-cat', 'sp-stars': 'sp-star', 'sp-dragons': 'sp-dragon',
  'sp-dinosaurs': 'sp-dinosaur', 'sp-eggs': 'sp-egg'
};
const disallineati = Object.entries(PLURALI)
  .filter(([plur, sing]) => suDisco.has(sing) !== suDisco.has(plur));
disallineati.length
  ? ko('plurale e singolare disegnati in modi diversi',
       disallineati.map(([p, s]) => `${s} e ${p}`).join(', '))
  : ok('ogni plurale e disegnato come il suo singolare');

/* ------------------------------------------------------------------ */

console.log();
if (problemi) {
  console.log(`${problemi} problemi. Il gioco mostrerebbe immagini rotte o non funzionerebbe offline.\n`);
  process.exitCode = 1;
} else {
  console.log('Tutti gli asset grafici sono integri.\n');
}
