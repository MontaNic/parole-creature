/**
 * Parole & Creature — punto di ingresso.
 *
 * Qui vivono: avvio dell'app, navigazione fra le schermate, costruzione di
 * una partita (quali item, quali mini-giochi, in che ordine) e il "clock"
 * della sessione con il limite gentile impostato dai genitori.
 *
 * Le regole didattiche stanno in js/srs.js, i contenuti in content.json:
 * per aggiungere parole o mondi non serve toccare questo file.
 */

import { CONFIG } from './js/config.js';
import {
  loadAll, content, t, applyStaticStrings, getItem, getPhase
} from './js/content-loader.js';
import {
  save, loadSave, persist, rolloverDay, registerPlayToday,
  addXp, checkAccessWindow
} from './js/state.js';
import { recordAnswer, pickRoundItems, shuffle } from './js/srs.js';
import {
  splitRound, freeReviewPool, unitProgress, currentUnit,
  curriculumConfig, phaseProgress, playablePhases
} from './js/curriculum.js';
import {
  initAudioUnlock, sfxCorrect, sfxRetry, stopVoice, startMusic, musicVolume,
  isAudioUnlocked
} from './js/audio.js';
import { initEffects, celebrateCorrect, celebrate, toast } from './js/effects.js';
import {
  renderMascot, mascotSay, mascotCheer, stageChangedAt, encouragementKey
} from './js/mascot.js';
import { GAMES, mostraConferma } from './js/minigames.js';
import { pendingAtStart, pendingAfterRound, playChapters } from './js/story.js';
import { planChest, openChest } from './js/chests.js';
import { renderDen } from './js/den.js';
import { bumpToday } from './js/history.js';
import { planBonus, bubblePool, playBonus } from './js/bonus.js';
import { checkBadges } from './js/badges.js';
import { dialogueFor, wantsDialogue } from './js/dialogues.js';
import { renderPhonics, runLesson } from './js/phonics.js';
import { masteredCount } from './js/srs.js';
import {
  showScreen, renderHome, renderAlbum, renderSummary,
  renderBlocked, runOnboarding, syncCreatures,
  runStartGate
} from './js/screens.js';
import { openParents } from './js/parents.js';
import { ensureTodayMission, trackMissionEvent } from './js/missions.js';

/* ------------------------------------------------------------------ */
/* Stato della sessione corrente (non persistente)                     */
/* ------------------------------------------------------------------ */

const session = {
  correctStreakVisual: 0,   // usato per ruotare suoni e animazioni
  retryCount: 0,            // ruota le battute di incoraggiamento
  greetCount: 0,            // alterna le frasi di Pepe sulla home
  roundActive: false,
  homeRefs: null,
  ignoreSessionLimit: false // il genitore/bambino ha scelto di continuare
};

/* ------------------------------------------------------------------ */
/* Avvio                                                               */
/* ------------------------------------------------------------------ */

async function boot() {
  initEffects();
  loadSave();

  try {
    await loadAll();
  } catch (err) {
    console.error('[boot] contenuti non caricati:', err);
    applyStaticStrings();
    showScreen('error');
    return;
  }

  applyStaticStrings();
  initAudioUnlock();
  // Il worker va registrato PRIMA di aspettare il tocco: non ha bisogno di
  // un gesto, e la cache offline deve riempirsi anche se nessuno tocca.
  registerServiceWorker();
  // Nessuna voce prima di un tocco: senza, il browser rifiuta play() e Pepe
  // parlerebbe con la voce sintetica del sistema. Se un gesto c'e' gia'
  // stato durante il caricamento, la schermata non serve.
  if (!isAudioUnlocked()) await runStartGate();
  rolloverDay();
  ensureTodayMission();
  syncCreatures();
  wireGlobalNav();
  startSessionClock();

  const access = checkAccessWindow();
  if (!access.allowed) {
    renderBlocked(access.reason, () => openParents(goHome));
    return;
  }

  if (!save.settings.onboardingDone) {
    await runOnboarding();
  }
  // Il prologo della storia: una volta sola, subito dopo l'onboarding (o al
  // primo avvio dopo l'aggiornamento, per chi giocava gia').
  await playChapters(pendingAtStart());
  goHome(true);
}

