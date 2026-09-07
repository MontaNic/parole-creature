/**
 * La tana: uno spazio suo, da arredare con cio' che ha guadagnato.
 *
 * Nella stanza vanno Pepe, le creature trovate e gli adesivi degli scrigni.
 * Le posizioni sono in percentuale della stanza, cosi' la disposizione
 * regge quando l'iPad si gira. La logica di cosa e' disponibile e di dove
 * si puo' mettere e' pura e testata; il trascinamento e' pointer events.
 */

import { content, t, getItem } from './content-loader.js';
import { save, persist } from './state.js';
import { spriteSvg } from './minigames.js';
import { speakItem, sfxTap, stopVoice } from './audio.js';
import { renderMascot, mascotSay, mascotCheer } from './mascot.js';
import { showScreen } from './screens.js';

/** Colori di parete: quattro, dal design system (notte, foresta, lago, ambra). */
export const WALLS = ['#443A72', '#2F6B4F', '#1F6E7A', '#8A5A2B'];
const MIN = 6, MAX = 94;   // margine in % perche' una cosa non sparisca oltre il bordo

/* ------------------------------------------------------------------ */
/* Logica pura                                                         */
/* ------------------------------------------------------------------ */

/** Tutto cio' che il bambino possiede e puo' mettere nella tana. */
export function denItems() {
  const items = [];
  for (const c of content.creatures) {
    if (c.id === 'c_pepe' || save.progress.creatures[c.id]) {
      items.push({ id: c.id, kind: 'creature', sprite: c.sprite, name: c.name_it, creature: c });
    }
  }
  for (const s of content.stickers?.items || []) {
    if (!save.progress.stickers?.[s.id]) continue;
    const w = getItem(s.wordId);
    if (w) items.push({ id: s.id, kind: 'sticker', sprite: w.sprite, name: w.en, word: w });
  }
  return items;
}

export const clamp = (v) => Math.min(MAX, Math.max(MIN, v));

function den() {
  if (!save.den) save.den = { placed: {}, wall: 0 };
  if (!save.den.placed) save.den.placed = {};
  return save.den;
}

/** Mette (o sposta) una cosa nella stanza; x e y in %, ritagliati ai bordi. */
export function placeItem(id, x, y) {
  const d = den();
  const z = 1 + Math.max(0, ...Object.values(d.placed).map(p => p.z || 0));
  d.placed[id] = { x: clamp(x), y: clamp(y), z };
  persist();
  return d.placed[id];
}

export function removeItem(id) {
  const d = den();
  delete d.placed[id];
  persist();
}

export function isPlaced(id) {
  return Boolean(den().placed[id]);
}

export function setWall(i) {
  den().wall = ((i % WALLS.length) + WALLS.length) % WALLS.length;
  persist();
}

/* ------------------------------------------------------------------ */
/* La schermata                                                        */
/* ------------------------------------------------------------------ */

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

let salutato = false;   // Pepe presenta la tana una volta per sessione

