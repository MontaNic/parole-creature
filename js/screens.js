/**
 * Schermate: home/mappa, album delle creature, riepilogo, onboarding, blocco.
 * Qui c'e' solo presentazione; le regole di gioco stanno in game.js.
 */

import { content, t, getItem, getPhase } from './content-loader.js';
import { save, persist } from './state.js';
import { trackOf, masteredCount, isMastered } from './srs.js';
import {
  unitProgress, phaseProgress, playableUnits, playablePhases,
  isPhaseUnlocked, lockInfo, curriculumConfig, currentUnit
} from './curriculum.js';
import { renderMascot, mascotSay, mascotCheer, encouragementKey } from './mascot.js';
import { spriteSvg } from './minigames.js';
import { speakItem, sfxTap, sfxUnlock } from './audio.js';
import { celebrate } from './effects.js';
import { ensureTodayMission, currentMission, missionRatio } from './missions.js';
import { renderStoryStrip, chapterForCreature, isAvailable as chapterAvailable, playChapter } from './story.js';
import { renderStickers } from './chests.js';
import { canShare, shareSummary } from './share.js';
import { renderBadges, renderNewBadges } from './badges.js';
import { renderShelf, openBook } from './books.js';

/* Fasi aperte a mano dal bambino, oltre a quella corrente. */
const fasiAperte = new Set();

/* ------------------------------------------------------------------ */
/* Router minimale                                                     */
/* ------------------------------------------------------------------ */

export function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s =>
    s.classList.toggle('is-active', s.id === `screen-${id}`));
  const el = document.getElementById(`screen-${id}`);
  el?.scrollTo?.(0, 0);
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

/* ------------------------------------------------------------------ */
/* Creature                                                            */
/* ------------------------------------------------------------------ */

export function isCreatureUnlocked(creature) {
  if (save.progress.creatures[creature.id]) return true;
  const u = creature.unlock || {};
  if (u.type === 'start') return true;
  if (u.type === 'world') {
    const w = content.worldById.get(u.value);
    return Boolean(w && unitProgress(w).completed);
  }
  // Ricompensa per aver superato davvero la soglia di padronanza di una fase.
  if (u.type === 'phase') return phaseProgress(u.value).reached;
  if (u.type === 'mastered') return masteredCount() >= u.value;
  if (u.type === 'streak') return save.streak.current >= u.value;
  return false;
}

/**
 * Registra le creature appena sbloccate.
 * @returns {Array} creature nuove (per mostrarle nel riepilogo)
 */
export function syncCreatures() {
  const fresh = [];
  for (const c of content.creatures) {
    if (!save.progress.creatures[c.id] && isCreatureUnlocked(c)) {
      save.progress.creatures[c.id] = new Date().toISOString();
      fresh.push(c);
    }
  }
  if (fresh.length) persist(true);
  return fresh;
}

/* ------------------------------------------------------------------ */
/* Home                                                                */
/* ------------------------------------------------------------------ */

