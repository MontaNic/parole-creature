/**
 * I suoni: phonics sintetico, in quattro lezioni.
 *
 * Lettera -> suono (non il nome della lettera), poi la fusione: tre suoni
 * toccati in ordine diventano una parola del gioco. E' cio' che rende
 * leggibili parole mai viste. Niente voto: sbagliare fa tremare la
 * tessera e basta.
 */

import { content, t, getItem } from './content-loader.js';
import { save, persist } from './state.js';
import { shuffle } from './srs.js';
import { spriteSvg } from './minigames.js';
import { speakLine, speakItem, stopVoice, sfxTap, sfxCorrect, sfxRetry } from './audio.js';
import { mascotSay } from './mascot.js';
import { celebrate, celebrateCorrect } from './effects.js';
import { showScreen } from './screens.js';

export function lessons() { return (content.phonics.lessons || []).slice().sort((a, b) => a.order - b.order); }
export function soundById(id) { return content.phonics.sounds.find(s => s.id === id) || null; }
export function blendOf(wordId) { return content.phonics.blends.find(b => b.wordId === wordId) || null; }
export function soundAudio(sound) { return `en/sound.${sound.id}.mp3`; }
/** Il suono isolato dove la sintesi lo dice pulito; altrimenti quello ancorato. */
export function letterAudio(sound) { return sound.isolated ? `en/letter.${sound.id}.mp3` : soundAudio(sound); }
export function blendAudio(wordId) { return `en/blend.${wordId}.mp3`; }
export function lessonDone(lesson) { return save.phonics?.lessons?.[lesson.id]?.done || 0; }

function markDone(lesson) {
  if (!save.phonics) save.phonics = { lessons: {} };
  const rec = save.phonics.lessons[lesson.id] || { done: 0 };
  rec.done += 1; rec.last = new Date().toISOString();
  save.phonics.lessons[lesson.id] = rec;
  persist(true);
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}
const pause = (ms) => new Promise(r => setTimeout(r, ms));
const alive = () => document.getElementById('screen-play')?.classList.contains('is-active');

/** La card in home: quattro puntini, uno per lezione. */
export function renderPhonicsCard() {
  const dots = document.getElementById('phonics-dots');
  if (!dots) return;
  dots.innerHTML = '';
  for (const l of lessons()) {
    const d = el('i', 'phonics-dot' + (lessonDone(l) ? ' is-done' : ''));
    d.title = l.title_it;
    dots.appendChild(d);
  }
}

/** La schermata delle lezioni. */
export function renderPhonics(onOpen) {
  const host = document.getElementById('phonics-lessons');
  host.innerHTML = '';
  for (const l of lessons()) {
    const card = el('button', 'phonics-lesson' + (lessonDone(l) ? ' is-done' : ''));
    card.type = 'button';
    card.appendChild(el('div', 'phonics-lesson-letters', l.title_it));
    card.appendChild(el('div', 'phonics-lesson-title', t('phonics.lesson').replace('{n}', l.order)));
    card.appendChild(el('div', 'tiny muted', lessonDone(l) ? t('phonics.done_times').replace('{n}', lessonDone(l)) : ''));
    card.addEventListener('click', () => { sfxTap(); onOpen(l); });
    host.appendChild(card);
  }
  showScreen('phonics');
}

/* ------------------------------------------------------------------ */
/* Una lezione                                                         */
/* ------------------------------------------------------------------ */

