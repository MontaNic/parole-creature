/**
 * Audio del gioco.
 *
 * Tre livelli, in ordine di preferenza:
 *  1) file MP3 pre-generati con ElevenLabs (assets/audio/...), cachati dal
 *     service worker: funzionano offline e non costano nulla a runtime;
 *  2) sintesi vocale del browser (SpeechSynthesis) se il file non c'e';
 *  3) niente, se il dispositivo non ha nemmeno la sintesi (il gioco resta
 *     giocabile: le immagini e i testi bastano a proseguire).
 *
 * Effetti sonori e musica sono generati con la Web Audio API: zero byte da
 * scaricare, nessun problema di licenza, peso nullo su tablet lenti.
 */

import { CONFIG } from './config.js';
import { audioIndex } from './content-loader.js';
import { save } from './state.js';

let ctx = null;
let musicGain = null;
let musicTimer = null;
let unlocked = false;

/** Cache degli elementi <audio> gia' creati, per non riscaricare i file. */
const audioCache = new Map();

/* ------------------------------------------------------------------ */
/* Sblocco su iOS/Safari: serve un gesto dell'utente                   */
/* ------------------------------------------------------------------ */

export function initAudioUnlock() {
  const unlock = () => {
    if (unlocked) return;
    unlocked = true;
    getCtx();
    if (ctx && ctx.state === 'suspended') ctx.resume();
    // Un'utterance vuota "sveglia" la sintesi vocale su iOS.
    try {
      const u = new SpeechSynthesisUtterance('');
      speechSynthesis.speak(u);
    } catch { /* ignorato */ }
    if (save.settings.music) startMusic();
  };
  ['pointerdown', 'touchstart', 'keydown'].forEach(ev =>
    document.addEventListener(ev, unlock, { once: true, passive: true })
  );
}

function getCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) ctx = new AC();
  }
  if (ctx && ctx.state === 'suspended') ctx.resume();
  return ctx;
}

/* ------------------------------------------------------------------ */
/* Voce: parole e frasi in inglese                                     */
/* ------------------------------------------------------------------ */

/**
 * Pronuncia una parola o frase in inglese.
 * @param {{id:string, en:string}} item elemento di content.json
 * @returns {Promise<void>} si risolve a fine riproduzione
 */
export function speakItem(item) {
  if (!item) return Promise.resolve();
  return playVoice(`en/${item.id}.mp3`, item.en, 'en-GB');
}

/**
 * Pronuncia una battuta della mascotte in italiano.
 * @param {string} key chiave dentro strings.mascot (es. "welcome_back")
 * @param {string} text testo di ripiego per la sintesi vocale
 */
export function speakMascot(key, text) {
  return playVoice(`it/mascot.${key}.mp3`, text, 'it-IT');
}

async function playVoice(relPath, text, lang) {
  const hasFile = !audioIndex.loaded || audioIndex.files.has(relPath);
  if (hasFile) {
    try {
      await playFile(CONFIG.audioBase + relPath);
      return;
    } catch {
      // file assente o non riproducibile: si prosegue con la sintesi
    }
  }
  await speakSynth(text, lang);
}

function playFile(url) {
  return new Promise((resolve, reject) => {
    let el = audioCache.get(url);
    if (!el) {
      el = new Audio(url);
      el.preload = 'auto';
      audioCache.set(url, el);
    }

    let timer = null;
    const cleanup = () => {
      clearTimeout(timer);
      el.removeEventListener('ended', onEnd);
      el.removeEventListener('error', onErr);
    };
    const onEnd = () => { cleanup(); resolve(); };
    const onErr = () => { cleanup(); reject(new Error('audio non disponibile')); };

    el.addEventListener('ended', onEnd);
    el.addEventListener('error', onErr);

    // Rete di sicurezza: se 'ended' non arriva mai (traccia che non parte,
    // decodifica bloccata, scheda messa in pausa dal sistema) il mini-gioco
    // resterebbe appeso in attesa. Meglio proseguire senza audio.
    const ceiling = Number.isFinite(el.duration) && el.duration > 0
      ? (el.duration + 1) * 1000
      : 12000;
    timer = setTimeout(onEnd, ceiling);

    el.currentTime = 0;
    const p = el.play();
    if (p && typeof p.catch === 'function') p.catch(onErr);
  });
}