function wireGlobalNav() {
  document.querySelectorAll('[data-nav="home"]').forEach(btn => {
    btn.addEventListener('click', () => { stopVoice(); goHome(); });
  });
}

/* ------------------------------------------------------------------ */
/* Home                                                                */
/* ------------------------------------------------------------------ */

function goHome(firstTime = false) {
  stopVoice();
  session.roundActive = false;

  const access = checkAccessWindow();
  if (!access.allowed) {
    renderBlocked(access.reason, () => openParents(goHome));
    return;
  }

  session.homeRefs = renderHome({
    onWorld: (world) => startRound({ world }),
    onReview: () => startRound({ review: true }),
    onAlbum: () => renderAlbum(),
    onDen: () => renderDen(),
    onPhonics: () => renderPhonics(async (lesson) => {
      session.roundActive = false;
      renderMascot(document.getElementById('play-mascot'));
      await runLesson(lesson);
      goHome();
    }),
    onParents: () => openParents(goHome)
  });

  greet(firstTime);
}

async function greet(firstTime) {
  const refs = session.homeRefs;
  if (!refs) return;
  // Tornando sulla home Pepe alterna le due frasi di attesa: sentire sempre
  // la stessa, dieci volte al giorno, la fa diventare rumore.
  const key = firstTime
    ? (save.streak.current > 1 ? 'streak_kept' : 'welcome_back')
    : (session.greetCount++ % 2 === 0 ? 'idle_1' : 'idle_2');
  await mascotSay(key, { bubble: refs.bubble, avatar: refs.mascotHost });
}

/* ------------------------------------------------------------------ */
/* Costruzione di una partita                                          */
/* ------------------------------------------------------------------ */

/**
 * Costruisce una partita.
 *
 * Ogni partita e' composta da due sorgenti:
 *   - il materiale NUOVO dell'unita' corrente;
 *   - un ripasso delle unita' precedenti (interleaving), nella quota indicata
 *     dal curriculum.
 *
 * La ripetizione spaziata ordina dentro ciascuna delle due sorgenti, ma non
 * potrebbe da sola garantire che le unita' vecchie tornino: la quota di
 * ripasso serve esattamente a questo.
 *
 * @param {{world?: object, review?: boolean}} opts
 */
function buildRound(opts) {
  const settings = save.settings;
  const total = CONFIG.game.questionsPerRound;

  let world = opts.world;
  let picked = [];
  let reviewIds = new Set();
  let pool = [];

  if (opts.review) {
    // Ripasso libero: tutto quello che il bambino ha gia' incontrato, con la
    // precedenza a cio' che non e' ancora solido.
    pool = freeReviewPool(settings);
    if (!pool.length) return null;
    world = {
      id: '__review__',
      title_it: t('ui.free_review'),
      phase: currentUnit(settings)?.phase || 1,
      minigames: ['match', 'listen', 'quiz', 'hunt'],
      color: '#38bdf8'
    };
    picked = pickRoundItems(pool, Math.min(total, Math.max(5, pool.length)));
    picked.forEach(it => reviewIds.add(it.id));
  } else {
    const split = splitRound(world, total, settings);
    if (!split.newItems.length && !split.reviewItems.length) return null;

    const fresh = pickRoundItems(split.newItems, split.newCount);
    const review = split.reviewCount > 0
      ? pickRoundItems(split.reviewItems, split.reviewCount)
      : [];
    review.forEach(it => reviewIds.add(it.id));

    picked = interleave(fresh, review);
    pool = dedupeById([...split.newItems, ...split.reviewItems]);
  }

  if (!picked.length) return null;

  // Il testo scritto dipende dalla FASE che si sta giocando, non dal singolo
  // item: arrivato alla fase 2, anche le parole vecchie vanno riviste scritte.
  const phase = getPhase(world.phase);
  const showWritten = Boolean(phase?.showWrittenWord);

  const pr = opts.review ? { ratio: 1, plays: 3 } : unitProgress(world, settings);
  const difficulty = pr.ratio > 0.6 ? 3 : pr.plays > 0 ? 2 : 1;

  return {
    world, pool, items: picked, reviewIds, showWritten, difficulty,
    steps: buildSteps(world, picked, pool, difficulty),
    // Il dialogo dell'unita' chiude la partita: sempre le prime due volte, poi una su tre.
    dialogue: (!opts.review && dialogueFor(world.id) && wantsDialogue((save.progress.worlds[world.id] || {}).plays || 0)) ? dialogueFor(world.id) : null
  };
}

