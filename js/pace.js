import { mascotSay } from './mascot.js';

/**
 * Il ritmo lo detta il gioco, non il dito.
 *
 * Al playtest il bambino toccava "Avanti" a raffica: la storia, le
 * spiegazioni di Pepe, la parola da indovinare venivano tagliate a meta' e
 * lui si perdeva. Regola: mentre una voce spiega o pronuncia cio' che serve
 * per rispondere, i comandi per andare oltre restano fermi; si accendono,
 * con un piccolo rimbalzo, quando la voce ha finito.
 *
 * Non c'e' rischio di restare bloccati: ogni voce del gioco si risolve
 * comunque (fine traccia, tetto di durata, audio negato dal browser), e il
 * blocco si toglie in ogni caso nel finally.
 */

/**
 * Tiene fermi i comandi finche' `voce` non si risolve.
 * @param {Element|Element[]} targets bottoni (disabilitati) o contenitori
 *        (ignorano i tocchi)
 * @param {Promise<*>|undefined} voce la riproduzione da aspettare
 * @returns {Promise<void>}
 */
export async function dopoLaVoce(targets, voce) {
  const list = [].concat(targets).filter(Boolean);
  for (const n of list) {
    n.classList.add('is-hold');
    if ('disabled' in n) n.disabled = true;
  }
  try {
    await voce;
  } finally {
    for (const n of list) {
      // Chi e' stato tolto dallo schermo nel frattempo non va riacceso.
      if (!n.isConnected) continue;
      n.classList.remove('is-hold');
      if ('disabled' in n) n.disabled = false;
      if (n.matches?.('.btn')) {
        n.classList.remove('is-ready');
        void n.offsetWidth;
        n.classList.add('is-ready');
      }
    }
  }
}

/** Le istruzioni gia' dette in questa sessione (si azzera ricaricando). */
const gia = new Set();

/**
 * Pepe spiega a voce come si gioca, la PRIMA volta che quel gioco compare
 * nella sessione. Le scritte delle istruzioni c'erano, ma a 7 anni non
 * sempre si leggono; ripeterle a ogni domanda pero' renderebbe la partita
 * lenta e la voce rumore. Dalla seconda volta resta la scritta.
 * @param {string} key chiave in strings.mascot (howto_*)
 * @returns {Promise<void>}
 */
export async function spiega(key) {
  if (gia.has(key)) return;
  gia.add(key);
  await mascotSay(key, { avatar: document.getElementById('play-mascot') });
}