export function renderHome(handlers) {
  // HUD
  document.getElementById('hud-streak').textContent = save.streak.current;
  document.getElementById('hud-words').textContent = masteredCount();
  document.getElementById('hud-level').textContent = save.progress.level;

  // Mascotte + fumetto
  const mascotHost = document.getElementById('home-mascot');
  renderMascot(mascotHost);
  const bubble = document.getElementById('home-speech');

  // Missione del giorno
  ensureTodayMission();
  const mission = currentMission();
  const card = document.getElementById('mission-card');
  if (mission) {
    document.getElementById('mission-text').textContent = mission.text_it;
    document.getElementById('mission-fill').style.width = `${Math.round(missionRatio() * 100)}%`;
    card.classList.toggle('is-done', save.daily.missionDone);
    card.querySelector('.mission-icon').innerHTML = '';
    card.querySelector('.mission-icon').appendChild(spriteSvg(mission.sprite || 'sp-icon-mission'));
    card.style.display = '';
  } else {
    card.style.display = 'none';
  }

  // Mappa: le unita' sono raggruppate per fase, perche' la fase e' l'unita'
  // di misura del curriculum ed e' li' che sta la soglia da superare.
  const host = document.getElementById('worlds-grid');
  host.className = 'phase-list';
  host.innerHTML = '';

  const units = playableUnits(save.settings);
  // Solo la fase in corso mostra le sue unita'. Le altre restano una riga:
  // e' cosi' che la home sta in uno schermo da tablet senza scorrere, ed e'
  // cosi' che un bambino vede subito dove deve andare.
  const faseCorrente = currentUnit(save.settings)?.phase ?? playablePhases()[0];
  let hintShown = false;
  for (const phase of playablePhases()) {
    const phaseUnits = units.filter(w => w.phase === phase);
    if (!phaseUnits.length) continue;
    // L'avviso "ancora N parole" si mostra solo sulla prima fase chiusa:
    // sulle successive sarebbe un traguardo che non e' ancora il suo turno.
    const showHint = !isPhaseUnlocked(phase) && !hintShown;
    if (showHint) hintShown = true;
    const aperta = phase === faseCorrente || fasiAperte.has(phase);
    host.appendChild(
      renderPhaseBlock(phase, phaseUnits, { bubble, mascotHost }, handlers, showHint, aperta));
  }

  document.getElementById('btn-free-review').onclick = () => { sfxTap(); handlers.onReview(); };
  document.getElementById('btn-album').onclick = () => { sfxTap(); handlers.onAlbum(); };
  document.getElementById('btn-den').onclick = () => { sfxTap(); handlers.onDen?.(); };
  document.getElementById('btn-parents').onclick = () => { sfxTap(); handlers.onParents(); };

  showScreen('home');
  return { bubble, mascotHost };
}

/**
 * Un blocco di fase: intestazione con la barra di padronanza e, sotto, le
 * sue unita'. La barra ha una tacca all'80%: e' la soglia da superare per
 * aprire la fase successiva, ed e' bene che si veda dove si sta arrivando.
 */
function renderPhaseBlock(phase, units, refs, handlers, showHint = false, aperta = true) {
  const info = getPhase(phase);
  const prog = phaseProgress(phase);
  const unlocked = isPhaseUnlocked(phase);
  const cfg = curriculumConfig();

  const block = el('section',
    'phase-block' + (unlocked ? '' : ' is-locked') + (aperta ? '' : ' is-collapsed'));

  const head = el('header', 'phase-head');
  if (!aperta) {
    // Toccando l'intestazione la fase si apre, e resta aperta finche' si
    // torna alla home.
    head.addEventListener('click', () => {
      sfxTap();
      fasiAperte.add(phase);
      block.classList.remove('is-collapsed');
    });
  }
  const row = el('div', 'phase-title-row');
  row.appendChild(el('span', 'phase-badge', `${t('ui.phase_label')} ${phase}`));
  row.appendChild(el('h3', 'phase-title', info?.title_it || ''));
  if (!unlocked) {
    const lock = el('span', 'phase-lock');
    lock.appendChild(spriteSvg('sp-icon-lock'));
    row.appendChild(lock);
  } else if (!aperta) {
    row.appendChild(el('span', 'phase-toggle', t('ui.phase_show')));
  }
  head.appendChild(row);

  const meter = el('div', 'phase-meter');
  const fill = el('i');
  fill.style.width = `${Math.round(prog.ratio * 100)}%`;
  if (prog.reached) fill.classList.add('is-reached');
  meter.appendChild(fill);
  const tick = el('u', 'phase-tick');
  tick.style.left = `${Math.round(cfg.phaseUnlockRatio * 100)}%`;
  meter.appendChild(tick);
  head.appendChild(meter);

  head.appendChild(el('p', 'phase-meta',
    `${prog.mastered}/${prog.total} ${t('ui.mastered_label')}`));

  if (showHint) {
    const phases = playablePhases();
    const prev = phases[phases.indexOf(phase) - 1];
    const missing = phaseProgress(prev).missing;
    head.appendChild(el('p', 'phase-hint',
      t('ui.phase_locked_hint').replace('{n}', missing)));
  }

  block.appendChild(head);

  const grid = el('div', 'worlds');
  units.forEach(w => grid.appendChild(unitCard(w, refs, handlers)));
  block.appendChild(grid);
  return block;
}

