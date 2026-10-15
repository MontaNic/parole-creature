/**
 * I mini-giochi.
 *
 * Ogni gioco:
 *  - riceve gli item su cui esercitarsi, un "pool" da cui pescare i
 *    distrattori e alcuni servizi (audio, feedback);
 *  - chiama report(itemId, indovinatoAlPrimoColpo) per ogni item risolto;
 *  - si risolve solo quando il bambino ha completato l'esercizio.
 *
 * Regola di fondo: non si perde mai. Una risposta sbagliata riporta
 * gentilmente all'ascolto e si riprova, senza penalita' e senza tempo.
 */

import { CONFIG } from './config.js';
import { t, artIndex } from './content-loader.js';
import { speakItem, speakLine, sfxTap } from './audio.js';
import { canRecord, startRecording, playBlob } from './recorder.js';
import { canRecognize, recognize, matchesTarget } from './speech.js';
import { gameDialogue } from './dialogues.js';
import { burstConfetti } from './effects.js';
import { mascotSay } from './mascot.js';
import { save, persist } from './state.js';
import { shuffle, distractors, distinctBySprite } from './srs.js';
import { dopoLaVoce, spiega } from './pace.js';

/**
 * Il ritmo dentro i mini-giochi (vedi pace.js): le scelte si accendono dopo
 * aver sentito la parola, e restano ferme mentre Pepe incoraggia e la parola
 * torna. Toccare a raffica non porta avanti: porta solo a non sentire.
 */
const fermo = (node, fn) => dopoLaVoce(node, fn());

const SVG_NS = 'http://www.w3.org/2000/svg';

/* ------------------------------------------------------------------ */
/* Helper di costruzione                                               */
/* ------------------------------------------------------------------ */

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * L'elemento grafico di uno sprite.
 *
 * Chi ha un'illustrazione generata riceve un <img>; tutti gli altri — numeri,
 * colori, icone di interfaccia, plurali — restano <svg><use>, perche' per
 * loro il disegno vettoriale e' la scelta giusta e non un ripiego: il conteggio
 * delle gemme dev'essere esatto, la tinta dei colori dev'essere quella della
 * palette, le icone appartengono al design system.
 *
 * Il nome resta spriteSvg per non toccare venti punti di chiamata, ma quello
 * che torna non e' sempre un SVG: il CSS che li veste seleziona `svg, img`.
 */
export function spriteSvg(spriteId) {
  if (artIndex.sprites.has(spriteId)) {
    const img = document.createElement('img');
    img.src = `${CONFIG.artBase}${spriteId}.png`;
    img.alt = '';
    img.decoding = 'async';
    return img;
  }
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#${spriteId}`);
  svg.appendChild(use);
  return svg;
}

/**
 * Il grande pulsante rotondo che pronuncia la parola.
 * @param {object|Function} source item fisso oppure funzione che restituisce
 *        l'item corrente (serve alla caccia, dove il bersaglio cambia).
 */
export function audioOrb(source, label) {
  const btn = el('button', 'audio-orb');
  btn.type = 'button';
  btn.setAttribute('aria-label', label || t('ui.tap_to_hear'));
  btn.appendChild(spriteSvg('sp-icon-sound'));
  const play = async () => {
    btn.classList.add('is-playing');
    const it = typeof source === 'function' ? source() : source;
    await (it && it._rel ? speakLine(it._rel, it.en, 'en-GB') : speakItem(it));
    btn.classList.remove('is-playing');
  };
  btn.addEventListener('click', play);
  btn._play = play;
  return btn;
}

/**
 * Quante scelte mostrare. `level` e' la difficolta' del singolo passo, che
 * sale dentro la partita: 1 = due scelte, 2 = tre, 3 = quattro.
 */
function choiceCount(pool, level) {
  const max = Math.min(CONFIG.game.maxChoices, Math.max(CONFIG.game.minChoices, pool.length));
  const wanted = level >= 3 ? 4 : level >= 2 ? 3 : 2;
  return Math.min(max, wanted);
}

