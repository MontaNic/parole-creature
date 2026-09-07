/**
 * Gli scrigni a sorpresa.
 *
 * Uno scrigno compare di rado in mezzo a una partita, senza preavviso, mai
 * piu' di uno al giorno. Dentro c'e' un adesivo — una parola da collezione,
 * con illustrazione e pronuncia — o, finiti gli adesivi, stelle in regalo.
 * Poco codice, molta attesa: il valore sta nel non sapere quando.
 */

import { CONFIG } from './config.js';
import { content, t, getItem } from './content-loader.js';
import { save, persist, addXp } from './state.js';
import { spriteSvg } from './minigames.js';
import { speakItem, stopVoice, sfxTap, sfxUnlock } from './audio.js';
import { mascotSay } from './mascot.js';
import { celebrate } from './effects.js';

/* ------------------------------------------------------------------ */
/* Decisioni (pure, testabili)                                         */
/* ------------------------------------------------------------------ */

export function stickers() {
  return content.stickers?.items || [];
}

/**
 * A quale passo della partita compare lo scrigno, o -1.
 * Mai nel primo passo ne' nella sfida finale, mai nella primissima partita,
 * mai due volte nello stesso giorno.
 * @param {number} stepCount
 * @param {{rng?:()=>number, alreadyToday:boolean, roundsPlayed:number, chance?:number}} o
 */
export function planChest(stepCount, o) {
  const rng = o.rng || Math.random;
  const chance = o.chance ?? CONFIG.chest.chance;
  if (o.alreadyToday || o.roundsPlayed < 1 || stepCount < 3) return -1;
  if (rng() >= chance) return -1;
  return 1 + Math.floor(rng() * (stepCount - 2));
}

/** Un adesivo non ancora trovato, a caso; null quando sono finiti. */
export function nextSticker(rng = Math.random) {
  const have = save.progress.stickers || {};
  const left = stickers().filter(s => !have[s.id]);
  if (!left.length) return null;
  return left[Math.floor(rng() * left.length)];
}

/* ------------------------------------------------------------------ */
/* La scena                                                            */
/* ------------------------------------------------------------------ */

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

const tap = (btn) => new Promise(res => { btn.onclick = () => { sfxTap(); res(); }; });

/**
 * Mostra lo scrigno nell'area di gioco e si risolve quando il bambino ha
 * visto il premio e toccato "Continua".
 * @returns {Promise<{type:'sticker'|'xp', levelUp:boolean}>}
 */
export async function openChest(host, { mascotHost, rng = Math.random } = {}) {
  stopVoice();
  host.innerHTML = '';
  const wrap = el('div', 'chest-wrap');
  wrap.appendChild(el('p', 'game-prompt', t('games.chest_prompt')));
  const btn = el('button', 'chest-btn');
  btn.type = 'button';
  btn.setAttribute('aria-label', t('games.chest_prompt'));
  btn.appendChild(spriteSvg('sp-chest'));
  wrap.appendChild(btn);
  host.appendChild(wrap);
  mascotSay('chest_found', { avatar: mascotHost });

  await tap(btn);
  stopVoice();
  btn.onclick = null;
  btn.disabled = true;
  btn.classList.add('is-open');
  btn.innerHTML = '';
  btn.appendChild(spriteSvg('sp-chest-open'));
  sfxUnlock();
  celebrate();

  const sticker = nextSticker(rng);
  const reward = el('div', 'chest-reward');
  let levelUp = false;
  let word = null;
  if (sticker) {
    word = getItem(sticker.wordId);
    if (!save.progress.stickers) save.progress.stickers = {};
    save.progress.stickers[sticker.id] = new Date().toISOString();
    const art = el('div', 'art');
    art.appendChild(spriteSvg(word.sprite));
    reward.appendChild(art);
    reward.appendChild(el('span', 'en', word.en));
    reward.appendChild(el('span', 'it', word.it));
  } else {
    levelUp = addXp(CONFIG.chest.xpBonus);
    const art = el('div', 'art');
    art.appendChild(spriteSvg('sp-icon-star'));
    reward.appendChild(art);
    reward.appendChild(el('span', 'xp', `+${CONFIG.chest.xpBonus}`));
  }
  save.daily.chestOpened = true;
  save.stats.chestsOpened = (save.stats.chestsOpened || 0) + 1;
  persist(true);
  wrap.appendChild(reward);

  await mascotSay(sticker ? 'chest_sticker' : 'chest_stars', { avatar: mascotHost });
  if (word) await speakItem(word);

  const go = el('button', 'btn btn-lg', t('ui.continue_button'));
  wrap.appendChild(go);
  await tap(go);
  return { type: sticker ? 'sticker' : 'xp', levelUp };
}

/* ------------------------------------------------------------------ */
/* L'album degli adesivi                                               */
/* ------------------------------------------------------------------ */

export function renderStickers(host) {
  host.innerHTML = '';
  const all = stickers();
  if (!all.length) return;
  const have = save.progress.stickers || {};
  const found = all.filter(s => have[s.id]).length;
  host.appendChild(el('h3', 'stickers-title', `${t('album.stickers_title')} · ${found}/${all.length}`));
  host.appendChild(el('p', 'muted center tiny', t('album.stickers_subtitle')));
  const grid = el('div', 'sticker-grid');
  for (const s of all) {
    const word = getItem(s.wordId);
    if (!word) continue;
    const ok = Boolean(have[s.id]);
    const card = el('button', 'sticker-card' + (ok ? '' : ' is-locked'));
    card.type = 'button';
    const art = el('div', 'sticker-art');
    art.appendChild(spriteSvg(word.sprite));
    card.appendChild(art);
    card.appendChild(el('span', 'sticker-en', ok ? word.en : '?'));
    card.addEventListener('click', () => { sfxTap(); if (ok) speakItem(word); });
    grid.appendChild(card);
  }
  host.appendChild(grid);
}
