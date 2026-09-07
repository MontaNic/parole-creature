/**
 * Lo storico giornaliero: quanto e come si e' giocato, giorno per giorno.
 *
 * Serve ai genitori (grafico degli ultimi 14 giorni, criteri di successo),
 * non al bambino. Funzioni pure con la data iniettabile, cosi' il test le
 * prova senza aspettare domani.
 */

import { CONFIG } from './config.js';
import { save, persist, todayKey } from './state.js';

function vuoto() {
  return { correct: 0, wrong: 0, minutes: 0, rounds: 0, mastered: 0 };
}

function history() {
  if (!save.history) save.history = {};
  return save.history;
}

/**
 * Somma i contatori di oggi. `mastered` non si somma: e' una foto.
 * @param {{correct?:number, wrong?:number, minutes?:number, rounds?:number, mastered?:number}} delta
 */
export function bumpToday(delta, day = todayKey()) {
  const h = history();
  const d = h[day] || (h[day] = vuoto());
  for (const k of ['correct', 'wrong', 'minutes', 'rounds']) if (delta[k]) d[k] += delta[k];
  if (typeof delta.mastered === 'number') d.mastered = delta.mastered;
  prune(day);
  persist();
  return d;
}

/** Tiene solo gli ultimi N giorni: il salvataggio non deve crescere per sempre. */
export function prune(day = todayKey(), keep = CONFIG.success.historyKeepDays) {
  const h = history();
  const limite = shift(day, -keep);
  for (const k of Object.keys(h)) if (k < limite) delete h[k];
}

function shift(day, days) {
  const d = new Date(day + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return todayKey(d);
}

/**
 * Gli ultimi n giorni fino a `day` incluso, in ordine, con zeri dove non si
 * e' giocato.
 */
export function lastDays(n = CONFIG.success.windowDays, day = todayKey()) {
  const h = history();
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const k = shift(day, -i);
    out.push({ day: k, ...(h[k] || vuoto()) });
  }
  return out;
}

/** Precisione di un giorno in %, o null se non si e' risposto. */
export function accuracyOf(d) {
  const n = d.correct + d.wrong;
  return n ? Math.round((d.correct / n) * 100) : null;
}

/**
 * I criteri di successo, misurati.
 * @param {number} mastered parole padroneggiate oggi
 */
export function successReport(mastered, day = todayKey()) {
  const cfg = CONFIG.success;
  const giorni = lastDays(cfg.windowDays, day).filter(d => d.rounds > 0 || d.minutes >= 1).length;
  return {
    days: { value: giorni, target: cfg.daysTarget, window: cfg.windowDays, ok: giorni >= cfg.daysTarget },
    mastered: { value: mastered, target: cfg.masteredTarget, ok: mastered >= cfg.masteredTarget }
  };
}