/** La card di una singola unita'. */
function unitCard(world, refs, handlers) {
  const lock = lockInfo(world);
  const p = unitProgress(world);

  const btn = el('button', 'world-card' + (lock.locked ? ' is-locked' : ''));
  btn.type = 'button';
  btn.style.setProperty('--world-color', world.color || '#ffb02e');
  // L'obiettivo linguistico non si mostra al bambino, ma resta a portata di
  // mano per il genitore che gli sta accanto.
  if (world.objective_it) btn.title = world.objective_it;

  const art = el('div', 'world-art');
  art.appendChild(spriteSvg(world.sprite));
  btn.appendChild(art);
  btn.appendChild(el('div', 'world-name', world.title_it));
  btn.appendChild(el('div', 'world-meta', `${p.done}/${p.total}`));

  const bar = el('div', 'world-bar');
  const fill = el('i');
  fill.style.width = `${Math.round(p.ratio * 100)}%`;
  bar.appendChild(fill);
  // Seconda barretta piu' scura: quanto di quell'unita' e' davvero solido.
  const mastery = el('i', 'mastery');
  mastery.style.width = `${Math.round(p.masteryRatio * 100)}%`;
  bar.appendChild(mastery);
  btn.appendChild(bar);

  if (lock.locked) {
    const ico = el('div', 'world-lock');
    ico.appendChild(spriteSvg('sp-icon-lock'));
    btn.appendChild(ico);
  } else if (p.completed) {
    const badge = el('div', 'world-done-badge');
    badge.appendChild(spriteSvg('sp-icon-check'));
    btn.appendChild(badge);
  }

  btn.addEventListener('click', () => {
    sfxTap();
    if (lock.locked) {
      mascotSay(lock.reason === 'phase' ? 'locked_phase' : 'locked_unit',
        { bubble: refs.bubble, avatar: refs.mascotHost, vars: { n: lock.missing } });
      return;
    }
    handlers.onWorld(world);
  });
  return btn;
}

/* ------------------------------------------------------------------ */
/* Album delle creature                                                */
/* ------------------------------------------------------------------ */

export function renderAlbum() {
  syncCreatures();
  const grid = document.getElementById('album-grid');
  grid.innerHTML = '';

  let found = 0;
  content.creatures.forEach(c => {
    const unlocked = Boolean(save.progress.creatures[c.id]);
    if (unlocked) found += 1;

    const card = el('button', 'creature-card' + (unlocked ? '' : ' is-locked'));
    card.type = 'button';
    const art = el('div', 'creature-art');
    art.appendChild(spriteSvg(c.sprite));
    card.appendChild(art);
    card.appendChild(el('div', 'creature-name', unlocked ? c.name_it : t('ui.unknown_creature')));
    if (unlocked) card.appendChild(el('div', 'creature-fact', c.fact_it));

    card.addEventListener('click', () => {
      sfxTap();
      if (!unlocked) return;
      // Una creatura trovata e' anche un capitolo: toccarla lo riapre.
      const chapter = chapterForCreature(c.id);
      if (chapter && chapterAvailable(chapter)) playChapter(chapter).then(renderAlbum);
      else mascotCheer(art);
    });
    grid.appendChild(card);
  });

  // L'indice dei capitoli, sopra le creature.
  let strip = document.getElementById('album-story');
  if (!strip) {
    strip = el('div');
    strip.id = 'album-story';
    grid.parentElement.insertBefore(strip, grid);
  }
  renderStoryStrip(strip, chapter => playChapter(chapter).then(renderAlbum));

  // Gli adesivi degli scrigni, sotto le creature.
  let stickers = document.getElementById('album-stickers');
  if (!stickers) {
    stickers = el('div');
    stickers.id = 'album-stickers';
    grid.parentElement.appendChild(stickers);
  }
  renderStickers(stickers);

  // I libretti della fase 4, leggibili con audio.
  let shelf = document.getElementById('album-books');
  if (!shelf) {
    shelf = el('div');
    shelf.id = 'album-books';
    grid.parentElement.appendChild(shelf);
  }
  renderShelf(shelf, book => openBook(book).then(renderAlbum));

  // I distintivi, in fondo.
  let badges = document.getElementById('album-badges');
  if (!badges) {
    badges = el('div');
    badges.id = 'album-badges';
    grid.parentElement.appendChild(badges);
  }
  renderBadges(badges);

  document.getElementById('album-count').textContent = `${found}/${content.creatures.length}`;
  showScreen('album');
}