function pause(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Il disegno del soggetto, fuori dalle scelte.
 *
 * Una parola e la frase che la insegna mostrano lo stesso disegno: il drago
 * vale per "dragon" e per "What is it? A dragon.". Perche' il bambino capisca
 * al volo quale delle due gli si chiede, la frase ha SEMPRE la cornice a
 * fumetto (il rosa dei dialoghi) e la sua traduzione sotto. La parola nuda
 * resta una tessera semplice.
 */
function soggetto(item, width) {
  const art = el('div', 'choice' + (item.kind === 'phrase' ? ' is-phrase' : ''));
  art.style.width = width;
  art.style.pointerEvents = 'none';
  art.appendChild(spriteSvg(item.sprite));
  return art;
}

/* ------------------------------------------------------------------ */
/* Aiuto scritto dopo una difficolta' dimostrata                       */
/* ------------------------------------------------------------------ */

/** Errori consecutivi sullo stesso item prima di mostrare la parola scritta. */
export const SOGLIA_AIUTO = 2;

/**
 * Se mostrare la forma scritta come aiuto.
 *
 * La regola sta qui, isolata e verificata da un test, perche' e' una scelta
 * didattica e non un dettaglio di resa: la parola scritta compare SOLO dopo
 * due errori sullo stesso item, mai prima. Se comparisse al primo tentativo
 * diventerebbe un modo per abituarsi a leggere invece che ad ascoltare, e
 * nella fase 1 l'ascolto e' esattamente cio' che si sta allenando.
 *
 * Dove il testo c'e' gia' (fasi 2 e 3) non c'e' niente da aggiungere.
 */
export function serveAiutoScritto(errori, showWritten) {
  return !showWritten && errori >= SOGLIA_AIUTO;
}

/**
 * Mostra la parola scritta accanto al soggetto.
 * L'aiuto vive quanto l'item: al successivo il contenitore viene ricostruito.
 */
function mostraAiuto(host, item, showWritten, errori) {
  if (!serveAiutoScritto(errori, showWritten)) return;
  if (!host || host.querySelector('.written-help')) return;
  const cls = item.kind === 'phrase' ? 'phrase-written' : 'word-written';
  const aiuto = el('p', `${cls} written-help anim-pop`, item.en);
  aiuto.setAttribute('aria-live', 'polite');
  host.appendChild(aiuto);
}

/** Toglie l'aiuto: serve alla caccia, dove il bersaglio cambia nello stesso turno. */
function togliAiuto(host) {
  host?.querySelector('.written-help')?.remove();
}

/**
 * Conferma scritta dopo una risposta giusta.
 *
 * E' il feedback visivo che mancava: il bambino sentiva un suono e vedeva i
 * coriandoli, ma non aveva mai davanti la parola che aveva appena indovinato.
 * Compare in verde, in Andika, e vive quanto la pausa prima del passo dopo.
 * Vale anche in fase 1: qui la lettura e' un premio che arriva DOPO la
 * risposta, non un aiuto che la precede.
 */
export function mostraConferma(host, item) {
  if (!host || !item) return;
  togliAiuto(host);
  const cls = item.kind === 'phrase' ? 'phrase-written' : 'word-written';
  const c = el('p', `${cls} written-help is-confirm anim-pop`, item.en);
  host.appendChild(c);
}

/* ------------------------------------------------------------------ */
/* 1. Abbinamento parola -> immagine                                   */
/* ------------------------------------------------------------------ */

async function gameMatch(api) {
  const { host, items, pool, showWritten, difficulty, report, fx } = api;
  const item = items[0];

  host.innerHTML = '';
  host.appendChild(el('p', 'game-prompt', t('games.match_prompt')));

  const orb = audioOrb(item);
  host.appendChild(orb);

  if (showWritten) {
    host.appendChild(el('p', 'word-written', item.en));
  }

  const n = choiceCount(pool, difficulty);
  const options = shuffle([item, ...distractors(pool, item, n - 1)]);

  const grid = el('div', 'choice-grid' + (options.length === 3 ? ' cols-3' : ''));
  const cols = options.length === 3 ? 3 : 2;
  grid.style.setProperty('--cols', cols);
  grid.style.setProperty('--rows', Math.ceil(options.length / cols));
  host.appendChild(grid);

  fermo(grid, async () => { await pause(250); await spiega('howto_match'); await orb._play(); });

  return new Promise(resolve => {
    let firstTry = true;
    let errori = 0;

    options.forEach(opt => {
      const btn = el('button', 'choice');
      btn.type = 'button';
      btn.appendChild(spriteSvg(opt.sprite));
      btn.setAttribute('aria-label', opt.it);

      btn.addEventListener('click', async (ev) => {
        if (btn.disabled) return;
        sfxTap();
        if (opt.id === item.id) {
          grid.querySelectorAll('button').forEach(b => b.disabled = true);
          btn.classList.add('is-correct');
          fx.good(ev, firstTry, item);
          report(item.id, firstTry);
          await pause(1100);
          resolve();
        } else {
          firstTry = false;
          errori += 1;
          btn.classList.add('is-wrong');
          btn.disabled = true;
          await fermo(grid, async () => {
            await fx.bad();
            btn.classList.remove('is-wrong');
            btn.classList.add('is-dim');
            mostraAiuto(host, item, showWritten, errori);
            await orb._play();
          });
        }
      });
      grid.appendChild(btn);
    });
  });
}

/* ------------------------------------------------------------------ */
/* 2. Quiz a scelta multipla con audio                                 */
/* ------------------------------------------------------------------ */

async function gameQuiz(api) {
  const { host, items, pool, showWritten, difficulty, report, fx } = api;
  const item = items[0];
  const isPhrase = item.kind === 'phrase';

  host.innerHTML = '';
  // Senza testo scritto nessuna traccia parte da sola: la frase non si e'
  // "sentita", si sceglie ascoltando le opzioni.
  const prompt = !isPhrase
    ? (showWritten ? 'games.quiz_prompt' : 'games.quiz_prompt_listen')
    : (showWritten ? 'games.quiz_prompt_phrase' : 'games.quiz_prompt_phrase_listen');
  host.appendChild(el('p', 'game-prompt', t(prompt)));

  // Si parte dall'immagine: il bambino sa gia' di cosa si parla.
  host.appendChild(soggetto(item, 'min(190px, 46vw)'));
  if (isPhrase) host.appendChild(el('p', 'word-hint-it', item.it));

  const n = choiceCount(pool, difficulty);
  const options = shuffle([item, ...distractors(pool, item, n - 1)]);
  const list = el('div', showWritten ? 'choice-list' : 'sound-row');
  host.appendChild(list);

  return new Promise(resolve => {
    let firstTry = true;
    let errori = 0;

    let chiuso = false;   // risposta giusta data: niente piu' scelte

    // Scegliere: uguale per le due forme (testo scritto o bolle sonore).
    const scegli = async (opt, segno, ev) => {
      if (chiuso) return;
      if (opt.id === item.id) {
        chiuso = true;
        list.querySelectorAll('button').forEach(b => b.disabled = true);
        segno.classList.add('is-correct');
        await speakItem(item);
        fx.good(ev, firstTry, item);
        report(item.id, firstTry);
        await pause(1000);
        resolve();
      } else {
        firstTry = false;
        errori += 1;
        segno.classList.add('is-wrong');
        await fermo(list, async () => {
          await fx.bad();
          segno.classList.remove('is-wrong');
          segno.classList.add('is-dim');
          // L'aiuto va sotto l'immagine, non fra le scelte: e' un
          // suggerimento sul bersaglio, non una quinta opzione.
          mostraAiuto(host, item, showWritten, errori);
          await speakItem(item);
        });
      }
    };

    options.forEach((opt, k) => {
      if (showWritten) {
        // Fasi 2-3: si legge la parola/frase, l'audio resta a richiesta.
        const btn = el('button', 'choice-text', opt.en);
        btn.type = 'button';
        btn.addEventListener('click', (ev) => {
          if (btn.disabled) return;
          sfxTap();
          btn.disabled = true;
          scegli(opt, btn, ev);
        });
        list.appendChild(btn);
        return;
      }

      /*
       * Fase 1: niente testo. Prima era una barra bianca enorme con un
       * altoparlante minuscolo, e si toccava due volte (ascolta, poi
       * scegli) senza che niente lo dicesse. Ora ogni scelta e' una BOLLA
       * di un colore suo ("era quella blu") che fa sentire la parola, e
       * sotto una ZAMPA di Pepe per sceglierla. La zampa si accende solo
       * dopo aver ascoltato quella bolla: non si sceglie senza sentire.
       */
      const col = el('div', 'sound-opt');
      const bolla = el('button', `sound-bubble c${k % 4}`);
      bolla.type = 'button';
      bolla.setAttribute('aria-label', t('ui.tap_to_hear'));
      bolla.appendChild(spriteSvg('sp-icon-sound'));
      const zampa = el('button', 'paw-btn');
      zampa.type = 'button';
      zampa.setAttribute('aria-label', t('games.quiz_choose'));
      zampa.appendChild(spriteSvg('sp-icon-paw'));
      zampa.disabled = true;
      let sentita = false;

      bolla.addEventListener('click', async () => {
        if (bolla.disabled) return;
        sfxTap();
        bolla.classList.add('is-playing');
        await dopoLaVoce(sentita ? [] : zampa, speakItem(opt));
        bolla.classList.remove('is-playing');
        if (!sentita) { sentita = true; bolla.classList.add('is-heard'); }
      });
      zampa.addEventListener('click', (ev) => {
        if (zampa.disabled) return;
        sfxTap();
        zampa.disabled = true;
        bolla.disabled = true;
        scegli(opt, col, ev);
      });
      col.appendChild(bolla);
      col.appendChild(zampa);
      list.appendChild(col);
    });

    // Con il testo scritto conviene sentire subito la traccia giusta.
    const howto = isPhrase
      ? (showWritten ? 'howto_quiz_phrase' : 'howto_quiz_phrase_listen')
      : (showWritten ? 'howto_quiz_read' : 'howto_quiz_listen');
    fermo(list, async () => {
      await pause(300);
      await spiega(howto);
      if (showWritten) await speakItem(item);
    });
  });
}

/* ------------------------------------------------------------------ */
/* 3. Ascolta e ripeti                                                 */
/* ------------------------------------------------------------------ */

async function gameListen(api) {
  const { host, items, showWritten, report, fx, onRepeat } = api;
  const item = items[0];

  host.innerHTML = '';
  host.appendChild(el('p', 'game-prompt', t('games.listen_prompt')));

  const stage = el('div', 'repeat-stage');
  const orb = audioOrb(item);
  stage.appendChild(orb);

  if (showWritten) {
    stage.appendChild(el('p', item.kind === 'phrase' ? 'phrase-written' : 'word-written', item.en));
  } else {
    // Il terzo termine tiene tutta la colonna (orb, figura, microfono, Fatto)
    // dentro un iPad orizzontale con la barra di Safari.
    stage.appendChild(soggetto(item, 'min(190px, 46vw, 24vh)'));
  }
  stage.appendChild(el('p', 'word-hint-it', item.it));

  // Il microfono: registrarsi e riascoltarsi, senza voto. Compare solo dove
  // puo' funzionare (HTTPS, MediaRecorder) e se i genitori lo vogliono.
  if (canRecord()) stage.appendChild(recRow());

  const done = el('button', 'btn btn-good btn-lg', t('games.listen_done'));
  done.type = 'button';
  stage.appendChild(done);
  host.appendChild(stage);

  // "Fatto" si accende solo dopo aver sentito il modello da ripetere.
  fermo(done, async () => { await pause(250); await spiega('howto_listen'); await orb._play(); });

  return new Promise(resolve => {
    done.addEventListener('click', async (ev) => {
      done.disabled = true;
      onRepeat?.();
      fx.good(ev, true, item);
      // Ripetere non e' un test: conta come esposizione positiva.
      report(item.id, true);
      await pause(900);
      resolve();
    });
  });
}

let dettoRecord = false;   // Pepe commenta la prima registrazione della sessione

function recRow() {
  const row = el('div', 'rec-row');
  const rec = el('button', 'btn btn-ghost btn-sm rec-btn');
  rec.type = 'button';
  const icona = spriteSvg('sp-icon-mic');
  icona.classList.add('ico');
  const label = el('span', null, t('games.record_start'));
  rec.appendChild(icona);
  rec.appendChild(label);
  const again = el('button', 'btn btn-cool btn-sm rec-play');
  again.type = 'button';
  const ic2 = spriteSvg('sp-icon-play');
  ic2.classList.add('ico');
  again.appendChild(ic2);
  again.appendChild(el('span', null, t('games.record_play')));
  again.hidden = true;
  row.appendChild(rec);
  row.appendChild(again);

  let corrente = null;   // registrazione in corso
  let blob = null;       // l'ultima registrazione, solo in memoria

  const riascolta = async () => {
    rec.disabled = true; again.disabled = true;
    await playBlob(blob);
    rec.disabled = false; again.disabled = false;
  };

  rec.addEventListener('click', async () => {
    sfxTap();
    if (corrente) {
      // Secondo tocco: ferma, poi si riascolta subito.
      const r = corrente; corrente = null;
      rec.classList.remove('is-rec');
      label.textContent = t('games.record_start');
      blob = await r.stop();
      if (blob && blob.size) {
        save.stats.totalRecordings = (save.stats.totalRecordings || 0) + 1;
        persist();
        again.hidden = false;
        await riascolta();
        if (!dettoRecord) {
          dettoRecord = true;
          mascotSay('record_done', { avatar: document.getElementById('play-mascot') });
        }
      }
      return;
    }
    try {
      corrente = await startRecording();
      rec.classList.add('is-rec');
      label.textContent = t('games.record_stop');
    } catch {
      // Permesso negato o microfono assente: il bottone sparisce, la
      // partita continua come prima. Nessun errore da spiegare a 7 anni.
      row.remove();
    }
  });
  again.addEventListener('click', () => { sfxTap(); riascolta(); });
  return row;
}

/* ------------------------------------------------------------------ */
/* 3b. Dillo tu: produrre prima di ascoltare                           */
/* ------------------------------------------------------------------ */

/**
 * Figura (e per le frasi la frase in italiano), nessuna scelta: il bambino
 * deve dirlo ad alta voce PRIMA di sentire il modello. Poi ascolta (prima
 * la sua registrazione se c'e', poi la voce modello) e si giudica da solo.
 * "Uguale" vale una risposta giusta, "Quasi" un'esposizione. Con il
 * riconoscimento vocale acceso dai genitori, Pepe conferma se ha sentito
 * la parola giusta; se no, invita ad ascoltare e riprovare, senza costo.
 */
async function gameSayIt(api) {
  const { host, items, report, fx, onRepeat } = api;
  const item = items[0];
  const isPhrase = item.kind === 'phrase';

  host.innerHTML = '';
  host.appendChild(el('p', 'game-prompt', t('games.sayit_prompt')));
  const stage = el('div', 'repeat-stage');
  stage.appendChild(soggetto(item, 'min(190px, 46vw, 24vh)'));
  if (isPhrase) stage.appendChild(el('p', 'word-hint-it sayit-hint', item.it));

  const row = el('div', 'rec-row');
  let blob = null;
  let corrente = null;
  let rec = null;
  if (canRecord()) {
    rec = el('button', 'btn btn-ghost btn-sm rec-btn');
    rec.type = 'button';
    const ic = spriteSvg('sp-icon-mic'); ic.classList.add('ico');
    const label = el('span', null, t(canRecognize() ? 'games.sayit_speak' : 'games.record_start'));
    rec.appendChild(ic); rec.appendChild(label);
    rec.addEventListener('click', async () => {
      sfxTap();
      if (canRecognize()) {
        // Conferma morbida: ascolta e confronta, mai bocciare.
        rec.disabled = true; rec.classList.add('is-rec');
        const heard = await recognize('en-GB', 5000);
        rec.classList.remove('is-rec'); rec.disabled = false;
        if (matchesTarget(item.en, heard)) {
          burstConfetti(window.innerWidth / 2, window.innerHeight / 2);
          toastLocal(host, t('games.sayit_heard').replace('{w}', item.en), true);
          mascotSay('sayit_heard', { avatar: document.getElementById('play-mascot') });
        } else {
          toastLocal(host, t('games.sayit_unclear'), false);
        }
        return;
      }
      if (corrente) {
        const r = corrente; corrente = null;
        rec.classList.remove('is-rec'); label.textContent = t('games.record_start');
        blob = await r.stop();
        if (blob && blob.size) { save.stats.totalRecordings = (save.stats.totalRecordings || 0) + 1; persist(); }
        return;
      }
      try {
        corrente = await startRecording();
        rec.classList.add('is-rec'); label.textContent = t('games.record_stop');
      } catch { row.remove(); }
    });
    row.appendChild(rec);
  }
  const listen = el('button', 'btn btn-cool btn-lg', t('games.sayit_listen'));
  listen.type = 'button';
  row.appendChild(listen);
  stage.appendChild(row);

  const judge = el('div', 'rec-row');
  judge.hidden = true;
  const same = el('button', 'btn btn-good btn-lg', t('games.sayit_same'));
  const almost = el('button', 'btn btn-ghost', t('games.sayit_almost'));
  same.type = almost.type = 'button';
  judge.appendChild(same); judge.appendChild(almost);
  stage.appendChild(judge);
  host.appendChild(stage);

  await pause(250);
  await dopoLaVoce(row, mascotSay('sayit_go', { avatar: document.getElementById('play-mascot') }));

  return new Promise(resolve => {
    listen.addEventListener('click', async () => {
      sfxTap();
      listen.disabled = true;
      if (corrente) { const r = corrente; corrente = null; rec?.classList.remove('is-rec'); blob = await r.stop(); }
      if (blob && blob.size) await playBlob(blob);   // prima tu
      await speakItem(item);                          // poi il modello
      listen.disabled = false;
      judge.hidden = false;
    });
    const fine = async (uguale, ev) => {
      same.disabled = almost.disabled = true;
      onRepeat?.();
      if (uguale) { fx.good(ev, true, item); report(item.id, true); }
      else { mostraConferma(host, item); }
      await pause(900);
      resolve();
    };
    same.addEventListener('click', (ev) => fine(true, ev));
    almost.addEventListener('click', (ev) => fine(false, ev));
  });
}

/** Un messaggio dentro l'area di gioco, breve, non bloccante. */
function toastLocal(host, text, good) {
  host.querySelector('.sayit-toast')?.remove();
  const n = el('p', `written-help sayit-toast anim-pop${good ? ' is-confirm' : ''}`, text);
  host.appendChild(n);
  setTimeout(() => n.remove(), 2200);
}

/* ------------------------------------------------------------------ */
/* 4. Caccia alla parola                                               */
/* ------------------------------------------------------------------ */

async function gameHunt(api) {
  const { host, items, pool, report, fx } = api;
  // Due bersagli con la stessa illustrazione renderebbero la caccia
  // impossibile: il bambino ne tocca uno giusto e sembra sbagliato.
  const targets = distinctBySprite(items).slice(0, CONFIG.game.huntTargets);

  host.innerHTML = '';
  host.appendChild(el('p', 'game-prompt', t('games.hunt_prompt')));

  const extras = Math.max(0, 6 - targets.length);
  // Anche i riempitivi sono parole: il disegno di una frase al plurale
  // ("These are cats.") accanto al gatto renderebbe ambiguo "cat".
  const fillers = distinctBySprite(
    pool.filter(p => p.kind === 'word' && !targets.some(tg => tg.sprite === p.sprite))
  ).slice(0, extras);
  const options = shuffle([...targets, ...shuffle(fillers).slice(0, extras)]);

  const grid = el('div', 'choice-grid cols-3');
  grid.style.setProperty('--cols', 3);
  grid.style.setProperty('--rows', Math.ceil(options.length / 3));
  host.appendChild(grid);

  const buttons = new Map();
  options.forEach(opt => {
    const btn = el('button', 'choice');
    btn.type = 'button';
    btn.appendChild(spriteSvg(opt.sprite));
    btn.setAttribute('aria-label', opt.it);
    grid.appendChild(btn);
    buttons.set(opt.id, btn);
  });

  let index = 0;
  let firstTry = true;
  let errori = 0;

  // L'orb pronuncia sempre il bersaglio corrente della caccia.
  const orb = audioOrb(() => targets[index]);
  host.appendChild(orb);

  const announce = (primo = false) => fermo(grid, async () => {
    await pause(300);
    if (primo) await spiega('howto_hunt');
    await orb._play();
  });
  announce(true);

  return new Promise(resolve => {
    let finished = false;

    grid.addEventListener('click', async (ev) => {
      const btn = ev.target.closest('.choice');
      if (!btn || btn.disabled || finished) return;
      sfxTap();

      // Dopo l'ultimo bersaglio la caccia e' chiusa: i tocchi in piu'
      // (frequenti, a 7 anni) non devono fare nulla.
      const current = targets[index];
      if (!current) return;

      if (buttons.get(current.id) === btn) {
        btn.disabled = true;
        btn.classList.add('is-found');
        fx.good(ev, firstTry, current);
        report(current.id, firstTry);
        index += 1;
        firstTry = true;
        // Il bersaglio cambia dentro lo stesso turno: l'aiuto era del
        // precedente e non deve restare a suggerire la parola sbagliata.
        errori = 0;
        togliAiuto(host);
        if (index >= targets.length) {
          finished = true;
          await pause(600);
          resolve();
        } else {
          await pause(450);
          announce();
        }
      } else {
        firstTry = false;
        errori += 1;
        btn.classList.add('is-wrong');
        await fermo(grid, async () => {
          await fx.bad();
          btn.classList.remove('is-wrong');
          mostraAiuto(host, current, api.showWritten, errori);
          await orb._play();
        });
      }
    });
  });
}

/* ------------------------------------------------------------------ */
/* 5. Trascina la parola sull'immagine                                 */
/* ------------------------------------------------------------------ */

async function gameDragDrop(api) {
  const { host, items, pool, difficulty, report, fx } = api;
  const item = items[0];

  host.innerHTML = '';
  host.appendChild(el('p', 'game-prompt', t('games.dragdrop_prompt')));

  const stage = el('div', 'dnd-stage');
  const targetsWrap = el('div', 'dnd-targets');
  const n = Math.min(4, Math.max(2, choiceCount(pool, difficulty)));
  const options = shuffle([item, ...distractors(pool, item, n - 1)]);

  options.forEach(opt => {
    const box = el('div', 'drop-target');
    box.dataset.id = opt.id;
    box.appendChild(spriteSvg(opt.sprite));
    targetsWrap.appendChild(box);
  });

  const token = el('div', 'drag-token', item.en);
  token.setAttribute('role', 'button');
  token.tabIndex = 0;

  stage.appendChild(targetsWrap);
  stage.appendChild(token);
  host.appendChild(stage);

  fermo(stage, async () => { await pause(300); await spiega('howto_dragdrop'); await speakItem(item); });
  token.addEventListener('dblclick', () => speakItem(item));

  return new Promise(resolve => {
    let firstTry = true;
    let dragging = false;
    let finished = false;
    let ghost = null;

    const finish = async (box, ev) => {
      if (finished) return;
      finished = true;
      box.classList.add('is-correct');
      token.style.visibility = 'hidden';
      await speakItem(item);
      fx.good(ev, firstTry, item);
      report(item.id, firstTry);
      await pause(1000);
      resolve();
    };

    const wrong = async (box) => {
      if (finished) return;
      firstTry = false;
      box?.classList.add('is-wrong');
      await fermo(stage, async () => {
        await fx.bad();
        box?.classList.remove('is-wrong');
        await speakItem(item);
      });
    };

    // Trascinamento con Pointer Events: funziona con dito, penna e mouse.
    token.addEventListener('pointerdown', (ev) => {
      dragging = true;
      ghost = token;
      token.setPointerCapture?.(ev.pointerId);
      token.classList.add('is-dragging');
      moveGhost(ev.clientX, ev.clientY);
    });

    token.addEventListener('pointermove', (ev) => {
      if (!dragging) return;
      ev.preventDefault();
      moveGhost(ev.clientX, ev.clientY);
      highlight(ev.clientX, ev.clientY);
    });

    token.addEventListener('pointerup', async (ev) => {
      if (!dragging) return;
      dragging = false;
      // Prima si legge cosa c'e' sotto il dito, poi si rimette a posto il
      // token: invertendo l'ordine il token tornerebbe sotto il puntatore.
      const box = boxAt(ev.clientX, ev.clientY);
      token.classList.remove('is-dragging');
      token.style.position = token.style.left = token.style.top = '';
      targetsWrap.querySelectorAll('.drop-target').forEach(b => b.classList.remove('is-over'));
      if (box && box.dataset.id === item.id) finish(box, ev);
      else if (box) wrong(box);
    });

    // In alternativa al trascinamento si puo' semplicemente toccare
    // l'immagine: a 7 anni il drag non sempre riesce al primo colpo.
    targetsWrap.addEventListener('click', (ev) => {
      const box = ev.target.closest('.drop-target');
      if (!box || dragging) return;
      sfxTap();
      if (box.dataset.id === item.id) finish(box, ev);
      else wrong(box);
    });

    function moveGhost(x, y) {
      ghost.style.position = 'fixed';
      ghost.style.left = `${x}px`;
      ghost.style.top = `${y}px`;
    }
    function boxAt(x, y) {
      const node = document.elementFromPoint(x, y);
      return node ? node.closest('.drop-target') : null;
    }
    function highlight(x, y) {
      const box = boxAt(x, y);
      targetsWrap.querySelectorAll('.drop-target').forEach(b =>
        b.classList.toggle('is-over', b === box));
    }
  });
}

/* ------------------------------------------------------------------ */
/* 6. Ricomponi la frase                                               */
/* ------------------------------------------------------------------ */

async function gameBuild(api) {
  const { host, items, report, fx } = api;
  const item = items[0];
  const words = item.en.split(/\s+/);

  host.innerHTML = '';
  host.appendChild(el('p', 'game-prompt', t('games.build_prompt')));

  const orb = audioOrb(item);
  host.appendChild(orb);
  host.appendChild(el('p', 'word-hint-it', item.it));

  const line = el('div', 'build-line');
  const bank = el('div', 'build-bank');
  host.appendChild(line);
  host.appendChild(bank);

  const order = shuffle(words.map((w, i) => ({ w, i })));
  const placed = [];

  fermo([line, bank], async () => { await pause(250); await spiega('howto_build'); await orb._play(); });

  return new Promise(resolve => {
    let firstTry = true;

    order.forEach(entry => {
      const chip = el('button', 'build-chip', entry.w);
      chip.type = 'button';
      chip.addEventListener('click', () => {
        if (chip.classList.contains('is-used')) return;
        sfxTap();
        chip.classList.add('is-used');

        const inLine = el('button', 'build-chip', entry.w);
        inLine.type = 'button';
        inLine.addEventListener('click', () => {
          sfxTap();
          chip.classList.remove('is-used');
          const idx = placed.indexOf(entry);
          if (idx >= 0) placed.splice(idx, 1);
          inLine.remove();
        });
        line.appendChild(inLine);
        placed.push(entry);

        if (placed.length === words.length) check();
      });
      bank.appendChild(chip);
    });

    async function check() {
      const ok = placed.every((entry, pos) => entry.w === words[pos]);
      if (ok) {
        line.classList.add('is-correct');
        line.querySelectorAll('button').forEach(b => b.disabled = true);
        await speakItem(item);
        fx.good(null, firstTry, item);
        report(item.id, firstTry);
        await pause(1000);
        resolve();
      } else {
        firstTry = false;
        line.classList.add('is-wrong');
        await fermo([line, bank], async () => {
          await fx.bad();
          line.classList.remove('is-wrong');
          // Si rimette tutto nel mazzo e si riascolta: nessuna penalita'.
          line.innerHTML = '';
          placed.length = 0;
          bank.querySelectorAll('.build-chip').forEach(c => c.classList.remove('is-used'));
          await orb._play();
        });
      }
    }
  });
}

/* ------------------------------------------------------------------ */
/* 7. Vero o falso                                                     */
/* ------------------------------------------------------------------ */

/**
 * Si vede un'immagine, si sente una parola: e' quella giusta?
 *
 * E' un atto mentale diverso dallo scegliere fra quattro: qui si VERIFICA,
 * e meta' delle volte la risposta giusta e' "no". Spezza il ritmo del "tocca
 * l'immagine" e insegna a non fidarsi del primo suono che arriva. Due bottoni
 * grandi con icona, niente da leggere.
 */
async function gameTrueFalse(api) {
  const { host, items, pool, showWritten, report, fx } = api;
  const item = items[0];
  const bugia = distractors(pool, item, 1)[0];
  // Senza un distrattore valido non c'e' niente da verificare.
  if (!bugia) return gameMatch(api);

  const vero = Math.random() < 0.5;
  const detto = vero ? item : bugia;

  host.innerHTML = '';
  host.appendChild(el('p', 'game-prompt', t('games.truefalse_prompt')));

  const art = el('div', 'choice tf-art');
  art.style.pointerEvents = 'none';
  art.appendChild(spriteSvg(item.sprite));
  host.appendChild(art);

  const orb = audioOrb(detto);
  host.appendChild(orb);

  const riga = el('div', 'tf-row');
  const si = el('button', 'tf-btn tf-yes');
  si.type = 'button'; si.setAttribute('aria-label', t('games.truefalse_yes'));
  si.appendChild(spriteSvg('sp-icon-check'));
  si.appendChild(el('span', 'tf-label', t('games.truefalse_yes')));
  const no = el('button', 'tf-btn tf-no');
  no.type = 'button'; no.setAttribute('aria-label', t('games.truefalse_no'));
  no.appendChild(spriteSvg('sp-icon-close'));
  no.appendChild(el('span', 'tf-label', t('games.truefalse_no')));
  riga.appendChild(si); riga.appendChild(no);
  host.appendChild(riga);

  fermo(riga, async () => { await pause(300); await spiega('howto_truefalse'); await orb._play(); });

  return new Promise(resolve => {
    let firstTry = true;
    let errori = 0;
    const rispondi = async (scelta, btn, ev) => {
      if (si.disabled) return;
      sfxTap();
      if (scelta === vero) {
        si.disabled = no.disabled = true;
        btn.classList.add('is-correct');
        // La conferma mostra cio' che si e' SENTITO: e' quello da imparare.
        fx.good(ev, firstTry, detto);
        report(item.id, firstTry);
        await pause(1100);
        resolve();
      } else {
        firstTry = false;
        errori += 1;
        btn.classList.add('is-wrong');
        await fermo(riga, async () => {
          await fx.bad();
          btn.classList.remove('is-wrong');
          mostraAiuto(host, detto, showWritten, errori);
          await orb._play();
        });
      }
    };
    si.addEventListener('click', ev => rispondi(true, si, ev));
    no.addEventListener('click', ev => rispondi(false, no, ev));
  });
}

/* ------------------------------------------------------------------ */

export const GAMES = {
  dialogue: (api) => gameDialogue(api),
  sayit: gameSayIt,
  truefalse: gameTrueFalse,
  match: gameMatch,
  quiz: gameQuiz,
  listen: gameListen,
  hunt: gameHunt,
  dragdrop: gameDragDrop,
  build: gameBuild
};

/** Quanti item consuma un tipo di gioco in un singolo turno. */
export function itemsPerStep(type) {
  if (type === 'dialogue') return 0;
  return type === 'hunt' ? CONFIG.game.huntTargets : 1;
}
