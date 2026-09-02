/**
 * Draghetti & Parole — punto di ingresso.
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
  loadAll, content, t, applyStaticStrings,
  availableWorlds, worldItems, getItem
} from './js/content-loader.js';
import {
  save, loadSave, persist, rolloverDay, registerPlayToday,
  addXp, checkAccessWindow
} from './js/state.js';
import { recordAnswer, pickRoundItems, dueItems, shuffle } from './js/srs.js';
import {
  initAudioUnlock, sfxCorrect, sfxRetry, stopVoice, startMusic
} from './js/audio.js';
import { initEffects, celebrateCorrect, toast } from './js/effects.js';
import { renderMascot, mascotSay, mascotCheer, stageChangedAt } from './js/mascot.js';
import { GAMES, itemsPerStep } from './js/minigames.js';
import {
  showScreen, renderHome, renderAlbum, renderSummary,
  renderBlocked, runOnboarding, syncCreatures, worldProgress
} from './js/screens.js';
import { openParents } from './js/parents.js';
import { ensureTodayMission, trackMissionEvent } from './js/missions.js';

/* ------------------------------------------------------------------ */
/* Stato della sessione corrente (non persistente)                     */
/* ------------------------------------------------------------------ */

const session = {
  correctStreakVisual: 0,   // usato per ruotare suoni e animazioni
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
  const key = firstTime
    ? (save.streak.current > 1 ? 'streak_kept' : 'welcome_back')
    : 'idle_1';
  await mascotSay(key, { bubble: refs.bubble, avatar: refs.mascotHost });
}

/* ------------------------------------------------------------------ */
/* Costruzione di una partita                                          */
/* ------------------------------------------------------------------ */

/**
 * Sceglie gli item e li distribuisce fra i mini-giochi del mondo.
 * @param {{world?: object, review?: boolean}} opts
 */
function buildRound(opts) {
  const settings = save.settings;
  const unlockedWorlds = availableWorlds(settings);

  let world = opts.world;
  let pool;

  if (opts.review) {
    // Ripasso libero: pesca fra tutto quello che il bambino ha gia' visto,
    // dando la precedenza a cio' che la ripetizione spaziata segnala scaduto.
    const seen = unlockedWorlds.flatMap(w => worldItems(w, settings));
    const due = dueItems(seen);
    pool = (due.length >= 4 ? due : seen.filter(i => save.progress.srs[i.id]));
    if (!pool.length) pool = seen;
    world = {
      id: '__review__',
      title_it: t('ui.free_review'),
      phase: 1,
      minigames: ['match', 'listen', 'quiz', 'hunt'],
      color: '#38bdf8'
    };
  } else {
    pool = worldItems(world, settings);
  }

  if (!pool.length) return null;

  // Se il mondo ha pochi item si accorcia la partita invece di ripeterli:
  // meglio finire con la sensazione di aver chiuso qualcosa.
  const count = Math.min(CONFIG.game.questionsPerRound, Math.max(5, pool.length));
  const items = pickRoundItems(pool, count);
  const phase = content.phases.find(p => p.id === (world.phase || 1));
  const showWritten = Boolean(phase?.showWrittenWord);

  const pr = opts.review ? { ratio: 1, plays: 3 } : worldProgress(world);
  const difficulty = pr.ratio > 0.6 ? 3 : pr.plays > 0 ? 2 : 1;

  return { world, pool, items, showWritten, difficulty, steps: buildSteps(world, items, pool) };
}

/** Alterna i mini-giochi previsti dal mondo, rispettando quanti item servono. */
function buildSteps(world, items, pool) {
  const types = (world.minigames || ['match']).slice();
  const steps = [];
  let i = 0;
  let ti = 0;

  while (i < items.length) {
    let type = types[ti++ % types.length];
    const item = items[i];

    // Vincoli di buon senso: "ricomponi la frase" ha senso solo sulle frasi,
    // la caccia serve almeno 3 item e un pool abbastanza grande.
    if (type === 'build' && item.kind !== 'phrase') type = 'quiz';
    if (type === 'hunt') {
      const slice = items.slice(i, i + CONFIG.game.huntTargets);
      const distinct = new Set(slice.map(x => x.id)).size === CONFIG.game.huntTargets;
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
    bad: () => {
      const variant = Math.floor(Math.random() * 3);
      sfxRetry();
      toast(t(`games.retry_${variant + 1}`), false, 1400);
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
      review: Boolean(opts.review)
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

  // Statistiche del mondo
  if (round.world.id !== '__review__') {
    const rec = save.progress.worlds[round.world.id] || { plays: 0, completed: false };
    rec.plays = (rec.plays || 0) + 1;
    rec.lastPlayed = new Date().toISOString();
    const pr = worldProgress(round.world);
    rec.completed = pr.completed;
    save.progress.worlds[round.world.id] = rec;
  }
  save.stats.totalRounds += 1;
  if (trackMissionEvent({ roundDone: true })) missionJustDone = true;

  const newCreatures = syncCreatures();
  persist(true);

  if (levelUp && stageChangedAt(save.progress.level)) {
    // Il cambio di stadio della mascotte e' un evento: vale un festeggiamento.
    toast(t('mascot.level_up'), true, 2000);
  }

  const overLimit = !session.ignoreSessionLimit
    && save.daily.minutesPlayed >= save.settings.sessionMinutes;

  await renderSummary(
    { correct, total, newCreatures, levelUp, missionDone: missionJustDone, endSession: overLimit },
    {
      onHome: () => goHome(),
      onAgain: () => startRound(opts),
      onContinueAnyway: () => { session.ignoreSessionLimit = true; startRound(opts); }
    }
  );
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
