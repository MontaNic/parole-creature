/**
 * Composizione dei passi di una partita: quale gioco per quale item, in
 * che ordine, con quale difficolta'. Logica pura (niente DOM), cosi' i
 * test del curriculum la possono controllare.
 */

import { CONFIG } from './config.js';
import { shuffle, similar } from './srs.js';
import { curriculumConfig } from './curriculum.js';

/*
 * Quale gioco puo' ospitare quale item.
 *
 * Le frasi NON entrano nei giochi a immagini. "What is it? A dragon." con il
 * disegno del drago e' la stessa domanda di "dragon", solo piu' lunga: al
 * bambino arrivava a volte la parola e a volte la frase per lo stesso
 * disegno, e sembrava incoerenza. Le frasi vanno dove la loro forma conta —
 * ascolto, quiz col testo, costruzione.
 *
 * Nemmeno il vero o falso: un disegno e una voce da verificare e' una domanda
 * sulla PAROLA ("E' la parola giusta?"). Con le frasi il bambino vedeva il
 * drago e sentiva "What is it? A knight." — la stessa domanda in due forme.
 */
/*
 * E niente microfono nelle partite normali. "Ascolta e ripeti" e "Dillo tu"
 * erano circa il 40% delle domande (3-4 su 8, meta' nelle unita' 7-8), e il
 * microfono su iPad e' il punto piu' fragile del gioco: ogni "non ti ho
 * sentito" ripetuto e' un motivo per smettere. Il parlato non sparisce: ha
 * il suo giro apposta, "Parla con Pepe" (passiParlati), breve e riconoscibile.
 */
const GIOCHI_PER_PAROLA = ['match', 'hunt', 'quiz', 'truefalse', 'dragdrop'];
const GIOCHI_PER_FRASE  = ['quiz', 'build'];

/** Quante parole o frasi in un giro di "Parla con Pepe". */
export const PAROLE_PER_PARLARE = 5;

/**
 * Il giro di "Parla con Pepe": si alternano "Ascolta e ripeti" (prima il
 * modello) e "Dillo tu" (prima il bambino), cominciando dal piu' facile.
 */
export function passiParlati(items) {
  return items.map((it, k) => ({
    type: k % 2 ? 'sayit' : 'listen',
    items: [it],
    difficulty: 2,
    isFinal: false
  }));
}

/**
 * Compone i passi della partita.
 *
 * Tre principi, tutti nati dal playtest:
 *
 *  1. Ogni item va in un gioco che sa distinguerlo (vedi sopra).
 *  2. L'ordine dei giochi e' mescolato e non ripete mai lo stesso due volte
 *     di fila. Prima ciclava sempre nella stessa sequenza: ogni partita era
 *     uguale alla precedente, e si sentiva.
 *  3. La difficolta' sale DENTRO la partita — le prime domande sono facili,
 *     l'ultima e' la sfida finale con il massimo delle scelte — e sale anche
 *     con la padronanza dell'unita'. Prima era un solo numero per tutta la
 *     partita, e nel primo round di ogni unita' erano due scelte fisse dalla
 *     prima domanda all'ultima.
 */
export function buildSteps(world, items, pool, baseDifficulty, showWritten = true) {
  /*
   * Prima le parole, poi le frasi.
   *
   * Prima parole e frasi erano mescolate a caso, con lo stesso disegno: una
   * volta la voce diceva "dragon", quella dopo "What is it? A dragon.", e il
   * bambino non sapeva cosa aspettarsi. Ora i giochi a scelta fanno sentire
   * sempre e solo la parola; le frasi arrivano dopo, tutte insieme, con un
   * segnale che le annuncia. Nella fase di solo ascolto le frasi sono
   * "Ascolta e ripeti": si sentono e si ripetono, senza scegliere disegni.
   */
  const parole = items.filter(it => it.kind !== 'phrase');
  const frasi = items.filter(it => it.kind === 'phrase');

  const steps = stepsParole(world, parole, pool);
  // La rampa di difficolta' e la sfida finale stanno sulle parole; se la
  // partita e' di sole frasi (i mondi delle frasi), stanno sulle frasi.
  const passiFrasi = stepsFrasi(world, frasi, pool, showWritten);
  rampa(steps.length ? steps : passiFrasi, baseDifficulty);
  if (steps.length) {
    passiFrasi.forEach(st => { st.difficulty = 2; st.isFinal = false; });
    if (passiFrasi.length) passiFrasi[0].phrasesStart = true;
  }
  const tutti = [...steps, ...passiFrasi];
  // Nelle partite normali mai il microfono (vedi sopra): anche quando una
  // parola, per mancanza di alternative, finisce in "Ascolta e ripeti".
  tutti.forEach(st => { if (st.type === 'listen') st.noMic = true; });
  return tutti;
}

