/**
 * Il check del mese: la misura esterna.
 *
 * Il gioco dice "padroneggiata" quando una parola e' stata indovinata piu'
 * volte in giorni diversi; ma indovinare fra quattro figure non e' dirla.
 * Qui il genitore legge l'italiano, il bambino dice l'inglese, il genitore
 * segna. Dieci parole a caso; il risultato resta nel salvataggio.
 */

import { content, getItem } from './content-loader.js';
import { save, persist, todayKey } from './state.js';
import { isMastered } from './srs.js';

export const CHECK_SIZE = 10;
export const CHECK_EVERY_DAYS = 30;

/** Gli id delle parole padroneggiate (solo parole: le frasi si testano parlando). */
export function masteredWordIds() {
  return content.words.filter(w => isMastered(w.id)).map(w => w.id);
}

/** n parole a caso, senza doppioni, fra quelle date. */
export function pickCheckItems(ids, n = CHECK_SIZE, rng = Math.random) {
  const pool = ids.slice();
  const out = [];
  while (pool.length && out.length < n) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return out;
}

export function lastCheck() {
  const list = save.checks || [];
  return list.length ? list[list.length - 1] : null;
}

/** Giorni dall'ultimo check, o null se mai fatto. */
export function daysSinceLastCheck(today = todayKey()) {
  const last = lastCheck();
  if (!last) return null;
  const a = new Date(last.day + 'T12:00:00'), b = new Date(today + 'T12:00:00');
  return Math.round((b - a) / 86400000);
}

export function checkDue(today = todayKey()) {
  const d = daysSinceLastCheck(today);
  return d === null || d >= CHECK_EVERY_DAYS;
}

/** Registra un check fatto. */
export function saveCheck(items, day = todayKey()) {
  if (!save.checks) save.checks = [];
  const rec = { day, n: items.length, ok: items.filter(i => i.ok).length, items };
  save.checks.push(rec);
  if (save.checks.length > 24) save.checks.splice(0, save.checks.length - 24);
  persist(true);
  return rec;
}

export function itemLabel(id) {
  const it = getItem(id);
  return it ? { en: it.en, it: it.it } : { en: id, it: id };
}
