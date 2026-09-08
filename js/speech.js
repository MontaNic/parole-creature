/**
 * Riconoscimento vocale del browser, usato solo come conferma morbida in
 * "Dillo tu": mai una bocciatura. E' l'unica funzione in cui un suono puo'
 * uscire dal dispositivo (su iPad passa dai server di Apple): per questo e'
 * spenta finche' un genitore non la accende nell'area riservata.
 */

import { save } from './state.js';

function Recognizer() {
  return (typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)) || null;
}

export function canRecognize() {
  if (save.settings?.speechCheck !== true) return false;
  return Boolean(Recognizer());
}

/** Normalizza per confrontare: minuscolo, niente punteggiatura, apostrofi sciolti. */
export function normalize(s) {
  return String(s || '').toLowerCase()
    .replace(/[’']/g, "'").replace(/it's/g, 'it is').replace(/what's/g, 'what is').replace(/i've/g, 'i have')
    .replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * La parola giusta c'e' fra le alternative sentite?
 * Per una parola: basta che compaia. Per una frase: basta che compaiano
 * almeno due terzi delle sue parole, nell'ordine non importa. E' tollerante
 * di proposito: la voce di un bambino e' difficile per qualunque motore.
 */
export function matchesTarget(target, alternatives) {
  const want = normalize(target).split(' ').filter(Boolean);
  if (!want.length) return false;
  for (const alt of alternatives || []) {
    const heard = new Set(normalize(alt).split(' '));
    if (want.length === 1) { if (heard.has(want[0])) return true; continue; }
    const hits = want.filter(w => heard.has(w)).length;
    if (hits >= Math.ceil(want.length * 2 / 3)) return true;
  }
  return false;
}

/**
 * Ascolta per al massimo `ms` millisecondi e restituisce le alternative.
 * Si risolve sempre (lista vuota se niente o errore): non deve mai bloccare.
 */
export function recognize(lang = 'en-GB', ms = 5000) {
  return new Promise(resolve => {
    const R = Recognizer();
    if (!R) { resolve([]); return; }
    let done = false;
    const finish = (list) => { if (done) return; done = true; clearTimeout(timer); try { rec.stop(); } catch { /* ignorato */ } resolve(list); };
    const rec = new R();
    rec.lang = lang;
    rec.maxAlternatives = 5;
    rec.interimResults = false;
    rec.continuous = false;
    const timer = setTimeout(() => finish([]), ms);
    rec.onresult = (ev) => {
      const out = [];
      for (const res of ev.results) for (const alt of res) out.push(alt.transcript);
      finish(out);
    };
    rec.onerror = () => finish([]);
    rec.onend = () => finish([]);
    try { rec.start(); } catch { finish([]); }
  });
}