/**
 * Distribuisce gli item di ripasso fra quelli nuovi invece di accodarli:
 * alternare fa lavorare il richiamo, metterli tutti in fondo no.
 */
function interleave(fresh, review) {
  if (!review.length) return fresh.slice();
  if (!fresh.length) return review.slice();

  const out = [];
  const gap = (fresh.length + review.length) / review.length;
  let ri = 0;
  let next = Math.max(1, Math.round(gap) - 1);

  fresh.forEach((item, idx) => {
    out.push(item);
    if (ri < review.length && out.length >= next) {
      out.push(review[ri++]);
      next = out.length + Math.max(1, Math.round(gap) - 1);
    }
  });
  while (ri < review.length) out.push(review[ri++]);
  return out;
}

function dedupeById(items) {
  return [...new Map(items.map(it => [it.id, it])).values()];
}

/*
 * Quale gioco puo' ospitare quale item.
 *
 * Le frasi NON entrano nei giochi a immagini. "What is it? A dragon." con il
 * disegno del drago e' la stessa domanda di "dragon", solo piu' lunga: al
 * bambino arrivava a volte la parola e a volte la frase per lo stesso
 * disegno, e sembrava incoerenza. Le frasi vanno dove la loro forma conta —
 * ascolto, quiz col testo, costruzione, vero o falso.
 */
