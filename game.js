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
  initAudioUnlock, sfxCorrect, sfxRetry, stopVoice, startMusic
} from './js/audio.js';
import { initEffects, celebrateCorrect, toast } from './js/effects.js';
import {
  renderMascot, mascotSay, mascotCheer, stageChangedAt, encouragementKey
} from './js/mascot.js';
import { GAMES, itemsPerStep } from './js/minigames.js';
import {
  showScreen, renderHome, renderAlbum, renderSummary,
  renderBlocked, runOnboarding, syncCreatures
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
  rolloverDay();
  ensureTodayMission();
  syncCreatures();
  registerServiceWorker();
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
    steps: buildSteps(world, picked, pool)
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

/** Alterna i mini-giochi previsti dall'unita', rispettando quanti item servono. */
function buildSteps(world, items, pool) {
  const types = (world.minigames || ['match']).slice();
  const maxBuildWords = curriculumConfig().maxBuildWords;
  const steps = [];
  let i = 0;
  let ti = 0;

  while (i < items.length) {
    let type = types[ti++ % types.length];
    const item = items[i];

    // Vincoli di buon senso.
    // "Ricomponi la frase" solo su frasi, e solo se sono abbastanza corte:
    // otto tessere da riordinare sono un rompicapo, non un esercizio.
    if (type === 'build') {
      const words = item.kind === 'phrase' ? item.en.split(/\s+/).length : 0;
      if (!words || words > maxBuildWords) type = 'quiz';
    }
    if (type === 'hunt') {
      const slice = items.slice(i, i + CONFIG.game.huntTargets);
      // Distinti per illustrazione, non per id: due item diversi possono
      // mostrare la stessa immagine.
      const distinct = new Set(slice.map(x => x.sprite)).size === CONFIG.game.huntTargets;
      if (slice.length < CONFIG.game.huntTargets || !distinct || pool.length < 4) type = 'match';
    }
    if ((type === 'match' || type === 'dragdrop' || type === 'quiz') && pool.length < 2) type = 'listen';

    const n = Math.min(itemsPerStep(type), items.length - i);
    steps.push({ type, items: items.slice(i, i + n) });
    i += n;
  }
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

  const fx = {
    good: (ev) => {
      const variant = session.correctStreakVisual++ % 3;
      sfxCorrect(variant);
      const point = pointOf(ev);
      celebrateCorrect(variant, point);
      toast(t(`games.correct_${variant + 1}`), true, 1200);
      mascotCheer(document.getElementById('play-mascot'));
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

  for (const step of round.steps) {
    if (!session.roundActive) return;   // il bambino e' uscito con "indietro"
    const play = GAMES[step.type] || GAMES.match;
    await play({
      host,
      items: step.items,
      pool: round.pool,
      showWritten: round.showWritten,
      difficulty: round.difficulty,
      report,
      fx,
      onRepeat: () => {
        save.stats.totalRepeats += 1;
        if (trackMissionEvent({ repeat: true })) missionJustDone = true;
      }
    });
  }

  if (!session.roundActive) return;
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
  if (trackMissionEvent({ roundDone: true })) missionJustDone = true;

  const phaseUnlocked = checkPhaseUnlock();
  const newCreatures = syncCreatures();
  persist(true);

  if (levelUp && stageChangedAt(save.progress.level)) {
    // Il cambio di stadio della mascotte e' un evento: vale un festeggiamento.
    toast(t('mascot.level_up'), true, 2000);
  }

  const overLimit = !session.ignoreSessionLimit
    && save.daily.minutesPlayed >= save.settings.sessionMinutes;

  await renderSummary(
    { correct, total, newCreatures, levelUp, phaseUnlocked,
      worldCompleted: worldJustCompleted,
      missionDone: missionJustDone, endSession: overLimit },
    {
      onHome: () => goHome(),
      onAgain: () => startRound(opts),
      onContinueAnyway: () => { session.ignoreSessionLimit = true; startRound(opts); }
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
    persist();
  }, TICK_MS);

  // Riprendere la musica quando si torna sull'app dopo un cambio di scheda.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && save.settings.music) startMusic();
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
}

/* ------------------------------------------------------------------ */

boot();

// Utile in console durante lo sviluppo e per il playtest con Pietro.
// `save` e' una live binding del modulo: si legge con una funzione, non
// copiandola, altrimenti si fotografa lo stato del boot.
window.__gioco = { getSave: () => save, content, shuffle, startRound, goHome };
