/**
 * I libretti: i mini-ebook della fase 4, leggibili nel gioco.
 *
 * Ogni libretto e' una storia di 8 pagine con il lessico e le strutture
 * delle unita' gia' fatte; ogni pagina ha un'illustrazione del gioco, il
 * testo in Andika e la sua traccia audio. Si apre completando l'unita'
 * indicata. E' la lettura che le Indicazioni chiedono: parole gia'
 * imparate a orecchio, ritrovate scritte in un testo continuo.
 */

import { content, t } from './content-loader.js';
import { save, persist } from './state.js';
import { unitProgress } from './curriculum.js';
import { spriteSvg, audioOrb } from './minigames.js';
import { speakLine, stopVoice, sfxTap } from './audio.js';
import { showScreen } from './screens.js';

export function books() {
  return (content.ebooks || []).filter(b => Array.isArray(b.pages) && b.pages.length);
}

export function bookUnlocked(book) {
  const world = content.worlds.find(w => w.id === book.unlockAfterWorld);
  return Boolean(world && unitProgress(world).completed);
}

/** Percorso audio di una pagina: lo stesso che genera tools/generate-audio.mjs. */
export function pageAudio(book, n) {
  return `en/book.${book.id}.${n}.mp3`;
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

function markRead(book) {
  if (!save.ebooks) save.ebooks = {};
  const rec = save.ebooks[book.id] || {};
  if (rec.status !== 'sent') rec.status = 'read';
  rec.readAt = new Date().toISOString();
  save.ebooks[book.id] = rec;
  persist(true);
}

/** Apre un libretto; si risolve quando si torna indietro. */
export function openBook(book) {
  return new Promise(resolve => {
    stopVoice();
    const title = document.getElementById('book-title');
    const pageEl = document.getElementById('book-page');
    const art = document.getElementById('book-art');
    const text = document.getElementById('book-text');
    const prev = document.getElementById('book-prev');
    const next = document.getElementById('book-next');
    const back = document.getElementById('book-back');
    title.textContent = book.title;
    prev.textContent = t('books.prev');
    showScreen('book');

    let i = 0;
    let token = 0;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      stopVoice();
      prev.onclick = next.onclick = back.onclick = null;
      resolve();
    };
    const show = async () => {
      const my = ++token;
      const p = book.pages[i];
      const last = i === book.pages.length - 1;
      pageEl.textContent = t('books.page').replace('{n}', i + 1).replace('{tot}', book.pages.length);
      art.innerHTML = '';
      art.appendChild(spriteSvg(p.sprite));
      text.innerHTML = '';
      const orb = audioOrb({ id: `book.${book.id}.${i}`, en: p.en, kind: 'phrase', _rel: pageAudio(book, i) });
      orb.classList.add('book-orb');
      text.appendChild(orb);
      text.appendChild(el('p', 'book-line', p.en));
      prev.hidden = i === 0;
      next.textContent = t(last ? 'books.the_end' : 'books.next');
      stopVoice();
      await speakLine(pageAudio(book, i), p.en, 'en-GB');
      if (my !== token) return;
    };
    prev.onclick = () => { sfxTap(); if (i > 0) { i -= 1; show(); } };
    next.onclick = () => {
      sfxTap();
      if (i < book.pages.length - 1) { i += 1; show(); return; }
      markRead(book);
      finish();
    };
    back.onclick = () => { sfxTap(); finish(); };
    show();
  });
}

/** La mensola nell'album: sei copertine, in ombra quelle non ancora aperte. */
export function renderShelf(host, onOpen) {
  host.innerHTML = '';
  const all = books();
  if (!all.length) return;
  const letti = all.filter(b => save.ebooks?.[b.id]?.status === 'read' || save.ebooks?.[b.id]?.status === 'sent').length;
  host.appendChild(el('h3', 'stickers-title', `${t('books.title')} · ${letti}/${all.length}`));
  host.appendChild(el('p', 'muted center tiny', t('books.subtitle')));
  const shelf = el('div', 'book-shelf');
  for (const b of all) {
    const ok = bookUnlocked(b);
    const card = el('button', 'book-cover' + (ok ? '' : ' is-locked'));
    card.type = 'button';
    const a = el('div', 'book-cover-art');
    a.appendChild(spriteSvg(b.pages[0].sprite));
    card.appendChild(a);
    card.appendChild(el('b', 'book-cover-title', b.title));
    if (!ok) card.appendChild(el('span', 'tiny', t('books.locked')));
    card.addEventListener('click', () => { sfxTap(); if (ok) onOpen(b); });
    shelf.appendChild(card);
  }
  host.appendChild(shelf);
}
