/**
 * Zibo, la mascotte.
 *
 * E' il filo conduttore del gioco: accoglie, spiega, incoraggia e cresce
 * insieme al bambino. Gli accessori (sciarpa, cappello, corona) compaiono
 * al salire del livello, cosi' il progresso si vede addosso al compagno
 * e non solo in un numero.
 */

import { content, t } from './content-loader.js';
import { speakMascot } from './audio.js';
import { save } from './state.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Stadio di evoluzione corrispondente al livello attuale. */
export function currentStage() {
  const stages = content.mascotStages.length
    ? content.mascotStages
    : [{ level: 1, label_it: 'Cucciolo', scale: 1, accessory: 'none' }];
  let stage = stages[0];
  for (const s of stages) if (save.progress.level >= s.level) stage = s;
  return stage;
}

/** Vero se il livello raggiunto fa scattare un nuovo stadio. */
export function stageChangedAt(level) {
  return content.mascotStages.some(s => s.level === level);
}

/**
 * Disegna Zibo dentro un contenitore.
 * @param {HTMLElement} host
 */
export function renderMascot(host) {
  if (!host) return null;
  const stage = currentStage();
  host.innerHTML = '';

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 108');
  svg.setAttribute('class', 'mascot-anim');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', t('mascot.name', 'Zibo'));

  const group = document.createElementNS(SVG_NS, 'g');
  const s = stage.scale || 1;
  // Scala mantenendo i piedi appoggiati in basso.
  group.setAttribute('transform', `translate(${50 - 50 * s}, ${100 - 100 * s}) scale(${s})`);

  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', '#sp-zibo');
  group.appendChild(use);

  const acc = accessory(stage.accessory);
  if (acc) group.appendChild(acc);

  svg.appendChild(group);
  host.appendChild(svg);
  return svg;
}

function accessory(kind) {
  if (!kind || kind === 'none') return null;
  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('stroke', '#2b2140');
  g.setAttribute('stroke-width', '3.2');
  g.setAttribute('stroke-linejoin', 'round');
  g.setAttribute('stroke-linecap', 'round');

  if (kind === 'scarf') {
    g.innerHTML = `
      <path d="M30 74 c12 8 28 8 40 0 l3 9 c-14 9 -32 9 -46 0Z" fill="#ef4444"/>
      <path d="M66 82 l10 14 -10 3 -5 -14Z" fill="#dc2626"/>`;
  } else if (kind === 'hat') {
    g.innerHTML = `
      <path d="M30 74 c12 8 28 8 40 0 l3 9 c-14 9 -32 9 -46 0Z" fill="#ef4444"/>
      <path d="M22 46 h56 l-6 -8 H28Z" fill="#7c3aed"/>
      <path d="M32 38 c0 -14 36 -14 36 0Z" fill="#8b5cf6"/>
      <circle cx="50" cy="24" r="4" fill="#facc15"/>`;
  } else if (kind === 'crown') {
    g.innerHTML = `
      <path d="M30 74 c12 8 28 8 40 0 l3 9 c-14 9 -32 9 -46 0Z" fill="#ef4444"/>
      <path d="M28 46 L34 26 L42 38 L50 22 L58 38 L66 26 L72 46Z" fill="#facc15"/>
      <circle cx="50" cy="32" r="3" fill="#ef4444"/>`;
  }
  return g;
}

/* ------------------------------------------------------------------ */
/* Voce e fumetto                                                      */
/* ------------------------------------------------------------------ */

let speakToken = 0;

/**
 * Fa parlare Zibo: mostra il fumetto (poche parole, il bambino non legge
 * ancora bene) e riproduce la voce italiana.
 *
 * @param {string} key chiave dentro strings.mascot
 * @param {{bubble?: HTMLElement, avatar?: HTMLElement, vars?: object}} opts
 */
export async function mascotSay(key, opts = {}) {
  const myToken = ++speakToken;
  let text = t(`mascot.${key}`, '');
  if (opts.vars) {
    for (const [k, v] of Object.entries(opts.vars)) {
      text = text.replaceAll(`{${k}}`, v);
    }
  }

  if (opts.bubble) opts.bubble.textContent = text;
  const svg = opts.avatar?.querySelector('svg');
  svg?.classList.add('is-talking');

  await speakMascot(key, text);

  if (myToken === speakToken) svg?.classList.remove('is-talking');
  return text;
}

/** Piccola animazione di gioia (dopo una risposta giusta o uno sblocco). */
export function mascotCheer(host) {
  const svg = host?.querySelector('svg');
  if (!svg) return;
  svg.classList.remove('is-happy');
  void svg.offsetWidth;          // forza il restart dell'animazione
  svg.classList.add('is-happy');
  setTimeout(() => svg.classList.remove('is-happy'), 1400);
}

/** Sceglie a rotazione una delle varianti di incoraggiamento. */
export function encouragementKey(kind, index) {
  const n = 3;
  return `${kind}_${(index % n) + 1}`;
}
