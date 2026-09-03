#!/usr/bin/env node
/**
 * Generazione OFFLINE delle illustrazioni del gioco.
 *
 * Gira sul computer, non nel browser: il gioco non chiama mai un servizio di
 * generazione immagini a runtime, esattamente come per gli audio.
 *
 * Le regole di stile qui sotto NON sono inventate: sono la trascrizione in
 * inglese delle 8 regole in design-system.md, sezione "Regole per le
 * illustrazioni". Se cambiano lì, vanno cambiate qui.
 *
 * L'unica parte variabile del prompt e' la descrizione del soggetto, che sta
 * in tools/image-subjects.json. Cosi' lo stile e' identico per costruzione e
 * non dipende da come e' scritta la singola voce.
 *
 * Uso:
 *   node tools/generate-images.mjs --list             elenca i soggetti
 *   node tools/generate-images.mjs --batch 1          genera un gruppo
 *   node tools/generate-images.mjs --only sp-pepe,sp-dragon
 *   node tools/generate-images.mjs --batch 2 --force  rigenera anche i fatti
 *   node tools/generate-images.mjs --batch 1 --dry-run
 *
 * Poi, per lo sfondo trasparente:
 *   .venv-tools/bin/python tools/remove-bg.py
 *
 * Nota rete: dietro un proxy che rifirma i certificati TLS, Node fallisce
 * dove curl funziona. Lo script se ne accorge e si rilancia con --use-system-ca.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW_DIR = path.join(ROOT, 'assets', 'img', 'art', 'raw');

/* ------------------------------------------------------------------ */
/* Stile fisso — trascrizione di design-system.md                      */
/* ------------------------------------------------------------------ */

const STYLE = [
  // regola 1: contorno
  'Style: flat vector cartoon sticker for a children game.',
  'Bold uniform dark outline in colour #2B2140, thick and even all around, with rounded corners and rounded line joins.',
  // regola 2: fill piatti dalla palette
  'Completely flat fill colours: NO gradients, NO texture, NO inner shading, NO highlights, NO glossy reflections.',
  'Colour palette strictly limited to: amber #FFB02E, orange #FF7A4D, green #2FB865, sky blue #38BDF8, purple #A855F7, pink #F4628F, yellow #FACC15, warm white #FFFDF7, light grey #CBD5E1, brown #A16207, dark ink #2B2140.',
  // regola 3: nessuna ombra portata
  'NO drop shadow, NO cast shadow, NO ground shadow under the subject.',
  // regola 4: composizione
  'Composition: one single subject, centred, facing the viewer, entirely inside the frame with about 10% empty margin on every side.',
  // regola 6: leggibilita' a 80px
  'Simple bold shapes: the subject must stay readable when the image is shrunk to 80 pixels.',
  // regola 8: niente spavento
  'Friendly, cute and harmless: no fangs, no claws raised, no blood, no menacing expression, no dark mood.',
  // regola 7: niente testo
  'NO text, NO letters, NO numbers, NO watermark, NO signature, NO frame, NO border.',
  // fondo: piatto e uniforme, perche' poi va rimosso
  'Plain solid pure white background #FFFFFF, completely empty, nothing else in the scene.'
].join(' ');

/* Le creature devono avere le proporzioni con cui e' disegnata Pepe. */
const CREATURE = 'Puppy proportions: oversized round head, big low-set wide-apart eyes, short stubby limbs.';

function buildPrompt(subject) {
  const extra = subject.kind === 'creature' ? ' ' + CREATURE : '';
  return `Illustration of ${subject.prompt}.${extra} ${STYLE}`;
}

/* ------------------------------------------------------------------ */
/* Argomenti                                                           */
/* ------------------------------------------------------------------ */

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d = '') => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

const LIST = has('--list');
const DRY = has('--dry-run');
const FORCE = has('--force');
const BATCH = val('--batch', '');
const ONLY = val('--only', '').split(',').map(s => s.trim()).filter(Boolean);
const MODEL = val('--model', 'gemini-3.1-flash-lite-image');

/* ------------------------------------------------------------------ */
/* .env                                                                */
/* ------------------------------------------------------------------ */

async function loadEnv() {
  const file = path.join(ROOT, '.env');
  const env = { ...process.env };
  if (!existsSync(file)) return env;
  for (const line of (await readFile(file, 'utf8')).split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!env[k]) env[k] = v;
  }
  return env;
}

/* ------------------------------------------------------------------ */
/* Rete: proxy che rifirma i certificati                               */
/* ------------------------------------------------------------------ */

const TLS_ERRORS = new Set([
  'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'DEPTH_ZERO_SELF_SIGNED_CERT', 'CERT_SIGNATURE_FAILURE'
]);
const isTls = (err) => TLS_ERRORS.has(err?.cause?.code || err?.code);

