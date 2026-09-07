/**
 * I distintivi: traguardi di lungo periodo.
 *
 * Ogni distintivo e' una condizione pura sul salvataggio: si valuta a fine
 * partita, e una volta preso resta. Gli id bd_* sono permanenti.
 */

import { content, t } from './content-loader.js';
import { save, persist } from './state.js';
import { masteredCount } from './srs.js';
import { spriteSvg } from './minigames.js';

/** @type {Array<{id:string, sprite:string, when:(s:object, ctx:object)=>boolean}>} */
export const BADGES = [
  { id: 'bd_first_round', sprite: 'sp-icon-play', when: (s) => (s.stats.totalRounds || 0) >= 1 },
  { id: 'bd_streak_3', sprite: 'sp-icon-flame', when: (s) => (s.streak.best || 0) >= 3 },
  { id: 'bd_streak_7', sprite: 'sp-icon-flame', when: (s) => (s.streak.best || 0) >= 7 },
  { id: 'bd_mastered_10', sprite: 'sp-icon-star', when: (s, c) => c.mastered >= 10 },
  { id: 'bd_mastered_25', sprite: 'sp-icon-star', when: (s, c) => c.mastered >= 25 },
  { id: 'bd_mastered_50', sprite: 'sp-icon-star', when: (s, c) => c.mastered >= 50 },
  { id: 'bd_phase1_creatures', sprite: 'sp-icon-album',
    when: (s) => ['c_flamup', 'c_rocktail', 'c_prisma', 'c_numo'].every(id => s.progress.creatures[id]) },
  { id: 'bd_first_chest', sprite: 'sp-chest-open', when: (s) => (s.stats.chestsOpened || 0) >= 1 },
  { id: 'bd_all_stickers', sprite: 'sp-icon-mission',
    when: (s, c) => c.stickerCount > 0 && Object.keys(s.progress.stickers || {}).length >= c.stickerCount },
  { id: 'bd_story_done', sprite: 'sp-torrek', when: (s) => Boolean(s.progress.storySeen?.st_epilogue) },
  { id: 'bd_first_record', sprite: 'sp-icon-mic', when: (s) => (s.stats.totalRecordings || 0) >= 1 }
];

function contesto() {
  return { mastered: masteredCount(), stickerCount: (content.stickers?.items || []).length };
}

/**
 * Valuta tutti i distintivi e restituisce quelli presi ADESSO.
 * @param {object} [s] salvataggio (per i test); default quello vero
 * @param {object} [ctx] contesto (per i test)
 */
export function checkBadges(s = save, ctx = contesto()) {
  if (!s.progress.badges) s.progress.badges = {};
  const nuovi = [];
  for (const b of BADGES) {
    if (s.progress.badges[b.id]) continue;
    let ok = false;
    try { ok = Boolean(b.when(s, ctx)); } catch { ok = false; }
    if (ok) {
      s.progress.badges[b.id] = new Date().toISOString();
      nuovi.push(b);
    }
  }
  if (nuovi.length && s === save) persist(true);
  return nuovi;
}

export function badgeName(b) { return t(`badges.${b.id}.name`, b.id); }
export function badgeDesc(b) { return t(`badges.${b.id}.desc`, ''); }

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

/** La fila dei distintivi appena presi, per il riepilogo. */
export function renderNewBadges(list) {
  const row = el('div', 'badge-row');
  row.appendChild(el('p', 'h-sub', t('badges.new_label')));
  const strip = el('div', 'badge-strip');
  for (const b of list) {
    const chip = el('div', 'badge-chip');
    chip.appendChild(spriteSvg(b.sprite));
    chip.appendChild(el('span', null, badgeName(b)));
    strip.appendChild(chip);
  }
  row.appendChild(strip);
  return row;
}

/** La sezione dell'album. */
export function renderBadges(host) {
  host.innerHTML = '';
  const have = save.progress.badges || {};
  const n = BADGES.filter(b => have[b.id]).length;
  host.appendChild(el('h3', 'stickers-title', `${t('badges.title')} · ${n}/${BADGES.length}`));
  host.appendChild(el('p', 'muted center tiny', t('badges.subtitle')));
  const grid = el('div', 'badge-grid');
  for (const b of BADGES) {
    const ok = Boolean(have[b.id]);
    const card = el('div', 'badge-card' + (ok ? '' : ' is-locked'));
    const art = el('div', 'badge-art');
    art.appendChild(spriteSvg(b.sprite));
    card.appendChild(art);
    card.appendChild(el('b', null, badgeName(b)));
    card.appendChild(el('span', 'badge-desc', badgeDesc(b)));
    grid.appendChild(card);
  }
  host.appendChild(grid);
}
