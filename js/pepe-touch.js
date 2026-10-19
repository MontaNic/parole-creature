/**
 * Toccare Pepe.
 *
 * Un bambino di 7 anni, la prima cosa che fa con la mascotte, e' toccarla:
 * prima non succedeva niente. Ora, nei momenti di pausa (home e riepilogo,
 * mai durante una domanda):
 *  - a ogni tocco una mossa breve, mai la stessa due volte di fila: salto,
 *    dondolio, giravolta, testa inclinata, coccola con i cuori;
 *  - ogni tanto Pepe dice una frase breve ("Sono molto carina!");
 *  - cinque tocchi veloci: il solletico, Pepe si rotola e ride;
 *  - tanti tocchi di fila: il pisolino. Pepe si addormenta un attimo e si
 *    risveglia da solo. Il tocco resta un gioco, non una raffica.
 *
 * Pepe non parla MAI sopra se stessa: finche' una sua battuta e' in corso
 * (questa o qualunque altra, come il saluto della home) i tocchi fanno solo
 * le mosse, non interrompono e non fanno partire un'altra frase.
 *
 * Pepe e' un unico disegno: si muove tutto il corpo, non coda e orecchie.
 */

import { sfxBoing } from './audio.js';
import { mascotSay } from './mascot.js';

const MOSSE = ['pt-jump', 'pt-wag', 'pt-spin', 'pt-tilt', 'pt-love'];
const DURATA = { 'pt-jump': 650, 'pt-wag': 750, 'pt-spin': 750, 'pt-tilt': 950, 'pt-love': 700, 'pt-tickle': 1700 };

/** Le frasi da tocco (chiavi in strings.mascot). */
export const FRASI = ['touch_1', 'touch_2', 'touch_3', 'touch_4', 'touch_5', 'touch_6', 'touch_7', 'touch_8'];
/**
 * La frase preferita (scelta dai genitori): esce piu' spesso delle altre,
 * circa una volta su due, ma mai due volte di fila.
 */
export const FRASE_PREFERITA = 'touch_1';
const PESO_PREFERITA = 0.6;

/**
 * Quale frase dire. Pura, per il test.
 * @param {string} ultima la frase detta l'ultima volta
 */
export function scegliFrase(ultima, rng = Math.random) {
  if (ultima !== FRASE_PREFERITA && rng() < PESO_PREFERITA) return FRASE_PREFERITA;
  const altre = FRASI.filter(k => k !== FRASE_PREFERITA && k !== ultima);
  return altre[Math.floor(rng() * altre.length)];
}

/** In media una frase ogni tre tocchi: di piu' sarebbe una chiacchierata continua. */
const PROBABILITA_FRASE = 0.5;
/** Il solletico: tanti tocchi in poco tempo. */
const SOLLETICO = { tocchi: 5, ms: 2500 };
/** Il pisolino: troppi tocchi di fila. */
// 20 tocchi in 15 secondi e' una raffica vera: con un tocco al secondo
// (gioco tranquillo) Pepe non deve addormentarsi.
const PISOLINO = { tocchi: 20, ms: 15000, dura: 4500 };

let ultimaMossa = '';
let ultimaFrase = '';
const tocchi = [];          // istanti degli ultimi tocchi
let dormeFinoA = 0;
let daUltimaFrase = 0;
let parlaDaSola = false;    // una frase da tocco e' in corso

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

/**
 * Sceglie cosa fa Pepe a questo tocco. Pura (orologio e caso iniettati),
 * per il test.
 * @param {number[]} storia istanti dei tocchi, compreso quello attuale
 * @param {{ora:number, daUltimaFrase:number, parlando:boolean, rng:()=>number}} s
 * @returns {'nap'|'tickle'|'talk'|'move'}
 */
