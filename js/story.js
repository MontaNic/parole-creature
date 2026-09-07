/**
 * La storia a episodi: l'isola dove le creature hanno perso le parole.
 *
 * I dati stanno in content.story (prologo + 8 capitoli + epilogo). Qui c'e'
 * la logica: quale capitolo scatta quando, come si vede, dove si rivede.
 *
 * Non e' un ornamento: e' il motivo in-fiction per cui si impara l'inglese.
 * Le parole che il bambino impara sono la voce che restituisce alle
 * creature, e la prima cosa che ogni creatura dice e' in inglese.
 */

import { content, t } from './content-loader.js';
import { save, persist } from './state.js';
import { renderMascot } from './mascot.js';
import { spriteSvg } from './minigames.js';
import { speakLine, stopVoice, sfxTap } from './audio.js';
import { showScreen } from './screens.js';

/* ------------------------------------------------------------------ */
/* Dati                                                                */
/* ------------------------------------------------------------------ */

export function chapters() {
  return (content.story?.chapters || []).slice().sort((a, b) => a.order - b.order);
}

export function chapterById(id) {
  return chapters().find(c => c.id === id) || null;
}

export function chapterForCreature(creatureId) {
  return chapters().find(c => c.creatureId === creatureId) || null;
}

/** Percorso audio di una riga: e' lo stesso che genera tools/generate-audio.mjs. */
export function lineAudio(chapter, n) {
  const line = chapter.lines[n];
  return line.who === 'creature'
    ? `en/story.${chapter.id}.mp3`
    : `it/story.${chapter.id}.${n}.mp3`;
}

export function isSeen(chapter) {
  return Boolean(save.progress.storySeen?.[chapter.id]);
}

/** Un capitolo si puo' (ri)vedere quando il suo momento e' arrivato. */
export function isAvailable(chapter) {
  const tr = chapter.trigger || {};
  if (tr.type === 'start') return true;
  if (tr.type === 'world') {
    // La creatura premio di quel mondo e' stata trovata.
    const world = content.worlds.find(w => w.id === tr.value);
    return Boolean(world && save.progress.creatures[world.reward]);
  }
  return false;
}

function markSeen(chapter) {
  if (!save.progress.storySeen) save.progress.storySeen = {};
  if (!save.progress.storySeen[chapter.id]) {
    save.progress.storySeen[chapter.id] = new Date().toISOString();
    persist(true);
  }
}

/* ------------------------------------------------------------------ */
/* Quando scatta                                                       */
/* ------------------------------------------------------------------ */

/** Il prologo, se non e' mai stato visto. */
export function pendingAtStart() {
  return chapters().filter(c => c.trigger?.type === 'start' && !isSeen(c));
}

/**
 * I capitoli che scattano dopo una partita, in ordine: quelli il cui mondo
 * ha appena consegnato la sua creatura. L'epilogo condivide il mondo di
 * Torrek e viene subito dopo il suo capitolo.
 * @param {Array<{unlock:{type:string,value:*}}>} newCreatures
 */
export function pendingAfterRound(newCreatures) {
  const worlds = new Set(
    (newCreatures || []).filter(c => c.unlock?.type === 'world').map(c => c.unlock.value)
  );
  return chapters().filter(c => c.trigger?.type === 'world' && worlds.has(c.trigger.value) && !isSeen(c));
}

/* ------------------------------------------------------------------ */
/* Come si vede                                                        */
/* ------------------------------------------------------------------ */

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

function chapterLabel(chapter) {
  if (chapter.trigger?.type === 'start') return `${t('story.prologue_label')} · ${chapter.title_it}`;
  if (!chapter.creatureId) return `${t('story.epilogue_label')} · ${chapter.title_it}`;
  return `${t('story.chapter_label').replace('{n}', chapter.order)} · ${chapter.title_it}`;
}

/**
 * Mostra un capitolo e si risolve quando e' finito o saltato.
 * Le battute scorrono a tocco; chi parla si anima, chi ascolta si attenua;
 * il narratore e' una didascalia senza fumetto.
 */
