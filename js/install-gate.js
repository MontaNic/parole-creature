/**
 * Il gioco su iPad e iPhone si usa installato sulla schermata Home.
 *
 * Perche': in Safari, un sito che non si apre per 7 giorni puo' perdere i
 * dati salvati (e con loro tutti i progressi del bambino). Un gioco aggiunto
 * alla Home ha uno spazio suo, che quella regola non tocca. E' la
 * protezione piu' efficace che il gioco possa darsi da solo.
 *
 * Come:
 *  - solo su iPad/iPhone in Safari (non installato) compare una schermata
 *    con i due passaggi per installarlo, al posto del gioco;
 *  - un genitore, con il codice, puo' giocare lo stesso nel browser, ma solo
 *    per questa visita: un blocco senza uscita prima o poi chiude fuori
 *    proprio chi non deve;
 *  - altrove (computer, Android, i test automatici) nessun blocco: li' il
 *    problema dei 7 giorni non c'e'.
 *
 * Attenzione: il gioco installato e quello in Safari hanno salvataggi
 * separati. Chi aveva gia' progressi in Safari li porta con
 * "Dati e backup": esporta da Safari, importa nel gioco installato.
 */

import { t } from './content-loader.js';
import { renderMascot } from './mascot.js';
import { sfxTap } from './audio.js';
import { soloCodiceGenitore } from './lock.js';

const CHIAVE_BROWSER = 'pc_browser_ok';

/** iPad (anche quelli che si presentano come Mac), iPhone, iPod. */
export function isApple(nav = navigator) {
  const ua = nav.userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return nav.platform === 'MacIntel' && (nav.maxTouchPoints || 0) > 1;
}

/** Vero quando il gioco gira dalla Home, a tutto schermo. */
export function isInstalled(win = window) {
  return Boolean(win.matchMedia?.('(display-mode: standalone)').matches || win.navigator.standalone === true);
}

/** Serve la schermata di installazione? */
export function needsInstall(win = window) {
  if (!isApple(win.navigator) || isInstalled(win)) return false;
  try { if (win.sessionStorage.getItem(CHIAVE_BROWSER) === '1') return false; } catch { /* privato */ }
  return true;
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

/**
 * Mostra la schermata finche' un genitore non sceglie il browser. Se il
 * gioco va installato, la promessa non si risolve mai: si riapre dalla Home.
 * @returns {Promise<void>}
 */
export function runInstallGate() {
  if (!needsInstall()) return Promise.resolve();
  return new Promise(resolve => {
    const fondo = el('div', 'install-gate');
    const scheda = el('div', 'install-card');
    fondo.appendChild(scheda);

    const mascotte = el('div', 'mascot-slot install-mascot');
    scheda.appendChild(mascotte);
    renderMascot(mascotte);

    scheda.appendChild(el('h1', 'h-title', t('install.title')));
    scheda.appendChild(el('p', 'install-text', t('install.why')));

    const passi = el('ol', 'install-steps');
    passi.appendChild(el('li', null, t('parents.install_step_1')));
    passi.appendChild(el('li', null, t('parents.install_step_2')));
    passi.appendChild(el('li', null, t('install.step_3')));
    scheda.appendChild(passi);

    scheda.appendChild(el('p', 'install-note', t('install.note')));

    const browser = el('button', 'btn btn-ghost btn-sm', t('install.browser_button'));
    browser.type = 'button';
    browser.onclick = async () => {
      sfxTap();
      if (!(await soloCodiceGenitore(t('install.browser_pin_title')))) return;
      try { sessionStorage.setItem(CHIAVE_BROWSER, '1'); } catch { /* privato */ }
      fondo.remove();
      resolve();
    };
    scheda.appendChild(browser);

    document.body.appendChild(fondo);
  });
}