export function renderDen() {
  const d = den();
  const room = document.getElementById('den-room');
  const tray = document.getElementById('den-tray');
  const walls = document.getElementById('den-walls');
  const hint = document.getElementById('den-hint');
  const items = denItems();
  const byId = new Map(items.map(i => [i.id, i]));

  // Cose riposte che non esistono piu' (non dovrebbe succedere: gli id sono permanenti)
  for (const id of Object.keys(d.placed)) if (!byId.has(id)) delete d.placed[id];

  const paint = () => {
    room.style.setProperty('--wall', WALLS[d.wall] || WALLS[0]);
    walls.querySelectorAll('button').forEach((b, i) => b.classList.toggle('is-on', i === d.wall));
  };

  /* --- parete --- */
  walls.innerHTML = '';
  WALLS.forEach((colore, i) => {
    const b = el('button', 'den-wall');
    b.type = 'button';
    b.style.background = colore;
    b.setAttribute('aria-label', `${t('den.wall')} ${i + 1}`);
    b.onclick = () => { sfxTap(); setWall(i); paint(); };
    walls.appendChild(b);
  });

  /* --- stanza --- */
  const drawRoom = () => {
    room.innerHTML = '';
    const entries = Object.entries(d.placed).sort((a, b) => (a[1].z || 0) - (b[1].z || 0));
    for (const [id, pos] of entries) {
      const it = byId.get(id);
      if (!it) continue;
      const node = el('div', `den-item is-${it.kind}`);
      node.dataset.id = id;
      node.style.left = `${pos.x}%`;
      node.style.top = `${pos.y}%`;
      node.appendChild(spriteSvg(it.sprite));
      wireDrag(node, it);
      room.appendChild(node);
    }
    hint.hidden = entries.length > 0;
  };

  /* --- vassoio --- */
  const drawTray = () => {
    tray.innerHTML = '';
    const left = items.filter(i => !isPlaced(i.id));
    if (!left.length) {
      tray.appendChild(el('p', 'tiny muted center', t('den.tray_empty')));
      return;
    }
    for (const it of left) {
      const b = el('button', 'den-tray-item');
      b.type = 'button';
      b.setAttribute('aria-label', it.name);
      b.appendChild(spriteSvg(it.sprite));
      b.onclick = () => {
        sfxTap();
        // Al centro, con un piccolo scarto casuale: due tocchi di fila non
        // devono sovrapporsi esattamente.
        placeItem(it.id, 50 + (Math.random() * 20 - 10), 55 + (Math.random() * 16 - 8));
        drawRoom(); drawTray();
      };
      tray.appendChild(b);
    }
  };

  /* --- trascinamento --- */
  function wireDrag(node, it) {
    let start = null;
    let moved = false;
    node.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      node.setPointerCapture?.(ev.pointerId);
      const r = room.getBoundingClientRect();
      start = { px: ev.clientX, py: ev.clientY, r };
      moved = false;
      node.style.zIndex = 999;
    });
    node.addEventListener('pointermove', (ev) => {
      if (!start) return;
      const dx = ev.clientX - start.px, dy = ev.clientY - start.py;
      if (Math.abs(dx) + Math.abs(dy) > 6) moved = true;
      if (!moved) return;
      const x = clamp(((ev.clientX - start.r.left) / start.r.width) * 100);
      const y = clamp(((ev.clientY - start.r.top) / start.r.height) * 100);
      node.style.left = `${x}%`;
      node.style.top = `${y}%`;
      const t2 = tray.getBoundingClientRect();
      tray.classList.toggle('is-target', ev.clientY >= t2.top - 10);
    });
    const finish = (ev) => {
      if (!start) return;
      const s = start; start = null;
      tray.classList.remove('is-target');
      const t2 = tray.getBoundingClientRect();
      if (moved && ev.clientY >= t2.top - 10) {
        // Riposto nel vassoio.
        removeItem(it.id);
        drawRoom(); drawTray();
        return;
      }
      if (moved) {
        const x = clamp(((ev.clientX - s.r.left) / s.r.width) * 100);
        const y = clamp(((ev.clientY - s.r.top) / s.r.height) * 100);
        placeItem(it.id, x, y);
        drawRoom();
        return;
      }
      // Un tocco: davanti a tutti, e parla.
      sfxTap();
      placeItem(it.id, d.placed[it.id].x, d.placed[it.id].y);
      drawRoom();
      const fresh = room.querySelector(`[data-id="${it.id}"]`);
      if (it.kind === 'sticker') speakItem(it.word);
      else mascotCheer(fresh);
    };
    node.addEventListener('pointerup', finish);
    node.addEventListener('pointercancel', () => { start = null; tray.classList.remove('is-target'); drawRoom(); });
  }

  paint();
  drawRoom();
  drawTray();
  renderMascot(document.getElementById('den-mascot'));
  showScreen('den');
  if (!salutato) {
    salutato = true;
    mascotSay('den_welcome', { avatar: document.getElementById('den-mascot') });
  } else {
    stopVoice();
  }
}
