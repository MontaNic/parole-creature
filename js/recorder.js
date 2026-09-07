/**
 * Registrazione della voce, per "ascolta e ripeti".
 *
 * Il bambino si registra dicendo la parola e si riascolta. Nessuna
 * valutazione: il piacere di sentirsi parlare inglese. La registrazione vive
 * in memoria e sparisce alla domanda dopo; niente e' salvato ne' inviato.
 */

import { save } from './state.js';
import { voiceVolume, stopVoice } from './audio.js';

export const MAX_MS = 4000;

/**
 * Il primo formato che il browser sa registrare. Safari conosce solo mp4,
 * Chrome preferisce webm/opus; l'ordine e' quello.
 * @param {(mime: string) => boolean} isSupported
 */
export function pickMimeType(isSupported) {
  const candidates = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
  return candidates.find(m => { try { return isSupported(m); } catch { return false; } }) || '';
}

/** Il microfono si offre solo dove puo' funzionare e dove i genitori lo vogliono. */
export function canRecord() {
  if (save.settings?.voiceRecording === false) return false;
  if (typeof window === 'undefined') return false;
  if (!window.isSecureContext) return false;
  if (!navigator.mediaDevices?.getUserMedia) return false;
  if (typeof MediaRecorder === 'undefined') return false;
  return true;
}

/**
 * Avvia la registrazione. Si risolve con un oggetto che ha `stop()`, che a
 * sua volta si risolve con il Blob audio (vuoto se non e' arrivato nulla).
 * Rifiuta se il microfono non e' disponibile o il permesso e' negato.
 */
export async function startRecording() {
  stopVoice();
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mimeType = pickMimeType(m => MediaRecorder.isTypeSupported(m));
  const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks = [];
  rec.addEventListener('dataavailable', e => { if (e.data && e.data.size) chunks.push(e.data); });

  const done = new Promise(resolve => rec.addEventListener('stop', () => {
    // Rilasciare il microfono subito: l'indicatore rosso di iOS si spegne.
    stream.getTracks().forEach(tr => tr.stop());
    resolve(new Blob(chunks, { type: rec.mimeType || mimeType || 'audio/webm' }));
  }));

  rec.start();
  const timer = setTimeout(() => { if (rec.state === 'recording') rec.stop(); }, MAX_MS);

  return {
    stop() {
      clearTimeout(timer);
      if (rec.state === 'recording') rec.stop();
      return done;
    }
  };
}

/** Riproduce una registrazione; si risolve a fine ascolto. */
export function playBlob(blob) {
  return new Promise(resolve => {
    if (!blob || !blob.size) { resolve(); return; }
    stopVoice();
    const url = URL.createObjectURL(blob);
    const el = new Audio(url);
    el.volume = voiceVolume();
    const fine = () => { URL.revokeObjectURL(url); resolve(); };
    el.addEventListener('ended', fine);
    el.addEventListener('error', fine);
    const p = el.play();
    if (p && typeof p.catch === 'function') p.catch(fine);
    setTimeout(fine, MAX_MS + 2000);
  });
}
