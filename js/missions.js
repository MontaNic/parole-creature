/**
 * Missione del giorno.
 *
 * Ogni giorno il gioco propone un obiettivo piccolo e diverso, cosi' che
 * "aprire il gioco oggi" abbia un motivo suo e non sia la fotocopia di ieri.
 * La missione e' scelta in modo deterministico dalla data: nessun sorteggio
 * che possa cambiare se il bambino ricarica la pagina.
 */

import { content } from './content-loader.js';
import { save, persist, todayKey } from './state.js';

/** Hash stabile e cortissimo su stringa. */
function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Assicura che la missione di oggi sia scelta e restituisce la sua definizione. */
export function ensureTodayMission() {
  const pool = content.missions;
  if (!pool.length) return null;

  const day = todayKey();
  if (save.daily.day !== day || !save.daily.missionId) {
    const idx = hashString(day) % pool.length;
    save.daily.day = day;
    save.daily.missionId = pool[idx].id;
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
  }
  if (!inc) return false;

  save.daily.missionProgress += inc;
  if (save.daily.missionProgress >= mission.target) {
    save.daily.missionProgress = mission.target;
    save.daily.missionDone = true;
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