function speakSynth(text, lang) {
  return new Promise(resolve => {
    if (!text || !('speechSynthesis' in window)) { resolve(); return; }
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang;
      u.rate = lang.startsWith('en') ? 0.82 : 0.95;   // piu' lento in inglese
      u.pitch = 1.05;
      const voice = pickVoice(lang);
      if (voice) u.voice = voice;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      speechSynthesis.speak(u);
      // Rete di sicurezza: alcuni browser non emettono mai "end".
      setTimeout(resolve, 400 + text.length * 90);
    } catch {
      resolve();
    }
  });
}

let cachedVoices = null;
function pickVoice(lang) {
  if (!('speechSynthesis' in window)) return null;
  if (!cachedVoices || !cachedVoices.length) cachedVoices = speechSynthesis.getVoices();
  if (!cachedVoices || !cachedVoices.length) return null;
  const prefix = lang.slice(0, 2);
  return cachedVoices.find(v => v.lang === lang)
      || cachedVoices.find(v => v.lang && v.lang.startsWith(prefix))
      || null;
}

if ('speechSynthesis' in window) {
  speechSynthesis.addEventListener?.('voiceschanged', () => { cachedVoices = null; });
}

export function stopVoice() {
  try { speechSynthesis.cancel(); } catch { /* ignorato */ }
  for (const el of audioCache.values()) {
    if (!el.paused) { el.pause(); el.currentTime = 0; }
  }
}

/* ------------------------------------------------------------------ */
/* Effetti sonori sintetizzati                                         */
/* ------------------------------------------------------------------ */

function tone({ freq = 440, dur = 0.16, type = 'sine', gain = 0.18, delay = 0, slideTo = null }) {
  const c = getCtx();
  if (!c || !save.settings.sfx) return;
  const osc = c.createOscillator();
  const g = c.createGain();
  const t0 = c.currentTime + delay;
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

/** Tre varianti di suono "giusto", a rotazione, per non stancare. */
const CORRECT_SFX = [
  () => { tone({ freq: 523, dur: .12, type: 'triangle' }); tone({ freq: 784, dur: .18, delay: .1, type: 'triangle' }); },
  () => { tone({ freq: 660, dur: .1, type: 'square', gain: .12 }); tone({ freq: 880, dur: .1, delay: .09, type: 'square', gain: .12 }); tone({ freq: 1174, dur: .22, delay: .18, type: 'triangle' }); },
  () => { tone({ freq: 440, dur: .3, type: 'sine', slideTo: 1320, gain: .16 }); }
];

export function sfxCorrect(variant = 0) {
  CORRECT_SFX[variant % CORRECT_SFX.length]();
}

/** Suono di riprova: mai punitivo, solo un "bloop" morbido verso il basso. */
export function sfxRetry() {
  tone({ freq: 330, dur: .22, type: 'sine', slideTo: 220, gain: .14 });
}

export function sfxTap() {
  tone({ freq: 700, dur: .06, type: 'triangle', gain: .1 });
}

export function sfxUnlock() {
  [523, 659, 784, 1046].forEach((f, i) =>
    tone({ freq: f, dur: .3, delay: i * 0.11, type: 'triangle', gain: .16 })
  );
}

export function sfxLevelUp() {
  [392, 523, 659, 784, 1046].forEach((f, i) =>
    tone({ freq: f, dur: .35, delay: i * 0.09, type: 'sine', gain: .15 })
  );
}

/* ------------------------------------------------------------------ */
/* Musica di sottofondo (arpeggio generato, volutamente discreto)      */
/* ------------------------------------------------------------------ */

const MUSIC_NOTES = [261.6, 329.6, 392.0, 523.3, 392.0, 329.6];
let musicStep = 0;

export function startMusic() {
  const c = getCtx();
  if (!c || musicTimer || !save.settings.music) return;
  musicGain = c.createGain();
  musicGain.gain.value = 0.045;          // molto basso: sfondo, non protagonista
  musicGain.connect(c.destination);

  musicTimer = setInterval(() => {
    if (!save.settings.music) return;
    const now = c.currentTime;
    const freq = MUSIC_NOTES[musicStep % MUSIC_NOTES.length];
    musicStep += 1;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(1, now + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
    osc.connect(g).connect(musicGain);
    osc.start(now);
    osc.stop(now + 1);
  }, 620);
}

export function stopMusic() {
  clearInterval(musicTimer);
  musicTimer = null;
}

export function setMusicEnabled(on) {
  save.settings.music = on;
  if (on) startMusic(); else stopMusic();
}