/** Passi per le parole: giochi mescolati, mai lo stesso due volte di fila. */
function stepsParole(world, items, pool) {
  const disponibili = new Set(world.minigames || ['match']);
  const steps = [];
  let i = 0;
  let precedente = null;

  const parolaDistinte = (da, n) => {
    // Le prossime n parole con illustrazioni diverse.
    const out = [];
    const viste = new Set();
    for (let k = da; k < items.length && out.length < n; k++) {
      const it = items[k];
      if (viste.has(it.sprite)) continue;
      viste.add(it.sprite);
      out.push(it);
    }
    return out;
  };

  while (i < items.length) {
    const item = items[i];
    let candidati = GIOCHI_PER_PAROLA.filter(tp => disponibili.has(tp)).filter(tp => {
      if (tp === 'hunt') return pool.length >= 4 && parolaDistinte(i, CONFIG.game.huntTargets).length === CONFIG.game.huntTargets;
      // Serve almeno un'alternativa dello stesso tipo.
      return similar(pool, item).length >= 1;
    });
    if (!candidati.length) candidati = ['listen'];

    const diversi = candidati.filter(tp => tp !== precedente);
    const type = shuffle(diversi.length ? diversi : candidati)[0];

    let presi;
    if (type === 'hunt') {
      presi = parolaDistinte(i, CONFIG.game.huntTargets);
      // Le parole della caccia possono non essere contigue: si tolgono dal
      // resto per non riproporle.
      const ids = new Set(presi.map(x => x.id));
      const resto = items.slice(i).filter(x => !ids.has(x.id));
      items = [...items.slice(0, i), ...presi, ...resto];
      i += presi.length;
    } else {
      presi = [item];
      i += 1;
    }
    steps.push({ type, items: presi });
    precedente = type;
  }
  return steps;
}

/** Passi per le frasi: "Ascolta e ripeti" in fase di solo ascolto. */
function stepsFrasi(world, items, pool, showWritten) {
  const cfg = curriculumConfig();
  const disponibili = new Set(world.minigames || ['match']);
  const steps = [];
  let precedente = null;
  for (const item of items) {
    let candidati;
    if (!showWritten) {
      candidati = ['listen'];     // "Ascolta e ripeti", senza microfono
    } else {
      candidati = GIOCHI_PER_FRASE.filter(tp => disponibili.has(tp)).filter(tp => {
        if (tp === 'build') {
          const n = item.en.split(/\s+/).length;
          return n >= 2 && n <= cfg.maxBuildWords;
        }
        return similar(pool, item).length >= 1;
      });
      if (!candidati.length) candidati = ['listen'];
    }
    const diversi = candidati.filter(tp => tp !== precedente);
    const type = shuffle(diversi.length ? diversi : candidati)[0];
    steps.push({ type, items: [item], noMic: type === 'listen' });
    precedente = type;
  }
  return steps;
}

/*
 * Difficolta' a salire: il primo terzo un gradino sotto la base, l'ultimo
 * un gradino sopra, e l'ultima domanda e' sempre la piu' difficile.
 */
function rampa(steps, baseDifficulty) {
  const n = steps.length;
  steps.forEach((st, k) => {
    const pos = n > 1 ? k / (n - 1) : 1;
    let d = baseDifficulty + (pos < 0.34 ? -1 : pos > 0.66 ? 1 : 0);
    st.isFinal = k === n - 1;
    if (st.isFinal) d = 3;
    st.difficulty = Math.max(1, Math.min(3, d));
  });
}