export function playChapter(chapter) {
  return new Promise(resolve => {
    stopVoice();
    const world = chapter.worldId ? content.worlds.find(w => w.id === chapter.worldId) : null;
    const creature = chapter.creatureId ? content.creatures.find(c => c.id === chapter.creatureId) : null;

    const screen = document.getElementById('screen-story');
    const tint = world?.color || '#6a5acd';
    // Esadecimale a 8 cifre: la tinta del mondo, trasparente verso il basso.
    screen.style.background = `radial-gradient(ellipse at 50% 22%, ${tint}66 0%, ${tint}00 62%)`;
    document.getElementById('story-chapter').textContent = chapterLabel(chapter);

    const pepeHost = document.getElementById('story-pepe');
    renderMascot(pepeHost);
    const creatureHost = document.getElementById('story-creature');
    creatureHost.innerHTML = '';
    creatureHost.className = 'story-creature';
    if (chapter.trigger?.type === 'world' && !chapter.creatureId) {
      // Epilogo: tutte le creature della storia insieme.
      creatureHost.classList.add('story-ensemble');
      for (const c of chapters()) {
        if (!c.creatureId || c.creatureId === 'c_pepe') continue;
        const cr = content.creatures.find(x => x.id === c.creatureId);
        if (cr) creatureHost.appendChild(spriteSvg(cr.sprite));
      }
    } else if (creature && creature.id !== 'c_pepe') {
      creatureHost.appendChild(spriteSvg(creature.sprite));
    }
    creatureHost.hidden = creatureHost.children.length === 0;

    const lineBox = document.getElementById('story-line');
    const next = document.getElementById('story-next');
    const skip = document.getElementById('story-skip');
    skip.textContent = t('story.skip');
    showScreen('story');

    let i = -1;
    let token = 0;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      stopVoice();
      next.onclick = null;
      skip.onclick = null;
      markSeen(chapter);
      resolve();
    };

    const show = async () => {
      i += 1;
      if (i >= chapter.lines.length) { finish(); return; }
      const my = ++token;
      const line = chapter.lines[i];
      const last = i === chapter.lines.length - 1;
      next.textContent = t(last ? 'story.done' : 'story.next');

      lineBox.className = `story-line is-${line.who}`;
      lineBox.innerHTML = '';
      if (line.who === 'creature') {
        lineBox.appendChild(el('span', 'en', line.en));
        lineBox.appendChild(el('span', 'it-sub', line.it));
      } else {
        lineBox.textContent = line.it;
      }

      const pepeSvg = pepeHost.querySelector('svg');
      pepeSvg?.classList.toggle('is-talking', line.who === 'pepe');
      pepeHost.classList.toggle('is-dim', line.who === 'creature');
      creatureHost.classList.toggle('is-speaking', line.who === 'creature');
      creatureHost.classList.toggle('is-dim', line.who === 'pepe');

      const english = line.who === 'creature';
      await speakLine(lineAudio(chapter, i), english ? line.en : line.it, english ? 'en-GB' : 'it-IT');
      if (my === token) {
        pepeSvg?.classList.remove('is-talking');
        creatureHost.classList.remove('is-speaking');
      }
    };

    next.onclick = () => { sfxTap(); stopVoice(); show(); };
    skip.onclick = () => { sfxTap(); finish(); };
    show();
  });
}

/** Riproduce in fila una lista di capitoli (quelli in sospeso). */
export async function playChapters(list) {
  for (const c of list) await playChapter(c);
}

/* ------------------------------------------------------------------ */
/* Dove si rivede: la striscia nell'album                              */
/* ------------------------------------------------------------------ */

/**
 * Dieci tondi: Pepe per il prologo, la creatura per ogni capitolo, una
 * stella per il finale. Quelli non ancora arrivati sono in ombra.
 * @param {HTMLElement} host
 * @param {(chapter: object) => void} onOpen
 */
export function renderStoryStrip(host, onOpen) {
  host.innerHTML = '';
  const all = chapters();
  if (!all.length) return;
  host.appendChild(el('p', 'story-strip-title', `${t('story.title')} · ${content.story.title_it}`));
  const strip = el('div', 'story-strip');
  for (const c of all) {
    const ok = isAvailable(c);
    const dot = el('button', 'story-dot' + (ok ? '' : ' is-locked'));
    dot.type = 'button';
    dot.setAttribute('aria-label', chapterLabel(c));
    let sprite = 'sp-icon-star';
    if (c.creatureId) sprite = content.creatures.find(x => x.id === c.creatureId)?.sprite || sprite;
    dot.appendChild(spriteSvg(sprite));
    dot.disabled = !ok;
    dot.addEventListener('click', () => { if (ok) { sfxTap(); onOpen(c); } });
    strip.appendChild(dot);
  }
  host.appendChild(strip);
}
