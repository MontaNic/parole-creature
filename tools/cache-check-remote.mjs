#!/usr/bin/env node
/**
 * Prova dell'offline su un sito vero, dal Mac, senza toccare l'iPad.
 *
 * Apre un Chrome headless con un profilo NUOVO (quindi nessuna cache
 * precedente), carica il gioco, lascia al service worker il tempo di
 * installarsi e precaricare, poi naviga sulla pagina di verifica
 * tools/cache-check.html e ne legge il verdetto.
 *
 * Perche' non basta `--dump-dom --virtual-time-budget`: sotto il tempo
 * virtuale le promesse di CacheStorage non si risolvono, e la verifica si
 * ferma a meta' facendo credere a un guasto che non c'e'. Qui il browser
 * vive in tempo reale e lo si guida con il protocollo DevTools.
 *
 * Uso:  node tools/cache-check-remote.mjs [url] [--attesa secondi]   (default: il sito Pages, 90 s)
 * Esce con codice 1 se il verdetto non e' PASS.
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const SITO = ((process.argv[2] && !process.argv[2].startsWith('--')) ? process.argv[2] : 'https://montanic.github.io/parole-creature/').replace(/\/?$/, '/');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9333;
// L'attesa cresce con le illustrazioni: 126 PNG in batch da 6 non entrano in 40 s.
const attesaArg = process.argv.indexOf('--attesa');
const ATTESA_INSTALLAZIONE = attesaArg > 0 ? Number(process.argv[attesaArg + 1]) * 1000 : 90_000;

const wait = ms => new Promise(r => setTimeout(r, ms));
const profilo = mkdtempSync(path.join(tmpdir(), 'pc-cache-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--mute-audio',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profilo}`, SITO
], { stdio: 'ignore' });
const chiudi = () => { chrome.kill('SIGKILL'); rmSync(profilo, { recursive: true, force: true }); };

let esito = 1;
try {
  console.log(`  sito: ${SITO}`);
  console.log(`  profilo nuovo, attendo ${ATTESA_INSTALLAZIONE / 1000}s che il worker installi e precarichi...`);
  await wait(ATTESA_INSTALLAZIONE);

  const targets = await (await fetch(`http://localhost:${PORT}/json`)).json();
  const page = targets.find(t => t.type === 'page' && t.url.startsWith(SITO));
  if (!page) throw new Error('la pagina del gioco non risulta aperta');

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((ok, ko) => { ws.onopen = ok; ws.onerror = ko; });
  let id = 0; const inAttesa = new Map();
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && inAttesa.has(m.id)) { inAttesa.get(m.id)(m.result); inAttesa.delete(m.id); }
  };
  const send = (method, params = {}) => new Promise(r => {
    inAttesa.set(++id, r); ws.send(JSON.stringify({ id, method, params }));
  });
  const js = async (expression) =>
    (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.value;

  console.log('  worker sul gioco:', await js(
    `navigator.serviceWorker.getRegistration().then(r => r ? (r.active ? 'attivo' : 'in installazione') : 'ASSENTE')`));

  await send('Page.navigate', { url: SITO + 'tools/cache-check.html' });
  let titolo = '';
  for (let i = 0; i < 30; i++) {
    await wait(1000);
    titolo = await js('document.title');
    if (titolo && !titolo.startsWith('Cache offline')) break;
  }
  const righe = await js(`[...document.querySelectorAll('#out > *')].map(e => e.textContent.trim()).filter(Boolean)`);
  for (const r of righe || []) console.log('   ', r.slice(0, 160));
  console.log(`\n  ${titolo}\n`);
  esito = /^PASS/.test(titolo) ? 0 : 1;
  ws.close();
} catch (err) {
  console.log('  errore:', err.message);
} finally {
  chiudi();
}
process.exitCode = esito;
