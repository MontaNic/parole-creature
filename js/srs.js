/**
 * Ripetizione spaziata semplificata (sistema di Leitner a box).
 *
 * Idea: ogni parola/frase sta in un "box". Rispondere bene la fa salire di
 * box (e la fa ricomparire piu' tardi), sbagliare la riporta al box 0
 * (ricompare subito). Nessun algoritmo complesso: a 7 anni conta che le
 * parole sbagliate tornino presto e quelle sapute non annoino.
 */

import { CONFIG } from './config.js';
import { content } from './content-loader.js';
import { save, persist, dayIndex } from './state.js';

/**
 * Box da cui un item conta come padroneggiato. Il curriculum in content.json
 * ha l'ultima parola; CONFIG e' solo il ripiego.
 */
function masteryBox() {
  return content.raw?.curriculum?.masteryBox ?? CONFIG.masteryBox;
}

/** Restituisce (creandolo se serve) lo stato SRS di un item. */
export function trackOf(itemId) {
  let rec = save.progress.srs[itemId];
  if (!rec) {
    rec = { box: 0, due: dayIndex(), seen: 0, correct: 0, wrong: 0, lastSeen: 0 };
    save.progress.srs[itemId] = rec;
  }
  return rec;
}

/**
 * Registra una risposta.
 *
 * Nota importante sulla promozione: il box sale solo se l'item era
 * effettivamente "scaduto". Se il bambino incontra la stessa parola due volte
 * nella stessa partita e la indovina entrambe le volte, il box sale una volta
 * sola. Senza questa regola bastava una sessione fortunata per dichiarare
 * padroneggiata mezza fase, e la soglia dell'80% non varrebbe nulla.
 *
 * L'errore invece retrocede sempre: se sbagli, sbagli.
 *
 * @returns {{box:number, mastered:boolean, firstTime:boolean, promoted:boolean}}
 */
export function recordAnswer(itemId, correct) {
  const rec = trackOf(itemId);
  const today = dayIndex();
  const firstTime = rec.seen === 0;
  const wasDue = firstTime || rec.due <= today;

  rec.seen += 1;
  rec.lastSeen = today;

  let promoted = false;
  if (correct) {
    rec.correct += 1;
    if (wasDue) {
      rec.box = Math.min(rec.box + 1, CONFIG.srsIntervals.length - 1);
      rec.due = today + CONFIG.srsIntervals[rec.box];
      promoted = true;
    }
  } else {
    rec.wrong += 1;
    rec.box = 0;   // torna in cima alla coda: la rivedra' subito
    rec.due = today + CONFIG.srsIntervals[0];
  }
  persist();

  return { box: rec.box, mastered: isMastered(itemId), firstTime, promoted };
}

export function isMastered(itemId) {
  const rec = save.progress.srs[itemId];
  return Boolean(rec && rec.box >= masteryBox());
}

/** L'item e' gia' comparso almeno una volta. */
export function hasBeenSeen(itemId) {
  return (save.progress.srs[itemId]?.seen || 0) > 0;
}

/** Quante volte l'item e' stato indovinato in totale. */
export function timesCorrect(itemId) {
  return save.progress.srs[itemId]?.correct || 0;
}

export function masteredCount() {
  return Object.keys(save.progress.srs).filter(isMastered).length;
}

export function seenCount() {
  return Object.keys(save.progress.srs).length;
}

/** Accuratezza complessiva in percentuale (0-100), null se non ci sono dati. */
export function overallAccuracy() {
  const { totalCorrect, totalWrong } = save.stats;
  const tot = totalCorrect + totalWrong;
  return tot ? Math.round((totalCorrect / tot) * 100) : null;
}

/** Le parole con piu' errori, per la dashboard genitori. */
export function hardestItems(limit = 5) {
  return Object.entries(save.progress.srs)
    .map(([id, r]) => ({ id, ...r }))
    .filter(r => r.wrong > 0)
    .sort((a, b) => (b.wrong - a.wrong) || (a.box - b.box))
    .slice(0, limit);
}

/**
 * Punteggio di priorita': piu' alto = da riproporre prima.
 * Ordine voluto: mai visto > scaduto da tempo > box basso.
 */
function priority(itemId) {
  const rec = save.progress.srs[itemId];
  const today = dayIndex();
  if (!rec || rec.seen === 0) return 1000;              // materiale nuovo
  const overdue = today - rec.due;                       // >0 se in ritardo
  if (overdue < 0) return 100 - rec.box * 10 + overdue;  // non ancora scaduto
  return 500 + Math.min(overdue, 30) * 5 - rec.box * 8;
}

/**
 * Sceglie gli item di una partita, mescolando ripasso e novita'.
 * @param {Array} items item candidati (gia' filtrati per mondo/temi)
 * @param {number} count quante domande servono
 */
export function pickRoundItems(items, count) {
  if (!items.length) return [];

  const ranked = items
    .map(it => ({ it, p: priority(it.id) + Math.random() * 12 }))
    .sort((a, b) => b.p - a.p)
    .map(x => x.it);

  // Se il mondo ha meno item delle domande richieste, si ripete ciclicamente
  // (con un rimescolamento, per non avere sempre la stessa sequenza).
  const out = [];
  let i = 0;
  while (out.length < count) {
    if (i >= ranked.length) {
      i = 0;
      shuffle(ranked);
    }
    out.push(ranked[i++]);
  }
  return out.slice(0, count);
}

/** Item scaduti fra tutti quelli gia' incontrati: usato dal ripasso libero. */
export function dueItems(allItems) {
  const today = dayIndex();
  return allItems.filter(it => {
    const rec = save.progress.srs[it.id];
    return rec && rec.seen > 0 && rec.due <= today;
  });
}

export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Elementi casuali diversi da quello dato: servono come distrattori. */
export function distractors(pool, exclude, howMany) {
  const candidates = pool.filter(it => it.id !== exclude.id);
  shuffle(candidates);
  return candidates.slice(0, howMany);
}
