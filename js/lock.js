/**
 * Il tempo di gioco del giorno: quando finisce, serve un genitore.
 *
 * Prima, alla scadenza, Pepe proponeva di smettere ma un piccolo "Continua"
 * lasciava andare avanti chiunque, e dalla home si poteva far partire una
 * partita nuova come niente fosse. Ora:
 *  - Pepe saluta, e il bottone grande e' "Ci vediamo domani!";
 *  - "Un genitore sblocca" chiede il codice genitore (1357 di partenza, lo
 *    stesso dell'area genitori), poi una conferma, poi propone di salvare
 *    una copia dei dati: e' il momento in cui un adulto e' davanti al tablet;
 *  - lo sblocco aggiunge un altro blocco di minuti, poi si richiede.
 * Il codice tiene fuori un bambino di 7 anni, non chi conosce il browser.
 */

import { t } from './content-loader.js';
import { save, checkPin, sbloccaTempo, exportSaveFile } from './state.js';
import { renderMascot, mascotSay } from './mascot.js';
import { sfxTap, stopVoice } from './audio.js';
import { dopoLaVoce } from './pace.js';

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

function bottone(testo, cls, onclick) {
  const b = el('button', `btn ${cls}`, testo);
  b.type = 'button';
  b.onclick = () => { if (b.disabled) return; sfxTap(); onclick(); };
  return b;
}

/** Il pannello sopra tutto, con la sua scheda. */
function apriPannello() {
  const fondo = el('div', 'lock-overlay');
  const scheda = el('div', 'lock-card');
  fondo.appendChild(scheda);
  document.body.appendChild(fondo);
  return { fondo, scheda, chiudi: () => fondo.remove() };
}

/** Il tastierino a 4 cifre (stesse classi di quello dell'area genitori). */
function tastierino(onComplete) {
  const wrap = el('div', 'lock-pin');
  const dots = el('div', 'pin-dots');
  const dotEls = [];
  for (let i = 0; i < 4; i++) { const d = el('i'); dots.appendChild(d); dotEls.push(d); }
  const errore = el('div', 'pin-error');
  let pin = '';
  const paint = () => dotEls.forEach((d, i) => d.classList.toggle('on', i < pin.length));
  const pad = el('div', 'pin-pad');
  for (const k of ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '<']) {
    const b = el('button', 'pin-key', k);
    b.type = 'button';
    b.onclick = async () => {
      errore.textContent = '';
      if (k === 'C') pin = '';
      else if (k === '<') pin = pin.slice(0, -1);
      else if (pin.length < 4) pin += k;
      paint();
      if (pin.length === 4) {
        if (!(await onComplete(pin))) { errore.textContent = t('parents.pin_wrong'); pin = ''; paint(); }
      }
    };
    pad.appendChild(b);
  }
  wrap.append(dots, errore, pad);
  return wrap;
}

/**
 * Codice, conferma, copia dei dati. Si risolve true se il genitore ha
 * sbloccato, false se ha rinunciato.
 * @param {{scheda: HTMLElement}} pannello
 */
function passiGenitore({ scheda }) {
  return new Promise(resolve => {
    const codice = () => {
      scheda.innerHTML = '';
      scheda.appendChild(el('h2', 'h-title', t('lock.pin_title')));
      scheda.appendChild(tastierino(async (pin) => {
        if (!(await checkPin(pin))) return false;
        conferma();
        return true;
      }));
      scheda.appendChild(bottone(t('lock.cancel'), 'btn-ghost', () => resolve(false)));
    };

    const conferma = () => {
      scheda.innerHTML = '';
      scheda.appendChild(el('h2', 'h-title', t('lock.confirm_title')));
      scheda.appendChild(el('p', 'lock-text',
        t('lock.confirm_text').replace('{n}', String(save.settings.sessionMinutes || 30))));
      scheda.appendChild(bottone(t('lock.confirm_yes'), 'btn-good btn-lg', () => { sbloccaTempo(); copia(); }));
      scheda.appendChild(bottone(t('lock.cancel'), 'btn-ghost', () => resolve(false)));
    };

    const copia = () => {
      scheda.innerHTML = '';
      scheda.appendChild(el('h2', 'h-title', t('lock.backup_title')));
      scheda.appendChild(el('p', 'lock-text', t('lock.backup_text')));
      const esito = el('p', 'lock-text lock-ok', '');
      const salva = bottone(t('lock.backup_yes'), 'btn-good btn-lg', async () => {
        salva.disabled = true;
        const ok = await exportSaveFile();
        esito.textContent = ok ? t('lock.backup_done') : '';
        salva.disabled = false;
        if (ok) avanti.textContent = t('lock.go_on');
      });
      const avanti = bottone(t('lock.backup_no'), 'btn-ghost', () => resolve(true));
      scheda.append(salva, esito, avanti);
    };

    codice();
  });
}

/**
 * Il blocco completo, quando si prova a giocare a tempo finito (dalla home,
 * da "Gioca ancora", dai suoni): Pepe saluta, poi la scelta.
 * @returns {Promise<boolean>} true se un genitore ha sbloccato
 */
export async function chiediSblocco() {
  stopVoice();
  const pannello = apriPannello();
  const { scheda } = pannello;
  const mascotte = el('div', 'mascot-slot lock-mascot');
  scheda.appendChild(mascotte);
  renderMascot(mascotte);
  scheda.appendChild(el('h2', 'h-title', t('lock.title')));
  const nome = save.child.name ? `, ${save.child.name}` : '';
  const domani = bottone(t('ui.session_end_message'), 'btn-good btn-lg', () => {});
  const genitore = bottone(t('lock.unlock_button'), 'btn-ghost btn-sm', () => {});
  scheda.append(domani, genitore);

  const voce = mascotSay('session_end', { avatar: mascotte, vars: { name: nome } });
  dopoLaVoce([domani, genitore], voce);

  const esito = await new Promise(resolve => {
    domani.onclick = () => { if (domani.disabled) return; sfxTap(); resolve(false); };
    genitore.onclick = async () => {
      if (genitore.disabled) return;
      sfxTap();
      resolve(await passiGenitore(pannello));
    };
  });
  pannello.chiudi();
  return esito;
}

/**
 * Solo i passi del genitore: dal riepilogo, dove Pepe ha gia' salutato.
 * @returns {Promise<boolean>}
 */
export async function sbloccoGenitore() {
  const pannello = apriPannello();
  const esito = await passiGenitore(pannello);
  pannello.chiudi();
  return esito;
}
