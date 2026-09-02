#!/usr/bin/env node
/**
 * Generazione OFFLINE degli audio del gioco.
 *
 * Questo script gira sul computer, non nel browser. Legge content.json e
 * strings.json, chiede a ElevenLabs le tracce mancanti e le salva come file
 * statici dentro assets/audio/. Il gioco a runtime non chiama mai l'API.
 *
 * Due modi di lavorare, entrambi con la chiave fuori dal client:
 *
 *   1) tramite proxy (consigliato se il repo e' pubblico o si genera da piu'
 *      macchine): imposta TTS_PROXY_URL e TTS_PROXY_TOKEN nel file .env.
 *      La chiave ElevenLabs sta solo nel worker, mai qui.
 *
 *   2) diretto (piu' semplice per una sola persona): imposta
 *      ELEVENLABS_API_KEY nel file .env locale, che e' escluso da git.
 *
 * Uso:
 *   node tools/generate-audio.mjs             genera solo i file mancanti
 *   node tools/generate-audio.mjs --force     rigenera tutto
 *   node tools/generate-audio.mjs --dry-run   elenca cosa farebbe
 *   node tools/generate-audio.mjs --index     riscrive solo assets/audio/index.json
 */

import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AUDIO_DIR = path.join(ROOT, 'assets', 'audio');

const args = new Set(process.argv.slice(2));
const FORCE = args.has('--force');
const DRY = args.has('--dry-run');
const ONLY_INDEX = args.has('--index');

/* ------------------------------------------------------------------ */
/* .env minimale (niente dipendenze esterne)                           */
/* ------------------------------------------------------------------ */

async function loadEnv() {
  const file = path.join(ROOT, '.env');
  const env = { ...process.env };
  if (!existsSync(file)) return env;
  const text = await readFile(file, 'utf8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in env) || !env[key]) env[key] = value;
  }
  return env;
}

/* ------------------------------------------------------------------ */
/* Elenco delle tracce da produrre                                     */
/* ------------------------------------------------------------------ */

async function buildJobList() {
  const content = JSON.parse(await readFile(path.join(ROOT, 'content.json'), 'utf8'));
  const strings = JSON.parse(await readFile(path.join(ROOT, 'strings.json'), 'utf8'));
  const jobs = [];

  // Contenuto didattico: sempre in inglese.
  for (const w of content.words || []) {
    jobs.push({ rel: `en/${w.id}.mp3`, text: w.en, lang: 'en' });
  }
  for (const p of content.phrases || []) {
    jobs.push({ rel: `en/${p.id}.mp3`, text: p.en, lang: 'en' });
  }

  // Battute della mascotte: in italiano.
  for (const [key, text] of Object.entries(strings.mascot || {})) {
    if (key === 'name') continue;
    if (typeof text !== 'string') continue;
    // Le frasi con segnaposto ({name}) cambiano a runtime: restano alla
    // sintesi vocale del browser, che puo' dire il nome del bambino.
    if (text.includes('{')) continue;
    jobs.push({ rel: `it/mascot.${key}.mp3`, text, lang: 'it' });
  }

  return { jobs, content };
}

/* ------------------------------------------------------------------ */
/* Chiamata TTS                                                        */
/* ------------------------------------------------------------------ */

const VOICES = {
  en: '21m00Tcm4TlvDq8ikWAM',   // Rachel
  it: 'XB0fDUnXU5powFXDhCwa'    // Charlotte
};

/**
 * Voce da usare per una lingua, in ordine di precedenza:
 *   ELEVENLABS_VOICE_EN / _IT   una voce diversa per lingua
 *   VOICE_ID                    la stessa voce per tutto (caso piu' comune)
 *   default                     le voci di riferimento qui sopra
 */
function voiceFor(env, lang) {
  return env[`ELEVENLABS_VOICE_${lang.toUpperCase()}`] || env.VOICE_ID || VOICES[lang];
}