export function cosaFa(storia, { ora, daUltimaFrase: df, parlando, rng = Math.random }) {
  const recenti = (ms) => storia.filter(t => ora - t <= ms).length;
  if (recenti(PISOLINO.ms) >= PISOLINO.tocchi) return 'nap';
  if (recenti(SOLLETICO.ms) >= SOLLETICO.tocchi) return 'tickle';
  // Mai sopra se stessa, e mai al primo tocco.
  if (!parlando && df >= 2 && rng() < PROBABILITA_FRASE) return 'talk';
  return 'move';
}

function anima(svg, cls) {
  svg.classList.remove(...MOSSE, 'pt-tickle');
  void svg.getBoundingClientRect();
  svg.classList.add(cls);
  setTimeout(() => svg.classList.remove(cls), DURATA[cls] || 800);
}

/** Particelle (cuori, stelle, zzz) che salgono dal punto in cui sta Pepe. */
function particelle(host, simbolo, quante, cls) {
  const r = host.getBoundingClientRect();
  for (let i = 0; i < quante; i++) {
    const p = el('span', `pt-particle ${cls}`, simbolo);
    p.style.left = `${r.left + r.width * (0.3 + Math.random() * 0.4)}px`;
    p.style.top = `${r.top + r.height * 0.25}px`;
    p.style.animationDelay = `${i * 140}ms`;
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 1800 + i * 140);
  }
}

/**
 * Pepe dice una frase, solo se nessuna sua battuta e' gia' in corso.
 * @returns {boolean} se ha parlato
 */
function dici(host, bubble, key) {
  const svg = host.querySelector('svg');
  if (parlaDaSola || svg?.classList.contains('is-talking')) return false;
  parlaDaSola = true;
  daUltimaFrase = 0;
  mascotSay(key, { bubble, avatar: host }).finally(() => { parlaDaSola = false; });
  return true;
}

/**
 * Rende Pepe toccabile dentro un contenitore (dopo renderMascot).
 * @param {HTMLElement} host
 * @param {{bubble?: HTMLElement}} opts il fumetto dove scrivere le frasi
 */
export function rendiToccabile(host, { bubble } = {}) {
  if (!host || host.dataset.toccabile) return;
  host.dataset.toccabile = '1';
  host.classList.add('pt-host');
  host.addEventListener('click', () => {
    const svg = host.querySelector('svg');
    if (!svg) return;
    const ora = Date.now();
    if (ora < dormeFinoA) return;   // dorme: i tocchi non la svegliano
    tocchi.push(ora);
    while (tocchi.length && ora - tocchi[0] > PISOLINO.ms) tocchi.shift();
    daUltimaFrase += 1;

    const parlando = parlaDaSola || svg.classList.contains('is-talking');
    const scelta = cosaFa(tocchi, { ora, daUltimaFrase, parlando });

    if (scelta === 'nap') {
      tocchi.length = 0;
      dormeFinoA = ora + PISOLINO.dura;
      dici(host, bubble, 'touch_nap');
      svg.classList.add('pt-nap');
      particelle(host, 'z', 3, 'is-zzz');
      const zzz = setInterval(() => particelle(host, 'z', 2, 'is-zzz'), 1400);
      setTimeout(() => { clearInterval(zzz); svg.classList.remove('pt-nap'); anima(svg, 'pt-jump'); sfxBoing(); }, PISOLINO.dura);
      return;
    }
    if (scelta === 'tickle') {
      tocchi.length = 0;
      anima(svg, 'pt-tickle');
      sfxBoing(); setTimeout(sfxBoing, 300); setTimeout(sfxBoing, 600);
      particelle(host, '★', 4, 'is-star');
      dici(host, bubble, 'touch_tickle');
      return;
    }
    if (scelta === 'talk') {
      const frase = scegliFrase(ultimaFrase);
      if (dici(host, bubble, frase)) ultimaFrase = frase;
    }
    const mosse = MOSSE.filter(m => m !== ultimaMossa);
    const mossa = mosse[Math.floor(Math.random() * mosse.length)];
    ultimaMossa = mossa;
    anima(svg, mossa);
    sfxBoing();
    if (mossa === 'pt-love') particelle(host, '♥', 3, 'is-heart');
  });
}
