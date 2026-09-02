/**
 * Schermate: home/mappa, album delle creature, riepilogo, onboarding, blocco.
 * Qui c'e' solo presentazione; le regole di gioco stanno in game.js.
 */

import { content, t, availableWorlds, worldItems, getItem } from './content-loader.js';
import { save, persist } from './state.js';
import { trackOf, masteredCount, isMastered } from './srs.js';
import { renderMascot, mascotSay, mascotCheer } from './mascot.js';
import { spriteSvg } from './minigames.js';
import { speakItem, sfxTap, sfxUnlock } from './audio.js';
import { celebrate } from './effects.js';
import { ensureTodayMission, currentMission, missionRatio } from './missions.js';

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
/* Stato di avanzamento dei mondi                                      */
/* ------------------------------------------------------------------ */

/**
 * Un mondo e' "completato" quando ogni suo elemento e' stato indovinato
 * almeno una volta. Niente punteggi minimi da superare: si avanza sempre.
 */
export function worldProgress(world) {
  const items = worldItems(world, save.settings);
  const done = items.filter(it => (save.progress.srs[it.id]?.correct || 0) > 0).length;
  const rec = save.progress.worlds[world.id] || { plays: 0 };
  return {
    total: items.length,
    done,
    ratio: items.length ? done / items.length : 0,
    completed: items.length > 0 && done === items.length,
    plays: rec.plays || 0
  };
}

/** Il primo mondo e' sempre aperto; gli altri seguono quello precedente. */
export function isWorldUnlocked(world, list) {
  const idx = list.findIndex(w => w.id === world.id);
  if (idx <= 0) return true;
  const prev = list[idx - 1];
  const p = worldProgress(prev);
  // Si apre completando il mondo precedente oppure dopo 3 partite:
  // nessun vicolo cieco se una parola resta ostica.
  return p.completed || p.plays >= 3;
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
    return Boolean(w && worldProgress(w).completed);
  }
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
  const list = availableWorlds(save.settings);

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
    const fill = document.getElementById('mission-fill');
    fill.style.width = `${Math.round(missionRatio() * 100)}%`;
    card.classList.toggle('is-done', save.daily.missionDone);
    card.querySelector('.mission-icon').innerHTML = '';
    card.querySelector('.mission-icon').appendChild(spriteSvg(mission.sprite || 'sp-icon-mission'));
    card.style.display = '';
  } else {
    card.style.display = 'none';
  }

  // Mondi
  const grid = document.getElementById('worlds-grid');
  grid.innerHTML = '';
  list.forEach(world => {
    const unlocked = isWorldUnlocked(world, list);
    const p = worldProgress(world);

    const btn = el('button', 'world-card' + (unlocked ? '' : ' is-locked'));
    btn.type = 'button';
    btn.style.setProperty('--world-color', world.color || '#ffb02e');

    const art = el('div', 'world-art');
    art.appendChild(spriteSvg(world.sprite));
    btn.appendChild(art);
    btn.appendChild(el('div', 'world-name', world.title_it));
    btn.appendChild(el('div', 'world-meta', `${p.done}/${p.total}`));

    const bar = el('div', 'world-bar');
    const fill = el('i');
    fill.style.width = `${Math.round(p.ratio * 100)}%`;
    bar.appendChild(fill);
    btn.appendChild(bar);

    if (!unlocked) {
      const lock = el('div', 'world-lock');
      lock.appendChild(spriteSvg('sp-icon-lock'));
      btn.appendChild(lock);
    } else if (p.completed) {
      const badge = el('div', 'world-done-badge');
      badge.appendChild(spriteSvg('sp-icon-check'));
      btn.appendChild(badge);
    }

    btn.addEventListener('click', () => {
      sfxTap();
      if (!unlocked) {
        mascotSay('idle_1', { bubble, avatar: mascotHost });
        return;
      }
      handlers.onWorld(world);
    });
    grid.appendChild(btn);
  });

  document.getElementById('btn-free-review').onclick = () => { sfxTap(); handlers.onReview(); };
  document.getElementById('btn-album').onclick = () => { sfxTap(); handlers.onAlbum(); };
  document.getElementById('btn-parents').onclick = () => { sfxTap(); handlers.onParents(); };

  showScreen('home');
  return { bubble, mascotHost };
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
      if (unlocked) mascotCheer(art);
    });
    grid.appendChild(card);
  });

  document.getElementById('album-count').textContent = `${found}/${content.creatures.length}`;
  showScreen('album');
}

/* ------------------------------------------------------------------ */
/* Riepilogo di fine partita                                           */
/* ------------------------------------------------------------------ */

/**
 * @param {{correct:number, total:number, newCreatures:Array, levelUp:boolean,
 *          missionDone:boolean, endSession:boolean}} result
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

  // Nuove creature: momento clou, con festeggiamento
  if (result.newCreatures.length) {
    sfxUnlock();
    celebrate();
    for (const c of result.newCreatures) {
      const wrap = el('div', 'reward-creature');
      wrap.appendChild(spriteSvg(c.sprite));
      body.appendChild(wrap);
      body.appendChild(el('p', 'h-sub', c.name_it));
    }
    await mascotSay('new_creature', { bubble, avatar: mascotHost });
  } else if (result.missionDone) {
    celebrate();
    await mascotSay('mission_done', { bubble, avatar: mascotHost });
  } else if (result.levelUp) {
    celebrate();
    await mascotSay('level_up', { bubble, avatar: mascotHost });
  } else {
    await mascotSay(`correct_${1 + (result.correct % 3)}`, { bubble, avatar: mascotHost });
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
      ok.onclick = () => {
        sfxTap();
        save.child.name = input.value.trim().slice(0, 16);
        persist(true);
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
