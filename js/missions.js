/**
 * Missione del giorno.
 *
 * Ogni giorno il gioco propone un obiettivo piccolo e diverso, cosi' che
 * "aprire il gioco oggi" abbia un motivo suo e non sia la fotocopia di ieri.
 * La missione e' scelta in modo deterministico dalla data: nessun sorteggio
 * che possa cambiare se il bambino ricarica la pagina.
 *
 * Ma non a caso fra TUTTE: prima il sorteggio ignorava a che punto fosse il
 * bambino, e il primo giorno poteva uscire "Ripassa 4 parole gia' viste"
 * (nell'unita' 1 non c'e' niente da ripassare) o "Indovina 3 numeri" (i
 * numeri arrivano all'unita' 4): missioni impossibili. Ora:
 *  - i primi giorni ci sono le missioni "intro", in ordine, che insegnano a
 *    usare il gioco (una partita intera, ripetere a Pepe, l'album);
 *  - poi si sorteggia solo fra quelle fattibili adesso.
 */
import { content } from './content-loader.js';
import { save, persist, todayKey } from './state.js';
import { playableUnits, isUnitUnlocked, unitItems } from './curriculum.js';
import { hasBeenSeen } from './srs.js';

/** Le missioni dei primi giorni, in ordine. */
export function introMissions() {
  return content.missions.filter(m => m.intro).sort((a, b) => a.intro - b.intro);
}

/*
 * Le intro sono per chi comincia. Chi giocava gia' prima che esistessero
 * (piu' di qualche giorno di gioco alle spalle) non le riceve: sarebbe
 * come rispiegargli un gioco che conosce.
 */
const GIORNI_INTRO = 5;

function prossimaIntro() {
  const fatte = save.progress.introMissions || 0;
  const intro = introMissions();
  if (fatte >= intro.length) return null;
  if ((save.stats.daysPlayed || 0) > GIORNI_INTRO) return null;
  return intro[fatte];
}

/**
 * Se una missione si puo' completare adesso, con cio' che il bambino ha
 * davanti. Esportata per il test che verifica che non ne esca mai una
 * impossibile.
 */
export function isFeasible(m, settings = save.settings) {
  if (m.intro) return false;   // le intro passano solo da prossimaIntro()
  const aperte = playableUnits(settings).filter(w => isUnitUnlocked(w, settings));
  switch (m.type) {
    case 'themeCorrect':
      return aperte.flatMap(w => unitItems(w, settings))
        .filter(it => it.theme === m.theme).length >= m.target;
    case 'reviewCorrect':
      // Il ripasso libero c'e' appena qualcosa e' stato visto; ne servono
      // abbastanza perche' la missione non sia la stessa parola quattro volte.
      return aperte.flatMap(w => unitItems(w, settings))
        .filter(it => hasBeenSeen(it.id)).length >= m.target * 2;
    case 'home':
      return !m.afterWorld || (save.progress.worlds[m.afterWorld]?.plays || 0) > 0;
    default:
      return true;
  }
}

/** Hash stabile e cortissimo su stringa. */
function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Assicura che la missione di oggi sia scelta e restituisce la sua definizione. */
export function ensureTodayMission() {
  if (!content.missions.length) return null;
  const day = todayKey();
  if (save.daily.day !== day || !save.daily.missionId) {
    let scelta = prossimaIntro();
    if (!scelta) {
      const fattibili = content.missions.filter(m => isFeasible(m));
      const pool = fattibili.length ? fattibili : content.missions.filter(m => m.type === 'lessons' && !m.intro);
      scelta = pool[hashString(day) % pool.length];
    }
    save.daily.day = day;
    save.daily.missionId = scelta.id;
    save.daily.missionProgress = 0;
    save.daily.missionDone = false;
    persist();
  }
  return currentMission();
}

export function currentMission() {
  return content.missions.find(m => m.id === save.daily.missionId) || null;
}

/**
 * Aggiorna la missione dopo un evento di gioco.
 * @param {{correct?:boolean, theme?:string, repeat?:boolean, roundDone?:boolean, review?:boolean}} ev
 * @returns {boolean} true se la missione si e' appena completata
 */
export function trackMissionEvent(ev) {
  const mission = currentMission();
  if (!mission || save.daily.missionDone) return false;

  let inc = 0;
  switch (mission.type) {
    case 'correctAnswers':
      if (ev.correct) inc = 1;
      break;
    case 'repeats':
      if (ev.repeat) inc = 1;
      break;
    case 'themeCorrect':
      if (ev.correct && ev.theme === mission.theme) inc = 1;
      break;
    case 'lessons':
      if (ev.roundDone) inc = 1;
      break;
    case 'reviewCorrect':
      if (ev.correct && ev.review) inc = 1;
      break;
    case 'home':
      // Fuori dallo schermo: lo conferma un adulto dalla card in home.
      if (ev.home) inc = 1;
      break;
    case 'visit':
      if (ev.visit && ev.visit === mission.screen) inc = 1;
      break;
  }
  if (!inc) return false;

  save.daily.missionProgress += inc;
  if (save.daily.missionProgress >= mission.target) {
    save.daily.missionProgress = mission.target;
    save.daily.missionDone = true;
    // Una intro chiusa fa passare alla prossima, il giorno dopo.
    if (mission.intro) save.progress.introMissions = Math.max(save.progress.introMissions || 0, mission.intro);
    persist(true);
    return true;
  }
  persist();
  return false;
}

export function missionRatio() {
  const mission = currentMission();
  if (!mission) return 0;
  return Math.min(1, save.daily.missionProgress / mission.target);
}
