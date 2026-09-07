/**
 * Stato persistente del gioco.
 *
 * Regole di sicurezza dei dati:
 *  - lo schema del salvataggio ha un numero di versione (SAVE_SCHEMA_VERSION);
 *  - i contenuti (content.json) sono indicizzati per id: aggiungere parole,
 *    mondi o creature NON tocca il salvataggio esistente;
 *  - ogni campo nuovo viene aggiunto tramite "riempimento dei default", quindi
 *    un salvataggio vecchio resta valido;
 *  - export/import su file, perche' localStorage puo' essere cancellato.
 */

import { CONFIG } from './config.js';

/*
 * ATTENZIONE: questa chiave NON va rinominata, mai, nemmeno se il gioco
 * cambia titolo. E' l'indirizzo del salvataggio dentro il browser:
 * cambiarla equivale a cancellare tutti i progressi di chi gia' gioca.
 * Il gioco si chiamava "Draghetti & Parole": il nome resta qui per questo.
 */
const STORAGE_KEY = 'draghetti_parole_save';
export const SAVE_SCHEMA_VERSION = 2;

/* ------------------------------------------------------------------ */
/* Utilita' di data                                                    */
/* ------------------------------------------------------------------ */

/** Data locale in formato YYYY-MM-DD (non UTC: conta il giorno del bambino). */
export function todayKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Indice progressivo del giorno locale, usato dalla ripetizione spaziata. */
export function dayIndex(d = new Date()) {
  const local = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.floor(local.getTime() / 86400000);
}

/* ------------------------------------------------------------------ */
/* Struttura di default                                                */
/* ------------------------------------------------------------------ */

function defaultSave() {
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),

    child: { name: '' },

    progress: {
      level: 1,
      xp: 0,
      /** worldId -> { completed, plays, bestStars, lastPlayed } */
      worlds: {},
      /** creatureId -> ISO string di sblocco */
      creatures: {},
      /** numero di fase -> ISO string di quando la soglia e' stata superata */
      phasesReached: {},
      /** capitolo della storia -> ISO string della prima visione */
      storySeen: {},
      /** adesivo degli scrigni -> ISO string di quando e' stato trovato */
      stickers: {},
      /** itemId (parola o frase) -> stato di ripetizione spaziata */
      srs: {}
    },

    streak: { current: 0, best: 0, lastPlayDay: '' },

    daily: {
      day: '',
      missionId: '',
      missionProgress: 0,
      missionDone: false,
      minutesPlayed: 0,
      sessionEnded: false,
      chestOpened: false
    },

    stats: {
      totalCorrect: 0,
      totalWrong: 0,
      totalRepeats: 0,
      totalRounds: 0,
      totalMinutes: 0,
      daysPlayed: 0,
      chestsOpened: 0
    },

    settings: {
      /* Il PIN e' volutamente debole: serve solo a tenere fuori un bambino. */
      pinHash: '',
      pinPlain: '',            // usato solo se crypto.subtle non e' disponibile
      sessionMinutes: CONFIG.game.defaultSessionMinutes,
      allowedFrom: '',         // "16:00" oppure "" = nessun limite
      allowedTo: '',
      allowedDays: [0, 1, 2, 3, 4, 5, 6],  // 0 = lunedi
      phasesEnabled: { 1: true, 2: true, 3: true, 4: true, 5: true },
      themesDisabled: [],      // temi messi in pausa dai genitori
      vacation: false,

      /*
       * Volumi 0-100, non piu' interruttori.
       * Un genitore ragiona per "quanto parla forte il gioco", non per ruoli:
       * un solo cursore copre Pepe, il narratore e la pronuncia inglese.
       *
       * I default non sono tutti uguali di proposito. La voce sta a 100
       * perche' e' il contenuto: se non si sente, il gioco non insegna. La
       * musica sta a 50, che corrisponde esattamente al volume con cui e'
       * stata progettata — sfondo, non protagonista — e lascia margine per
       * alzarla. Gli effetti stanno in mezzo.
       */
      musicVolume: 50,
      voiceVolume: 100,
      sfxVolume: 70,
      /* Scavalca la soglia di padronanza fra le fasi. Da usare con criterio:
         serve se il bambino e' gia' avanti o se una fase lo sta annoiando. */
      unlockAllPhases: false,
      kindleEmail: '',
      music: true,
      sfx: true,
      onboardingDone: false
    },

    /** ebookId -> { status: 'todo' | 'generated' | 'sent', updatedAt } */
    ebooks: {}
  };
}

