/**
 * Regole del curriculum.
 *
 * Qui sta tutto quello che decide COSA il bambino esercita e QUANDO puo'
 * andare avanti. Tenerlo in un modulo unico serve a poter cambiare la
 * didattica senza rovistare nella UI o nei mini-giochi.
 *
 * Tre concetti distinti, che e' facile confondere:
 *
 *   visto        l'item e' comparso almeno una volta
 *   completato   ogni item dell'unita' e' stato indovinato almeno una volta
 *                -> sblocca la creatura-ricompensa e l'unita' successiva
 *   padroneggiato l'item ha raggiunto il box `masteryBox` della ripetizione
 *                spaziata, cioe' e' stato indovinato piu' volte in giorni
 *                diversi -> e' questo che apre la FASE successiva
 *
 * "Completato" e' generoso apposta: nessun bambino deve restare bloccato.
 * "Padroneggiato" e' severo apposta: cambiare fase significa che la fase
 * precedente regge davvero.
 */

import { content, getItem } from './content-loader.js';
import { save } from './state.js';
import { isMastered, hasBeenSeen, timesCorrect } from './srs.js';

const DEFAULTS = {
  masteryBox: 3,
  unitMasteryRatio: 0.8,
  phaseUnlockRatio: 0.8,
  reviewWeight: 0.35,
  minReviewItems: 2,
  maxBuildWords: 6
};

export function curriculumConfig() {
  return { ...DEFAULTS, ...(content.raw?.curriculum || {}) };
}

/* ------------------------------------------------------------------ */
/* Filtri dei genitori                                                 */
/* ------------------------------------------------------------------ */

function themeAllowed(item, settings) {
  if (!item) return false;
  if (!item.theme) return true;
  return !(settings.themesDisabled || []).includes(item.theme);
}

function phaseAllowed(phase, settings) {
  return settings.phasesEnabled?.[phase] !== false;
}

/** Item nuovi di un'unita', al netto dei temi messi in pausa dai genitori. */
export function unitItems(world, settings = save.settings) {
  return (world.newItems || [])
    .map(getItem)
    .filter(it => themeAllowed(it, settings));
}

/**
 * Item di ripasso di un'unita': vengono dalle unita' precedenti indicate in
 * `reviewFrom`. E' la revisione *sistematica* richiesta dal curriculum, che
 * si aggiunge alla ripetizione spaziata (la quale ordina dentro ogni gruppo,
 * ma da sola non garantirebbe che le unita' vecchie tornino mai).
 */
export function unitReviewItems(world, settings = save.settings) {
  const out = [];
  for (const id of world.reviewFrom || []) {
    const prev = content.worldById.get(id);
    if (!prev) continue;
    if (!phaseAllowed(prev.phase, settings)) continue;
    out.push(...unitItems(prev, settings));
  }
  // Si ripassa quello che il bambino ha gia' incontrato. Se non ha ancora
  // visto nulla (unita' saltata dai genitori), si prende tutto: meglio
  // materiale nuovo che una partita vuota.
  const seen = out.filter(it => hasBeenSeen(it.id));
  return seen.length ? seen : out;
}

/** Unita' visibili nel gioco, in ordine, viste le impostazioni dei genitori. */
export function playableUnits(settings = save.settings) {
  return content.worlds.filter(w =>
    phaseAllowed(w.phase, settings) && unitItems(w, settings).length > 0);
}

/* ------------------------------------------------------------------ */
/* Avanzamento                                                         */
/* ------------------------------------------------------------------ */

/**
 * Stato di un'unita'.
 * @returns {{total, seen, done, mastered, ratio, masteryRatio, completed, plays}}
 */
export function unitProgress(world, settings = save.settings) {
  const items = unitItems(world, settings);
  const done = items.filter(it => timesCorrect(it.id) > 0).length;
  const mastered = items.filter(it => isMastered(it.id)).length;
  const rec = save.progress.worlds[world.id] || {};
  return {
    total: items.length,
    seen: items.filter(it => hasBeenSeen(it.id)).length,
    done,
    mastered,
    ratio: items.length ? done / items.length : 0,
    masteryRatio: items.length ? mastered / items.length : 0,
    completed: items.length > 0 && done === items.length,
    plays: rec.plays || 0
  };
}

/** Stato aggregato di una fase: e' su questo che si decide se aprirla o no. */
export function phaseProgress(phase, settings = save.settings) {
  const units = content.worlds.filter(w => w.phase === phase);
  let total = 0;
  let mastered = 0;
  let done = 0;
  for (const w of units) {
    const p = unitProgress(w, settings);
    total += p.total;
    mastered += p.mastered;
    done += p.done;
  }
  const { phaseUnlockRatio } = curriculumConfig();
  const ratio = total ? mastered / total : 0;
  return {
    phase,
    units: units.length,
    total,
    done,
    mastered,
    ratio,
    /** Quanti item mancano per raggiungere la soglia. */
    missing: Math.max(0, Math.ceil(total * phaseUnlockRatio) - mastered),
    reached: total > 0 && ratio >= phaseUnlockRatio
  };
}