const GIOCHI_PER_PAROLA = ['match', 'hunt', 'quiz', 'truefalse', 'dragdrop', 'listen', 'sayit'];
const GIOCHI_PER_FRASE  = ['listen', 'quiz', 'build', 'truefalse', 'sayit'];

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
function buildSteps(world, items, pool, baseDifficulty) {
  const cfg = curriculumConfig();
  const disponibili = new Set(world.minigames || ['match']);
  const steps = [];
  let i = 0;
  let precedente = null;

  const parolaDistinte = (da, n) => {
    // Le prossime n PAROLE con illustrazioni diverse, saltando le frasi.
    const out = [];
    const viste = new Set();
    for (let k = da; k < items.length && out.length < n; k++) {
      const it = items[k];
      if (it.kind !== 'word' || viste.has(it.sprite)) continue;
      viste.add(it.sprite);
      out.push(it);
    }
    return out;
  };

  while (i < items.length) {
    const item = items[i];
    const base = item.kind === 'phrase' ? GIOCHI_PER_FRASE : GIOCHI_PER_PAROLA;

    let candidati = base.filter(tp => disponibili.has(tp)).filter(tp => {
      if (tp === 'build') {
        const parole = item.en.split(/\s+/).length;
        return parole >= 2 && parole <= cfg.maxBuildWords;
      }
      if (tp === 'hunt') return pool.length >= 4 && parolaDistinte(i, CONFIG.game.huntTargets).length === CONFIG.game.huntTargets;
      if (tp === 'match' || tp === 'quiz' || tp === 'dragdrop' || tp === 'truefalse') return pool.length >= 2;
      return true;
    });
    if (!candidati.length) candidati = ['listen'];

    // Mai lo stesso gioco due volte di fila, se c'e' alternativa.
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

  // Difficolta' a salire: il primo terzo un gradino sotto la base, l'ultimo
  // un gradino sopra, e l'ultima domanda e' sempre la piu' difficile.
  const n = steps.length;
  steps.forEach((st, k) => {
    const pos = n > 1 ? k / (n - 1) : 1;
    let d = baseDifficulty + (pos < 0.34 ? -1 : pos > 0.66 ? 1 : 0);
    st.isFinal = k === n - 1;
    if (st.isFinal) d = 3;
    st.difficulty = Math.max(1, Math.min(3, d));
  });
  return steps;
}

/* ------------------------------------------------------------------ */
/* Svolgimento della partita                                           */
/* ------------------------------------------------------------------ */

async function startRound(opts) {
  const round = buildRound(opts);
  if (!round) { goHome(); return; }

  session.roundActive = true;
  session.currentRound = { ...opts, world: round.world };

  showScreen('play');
  const host = document.getElementById('play-area');
  const scoreEl = document.getElementById('play-score');
  const progressEl = document.getElementById('play-progress');
  renderMascot(document.getElementById('play-mascot'));

  let correct = 0;
  let answered = 0;
  let missionJustDone = false;
  let levelUp = false;

  const totalItems = round.steps.reduce((sum, s) => sum + s.items.length, 0);
  scoreEl.textContent = '0';
  progressEl.style.width = '0%';

  let serie = 0;   // risposte giuste al primo colpo, di fila

  // Lo scrigno a sorpresa: deciso adesso, in silenzio. Il bambino non lo sa.
  const chestAt = planChest(round.steps.length, {
    alreadyToday: Boolean(save.daily.chestOpened),
    roundsPlayed: save.stats.totalRounds
  });

  const fx = {
    /**
     * Risposta giusta.
     *
     * Oltre a suono e coriandoli, mostra la PAROLA SCRITTA: senza, il
     * bambino non aveva mai una conferma visibile di cosa avesse indovinato
     * — vedeva solo che la partita andava avanti. Qui la lettura non e' un
     * aiuto ma un premio, quindi vale anche in fase 1: arriva DOPO la
     * risposta, non prima.
     *
     * Ogni tre giuste di fila, una festa piu' grande e una battuta di Pepe.
     */
    good: (ev, firstTry, item) => {
      const variant = session.correctStreakVisual++ % 3;
      sfxCorrect(variant);
      celebrateCorrect(variant, pointOf(ev));
      toast(t(`games.correct_${variant + 1}`), true, 1200);
      mascotCheer(document.getElementById('play-mascot'));
      if (item) mostraConferma(host, item);

      serie = firstTry ? serie + 1 : 0;
      if (firstTry && serie > 0 && serie % 3 === 0) {
        celebrate();
        mascotSay(encouragementKey('streak', serie / 3 - 1), { avatar: document.getElementById('play-mascot') });
      }
    },
    /**
     * Risposta sbagliata.
     *
     * Il messaggio a schermo da solo non basta: a 7 anni, e senza saper
     * leggere, un errore in silenzio sembra un muro. Pepe deve sempre dire
     * qualcosa, e deve finire di parlare PRIMA che il mini-gioco riproponga
     * la parola, altrimenti le due voci si accavallano.
     *
     * @returns {Promise<void>} si risolve quando Pepe ha finito.
     */
    bad: async () => {
      const key = encouragementKey('retry', session.retryCount++);
      sfxRetry();
      toast(t(`games.${key}`), false, 1600);
      await mascotSay(key, { avatar: document.getElementById('play-mascot') });
    }
  };

  const report = (itemId, firstTry) => {
    answered += 1;
    const item = getItem(itemId);

    recordAnswer(itemId, firstTry);
    bumpToday(firstTry ? { correct: 1 } : { wrong: 1 });
    if (firstTry) {
      correct += 1;
      save.stats.totalCorrect += 1;
      if (addXp(CONFIG.game.xpPerCorrect)) levelUp = true;
    } else {
      save.stats.totalWrong += 1;
    }

    // Alla prima risposta della giornata scatta (una volta sola) la streak.
    registerPlayToday();

    if (trackMissionEvent({
      correct: firstTry,
      theme: item?.theme,
      review: round.reviewIds.has(itemId)
    })) missionJustDone = true;

    scoreEl.textContent = String(correct);
    progressEl.style.width = `${Math.round((answered / totalItems) * 100)}%`;
    persist();
  };

  for (const [i, step] of round.steps.entries()) {
    if (!session.roundActive) return;   // il bambino e' uscito con "indietro"
    const play = GAMES[step.type] || GAMES.match;

    // L'ultima domanda e' annunciata: dare una forma alla partita — inizio
    // facile, sfida in fondo — e' cio' che la distingue da una lista.
    if (step.isFinal && round.steps.length > 2) {
      await mascotSay('final_challenge', { avatar: document.getElementById('play-mascot') });
    }

    await play({
      host,
      items: step.items,
      pool: round.pool,
      showWritten: round.showWritten,
      difficulty: step.difficulty,
      isFinal: step.isFinal,
      report,
      fx,
      onRepeat: () => {
        save.stats.totalRepeats += 1;
        if (trackMissionEvent({ repeat: true })) missionJustDone = true;
      }
    });

    if (i === chestAt && session.roundActive) {
      const esito = await openChest(host, { mascotHost: document.getElementById('play-mascot') });
      if (esito.levelUp) levelUp = true;
    }
  }

  if (!session.roundActive) return;
  if (round.dialogue) {
    await GAMES.dialogue({ host, dialogue: round.dialogue, fx, onRepeat: () => { save.stats.totalRepeats += 1; } });
    if (!session.roundActive) return;
  }
  await finishRound({ round, correct, total: totalItems, levelUp, missionJustDone, opts });
}

function pointOf(ev) {
  if (!ev) return null;
  if (typeof ev.clientX === 'number') return { x: ev.clientX, y: ev.clientY };
  const rect = ev.target?.getBoundingClientRect?.();
  if (rect) return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  return null;
}

async function finishRound({ round, correct, total, levelUp, missionJustDone, opts }) {
  session.roundActive = false;

  // Statistiche dell'unita'. Interessa sapere se e' stata chiusa PROPRIO
  // ora: e' l'evento che merita l'annuncio, non il fatto di essere chiusa.
  let worldJustCompleted = false;
  if (round.world.id !== '__review__') {
    const rec = save.progress.worlds[round.world.id] || { plays: 0, completed: false };
    const wasCompleted = Boolean(rec.completed);
    rec.plays = (rec.plays || 0) + 1;
    rec.lastPlayed = new Date().toISOString();
    rec.completed = unitProgress(round.world).completed;
    worldJustCompleted = rec.completed && !wasCompleted;
    save.progress.worlds[round.world.id] = rec;
  }
  save.stats.totalRounds += 1;
  bumpToday({ rounds: 1, mastered: masteredCount() });
  if (trackMissionEvent({ roundDone: true })) missionJustDone = true;

  const phaseUnlocked = checkPhaseUnlock();
  const newCreatures = syncCreatures();
  const newBadges = checkBadges();
  persist(true);

  // La creatura appena trovata ha un capitolo: si vede dopo il riepilogo con
  // la festa, al tocco che prosegue, prima di andare avanti.
  const storia = pendingAfterRound(newCreatures, phaseUnlocked);

  // Il gioco bonus: dopo tre stelle, raro, breve. Dopo la storia, prima di
  // andare avanti. Le bolle vogliono parole con un PNG: se sono poche, niente.
  const ratio = total ? correct / total : 0;
  const stelle = ratio >= 0.9 ? 3 : ratio >= 0.5 ? 2 : 1;
  const bolle = bubblePool(round.pool, content.words);
  session.roundsSinceBonus = (session.roundsSinceBonus ?? 99) + 1;
  const bonus = planBonus(stelle, {
    roundsSince: session.roundsSinceBonus,
    todayCount: save.daily.bonusCount || 0,
    poolSize: bolle.length
  });
  const giocaBonus = async () => {
    if (!bonus || session.bonusDone) return;
    session.bonusDone = true;
    session.roundsSinceBonus = 0;
    await mascotSay('bonus_start', {});
    await playBonus({ items: shuffle(bolle), showWritten: round.showWritten });
  };
  session.bonusDone = false;
  const poi = (fn) => async () => { await playChapters(storia); storia.length = 0; await giocaBonus(); fn(); };

  if (levelUp && stageChangedAt(save.progress.level)) {
    // Il cambio di stadio della mascotte e' un evento: vale un festeggiamento.
    toast(t('mascot.level_up'), true, 2000);
  }

  const overLimit = !session.ignoreSessionLimit
    && save.daily.minutesPlayed >= save.settings.sessionMinutes;

  await renderSummary(
    { correct, total, newCreatures, levelUp, phaseUnlocked,
      worldCompleted: worldJustCompleted,
      world: round.world,
      newBadges,
      missionDone: missionJustDone, endSession: overLimit },
    {
      onHome: poi(() => goHome()),
      onAgain: poi(() => startRound(opts)),
      onContinueAnyway: poi(() => { session.ignoreSessionLimit = true; startRound(opts); })
    }
  );
}

/**
 * Verifica se una fase ha appena superato la soglia di padronanza.
 * E' il traguardo piu' importante del gioco: va segnato una volta sola,
 * perche' la seconda volta non e' piu' una notizia.
 *
 * @returns {number|null} numero della fase appena aperta
 */
function checkPhaseUnlock() {
  let unlocked = null;
  for (const phase of playablePhases()) {
    const reached = phaseProgress(phase).reached;
    const already = save.progress.phasesReached[phase];
    if (reached && !already) {
      save.progress.phasesReached[phase] = new Date().toISOString();
      unlocked = phase;
    }
  }
  if (unlocked !== null) persist(true);
  return unlocked;
}

/* ------------------------------------------------------------------ */
/* Clock della sessione (limite gentile)                               */
/* ------------------------------------------------------------------ */

const TICK_MS = 15000;

function startSessionClock() {
  setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    rolloverDay();
    save.daily.minutesPlayed += TICK_MS / 60000;
    save.stats.totalMinutes += TICK_MS / 60000;
    bumpToday({ minutes: TICK_MS / 60000 });
  }, TICK_MS);

  // Riprendere la musica quando si torna sull'app dopo un cambio di scheda.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && musicVolume() > 0) startMusic();
    else stopVoice();
  });
}

