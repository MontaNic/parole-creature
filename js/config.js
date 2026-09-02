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
  /** Versione dell'applicazione (mostrata nell'area genitori). */
  appVersion: '1.0.0',

  /** Percorsi dei dati. */
  contentUrl: 'content.json',
  stringsUrl: 'strings.json',
  spritesUrl: 'assets/img/sprites.svg',

  /** Cartella degli audio pre-generati e relativo indice. */
  audioBase: 'assets/audio/',
  audioIndexUrl: 'assets/audio/index.json',

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

  /** Ripetizione spaziata: intervalli in giorni per ciascun box di Leitner. */
  srsIntervals: [0, 1, 2, 4, 8, 16],

  /** Numero di volte che una parola va indovinata per considerarla "padroneggiata". */
  masteryBox: 4
};