/** Le fasi giocabili presenti nei contenuti (esclude quelle solo-genitori). */
export function playablePhases() {
  const set = new Set(content.worlds.map(w => w.phase));
  return [...set].sort((a, b) => a - b);
}

/**
 * Una fase si apre solo dimostrando padronanza sulla precedente.
 * I genitori possono scavalcare la soglia dall'area dedicata.
 */
export function isPhaseUnlocked(phase, settings = save.settings) {
  if (settings.unlockAllPhases) return true;
  const phases = playablePhases();
  const idx = phases.indexOf(phase);
  if (idx <= 0) return true;
  return phaseProgress(phases[idx - 1], settings).reached;
}

/**
 * Un'unita' si apre se la sua fase e' aperta e l'unita' precedente della
 * stessa fase e' stata completata (o giocata 3 volte: una parola ostica non
 * deve poter bloccare tutto il gioco).
 */
export function isUnitUnlocked(world, settings = save.settings) {
  if (!isPhaseUnlocked(world.phase, settings)) return false;
  const siblings = playableUnits(settings).filter(w => w.phase === world.phase);
  const idx = siblings.findIndex(w => w.id === world.id);
  if (idx <= 0) return true;
  const prev = unitProgress(siblings[idx - 1], settings);
  return prev.completed || prev.plays >= 3;
}

/**
 * Perche' un'unita' e' chiusa, in forma utilizzabile dalla UI.
 * @returns {{locked:boolean, reason:''|'phase'|'unit', missing:number}}
 */
export function lockInfo(world, settings = save.settings) {
  if (!isPhaseUnlocked(world.phase, settings)) {
    const phases = playablePhases();
    const prev = phases[phases.indexOf(world.phase) - 1];
    return { locked: true, reason: 'phase', missing: phaseProgress(prev, settings).missing };
  }
  if (!isUnitUnlocked(world, settings)) {
    return { locked: true, reason: 'unit', missing: 0 };
  }
  return { locked: false, reason: '', missing: 0 };
}

/** L'unita' che il bambino dovrebbe giocare adesso. */
export function currentUnit(settings = save.settings) {
  const units = playableUnits(settings).filter(w => isUnitUnlocked(w, settings));
  return units.find(w => !unitProgress(w, settings).completed) || units[units.length - 1] || null;
}

/* ------------------------------------------------------------------ */
/* Composizione della partita                                          */
/* ------------------------------------------------------------------ */

/**
 * Divide le domande di una partita fra materiale nuovo e ripasso.
 *
 * @param {object} world unita' da giocare
 * @param {number} total numero di domande della partita
 * @returns {{newItems:Array, reviewItems:Array, newCount:number, reviewCount:number}}
 */
export function splitRound(world, total, settings = save.settings) {
  const cfg = curriculumConfig();
  const weight = typeof world.reviewWeight === 'number' ? world.reviewWeight : cfg.reviewWeight;

  const fresh = unitItems(world, settings);
  const review = unitReviewItems(world, settings);

  if (!review.length) {
    return { newItems: fresh, reviewItems: [], newCount: Math.min(total, fresh.length || total), reviewCount: 0 };
  }

  let reviewCount = Math.max(cfg.minReviewItems, Math.round(total * weight));
  reviewCount = Math.min(reviewCount, review.length, total - 1);
  let newCount = total - reviewCount;

  // Se l'unita' ha meno item nuovi delle domande previste, il resto va al
  // ripasso invece di ripetere tre volte la stessa parola nuova.
  if (fresh.length && newCount > fresh.length) {
    newCount = fresh.length;
    reviewCount = Math.min(total - newCount, review.length);
  }

  return { newItems: fresh, reviewItems: review, newCount, reviewCount };
}

/**
 * Pool del ripasso libero: tutto quello che il bambino ha gia' incontrato
 * nelle unita' aperte, con la precedenza a cio' che non e' ancora solido.
 */
export function freeReviewPool(settings = save.settings) {
  const units = playableUnits(settings).filter(w => isUnitUnlocked(w, settings));
  const all = units.flatMap(w => unitItems(w, settings));
  const seen = all.filter(it => hasBeenSeen(it.id));
  if (!seen.length) return all;
  const shaky = seen.filter(it => !isMastered(it.id));
  return shaky.length >= 4 ? shaky : seen;
}