export async function runLesson(lesson) {
  const host = document.getElementById('play-area');
  const score = document.getElementById('play-score');
  const bar = document.getElementById('play-progress');
  showScreen('play');
  score.textContent = '0';
  let punti = 0;
  const sounds = lesson.soundIds.map(soundById).filter(Boolean);
  const totale = sounds.length + 4 + 4 + Math.min(4, lesson.blendWords.length);
  let fatti = 0;
  const avanza = () => { fatti += 1; bar.style.width = `${Math.round((fatti / totale) * 100)}%`; };
  const bene = (ev) => { punti += 1; score.textContent = String(punti); sfxCorrect(punti % 3); celebrateCorrect(punti, ev ? { x: ev.clientX, y: ev.clientY } : null); };

  await mascotSay('phonics_start', { avatar: document.getElementById('play-mascot') });

  // 1. i suoni, uno per uno
  for (const s of sounds) {
    if (!alive()) return;
    await introSound(host, s);
    avanza();
  }
  // 2. quale suono hai sentito?
  for (let k = 0; k < 4; k++) {
    if (!alive()) return;
    await whichSound(host, sounds, k, bene);
    avanza();
  }
  // 3. con che suono inizia?
  for (let k = 0; k < 4; k++) {
    if (!alive()) return;
    await startsWith(host, sounds, k, bene);
    avanza();
  }
  // 4. la fusione
  const blends = shuffle(lesson.blendWords.slice()).slice(0, 4);
  if (blends.length) await mascotSay('phonics_blend', { avatar: document.getElementById('play-mascot') });
  for (const wid of blends) {
    if (!alive()) return;
    await blendWord(host, wid, bene);
    avanza();
  }
  if (!alive()) return;
  markDone(lesson);
  host.innerHTML = '';
  host.appendChild(el('p', 'h-title', t('phonics.lesson_done')));
  celebrate();
  await mascotSay('phonics_done', { avatar: document.getElementById('play-mascot') });
  await pause(600);
}

function tile(text, big = false) {
  const b = el('button', 'ph-tile' + (big ? ' is-big' : ''), text);
  b.type = 'button';
  return b;
}

async function introSound(host, s) {
  host.innerHTML = '';
  host.appendChild(el('p', 'game-prompt', t('phonics.intro_prompt')));
  const stage = el('div', 'ph-stage');
  const big = tile(s.grapheme, true);
  stage.appendChild(big);
  const word = getItem(s.wordIds[0]);
  if (word) {
    const art = el('div', 'choice ph-art');
    art.style.pointerEvents = 'none';
    art.appendChild(spriteSvg(word.sprite));
    stage.appendChild(art);
    stage.appendChild(el('p', 'word-written', word.en));
  }
  const next = el('button', 'btn btn-lg', t('phonics.next'));
  stage.appendChild(next);
  host.appendChild(stage);
  const play = async () => { big.classList.add('is-playing'); stopVoice(); await speakLine(soundAudio(s), s.anchor, 'en-GB'); big.classList.remove('is-playing'); };
  big.addEventListener('click', () => { sfxTap(); play(); });
  await pause(250);
  await play();
  await new Promise(res => { next.onclick = () => { sfxTap(); stopVoice(); res(); }; });
}

function pick3(sounds, target) {
  const others = shuffle(sounds.filter(s => s !== target)).slice(0, 2);
  return shuffle([target, ...others]);
}

async function whichSound(host, sounds, k, bene) {
  const target = sounds[(k * 2 + 1) % sounds.length];
  host.innerHTML = '';
  host.appendChild(el('p', 'game-prompt', t('phonics.which_sound')));
  const stage = el('div', 'ph-stage');
  const orb = el('button', 'audio-orb');
  orb.type = 'button';
  orb.appendChild(spriteSvg('sp-icon-sound'));
  const play = async () => { orb.classList.add('is-playing'); stopVoice(); await speakLine(letterAudio(target), target.isolated || target.anchor, 'en-GB'); orb.classList.remove('is-playing'); };
  orb.addEventListener('click', () => { sfxTap(); play(); });
  stage.appendChild(orb);
  const row = el('div', 'ph-row');
  stage.appendChild(row);
  host.appendChild(stage);
  await pause(250);
  play();
  await new Promise(res => {
    for (const s of pick3(sounds, target)) {
      const b = tile(s.grapheme);
      b.addEventListener('click', async (ev) => {
        if (s === target) {
          b.classList.add('is-correct'); bene(ev);
          [...row.children].forEach(x => { x.disabled = true; });
          await pause(900); res();
        } else {
          sfxRetry(); b.classList.add('is-wrong'); setTimeout(() => b.classList.remove('is-wrong'), 500);
        }
      });
      row.appendChild(b);
    }
  });
}