/* ------------------------------------------------------------------ */
/* Migrazioni fra versioni di schema                                   */
/* ------------------------------------------------------------------ */

/**
 * Ogni funzione porta il salvataggio dalla versione N alla N+1.
 * Esempio per il futuro:
 *   2: (save) => { save.progress.badges = {}; return save; }
 */
const MIGRATIONS = {
  /*
   * 1 -> 2: gli interruttori audio diventano volumi.
   *
   * Chi aveva la musica accesa la ritrova allo stesso volume di prima (50,
   * che e' il livello con cui e' stata progettata), chi l'aveva spenta la
   * ritrova a zero. La voce non aveva un interruttore e parte al massimo:
   * e' il contenuto del gioco.
   */
  1: (save) => {
    const s = save.settings || (save.settings = {});
    if (s.musicVolume === undefined) s.musicVolume = s.music === false ? 0 : 50;
    if (s.sfxVolume === undefined) s.sfxVolume = s.sfx === false ? 0 : 70;
    if (s.voiceVolume === undefined) s.voiceVolume = 100;
    delete s.music;
    delete s.sfx;
    return save;
  }
};

function migrate(save) {
  let v = save.schemaVersion || 1;
  while (v < SAVE_SCHEMA_VERSION) {
    const step = MIGRATIONS[v];
    if (!step) break;
    save = step(save);
    v += 1;
    save.schemaVersion = v;
  }
  return save;
}

/** Aggiunge in profondita' le chiavi mancanti senza toccare quelle esistenti. */
function fillDefaults(target, defaults) {
  for (const key of Object.keys(defaults)) {
    const def = defaults[key];
    if (target[key] === undefined || target[key] === null) {
      target[key] = structuredCloneSafe(def);
    } else if (isPlainObject(def) && isPlainObject(target[key])) {
      fillDefaults(target[key], def);
    }
  }
  return target;
}

function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function structuredCloneSafe(v) {
  return typeof structuredClone === 'function'
    ? structuredClone(v)
    : JSON.parse(JSON.stringify(v));
}

/* ------------------------------------------------------------------ */
/* API pubblica                                                        */
/* ------------------------------------------------------------------ */

/** Copia in memoria del salvataggio. Unica fonte di verita' a runtime. */
export let save = defaultSave();

let saveTimer = null;

export function loadSave() {
  let raw = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch (err) {
    console.warn('[state] localStorage non disponibile:', err);
  }

  if (!raw) {
    save = defaultSave();
    return save;
  }

  try {
    let parsed = JSON.parse(raw);
    parsed = migrate(parsed);
    save = fillDefaults(parsed, defaultSave());
    save.schemaVersion = SAVE_SCHEMA_VERSION;
  } catch (err) {
    console.error('[state] salvataggio illeggibile, riparto da zero:', err);
    save = defaultSave();
  }
  return save;
}

/** Salvataggio ritardato: evita scritture continue durante la partita. */
export function persist(immediate = false) {
  save.updatedAt = new Date().toISOString();
  if (immediate) {
    writeNow();
    return;
  }
  clearTimeout(saveTimer);
  saveTimer = setTimeout(writeNow, 400);
}

function writeNow() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
  } catch (err) {
    console.error('[state] impossibile salvare:', err);
  }
}

export function resetSave() {
  save = defaultSave();
  persist(true);
  return save;
}

/* ------------------------------------------------------------------ */
/* Export / import su file                                             */
/* ------------------------------------------------------------------ */