/* ------------------------------------------------------------------ */
/* Riepilogo di fine partita                                           */
/* ------------------------------------------------------------------ */

/**
 * @param {{correct:number, total:number, newCreatures:Array, levelUp:boolean,
 *          phaseUnlocked:?number, worldCompleted:boolean, missionDone:boolean,
 *          endSession:boolean}} result
 */
export async function renderSummary(result, handlers) {
  const body = document.getElementById('summary-body');
  body.innerHTML = '';
  showScreen('summary');

  const mascotHost = el('div', 'mascot-slot');
  mascotHost.style.width = 'min(180px, 44vw)';
  body.appendChild(mascotHost);
  renderMascot(mascotHost);

  const bubble = el('div', 'speech no-tail');
  bubble.style.maxWidth = '520px';
  body.appendChild(bubble);

  // Stelle: 1 sempre, 2 da meta' risposte, 3 se quasi tutte giuste
  const ratio = result.total ? result.correct / result.total : 0;
  const stars = ratio >= 0.9 ? 3 : ratio >= 0.5 ? 2 : 1;
  const starRow = el('div', 'summary-stars');
  for (let i = 0; i < 3; i++) {
    const s = spriteSvg('sp-icon-star');
    if (i >= stars) s.classList.add('star-off');
    starRow.appendChild(s);
  }
  body.appendChild(starRow);

  const line = el('p', 'h-sub', `${result.correct}/${result.total}`);
  body.appendChild(line);

  /*
   * Annunci, dal traguardo piu' raro al piu' comune.
   * Le tre battute affidate al narratore (fase superata, mondo chiuso, nuova
   * creatura) capitano solo qui: e' l'unico punto del gioco in cui una voce
   * diversa da Pepe ha senso, ed e' anche l'unico abbastanza raro perche'
   * l'effetto "annuncio di fine episodio" non si consumi.
   */
  const bigMoment = result.phaseUnlocked || result.worldCompleted || result.newCreatures.length;
  if (bigMoment) { sfxUnlock(); celebrate(); }
  if (result.phaseUnlocked) body.appendChild(el('p', 'h-title', t('ui.phase_unlocked')));

  for (const c of result.newCreatures) {
    const wrap = el('div', 'reward-creature');
    wrap.appendChild(spriteSvg(c.sprite));
    body.appendChild(wrap);
    body.appendChild(el('p', 'h-sub', c.name_it));
  }

  if (result.newBadges?.length) body.appendChild(renderNewBadges(result.newBadges));

  if (result.phaseUnlocked) {
    await mascotSay('phase_done', { bubble, avatar: mascotHost });
  } else if (result.worldCompleted) {
    await mascotSay('world_complete', { bubble, avatar: mascotHost });
  }

  if (result.newCreatures.length) {
    await mascotSay('new_creature', { bubble, avatar: mascotHost });
  } else if (result.newBadges?.length) {
    await mascotSay('badge_new', { bubble, avatar: mascotHost });
  } else if (!bigMoment) {
    if (result.missionDone) {
      celebrate();
      await mascotSay('mission_done', { bubble, avatar: mascotHost });
    } else if (result.levelUp) {
      celebrate();
      await mascotSay('level_up', { bubble, avatar: mascotHost });
    } else {
      await mascotSay(encouragementKey('correct', result.correct), { bubble, avatar: mascotHost });
    }
  }

  const actions = el('div', 'row');
  actions.style.justifyContent = 'center';
  actions.style.maxWidth = '440px';

  if (result.endSession) {
    // Limite di sessione raggiunto: si propone di smettere, senza obbligare.
    // Il pulsante per continuare resta disponibile, ma in secondo piano.
    const name = save.child.name ? `, ${save.child.name}` : '';
    await mascotSay('session_end', { bubble, avatar: mascotHost, vars: { name } });

    const home = el('button', 'btn btn-lg', t('ui.session_end_message'));
    home.onclick = () => { sfxTap(); handlers.onHome(); };
    actions.appendChild(home);

    const anyway = el('button', 'btn btn-ghost btn-parent-small', t('ui.continue_button'));
    anyway.onclick = () => { sfxTap(); handlers.onContinueAnyway?.(); };
    actions.appendChild(anyway);
  } else {
    const again = el('button', 'btn btn-lg', t('ui.continue_button'));
    again.onclick = () => { sfxTap(); handlers.onAgain(); };
    const home = el('button', 'btn btn-ghost', t('ui.home'));
    home.onclick = () => { sfxTap(); handlers.onHome(); };
    actions.appendChild(again);
    actions.appendChild(home);
  }
  body.appendChild(actions);

  // Condivisione in famiglia: solo dove il browser sa condividere un file
  // e se i genitori lo vogliono. Il tocco e' del genitore accanto.
  if (canShare()) {
    const share = el('button', 'btn btn-ghost btn-parent-small share-btn');
    const ico = spriteSvg('sp-icon-share');
    ico.classList.add('ico');
    share.appendChild(ico);
    share.appendChild(el('span', null, t('share.button')));
    share.onclick = async () => {
      sfxTap();
      share.disabled = true;
      await shareSummary(result);
      share.disabled = false;
    };
    body.appendChild(share);
  }
}

