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
  addXp, checkAccessWindow, tempoFinito, chiediDatiPersistenti
} from './js/state.js';
import { chiediSblocco } from './js/lock.js';
import { runInstallGate } from './js/install-gate.js';
import { recordAnswer, pickRoundItems, shuffle, similar } from './js/srs.js';
import {
  splitRound, worldReviewSplit, freeReviewPool, unitProgress, currentUnit,
  curriculumConfig, phaseProgress, playablePhases
} from './js/curriculum.js';
import {
  initAudioUnlock, sfxCorrect, sfxRetry, sfxTap, stopVoice, startMusic, musicVolume,
  isAudioUnlocked
} from './js/audio.js';
import { initEffects, celebrateCorrect, celebrate, toast } from './js/effects.js';
import {
  renderMascot, mascotSay, mascotCheer, stageChangedAt, encouragementKey
} from './js/mascot.js';
import { GAMES, mostraConferma, spriteSvg } from './js/minigames.js';
import { buildSteps, passiParlati, PAROLE_PER_PARLARE } from './js/steps.js';
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
  // (il limite di tempo vive in save.daily: vedi tempoFinito() e js/lock.js)
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
  chiediDatiPersistenti();
  // Su iPad e iPhone il gioco si usa installato sulla Home: e' cio' che
  // protegge i progressi (vedi js/install-gate.js).
  await runInstallGate();
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
    // Il bambino ha appena conosciuto Pepe: "Bentornato" sarebbe sbagliato.
    session.justOnboarded = true;
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
    onSpeak: () => startRound({ speak: true }),
    onAlbum: () => renderAlbum(),
    onDen: () => renderDen(),
    onPhonics: () => renderPhonics(async (lesson) => {
      if (tempoFinito() && !(await chiediSblocco())) { goHome(); return; }
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
  const nuovo = firstTime && session.justOnboarded;
  session.justOnboarded = false;
  const key = nuovo ? 'welcome_new'
    : firstTime ? (save.streak.current > 1 ? 'streak_kept' : 'welcome_back')
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

  if (opts.speak) {
    // Parla con Pepe: cose gia' incontrate, con la precedenza a quelle
    // ancora poco solide. Non conta per l'avanzamento delle unita'.
    pool = freeReviewPool(settings);
    if (!pool.length) return null;
    world = {
      id: '__speak__',
      title_it: t('speak.home_card'),
      phase: currentUnit(settings)?.phase || 1,
      minigames: ['listen', 'sayit'],
      color: '#f4628f'
    };
    picked = pickRoundItems(pool, Math.min(PAROLE_PER_PARLARE, pool.length));
  } else if (opts.review) {
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
  } else if (opts.repeat) {
    // "Ripeti": la stessa partita di prima, con le stesse parole.
    picked = opts.repeat.items.slice();
    pool = opts.repeat.pool.slice();
    world = opts.repeat.world;
    picked.forEach(it => { if (opts.repeat.reviewIds.has(it.id)) reviewIds.add(it.id); });
  } else if (opts.worldReview) {
    // Ripasso del mondo appena finito, insieme ai mondi precedenti. Non
    // conta per l'avanzamento delle unita' (id con il doppio trattino).
    const base = opts.worldReview;
    const split = worldReviewSplit(base, total, settings);
    if (!split.newItems.length && !split.reviewItems.length) return null;
    const fresh = pickRoundItems(split.newItems, split.newCount);
    const review = split.reviewCount > 0 ? pickRoundItems(split.reviewItems, split.reviewCount) : [];
    review.forEach(it => reviewIds.add(it.id));
    picked = interleave(shuffle(fresh), review);
    pool = dedupeById([...split.newItems, ...split.reviewItems]);
    world = {
      id: '__worldreview__',
      reviewOf: base.id,
      title_it: `${t('ui.world_review')}: ${base.title_it}`,
      phase: base.phase,
      minigames: base.minigames,
      color: base.color
    };
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

  const pr = (opts.review || world.id.startsWith('__')) ? { ratio: 1, plays: 3 } : unitProgress(world, settings);
  const difficulty = pr.ratio > 0.6 ? 3 : pr.plays > 0 ? 2 : 1;

  return {
    world, pool, items: picked, reviewIds, showWritten, difficulty,
    steps: (opts.speak || world.id === '__speak__') ? passiParlati(picked) : buildSteps(world, picked, pool, difficulty, showWritten),
    // Il dialogo dell'unita' chiude la partita: sempre le prime due volte, poi una su tre.
    dialogue: (!opts.review && !opts.speak && !opts.worldReview && !opts.repeat && dialogueFor(world.id) && wantsDialogue((save.progress.worlds[world.id] || {}).plays || 0)) ? dialogueFor(world.id) : null
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

/* ------------------------------------------------------------------ */
/* Svolgimento della partita                                           */
/* ------------------------------------------------------------------ */

async function startRound(opts) {
  // Tempo di oggi finito: si gioca ancora solo se un genitore sblocca.
  if (tempoFinito() && !(await chiediSblocco())) { goHome(); return; }
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
  // La battuta di Pepe per la serie non si aspetta dentro il gioco, ma il
  // passo dopo si': altrimenti la parola nuova le taglierebbe la voce.
  let battutaInCorso = null;

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
        battutaInCorso = mascotSay(encouragementKey('streak', serie / 3 - 1), { avatar: document.getElementById('play-mascot') });
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
    if (battutaInCorso) { await battutaInCorso; battutaInCorso = null; }

    // Le frasi arrivano tutte insieme, dopo le parole, e si annunciano.
    if (step.phrasesStart) await annunciaFrasi(host);

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
      senzaMicrofono: Boolean(step.noMic),
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

/**
 * Il cambio di tempo fra parole e frasi: un cartello con il fumetto (lo
 * stesso rosa delle frasi nei giochi) e Pepe che lo dice a voce, perche'
 * un bambino che non legge ancora capisca che adesso cambia gioco.
 */
async function annunciaFrasi(host) {
  host.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'phrases-banner';
  const ico = spriteSvg('sp-icon-sound');
  ico.classList.add('ico');
  card.appendChild(ico);
  const tx = document.createElement('span');
  tx.textContent = t('games.phrases_now');
  card.appendChild(tx);
  host.appendChild(card);
  sfxTap();
  await Promise.all([
    mascotSay('phrases_now', { avatar: document.getElementById('play-mascot') }),
    new Promise(r => setTimeout(r, 1400))
  ]);
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
  // Ripasso libero e "Parla con Pepe" non toccano l'avanzamento delle unita'.
  if (!round.world.id.startsWith('__')) {
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

  const overLimit = tempoFinito();

  if (round.world.id === '__speak__') { save.daily.speakDone = true; persist(); }

  /*
   * Il bottone grande porta SEMPRE avanti, mai indietro:
   *  - mondo appena finito          -> "Ripasso del mondo" (questo + i vecchi)
   *  - dopo il ripasso, o mondo gia' finito e il prossimo aperto
   *                                 -> "Prossimo mondo"
   *  - mondo ancora da finire       -> "Avanti": altre parole nuove dello
   *                                    stesso mondo, non la stessa partita
   * "Ripeti" (la stessa identica partita) e "Casa" sono piccoli, sotto.
   */
  const baseWorld = round.world.id === '__worldreview__'
    ? content.worldById.get(round.world.reviewOf)
    : (round.world.id.startsWith('__') ? null : round.world);
  const baseProgress = baseWorld ? unitProgress(baseWorld) : null;
  const prossimo = baseProgress?.completed ? currentUnit() : null;
  const nextWorld = prossimo && prossimo.id !== baseWorld.id ? prossimo : null;
  const proponiRipasso = worldJustCompleted && splitRound(round.world, 8).reviewItems.length > 0;

  let primary;
  if (proponiRipasso) primary = 'world_review';
  else if (nextWorld) primary = 'next_world';
  else primary = 'continue';

  await renderSummary(
    { correct, total, newCreatures, levelUp, phaseUnlocked,
      worldCompleted: worldJustCompleted,
      nextWorld,
      primary,
      worldProgress: baseProgress && !baseProgress.completed ? baseProgress : null,
      world: round.world,
      newBadges,
      missionDone: missionJustDone, endSession: overLimit },
    {
      onHome: poi(() => goHome()),
      onAgain: poi(() => startRound({ repeat: { items: round.items, pool: round.pool, world: round.world, reviewIds: round.reviewIds } })),
      onNext: poi(() => startRound({ world: nextWorld })),
      onWorldReview: poi(() => startRound({ worldReview: round.world })),
      // "Avanti" senza un mondo dopo: si continua dove si e', con parole nuove.
      onContinue: poi(() => startRound(
        baseWorld ? { world: baseWorld }
          : round.world.id === '__speak__' ? { speak: true }
          : { review: true })),
      // Il genitore ha gia' sbloccato dal riepilogo: si riparte.
      onContinueAnyway: poi(() => startRound(opts))
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
window.__gioco = { getSave: () => save, content, shuffle, startRound, goHome, buildRound };
