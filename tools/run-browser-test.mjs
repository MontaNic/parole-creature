#!/usr/bin/env node
/**
 * Esegue una pagina di test in un browser senza schermo e ne legge il
 * verdetto: e' quello che fa la CI su ogni pull request.
 *
 * Le pagine di test (tools/curriculum-test.html, tools/smoke-test.html)
 * scrivono alla fine un elemento #verdict con "PASS" o "FAIL". Qui si serve
 * il progetto da un piccolo server locale, si apre la pagina con Playwright
 * e si aspetta quel verdetto.
 *
 * Uso:  node tools/run-browser-test.mjs tools/curriculum-test.html [timeout_s]
 * Esce con 0 se PASS, 1 se FAIL o se il verdetto non arriva in tempo.
 * Richiede il pacchetto `playwright` con Chromium.
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// require invece di import: cosi' vale anche un Playwright installato
// globalmente (NODE_PATH), oltre a quello in node_modules della CI.
const { chromium } = createRequire(import.meta.url)('playwright');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pagina = process.argv[2];
const timeoutMs = (Number(process.argv[3]) || 120) * 1000;
if (!pagina) { console.error('uso: node tools/run-browser-test.mjs <pagina.html> [timeout_s]'); process.exit(2); }

const TIPI = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
  '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.mp3': 'audio/mpeg',
  '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2'
};

const server = createServer(async (req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.join(ROOT, url.endsWith('/') ? url + 'index.html' : url);
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TIPI[path.extname(file)] || 'application/octet-stream' }).end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();
let esito = 1;
try {
  const page = await browser.newPage();
  const erroriPagina = [];
  page.on('pageerror', e => erroriPagina.push(e.message));
  await page.goto(`${base}/${pagina}`);
  const verdetto = page.locator('#verdict').filter({ hasText: /PASS|FAIL/ });
  await verdetto.first().waitFor({ timeout: timeoutMs });
  const testo = (await verdetto.first().innerText()).trim();

  // I controlli falliti (classe .ko) e le righe dei risultati, per il log.
  const falliti = await page.$$eval('.ko:not(#verdict)', ns => ns.map(n => n.innerText.trim()).filter(Boolean));
  console.log(`${pagina}: ${testo}`);
  if (!testo.startsWith('PASS')) {
    for (const r of falliti) console.log(`  KO  ${r}`);
    for (const e of erroriPagina) console.log(`  errore: ${e}`);
  }
  esito = testo.startsWith('PASS') ? 0 : 1;
} catch (err) {
  console.log(`${pagina}: nessun verdetto (${err.message.split('\n')[0]})`);
} finally {
  await browser.close();
  server.close();
}
process.exit(esito);