/* ------------------------------------------------------------------ */
/* Schermata di blocco (fascia oraria o pausa vacanza)                 */
/* ------------------------------------------------------------------ */

export function renderBlocked(reason, onParents) {
  renderMascot(document.getElementById('blocked-mascot'));
  const title = document.getElementById('blocked-title');
  const msg = document.getElementById('blocked-message');

  if (reason === 'vacation') {
    title.textContent = t('parents.vacation_mode');
    msg.textContent = t('parents.vacation_active_message');
  } else {
    title.textContent = t('parents.blocked_time_title');
    msg.textContent = t('parents.blocked_time_message');
  }
  document.getElementById('blocked-parents').onclick = onParents;
  showScreen('blocked');
}

/* ------------------------------------------------------------------ */
/* Ingresso: un tocco prima di tutto                                   */
/* ------------------------------------------------------------------ */

/**
 * Serve al browser, non al bambino: senza un gesto dell'utente play() viene
 * rifiutato, e la prima battuta di Pepe uscirebbe con la voce sintetica del
 * sistema. Il tocco qui sblocca l'audio (vedi initAudioUnlock) prima che
 * qualcuno parli.
 */
export function runStartGate() {
  return new Promise(resolve => {
    showScreen('start');
    const host = document.getElementById('start-mascot');
    renderMascot(host);
    let fatto = false;
    const via = () => { if (fatto) return; fatto = true; sfxTap(); resolve(); };
    document.getElementById('start-btn').addEventListener('click', via);
    host.addEventListener('click', via);
  });
}

/* ------------------------------------------------------------------ */
/* Onboarding senza lettura                                            */
/* ------------------------------------------------------------------ */