async function startsWith(host, sounds, k, bene) {
  const target = sounds[(k * 3 + 2) % sounds.length];
  const word = getItem(target.wordIds[k % target.wordIds.length]);
  const others = shuffle(sounds.filter(s => s !== target)).slice(0, 2).map(s => getItem(s.wordIds[0])).filter(w => w && w.sprite !== word.sprite);
  host.innerHTML = '';
  host.appendChild(el('p', 'game-prompt', t('phonics.starts_with')));
  const stage = el('div', 'ph-stage');
  const big = tile(target.grapheme, true);
  big.addEventListener('click', () => { sfxTap(); stopVoice(); speakLine(letterAudio(target), target.isolated || target.anchor, 'en-GB'); });
  stage.appendChild(big);
  const grid = el('div', 'choice-grid cols-3');
  grid.style.setProperty('--cols', 3); grid.style.setProperty('--rows', 1);
  stage.appendChild(grid);
  host.appendChild(stage);
  await pause(250);
  stopVoice(); speakLine(letterAudio(target), target.isolated || target.anchor, 'en-GB');
  await new Promise(res => {
    for (const w of shuffle([word, ...others])) {
      const b = el('button', 'choice');
      b.type = 'button';
      b.appendChild(spriteSvg(w.sprite));
      b.addEventListener('click', async (ev) => {
        if (w === word) {
          b.classList.add('is-correct'); bene(ev);
          [...grid.children].forEach(x => { x.disabled = true; });
          stopVoice(); await speakItem(word);
          await pause(500); res();
        } else {
          sfxRetry(); b.classList.add('is-wrong'); setTimeout(() => b.classList.remove('is-wrong'), 500);
        }
      });
      grid.appendChild(b);
    }
  });
}

export async function blendWord(host, wordId, bene) {
  const blend = blendOf(wordId);
  const word = getItem(wordId);
  if (!blend || !word) return;
  host.innerHTML = '';
  host.appendChild(el('p', 'game-prompt', t('phonics.blend_prompt')));
  const stage = el('div', 'ph-stage');
  const row = el('div', 'ph-row');
  stage.appendChild(row);
  const reveal = el('div', 'ph-reveal');
  reveal.hidden = true;
  stage.appendChild(reveal);
  host.appendChild(stage);
  let next = 0;
  await new Promise(res => {
    blend.soundIds.forEach((sid, i) => {
      const s = soundById(sid);
      const b = tile(s.grapheme);
      b.classList.add('is-waiting');
      b.addEventListener('click', async () => {
        if (i !== next) { sfxRetry(); b.classList.add('is-wrong'); setTimeout(() => b.classList.remove('is-wrong'), 400); return; }
        next += 1;
        b.classList.remove('is-waiting'); b.classList.add('is-said');
        stopVoice(); await speakLine(letterAudio(s), s.isolated || s.anchor, 'en-GB');
        if (next === blend.soundIds.length) res();
      });
      row.appendChild(b);
    });
  });
  // la parola intera, con la figura
  reveal.hidden = false;
  const art = el('div', 'choice ph-art'); art.style.pointerEvents = 'none';
  art.appendChild(spriteSvg(word.sprite));
  reveal.appendChild(art);
  reveal.appendChild(el('p', 'word-written', word.en));
  stopVoice(); await speakLine(blendAudio(wordId), blend.tts, 'en-GB');
  // e la scelta: quale parola e'?
  host.querySelector('.game-prompt').textContent = t('phonics.blend_which');
  // Resta la parola scritta, va via la figura: leggere "cat" e trovare il gatto e' il punto.
  reveal.querySelector('.ph-art')?.remove();
  const pool = content.phonics.blends.map(b => getItem(b.wordId)).filter(w => w && w.sprite !== word.sprite);
  const grid = el('div', 'choice-grid cols-3');
  grid.style.setProperty('--cols', 3); grid.style.setProperty('--rows', 1);
  reveal.appendChild(grid);
  await new Promise(res => {
    for (const w of shuffle([word, ...shuffle(pool).slice(0, 2)])) {
      const b = el('button', 'choice'); b.type = 'button';
      b.appendChild(spriteSvg(w.sprite));
      b.addEventListener('click', async (ev) => {
        if (w === word) { b.classList.add('is-correct'); bene(ev); [...grid.children].forEach(x => { x.disabled = true; }); await pause(800); res(); }
        else { sfxRetry(); b.classList.add('is-wrong'); setTimeout(() => b.classList.remove('is-wrong'), 500); }
      });
      grid.appendChild(b);
    }
  });
}
