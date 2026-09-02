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
 * Due voci, due ruoli distinti (in .env):
 *
 *   VOICE_ID_ENGLISH    il MODELLO di pronuncia. Dice tutto il contenuto
 *                       didattico in inglese: parole e frasi da imparare.
 *                       E' la voce che il bambino deve imitare.
 *   VOICE_ID_NARRATOR   la GUIDA. Dice le battute italiane di Zibo:
 *                       accoglienza, istruzioni, incoraggiamenti.
 *
 * La separazione non e' estetica: al bambino deve essere sempre chiaro,
 * dal solo timbro, se quello che sente e' inglese da imparare o italiano
 * da capire. Cambiare voce e' il segnale piu' immediato che esista.
 *
 * Uso:
 *   node tools/generate-audio.mjs             genera solo i file mancanti
 *   node tools/generate-audio.mjs --force     rigenera tutto
 *   node tools/generate-audio.mjs --plan      solo il riepilogo per voce
 *   node tools/generate-audio.mjs --dry-run   riepilogo + elenco delle tracce
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
const PLAN = args.has('--plan');
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

  // Contenuto didattico da imparare: sempre in inglese, voce VOICE_ID_ENGLISH.
  for (const w of content.words || []) {
    jobs.push({ rel: `en/${w.id}.mp3`, text: w.en, lang: 'en', kind: 'word' });
  }
  for (const p of content.phrases || []) {
    jobs.push({ rel: `en/${p.id}.mp3`, text: p.en, lang: 'en', kind: 'phrase' });
  }

  // Battute della mascotte: in italiano, voce VOICE_ID_NARRATOR.
  const spoken = strings.mascotSpoken || {};
  for (const [key, text] of Object.entries(strings.mascot || {})) {
    if (key === 'name') continue;
    if (typeof text !== 'string') continue;

    // Le battute con segnaposto ({name}, {n}) non si possono pre-generare
    // cosi' come sono. Invece di lasciarle alla sintesi del browser — che
    // suonerebbe come un'altra creatura — si registra la forma neutra
    // dichiarata in strings.mascotSpoken. Il fumetto continua a mostrare il
    // testo personalizzato: e' l'orecchio che deve restare coerente.
    let line = text;
    if (line.includes('{')) {
      if (!spoken[key]) {
        console.warn(`  ! ${key}: ha un segnaposto e nessuna versione in ` +
          `strings.mascotSpoken — restera' alla sintesi del browser`);
        continue;
      }
      line = spoken[key];
    }
    jobs.push({ rel: `it/mascot.${key}.mp3`, text: line, lang: 'it', kind: 'mascot' });
  }

  return { jobs, content };
}

/* ------------------------------------------------------------------ */
/* Chiamata TTS                                                        */
/* ------------------------------------------------------------------ */

/**
 * Le due voci del progetto. Il campo `env` e' il nome della variabile in .env,
 * `fallback` una voce pubblica di ElevenLabs usata solo se non e' configurata.
 */
const VOICE_ROLES = {
  en: {
    env: 'VOICE_ID_ENGLISH',
    legacyEnv: 'ELEVENLABS_VOICE_EN',
    fallback: '21m00Tcm4TlvDq8ikWAM',      // Rachel
    role: 'modello di pronuncia inglese'
  },
  it: {
    env: 'VOICE_ID_NARRATOR',
    legacyEnv: 'ELEVENLABS_VOICE_IT',
    fallback: 'XB0fDUnXU5powFXDhCwa',      // Charlotte
    role: 'voce guida italiana (Zibo)'
  }
};

function voiceFor(env, lang) {
  const r = VOICE_ROLES[lang];
  return env[r.env] || env[r.legacyEnv] || r.fallback;
}

/** Vero se la voce di quella lingua e' configurata davvero in .env. */
function voiceConfigured(env, lang) {
  const r = VOICE_ROLES[lang];
  return Boolean(env[r.env] || env[r.legacyEnv]);
}

/**
 * Parametri di sintesi per tipo di traccia.
 * Le parole singole vogliono stabilita' alta e zero espressivita': devono
 * suonare identiche a ogni riascolto, perche' sono un modello da imitare.
 * Le battute di Zibo possono permettersi piu' calore.
 */
function voiceSettings(kind) {
  if (kind === 'word') return { stability: 0.70, similarity_boost: 0.85, style: 0.0, use_speaker_boost: true };
  if (kind === 'phrase') return { stability: 0.55, similarity_boost: 0.85, style: 0.1, use_speaker_boost: true };
  return { stability: 0.45, similarity_boost: 0.80, style: 0.25, use_speaker_boost: true };
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
      voiceId: voiceFor(env, job.lang),
      voiceSettings: voiceSettings(job.kind)
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
      voice_settings: voiceSettings(job.kind)
    })
  });
  if (!res.ok) throw new Error(`ElevenLabs HTTP ${res.status}: ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}

/* ------------------------------------------------------------------ */
/* Riepilogo: quale voce dice cosa                                     */
/* ------------------------------------------------------------------ */

const KIND_LABEL = {
  word: 'parole singole',
  phrase: 'frasi e mini-dialoghi',
  mascot: 'battute di Zibo'
};

/**
 * Stampa la suddivisione delle tracce fra le due voci.
 * Serve a verificare la ripartizione PRIMA di spendere caratteri.
 */
function printPlan(env, jobs, todo) {
  const todoSet = new Set(todo.map(j => j.rel));

  console.log('\nRIEPILOGO PER VOCE');
  console.log('='.repeat(64));

  let totChars = 0;
  let todoChars = 0;

  for (const lang of ['en', 'it']) {
    const role = VOICE_ROLES[lang];
    const mine = jobs.filter(j => j.lang === lang);
    const mineTodo = mine.filter(j => todoSet.has(j.rel));
    const chars = mine.reduce((n, j) => n + j.text.length, 0);
    const charsTodo = mineTodo.reduce((n, j) => n + j.text.length, 0);
    totChars += chars;
    todoChars += charsTodo;

    const configured = voiceConfigured(env, lang);
    console.log(`\n${role.env}   (${role.role})`);
    console.log(`  stato voce      ${configured ? 'configurata in .env' : 'NON configurata — userei la voce di riserva'}`);
    console.log(`  tracce totali   ${mine.length}   (${chars} caratteri)`);
    console.log(`  da generare     ${mineTodo.length}   (${charsTodo} caratteri)`);

    const byKind = {};
    for (const j of mine) byKind[j.kind] = (byKind[j.kind] || 0) + 1;
    for (const [kind, n] of Object.entries(byKind)) {
      console.log(`    - ${String(n).padStart(3)}  ${KIND_LABEL[kind] || kind}`);
    }
    const sample = mine.slice(0, 3).map(j => `"${j.text}"`).join('   ');
    if (sample) console.log(`  esempi          ${sample}`);
  }

  console.log('\n' + '-'.repeat(64));
  console.log(`TOTALE            ${jobs.length} tracce, ${totChars} caratteri`);
  console.log(`DA GENERARE ORA   ${todo.length} tracce, ${todoChars} caratteri`);
  console.log('-'.repeat(64) + '\n');
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

  printPlan(env, jobs, todo);

  if (PLAN) return;

  if (DRY) {
    console.log('Tracce che verrebbero generate:');
    todo.forEach(j => console.log(`  ${j.rel.padEnd(28)} «${j.text}»`));
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