function reexecWithSystemCa() {
  if (process.execArgv.includes('--use-system-ca') || process.env.DP_CA_RETRY) return false;
  console.log('\nCertificato non verificabile: probabile proxy TLS.');
  console.log('Rilancio con --use-system-ca.\n');
  const r = spawnSync(process.execPath, ['--use-system-ca', ...process.argv.slice(1)], {
    stdio: 'inherit', env: { ...process.env, DP_CA_RETRY: '1' }
  });
  process.exit(r.status ?? 1);
}

/* ------------------------------------------------------------------ */
/* Generazione                                                         */
/* ------------------------------------------------------------------ */

async function generate(env, subject) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${env.GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildPrompt(subject) }] }],
      generationConfig: {
        responseModalities: ['IMAGE'],
        imageConfig: { aspectRatio: '1:1' }
      }
    })
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const data = await res.json();
  const part = (data.candidates?.[0]?.content?.parts || []).find(p => p.inlineData);
  if (!part) {
    const reason = data.candidates?.[0]?.finishReason || JSON.stringify(data).slice(0, 160);
    throw new Error(`nessuna immagine (${reason})`);
  }
  return Buffer.from(part.inlineData.data, 'base64');
}

/* ------------------------------------------------------------------ */

async function main() {
  const env = await loadEnv();
  const doc = JSON.parse(await readFile(path.join(ROOT, 'tools', 'image-subjects.json'), 'utf8'));
  const all = doc.soggetti;

  let todo = all;
  if (BATCH) todo = todo.filter(s => String(s.batch) === String(BATCH));
  if (ONLY.length) todo = todo.filter(s => ONLY.includes(s.id));

  if (LIST) {
    const perBatch = {};
    for (const s of all) (perBatch[s.batch] ||= []).push(s.id);
    console.log(`\n${all.length} soggetti da generare, in ${Object.keys(perBatch).length} gruppi:\n`);
    for (const [b, ids] of Object.entries(perBatch)) {
      console.log(`  gruppo ${b}  (${ids.length})  ${ids.join(' ')}`);
    }
    // Le chiavi che iniziano con _ sono commenti, non elenchi di sprite.
    const esclusi = Object.entries(doc.esclusi)
      .filter(([k, v]) => !k.startsWith('_') && Array.isArray(v))
      .map(([k, v]) => `${k} ${v.length}`).join(', ');
    console.log(`\n  esclusi di proposito: ${esclusi} — vedi il commento in image-subjects.json\n`);
    return;
  }

  if (!todo.length) {
    console.error('Nessun soggetto selezionato. Prova --list.');
    process.exitCode = 1; return;
  }

  await mkdir(RAW_DIR, { recursive: true });
  const pending = FORCE ? todo : todo.filter(s => !existsSync(path.join(RAW_DIR, `${s.id}.png`)));

  console.log(`\nModello: ${MODEL}`);
  console.log(`Selezionati ${todo.length}, da generare ${pending.length}.\n`);

  if (DRY) {
    for (const s of pending) {
      console.log(`--- ${s.id} (${s.kind})`);
      console.log(buildPrompt(s).replace(/\s+/g, ' ').slice(0, 400) + '…\n');
    }
    return;
  }
  if (!pending.length) { console.log('Niente da fare.\n'); return; }

  if (!env.GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY assente in .env.');
    process.exitCode = 1; return;
  }

  // Preflight: meglio accorgersi del proxy TLS subito che a meta' gruppo.
  try {
    await fetch('https://generativelanguage.googleapis.com/v1beta/models?key=' + env.GEMINI_API_KEY,
      { signal: AbortSignal.timeout(15000) });
  } catch (err) {
    if (isTls(err)) { reexecWithSystemCa(); }
    console.error(`Rete non raggiungibile: ${err.message}`);
    process.exitCode = 1; return;
  }

  let ok = 0, ko = 0;
  for (const s of pending) {
    let done = false;
    for (let attempt = 1; attempt <= 3 && !done; attempt++) {
      try {
        const buf = await generate(env, s);
        await writeFile(path.join(RAW_DIR, `${s.id}.png`), buf);
        console.log(`  ok  ${s.id.padEnd(16)} ${(buf.length / 1024).toFixed(0)} kB`);
        ok++; done = true;
      } catch (err) {
        if (attempt === 3) { console.warn(`  ko  ${s.id.padEnd(16)} ${err.message}`); ko++; }
        else await new Promise(r => setTimeout(r, 1500 * attempt));
      }
    }
    await new Promise(r => setTimeout(r, 600));   // rispetta i limiti di frequenza
  }

  console.log(`\nGenerate ${ok}, fallite ${ko}.`);
  console.log('Ora lo sfondo trasparente:  .venv-tools/bin/python tools/remove-bg.py\n');
}

main().catch(err => { console.error(err); process.exitCode = 1; });
