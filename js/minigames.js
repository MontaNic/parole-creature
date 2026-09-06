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
import { speakItem, sfxTap } from './audio.js';
import { shuffle, distractors, distinctBySprite } from './srs.js';

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
function audioOrb(source, label) {
  const btn = el('button', 'audio-orb');
  btn.type = 'button';
  btn.setAttribute('aria-label', label || t('ui.tap_to_hear'));
  btn.appendChild(spriteSvg('sp-icon-sound'));
  const play = async () => {
    btn.classList.add('is-playing');
    await speakItem(typeof source === 'function' ? source() : source);
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

  await pause(250);
  orb._play();

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
          await fx.bad();
          btn.classList.remove('is-wrong');
          btn.classList.add('is-dim');
          mostraAiuto(host, item, showWritten, errori);
          orb._play();
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
  host.appendChild(el('p', 'game-prompt',
    isPhrase ? t('games.quiz_prompt_phrase') : t('games.quiz_prompt')));

  // Si parte dall'immagine: il bambino sa gia' di cosa si parla.
  const art = el('div', 'choice');
  art.style.maxWidth = '190px';
  art.style.width = '46vw';
  art.style.pointerEvents = 'none';
  art.appendChild(spriteSvg(item.sprite));
  host.appendChild(art);

  const n = choiceCount(pool, difficulty);
  const options = shuffle([item, ...distractors(pool, item, n - 1)]);
  const list = el('div', 'choice-list');
  host.appendChild(list);

  return new Promise(resolve => {
    let firstTry = true;
    let errori = 0;

    options.forEach(opt => {
      const btn = el('button', 'choice-text');
      btn.type = 'button';

      if (showWritten) {
        // Fase 2-3: si legge la parola/frase, l'audio resta a richiesta.
        btn.textContent = opt.en;
      } else {
        // Fase 1: nessun testo. Ogni scelta e' un altoparlante da ascoltare.
        btn.appendChild(spriteSvg('sp-icon-sound'));
        btn.querySelector('svg').classList.add('ico');
        btn.setAttribute('aria-label', t('ui.tap_to_hear'));
      }

      let heard = showWritten;   // col testo scritto non serve ascoltare prima

      btn.addEventListener('click', async (ev) => {
        if (btn.disabled) return;
        sfxTap();

        if (!heard) {
          // Primo tocco: ascolta. Secondo tocco: sceglie.
          heard = true;
          btn.classList.add('is-playing');
          await speakItem(opt);
          btn.classList.remove('is-playing');
          return;
        }

        if (opt.id === item.id) {
          list.querySelectorAll('button').forEach(b => b.disabled = true);
          btn.classList.add('is-correct');
          await speakItem(item);
          fx.good(ev, firstTry, item);
          report(item.id, firstTry);
          await pause(1000);
          resolve();
        } else {
          firstTry = false;
          errori += 1;
          btn.classList.add('is-wrong');
          btn.disabled = true;
          await fx.bad();
          // L'aiuto va sotto l'immagine, non fra le scelte: e' un
          // suggerimento sul bersaglio, non una quinta opzione.
          mostraAiuto(host, item, showWritten, errori);
          await speakItem(item);
        }
      });
      list.appendChild(btn);
    });

    // Con il testo scritto conviene sentire subito la traccia giusta.
    if (showWritten) setTimeout(() => speakItem(item), 300);
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
    const art = el('div', 'choice');
    art.style.width = 'min(190px, 46vw)';
    art.style.pointerEvents = 'none';
    art.appendChild(spriteSvg(item.sprite));
    stage.appendChild(art);
  }
  stage.appendChild(el('p', 'word-hint-it', item.it));

  const done = el('button', 'btn btn-good btn-lg', t('games.listen_done'));
  done.type = 'button';
  stage.appendChild(done);
  host.appendChild(stage);

  await pause(250);
  orb._play();

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
  const fillers = distinctBySprite(
    pool.filter(p => !targets.some(tg => tg.sprite === p.sprite))
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

  const announce = async () => {
    await pause(300);
    orb._play();
  };
  await announce();

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
        await fx.bad();
        btn.classList.remove('is-wrong');
        mostraAiuto(host, current, api.showWritten, errori);
        orb._play();
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

  setTimeout(() => speakItem(item), 300);
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
      await fx.bad();
      box?.classList.remove('is-wrong');
      speakItem(item);
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

  await pause(250);
  orb._play();

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
        await fx.bad();
        line.classList.remove('is-wrong');
        // Si rimette tutto nel mazzo e si riascolta: nessuna penalita'.
        line.innerHTML = '';
        placed.length = 0;
        bank.querySelectorAll('.build-chip').forEach(c => c.classList.remove('is-used'));
        orb._play();
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

  await pause(300);
  orb._play();

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
        await fx.bad();
        btn.classList.remove('is-wrong');
        mostraAiuto(host, detto, showWritten, errori);
        orb._play();
      }
    };
    si.addEventListener('click', ev => rispondi(true, si, ev));
    no.addEventListener('click', ev => rispondi(false, no, ev));
  });
}

/* ------------------------------------------------------------------ */

export const GAMES = {
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
  return type === 'hunt' ? CONFIG.game.huntTargets : 1;
}