export function exportSaveFile() {
  const payload = {
    app: 'draghetti-parole',
    appVersion: CONFIG.appVersion,
    exportedAt: new Date().toISOString(),
    save
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `parole-creature-backup-${todayKey()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Importa un file di backup.
 * @returns {Promise<boolean>} true se il file era valido.
 */
export async function importSaveFile(file) {
  const text = await file.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    return false;
  }
  const incoming = payload && payload.save ? payload.save : payload;
  if (!incoming || typeof incoming !== 'object' || !incoming.progress) return false;

  save = fillDefaults(migrate(incoming), defaultSave());
  save.schemaVersion = SAVE_SCHEMA_VERSION;
  persist(true);
  return true;
}

/* ------------------------------------------------------------------ */
/* Streak e sessione giornaliera                                       */
/* ------------------------------------------------------------------ */

/**
 * Allinea il salvataggio al giorno corrente:
 * azzera i contatori giornalieri e aggiorna la streak.
 * @returns {{newDay: boolean, streakKept: boolean}}
 */
export function rolloverDay() {
  const today = todayKey();
  if (save.daily.day === today) return { newDay: false, streakKept: false };

  save.daily = {
    day: today,
    missionId: '',
    missionProgress: 0,
    missionDone: false,
    minutesPlayed: 0,
    sessionEnded: false,
    chestOpened: false
  };
  persist();
  return { newDay: true, streakKept: false };
}

/** Da chiamare quando il bambino gioca davvero (prima risposta della giornata). */
export function registerPlayToday() {
  const today = todayKey();
  if (save.streak.lastPlayDay === today) return false;

  const yesterday = todayKey(new Date(Date.now() - 86400000));
  save.streak.current = save.streak.lastPlayDay === yesterday
    ? save.streak.current + 1
    : 1;
  save.streak.best = Math.max(save.streak.best, save.streak.current);
  save.streak.lastPlayDay = today;
  save.stats.daysPlayed += 1;
  persist();
  return true;
}

/* ------------------------------------------------------------------ */
/* Livello ed esperienza                                               */
/* ------------------------------------------------------------------ */

/** Aggiunge xp e restituisce true se il livello e' salito. */
export function addXp(amount) {
  save.progress.xp += amount;
  const newLevel = 1 + Math.floor(save.progress.xp / CONFIG.game.xpPerLevel);
  if (newLevel > save.progress.level) {
    save.progress.level = newLevel;
    persist();
    return true;
  }
  persist();
  return false;
}

/* ------------------------------------------------------------------ */
/* PIN dell'area genitori                                              */
/* ------------------------------------------------------------------ */

/**
 * Hash del PIN. Nota onesta: non e' una misura di sicurezza reale
 * (il PIN e' a 4 cifre e l'hash sta sul dispositivo). Serve solo a
 * impedire l'ingresso accidentale di un bambino.
 */
export async function hashPin(pin) {
  if (!globalThis.crypto?.subtle) return '';
  // Anche questo prefisso e' congelato: cambiarlo cambierebbe l'hash e
  // renderebbe il PIN gia' impostato dai genitori impossibile da indovinare.
  const data = new TextEncoder().encode(`draghetti:${pin}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function setPin(pin) {
  const h = await hashPin(pin);
  if (h) {
    save.settings.pinHash = h;
    save.settings.pinPlain = '';
  } else {
    save.settings.pinHash = '';
    save.settings.pinPlain = pin;   // fallback su contesti senza crypto.subtle
  }
  persist(true);
}

export async function checkPin(pin) {
  if (save.settings.pinHash) return (await hashPin(pin)) === save.settings.pinHash;
  if (save.settings.pinPlain) return pin === save.settings.pinPlain;
  return true;   // nessun PIN impostato: primo accesso
}

export function hasPin() {
  return Boolean(save.settings.pinHash || save.settings.pinPlain);
}

/* ------------------------------------------------------------------ */
/* Controllo orari / pausa vacanza                                     */
/* ------------------------------------------------------------------ */

/**
 * @returns {{allowed: boolean, reason: 'vacation'|'day'|'time'|''}}
 */
export function checkAccessWindow(now = new Date()) {
  const s = save.settings;
  if (s.vacation) return { allowed: false, reason: 'vacation' };

  // getDay(): 0 = domenica. Nel salvataggio 0 = lunedi.
  const dayIdx = (now.getDay() + 6) % 7;
  if (Array.isArray(s.allowedDays) && s.allowedDays.length && !s.allowedDays.includes(dayIdx)) {
    return { allowed: false, reason: 'day' };
  }

  if (s.allowedFrom && s.allowedTo) {
    const mins = now.getHours() * 60 + now.getMinutes();
    const from = toMinutes(s.allowedFrom);
    const to = toMinutes(s.allowedTo);
    if (from !== null && to !== null) {
      const inside = from <= to
        ? (mins >= from && mins <= to)
        : (mins >= from || mins <= to);   // finestra a cavallo della mezzanotte
      if (!inside) return { allowed: false, reason: 'time' };
    }
  }
  return { allowed: true, reason: '' };
}

function toMinutes(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm).trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}