async function synthViaProxy(env, job) {
  const res = await fetch(env.TTS_PROXY_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(env.TTS_PROXY_TOKEN ? { authorization: `Bearer ${env.TTS_PROXY_TOKEN}` } : {})
    },
    body: JSON.stringify({
      text: job.text,
      lang: job.lang,
      voiceId: voiceFor(env, job.lang)
    })
  });
  if (!res.ok) throw new Error(`proxy HTTP ${res.status}: ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}

async function synthDirect(env, job) {
  const voiceId = voiceFor(env, job.lang);
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': env.ELEVENLABS_API_KEY,
      'content-type': 'application/json',
      accept: 'audio/mpeg'
    },
    body: JSON.stringify({
      text: job.text,
      model_id: env.ELEVENLABS_MODEL || 'eleven_multilingual_v2',
      voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.2 }
    })
  });
  if (!res.ok) throw new Error(`ElevenLabs HTTP ${res.status}: ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}

/* ------------------------------------------------------------------ */
/* Indice dei file disponibili                                         */
/* ------------------------------------------------------------------ */

async function writeIndex() {
  const files = [];
  for (const sub of ['en', 'it']) {
    const dir = path.join(AUDIO_DIR, sub);
    if (!existsSync(dir)) continue;
    for (const name of await readdir(dir)) {
      if (!name.endsWith('.mp3')) continue;
      const info = await stat(path.join(dir, name));
      if (info.size > 0) files.push(`${sub}/${name}`);
    }
  }
  files.sort();
  await mkdir(AUDIO_DIR, { recursive: true });
  await writeFile(
    path.join(AUDIO_DIR, 'index.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), files }, null, 2)
  );
  console.log(`\nassets/audio/index.json aggiornato: ${files.length} file.`);
}

/* ------------------------------------------------------------------ */

async function main() {
  const env = await loadEnv();

  if (ONLY_INDEX) {
    await writeIndex();
    return;
  }

  const { jobs } = await buildJobList();

  const useProxy = Boolean(env.TTS_PROXY_URL);
  const useDirect = !useProxy && Boolean(env.ELEVENLABS_API_KEY) &&
    env.ELEVENLABS_API_KEY !== 'inserisci_qui_la_tua_chiave';

  const todo = [];
  for (const job of jobs) {
    const dest = path.join(AUDIO_DIR, job.rel);
    if (!FORCE && existsSync(dest)) continue;
    todo.push({ ...job, dest });
  }

  console.log(`Tracce previste: ${jobs.length} — da generare: ${todo.length}`);

  if (DRY) {
    todo.forEach(j => console.log(`  ${j.rel}  «${j.text}»`));
    return;
  }
  if (!todo.length) { await writeIndex(); return; }

  if (!useProxy && !useDirect) {
    console.error(
      '\nManca la configurazione. Copia .env.example in .env e imposta\n' +
      '  TTS_PROXY_URL (+ TTS_PROXY_TOKEN)   oppure   ELEVENLABS_API_KEY\n' +
      'Senza audio pre-generati il gioco funziona lo stesso: usa la sintesi\n' +
      'vocale del browser come ripiego.\n'
    );
    process.exitCode = 1;
    return;
  }

  console.log(`Modalita: ${useProxy ? 'proxy' : 'chiamata diretta a ElevenLabs'}\n`);

  let done = 0;
  let failed = 0;
  for (const job of todo) {
    try {
      const buf = useProxy ? await synthViaProxy(env, job) : await synthDirect(env, job);
      await mkdir(path.dirname(job.dest), { recursive: true });
      await writeFile(job.dest, buf);
      done += 1;
      console.log(`  ok  ${job.rel}  (${(buf.length / 1024).toFixed(1)} kB)`);
    } catch (err) {
      failed += 1;
      console.warn(`  ko  ${job.rel}: ${err.message}`);
    }
    // Pausa breve: rispetta i limiti di frequenza dell'API.
    await new Promise(r => setTimeout(r, 350));
  }

  console.log(`\nGenerati ${done} file, falliti ${failed}.`);
  await writeIndex();
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
