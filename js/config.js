/**
 * Punto unico di configurazione del client.
 *
 * IMPORTANTE: qui non deve MAI finire una chiave API.
 * La chiave ElevenLabs vive solo nel proxy (vedi proxy/cloudflare-worker.js)
 * e nello script offline tools/generate-audio.mjs, che legge il file .env locale.
 * Il gioco a runtime NON chiama ElevenLabs: usa solo i file gia' generati
 * dentro assets/audio/ e, se manca un file, la sintesi vocale del browser.
 */
export const CONFIG = {
  /**
   * Versione e data, mostrate in fondo all'area genitori.
   * Servono a chi segnala un problema per dire "ce l'ho con questa".
   * Vanno alzate a mano a ogni rilascio: il progetto non ha un build step.
   */
  appVersion: '2.1.0',
  buildDate: '2026-09-07',

  /** Percorsi dei dati. */
  contentUrl: 'content.json',
  stringsUrl: 'strings.json',
  spritesUrl: 'assets/img/sprites.svg',

  /** Cartella degli audio pre-generati e relativo indice. */
  audioBase: 'assets/audio/',
  audioIndexUrl: 'assets/audio/index.json',

  /** Illustrazioni generate e indice di quali sprite ne hanno una. */
  artBase: 'assets/img/art/',
  artIndexUrl: 'assets/img/art/index.json',

  /**
   * Endpoint del proxy TTS. Usato SOLO da tools/generate-audio.mjs
   * (generazione offline), mai dal gioco. Lasciare vuoto qui e' corretto:
   * il valore reale sta in .env come TTS_PROXY_URL.
   */
  ttsProxyUrl: '',

  /** Voci ElevenLabs usate in generazione (riferimento per lo script offline). */
  voices: {
    en: { voiceId: '21m00Tcm4TlvDq8ikWAM', label: 'Rachel (EN)' },
    it: { voiceId: 'XB0fDUnXU5powFXDhCwa', label: 'Charlotte (IT)' }
  },

  /** Parametri di gioco. */
  game: {
    questionsPerRound: 8,        // domande per partita
    minChoices: 2,               // scelte minime nei quiz (fase 1 iniziale)
    maxChoices: 4,               // scelte massime
    huntTargets: 3,              // quante immagini trovare nella caccia
    xpPerCorrect: 10,
    xpPerLevel: 100,             // xp necessari per salire di livello
    defaultSessionMinutes: 10,
    sessionWarnRatio: 0.8        // a che punto della sessione avvisare
  },

  /**
   * Criteri di successo del progetto, misurabili nel pannello genitori:
   * giocare con regolarita' (giorni su una finestra) e imparare davvero
   * (parole padroneggiate). Prima taratura, da rivedere con i dati.
   */
  success: { windowDays: 14, daysTarget: 10, masteredTarget: 40, historyKeepDays: 90 },

  /** Giochi bonus: dopo tre stelle, non piu' di uno ogni N partite e M al giorno, per S secondi. */
  bonus: { everyRounds: 3, perDay: 3, seconds: 45, minPool: 4 },

  /** Scrigni a sorpresa: probabilita' per partita, e stelle quando gli adesivi sono finiti. */
  chest: { chance: 0.2, xpBonus: 30 },

  /**
   * Ripetizione spaziata: intervalli in giorni per ciascun box di Leitner.
   * Il primo intervallo e' 1 e non 0 di proposito: cosi' un item puo' salire
   * di box al massimo una volta al giorno, e "padroneggiato" significa
   * davvero "indovinato piu' volte in giorni diversi", non tre volte di fila
   * nella stessa sessione.
   */
  srsIntervals: [1, 1, 2, 4, 8, 16],

  /**
   * Box da cui un item conta come "padroneggiato".
   * Il valore vero arriva da content.json (curriculum.masteryBox): questo e'
   * solo il ripiego se il file non lo specifica.
   */
  masteryBox: 3
};