/**
 * Tutorial guidato solo da voce e icone: il bambino non deve leggere nulla
 * per capire cosa fare. Le poche scritte servono ai genitori accanto.
 */
export function runOnboarding() {
  return new Promise(resolve => {
    showScreen('onboarding');
    const mascotHost = document.getElementById('onb-mascot');
    const body = document.getElementById('onb-body');
    renderMascot(mascotHost);

    const skip = document.getElementById('onb-skip');
    skip.onclick = () => { finish(); };

    const bubble = el('div', 'speech no-tail');
    bubble.style.maxWidth = '520px';

    stepHello();

    function clear() {
      body.innerHTML = '';
      body.appendChild(bubble);
    }

    async function stepHello() {
      clear();
      const go = el('button', 'btn btn-lg', t('ui.start_button'));
      go.appendChild(spriteSvg('sp-icon-play'));
      go.querySelector('svg').classList.add('ico');
      go.onclick = () => { sfxTap(); stepName(); };
      body.appendChild(go);
      await mascotSay('welcome_first', { bubble, avatar: mascotHost });
    }

    async function stepName() {
      clear();
      const input = el('input', 'name-input');
      input.type = 'text';
      input.autocomplete = 'given-name';
      input.maxLength = 16;
      input.placeholder = t('onboarding.step_name_placeholder');
      input.value = save.child.name || '';
      const ok = el('button', 'btn btn-lg btn-good', t('ui.ok'));
      ok.onclick = async () => {
        sfxTap();
        ok.disabled = true;
        const name = input.value.trim().slice(0, 16);
        save.child.name = name;
        persist(true);
        // "Che bel nome!" ha senso solo se un nome e' stato scritto davvero.
        if (name) await mascotSay('nice_to_meet', { bubble, avatar: mascotHost });
        stepTutorial();
      };
      body.appendChild(input);
      body.appendChild(ok);
      await mascotSay('ask_name', { bubble, avatar: mascotHost });
    }

    async function stepTutorial() {
      clear();
      // Si usa una parola vera del contenuto: il tutorial e' gia' gioco.
      const demo = getItem('w_dragon') || content.words[0];
      const other = content.words.find(w => w.id !== demo.id) || content.words[1];
      if (!demo) { finish(); return; }

      const orb = el('button', 'audio-orb');
      orb.type = 'button';
      orb.appendChild(spriteSvg('sp-icon-sound'));
      body.appendChild(orb);

      const grid = el('div', 'choice-grid');
      grid.style.maxWidth = '460px';
      body.appendChild(grid);
      grid.style.visibility = 'hidden';

      let heard = false;
      orb.onclick = async () => {
        orb.classList.add('is-playing');
        await speakItem(demo);
        orb.classList.remove('is-playing');
        if (!heard) {
          heard = true;
          grid.style.visibility = '';
          mascotSay('tutorial_choose', { bubble, avatar: mascotHost });
        }
      };

      [demo, other].sort(() => Math.random() - 0.5).forEach(opt => {
        const b = el('button', 'choice');
        b.type = 'button';
        b.appendChild(spriteSvg(opt.sprite));
        b.onclick = async () => {
          if (opt.id === demo.id) {
            b.classList.add('is-correct');
            trackOf(demo.id);
            celebrate();
            await mascotSay('tutorial_done', { bubble, avatar: mascotHost });
            setTimeout(finish, 400);
          } else {
            b.classList.add('is-wrong');
            setTimeout(() => b.classList.remove('is-wrong'), 500);
            speakItem(demo);
          }
        };
        grid.appendChild(b);
      });

      await mascotSay('tutorial_listen', { bubble, avatar: mascotHost });
    }

    function finish() {
      save.settings.onboardingDone = true;
      persist(true);
      resolve();
    }
  });
}

/* Esportato per l'area genitori: quante parole sono padroneggiate. */
export { masteredCount, isMastered };
