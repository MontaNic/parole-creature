#!/usr/bin/env node
/**
 * Porta tutte le tracce allo stesso volume percepito.
 *
 * Le voci arrivano da ElevenLabs con livelli molto diversi: misurate a
 * ottobre 2026 andavano da -34.8 a -13.2 dB, oltre 21 dB di scarto, anche
 * fra due parole della stessa voce ("tooth" bassissima, accanto a "dragon").
 * Il bambino alzava il volume per una parola e la battuta dopo lo
 * spaventava.
 *
 * Come si misura: RMS sulle sole parti con voce (blocchi da 50 ms sopra
 * -45 dB), cosi' le pause non abbassano la media di una traccia corta. Non
 * e' LUFS: per tracce di mezzo secondo come i suoni delle lettere il
 * loudnorm di ffmpeg non e' affidabile, questo si'.
 *
 * Come si corregge: un guadagno fisso per traccia (la voce non cambia,
 * cambia solo quanto e' forte) piu' un limitatore a -1 dBFS che interviene
 * solo se un picco supererebbe il massimo. Si ricodifica in MP3 128 kbps
 * mono 44.1 kHz, come gli originali.
 *
 * Serve ffmpeg: ~/.local/bin/ffmpeg, oppure il percorso in FFMPEG.
 *
 * Uso:
 *   node tools/normalize-audio.mjs --report          misura e basta
 *   node tools/normalize-audio.mjs --sample a b ...  scrive copie corrette in --out
 *   node tools/normalize-audio.mjs                   corregge sul posto le tracce fuori tolleranza
 *   node tools/normalize-audio.mjs --only it/mascot.welcome   solo i file che iniziano cosi'
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AUDIO = path.join(ROOT, 'assets/audio');
const FFMPEG = process.env.FFMPEG || path.join(os.homedir(), '.local/bin/ffmpeg');

/** Il livello a cui portare ogni traccia: appena sopra la mediana misurata. */
export const TARGET_DB = -24;
/** Sotto questo scarto la traccia si lascia com'e': ricodificare costa qualita'. */
const TOLLERANZA_DB = 1;

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const valore = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };

/** Livello (dB, RMS sulle parti con voce) e picco (dBFS) di un file. */
export function misura(file) {
  const pcm = execFileSync(FFMPEG, ['-v', 'error', '-i', file, '-ac', '1', '-ar', '22050', '-f', 's16le', '-'],
    { maxBuffer: 1 << 28 });
  const n = pcm.length / 2;
  const blk = 1102;
  let picco = 0;
  const energie = [];
  for (let i = 0; i + blk <= n; i += blk) {
    let s = 0;
    for (let j = 0; j < blk; j++) {
      const v = pcm.readInt16LE((i + j) * 2) / 32768;
      s += v * v;
      if (Math.abs(v) > picco) picco = Math.abs(v);
    }
    energie.push(s / blk);
  }
  const voce = energie.filter(e => 10 * Math.log10(e + 1e-12) > -45);
  const db = voce.length ? 10 * Math.log10(voce.reduce((a, c) => a + c, 0) / voce.length) : -99;
  return { db: +db.toFixed(1), peak: +(20 * Math.log10(picco + 1e-12)).toFixed(1) };
}

/** Riscrive `src` in `dst` portandolo a TARGET_DB. */
export function correggi(src, dst, livello) {
  const guadagno = (TARGET_DB - livello.db).toFixed(2);
  const tmp = dst + '.tmp.mp3';
  execFileSync(FFMPEG, ['-v', 'error', '-y', '-i', src,
    '-af', `volume=${guadagno}dB,alimiter=limit=0.89:level=disabled`,
    '-ac', '1', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '128k',
    '-map_metadata', '-1', tmp]);
  fs.renameSync(tmp, dst);
  return +guadagno;
}

function tracce() {
  const idx = JSON.parse(fs.readFileSync(path.join(AUDIO, 'index.json'), 'utf8'));
  const solo = valore('--only');
  return idx.files.filter(f => !solo || f.startsWith(solo));
}

function main() {
  if (!fs.existsSync(FFMPEG)) {
    console.error(`ffmpeg non trovato in ${FFMPEG} (imposta FFMPEG).`);
    process.exit(1);
  }

  if (flag('--sample')) {
    const out = valore('--out');
    if (!out) { console.error('--sample vuole --out <cartella>'); process.exit(1); }
    fs.mkdirSync(out, { recursive: true });
    const nomi = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--out');
    for (const rel of nomi) {
      const src = path.join(AUDIO, rel);
      const l = misura(src);
      const base = rel.replace(/[/]/g, '_').replace(/\.mp3$/, '');
      fs.copyFileSync(src, path.join(out, `${base}.prima.mp3`));
      const g = correggi(src, path.join(out, `${base}.dopo.mp3`), l);
      const d = misura(path.join(out, `${base}.dopo.mp3`));
      console.log(`${rel.padEnd(40)} ${l.db} dB -> ${d.db} dB  (guadagno ${g > 0 ? '+' : ''}${g} dB)`);
    }
    return;
  }

  const files = tracce();
  const livelli = [];
  let corretti = 0;
  for (const rel of files) {
    const file = path.join(AUDIO, rel);
    const l = misura(file);
    livelli.push(l.db);
    if (flag('--report')) continue;
    if (Math.abs(TARGET_DB - l.db) < TOLLERANZA_DB) continue;
    correggi(file, file, l);
    corretti += 1;
    if (corretti % 100 === 0) console.log(`  ${corretti} tracce corrette...`);
  }
  livelli.sort((a, b) => a - b);
  console.log(`${files.length} tracce: min ${livelli[0]} dB, mediana ${livelli[livelli.length >> 1]} dB, max ${livelli[livelli.length - 1]} dB`);
  if (!flag('--report')) console.log(`Corrette ${corretti}, lasciate com'erano ${files.length - corretti} (entro ${TOLLERANZA_DB} dB da ${TARGET_DB}).`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
