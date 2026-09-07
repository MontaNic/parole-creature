/**
 * Condivisione in famiglia: il riepilogo di fine partita come immagine,
 * consegnata al foglio di condivisione del sistema. Nessun server, nessun
 * account: navigator.share con un file, e basta.
 */

import { CONFIG } from './config.js';
import { content, t, artIndex } from './content-loader.js';
import { save } from './state.js';

const W = 1200, H = 630;

/** Il bottone compare solo dove il browser sa condividere un file. */
export function canShare() {
  if (save.settings?.familySharing === false) return false;
  if (typeof navigator === 'undefined' || !navigator.share || !navigator.canShare) return false;
  try {
    const probe = new File([new Uint8Array([137, 80, 78, 71])], 'p.png', { type: 'image/png' });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

function loadArt(spriteId) {
  return new Promise(resolve => {
    if (!artIndex.sprites.has(spriteId)) { resolve(null); return; }
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = `${CONFIG.artBase}${spriteId}.png`;
  });
}

function star(ctx, cx, cy, r, on) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 ? r * 0.45 : r;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    ctx.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
  }
  ctx.closePath();
  ctx.fillStyle = on ? '#FACC15' : 'rgba(255,255,255,.18)';
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = on ? '#2B2140' : 'rgba(255,255,255,.25)';
  ctx.stroke();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Disegna la carta del riepilogo.
 * @param {{correct:number,total:number,newCreatures:Array,world?:object}} result
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function buildSummaryCard(result) {
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  try { await document.fonts?.load('700 60px Fredoka'); await document.fonts?.load('500 34px Fredoka'); } catch { /* ripiego: font di sistema */ }
  const F = '"Fredoka", "Trebuchet MS", sans-serif';

  // Sfondo notte
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#17123A'); g.addColorStop(1, '#332A5E');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,.35)';
  let seed = 7;
  for (let i = 0; i < 60; i++) {
    seed = (seed * 9301 + 49297) % 233280;
    const x = (seed / 233280) * W; seed = (seed * 9301 + 49297) % 233280;
    const y = (seed / 233280) * H;
    ctx.fillRect(x, y, 3, 3);
  }

  // Pepe a sinistra
  const pepe = await loadArt('sp-pepe');
  if (pepe) ctx.drawImage(pepe, 60, 150, 360, 360);

  // Titolo
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `700 56px ${F}`;
  ctx.textBaseline = 'top';
  ctx.fillText(t('share.title'), 470, 56);

  // Chi ha giocato
  const name = save.child?.name?.trim();
  ctx.font = `500 34px ${F}`;
  ctx.fillStyle = 'rgba(255,255,255,.85)';
  ctx.fillText(name ? t('share.played').replace('{name}', name) : t('share.played_anon'), 470, 130);

  // Stelle e punteggio
  const ratio = result.total ? result.correct / result.total : 0;
  const stars = ratio >= 0.9 ? 3 : ratio >= 0.5 ? 2 : 1;
  for (let i = 0; i < 3; i++) star(ctx, 510 + i * 84, 236, 34, i < stars);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `700 64px ${F}`;
  ctx.fillText(`${result.correct}/${result.total}`, 780, 200);

  // Unita' (o ripasso) e striscia
  ctx.font = `500 30px ${F}`;
  ctx.fillStyle = 'rgba(255,255,255,.8)';
  const unit = result.world && result.world.id !== '__review__' ? result.world.title_it : t('share.review');
  ctx.fillText(unit, 470, 300);
  const streak = save.streak?.current || 0;
  if (streak > 1) ctx.fillText(t('share.streak').replace('{n}', streak), 470, 344);

  // Creatura trovata
  const found = result.newCreatures?.[0];
  if (found) {
    roundRect(ctx, 470, 400, 660, 170, 28);
    ctx.fillStyle = '#FFFBF2'; ctx.fill();
    ctx.lineWidth = 6; ctx.strokeStyle = '#2B2140'; ctx.stroke();
    const art = await loadArt(found.sprite);
    if (art) ctx.drawImage(art, 490, 410, 150, 150);
    ctx.fillStyle = '#2B2140';
    ctx.font = `700 40px ${F}`;
    ctx.fillText(t('share.found').replace('{creature}', found.name_it), 660, 462);
  }

  // Piede
  ctx.font = `500 22px ${F}`;
  ctx.fillStyle = 'rgba(255,255,255,.5)';
  ctx.fillText(new Date().toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }), 470, 588);
  return canvas;
}

const toBlob = (canvas) => new Promise(res => canvas.toBlob(res, 'image/png'));

/**
 * Apre il foglio di condivisione con l'immagine. Annullare non e' un errore.
 * @returns {Promise<'shared'|'cancelled'|'unavailable'>}
 */
export async function shareSummary(result) {
  if (!canShare()) return 'unavailable';
  const canvas = await buildSummaryCard(result);
  const blob = await toBlob(canvas);
  if (!blob) return 'unavailable';
  const file = new File([blob], 'parole-creature.png', { type: 'image/png' });
  try {
    await navigator.share({ files: [file], title: t('share.title'), text: t('share.text') });
    return 'shared';
  } catch (err) {
    return err?.name === 'AbortError' ? 'cancelled' : 'unavailable';
  }
}