/* ------------------------------------------------------------------ */
/* Service worker (funzionamento offline)                              */
/* ------------------------------------------------------------------ */

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol === 'file:') return;   // niente SW aprendo il file a mano
  navigator.serviceWorker.register('sw.js').catch(err =>
    console.warn('[sw] registrazione fallita:', err));

  /*
   * Il rabbocco delle illustrazioni e' guidato da qui: la pagina chiede al
   * worker un pezzo alla volta finche' non manca nulla. Cosi' nessun evento
   * del worker dura a lungo, e se il bambino chiude prima si riprende alla
   * prossima apertura. Stato leggibile da window.__rabbocco (per i test).
   */
  window.__rabbocco = { mancanti: null, totale: 0, giri: 0 };
  navigator.serviceWorker.addEventListener('message', (ev) => {
    const r = ev.data && ev.data.rabbocco;
    if (!r) return;
    window.__rabbocco = { mancanti: r.mancanti, totale: r.totale, giri: window.__rabbocco.giri + 1 };
    // Il worker fa da solo tutti i giri; la pagina lo rilancia solo se e' rimasto qualcosa a fine corsa.
    if (r.mancanti > 0 && document.visibilityState === 'visible') setTimeout(chiediRabbocco, 5000);
  });
  const chiediRabbocco = () => navigator.serviceWorker.ready
    .then(reg => (reg.active || reg.waiting || reg.installing)?.postMessage('rabbocca'))
    .catch(() => {});
  navigator.serviceWorker.ready.then(() => chiediRabbocco());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') chiediRabbocco();
  });
}

/* ------------------------------------------------------------------ */

boot();

// Utile in console durante lo sviluppo e per il playtest con il bambino.
// `save` e' una live binding del modulo: si legge con una funzione, non
// copiandola, altrimenti si fotografa lo stato del boot.
window.__gioco = { getSave: () => save, content, shuffle, startRound, goHome };
