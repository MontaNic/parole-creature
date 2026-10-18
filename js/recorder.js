/**
 * Registrazione della voce, per "ascolta e ripeti".
 *
 * Il bambino si registra dicendo la parola e si riascolta. Nessuna
 * valutazione: il piacere di sentirsi parlare inglese. La registrazione vive
 * in memoria e sparisce alla domanda dopo; niente e' salvato ne' inviato.
 */

import { save } from './state.js';
import { voiceVolume, stopVoice, holdMusic, audioContext } from './audio.js';

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
    stream,
    stop() {
      clearTimeout(timer);
      if (rec.state === 'recording') rec.stop();
      return done;
    }
  };
}

/** Quanto aspettare che il microfono si apra (permesso compreso). */
export const ATTESA_MIC_MS = 8000;

/** Soglia (RMS 0..1) oltre la quale c'e' una voce, e non solo il rumore della stanza. */
export const SOGLIA_VOCE = 0.035;

/**
 * Decide, da una serie di livelli misurati, se il bambino ha parlato:
 * servono almeno ~250 ms sopra la soglia, non un colpo di tosse. Pura, per il test.
 * @param {number[]} livelli RMS per blocco
 * @param {number} msPerBlocco
 */
export function haParlato(livelli, msPerBlocco = 50) {
  const sopra = livelli.filter(l => l >= SOGLIA_VOCE).length;
  return sopra * msPerBlocco >= 250;
}

/**
 * Il turno del bambino al microfono.
 *
 * In "Dillo tu" e "Ascolta e ripeti" si poteva andare avanti senza aprire
 * bocca: registrarsi era facoltativo. Qui il microfono ascolta il VOLUME
 * (non le parole: il riconoscimento sulle voci dei bambini sbaglia) e:
 *  - mostra un indicatore che si muove mentre il bambino parla;
 *  - si ferma da solo quando, dopo aver sentito una voce, torna il
 *    silenzio, o dopo MAX_MS;
 *  - dice se una voce c'e' stata davvero.
 * La musica tace mentre il microfono e' aperto.
 *
 * @param {{onLevel?: (l:number)=>void, silenzioMs?: number}} opts
 * @returns {Promise<{stop: () => Promise<{blob: Blob, voce: boolean}>, done: Promise<{blob: Blob, voce: boolean}>}>}
 */
export async function registraTurno({ onLevel, silenzioMs = 1100, attesaMs = ATTESA_MIC_MS } = {}) {
  holdMusic(true);
  let rec;
  // Il permesso del microfono puo' restare in sospeso (richiesta ignorata,
  // microfono che non risponde): senza un tetto il gioco aspetterebbe per
  // sempre su "Ti ascolto...". Se il microfono arriva tardi lo si chiude.
  const avvio = startRecording();
  const tetto = new Promise((_, rej) => setTimeout(() => rej(new Error('microfono in ritardo')), attesaMs));
  try {
    rec = await Promise.race([avvio, tetto]);
  } catch (err) {
    avvio.then(r => r.stop()).catch(() => {});
    holdMusic(false);
    throw err;
  }

  const livelli = [];
  let analyser = null, src = null, timer = null;
  let ultimaVoce = 0, sentita = false;
  const t0 = performance.now();
  let chiuso = null;

  const chiudi = async () => {
    if (chiuso) return chiuso;
    chiuso = (async () => {
      clearInterval(timer);
      try { src?.disconnect(); } catch { /* ignorato */ }
      const blob = await rec.stop();
      holdMusic(false);
      // Senza analizzatore non si puo' giudicare: si da' fiducia.
      return { blob, voce: analyser ? haParlato(livelli) : Boolean(blob && blob.size) };
    })();
    return chiuso;
  };

  try {
    const c = audioContext();
    if (c && rec.stream) {
      src = c.createMediaStreamSource(rec.stream);
      analyser = c.createAnalyser();
      analyser.fftSize = 1024;
      src.connect(analyser);
      const buf = new Float32Array(analyser.fftSize);
      timer = setInterval(() => {
        analyser.getFloatTimeDomainData(buf);
        let q = 0;
        for (const v of buf) q += v * v;
        const l = Math.sqrt(q / buf.length);
        livelli.push(l);
        onLevel?.(Math.min(1, l / (SOGLIA_VOCE * 4)));
        const ora = performance.now();
        if (l >= SOGLIA_VOCE) { ultimaVoce = ora; if (haParlato(livelli)) sentita = true; }
        if (sentita && ora - ultimaVoce > silenzioMs) chiudi();
        if (ora - t0 > MAX_MS) chiudi();
      }, 50);
    }
  } catch { analyser = null; }

  // Senza analizzatore la registrazione si ferma comunque a MAX_MS.
  const done = new Promise(resolve => {
    const guarda = setInterval(() => { if (chiuso) { clearInterval(guarda); chiuso.then(resolve); } }, 60);
    setTimeout(() => chiudi(), MAX_MS + 200);
  });
  return { stop: chiudi, done };
}

/** Riproduce una registrazione; si risolve a fine ascolto. */
export function playBlob(blob) {
  return new Promise(resolve => {
    if (!blob || !blob.size) { resolve(); return; }
    stopVoice();
    // La musica tace anche nel riascolto: la voce del bambino e' il centro.
    holdMusic(true);
    const url = URL.createObjectURL(blob);
    const el = new Audio(url);
    el.volume = voiceVolume();
    let finito = false;
    const fine = () => { if (finito) return; finito = true; URL.revokeObjectURL(url); holdMusic(false); resolve(); };
    el.addEventListener('ended', fine);
    el.addEventListener('error', fine);
    const p = el.play();
    if (p && typeof p.catch === 'function') p.catch(fine);
    setTimeout(fine, MAX_MS + 2000);
  });
}
