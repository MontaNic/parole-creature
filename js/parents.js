/**
 * Area genitori.
 *
 * Protetta da un PIN a 4 cifre. E' bene essere onesti su cosa significa:
 * serve a impedire l'ingresso accidentale (o furbetto) di un bambino di 7
 * anni, non e' una misura di sicurezza informatica. Chi sa usare gli
 * strumenti del browser puo' aggirarla in un minuto.
 *
 * Tutto quello che si imposta qui vive nello stesso salvataggio versionato
 * del resto del progresso: nessun backend, nessun dato che esce dal device.
 */

import { CONFIG } from './config.js';
import { content, t, allThemes, audioIndex, getItem, getPhase, structuresOf } from './content-loader.js';
import {
  save, persist, setPin, checkPin, hasPin,
  exportSaveFile, importSaveFile, resetSave
} from './state.js';
import { masteredCount, seenCount, overallAccuracy, hardestItems } from './srs.js';
import { showScreen } from './screens.js';
import {
  unitProgress, phaseProgress, playablePhases, curriculumConfig
} from './curriculum.js';
import { setMusicEnabled } from './audio.js';

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

let onExit = () => {};

export function openParents(exitHandler) {
  onExit = exitHandler;
  showScreen('parents');
  if (!hasPin()) renderPinSetup();
  else renderPinEntry();
}

/* ------------------------------------------------------------------ */
/* Tastierino PIN                                                      */
/* ------------------------------------------------------------------ */

function renderPinPad(title, hint, onComplete) {
  const body = document.getElementById('parents-body');
  body.innerHTML = '';

  const wrap = el('div', 'panel');
  wrap.style.alignItems = 'center';
  wrap.style.textAlign = 'center';

  wrap.appendChild(el('h3', 'h-sub', title));
  if (hint) {
    const h = el('p', 'muted tiny', hint);
    h.style.maxWidth = '420px';
    wrap.appendChild(h);
  }

  const dots = el('div', 'pin-dots');
  const dotEls = [];
  for (let i = 0; i < 4; i++) { const d = el('i'); dots.appendChild(d); dotEls.push(d); }
  wrap.appendChild(dots);

  const error = el('div', 'pin-error');
  wrap.appendChild(error);

  let pin = '';
  const paint = () => dotEls.forEach((d, i) => d.classList.toggle('on', i < pin.length));

  const pad = el('div', 'pin-pad');
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '<'];
  keys.forEach(k => {
    const b = el('button', 'pin-key', k);
    b.type = 'button';
    b.onclick = async () => {
      error.textContent = '';
      if (k === 'C') pin = '';
      else if (k === '<') pin = pin.slice(0, -1);
      else if (pin.length < 4) pin += k;
      paint();
      if (pin.length === 4) {
        const ok = await onComplete(pin);
        if (!ok) {
          error.textContent = t('parents.pin_wrong');
          pin = '';
          paint();
        }
      }
    };
    pad.appendChild(b);
  });
  wrap.appendChild(pad);

  const back = el('button', 'btn btn-ghost', t('ui.back'));
  back.onclick = () => onExit();
  wrap.appendChild(back);

  body.appendChild(wrap);
}

function renderPinSetup() {
  renderPinPad(t('parents.pin_setup_title'), t('parents.pin_setup_hint'), async (pin) => {
    await setPin(pin);
    renderDashboard();
    return true;
  });
}

function renderPinEntry() {
  renderPinPad(t('parents.pin_enter_title'), '', async (pin) => {
    const ok = await checkPin(pin);
    if (ok) renderDashboard();
    return ok;
  });
}

/* ------------------------------------------------------------------ */
/* Dashboard                                                           */
/* ------------------------------------------------------------------ */

const TABS = [
  { id: 'settings', label: 'parents.tab_settings', render: panelSettings },
  { id: 'progress', label: 'parents.tab_progress', render: panelProgress },
  { id: 'ebooks',   label: 'parents.tab_ebooks',   render: panelEbooks },
  { id: 'media',    label: 'parents.tab_media',    render: panelMedia },
  { id: 'data',     label: 'parents.tab_data',     render: panelData }
];

let activeTab = 'settings';

function renderDashboard() {
  const body = document.getElementById('parents-body');
  body.innerHTML = '';

  const tabs = el('div', 'tabs');
  const panelHost = el('div');

  TABS.forEach(tab => {
    const b = el('button', 'tab' + (tab.id === activeTab ? ' is-active' : ''), t(tab.label));
    b.type = 'button';
    b.onclick = () => {
      activeTab = tab.id;
      tabs.querySelectorAll('.tab').forEach(x => x.classList.remove('is-active'));
      b.classList.add('is-active');
      panelHost.innerHTML = '';
      panelHost.appendChild(tab.render());
    };
    tabs.appendChild(b);
  });

  body.appendChild(tabs);
  body.appendChild(panelHost);
  panelHost.appendChild((TABS.find(x => x.id === activeTab) || TABS[0]).render());
}

/* ------------------------------------------------------------------ */
/* Pannello: impostazioni                                              */
/* ------------------------------------------------------------------ */

function field(labelText, control, hintText) {
  const f = el('div', 'field');
  const l = el('label', null, labelText);
  f.appendChild(l);
  f.appendChild(control);
  if (hintText) f.appendChild(el('div', 'hint', hintText));
  return f;
}

function switchRow(labelText, checked, onChange, hintText) {
  const row = el('div', 'switch-row');
  const left = el('div');
  left.appendChild(el('div', null, labelText));
  if (hintText) left.appendChild(el('div', 'hint', hintText));
  const sw = el('label', 'switch');
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  input.onchange = () => onChange(input.checked);
  sw.appendChild(input);
  sw.appendChild(el('span'));
  row.appendChild(left);
  row.appendChild(sw);
  return row;
}

function panelSettings() {
  const p = el('div', 'panel');

  // Nome del bambino
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.value = save.child.name || '';
  nameInput.maxLength = 16;
  nameInput.oninput = () => { save.child.name = nameInput.value.trim().slice(0, 16); persist(); };
  p.appendChild(field(t('parents.child_name'), nameInput));

  // Durata della sessione
  const minutes = document.createElement('input');
  minutes.type = 'number';
  minutes.min = '3'; minutes.max = '60'; minutes.step = '1';
  minutes.value = save.settings.sessionMinutes;
  minutes.onchange = () => {
    const v = Math.max(3, Math.min(60, Number(minutes.value) || CONFIG.game.defaultSessionMinutes));
    save.settings.sessionMinutes = v;
    minutes.value = v;
    persist(true);
  };
  p.appendChild(field(t('parents.session_minutes'), minutes, t('parents.session_minutes_hint')));

  // Fascia oraria
  const timeRow = el('div', 'row');
  const from = document.createElement('input');
  from.type = 'time'; from.value = save.settings.allowedFrom || '';
  const to = document.createElement('input');
  to.type = 'time'; to.value = save.settings.allowedTo || '';
  const syncTimes = () => {
    save.settings.allowedFrom = from.value;
    save.settings.allowedTo = to.value;
    persist(true);
  };
  from.onchange = syncTimes; to.onchange = syncTimes;
  timeRow.appendChild(field(t('parents.allowed_from'), from));
  timeRow.appendChild(field(t('parents.allowed_to'), to));
  p.appendChild(timeRow);

  // Giorni consentiti
  const daysBox = el('div', 'chips');
  const dayNames = t('parents.days_short');
  dayNames.forEach((name, idx) => {
    const on = save.settings.allowedDays.includes(idx);
    const c = el('button', 'chip-toggle' + (on ? ' on' : ''), name);
    c.type = 'button';
    c.onclick = () => {
      const set = new Set(save.settings.allowedDays);
      if (set.has(idx)) set.delete(idx); else set.add(idx);
      save.settings.allowedDays = [...set].sort((a, b) => a - b);
      c.classList.toggle('on');
      persist(true);
    };
    daysBox.appendChild(c);
  });
  p.appendChild(field(t('parents.allowed_days'), daysBox));

  // Fasi didattiche attive
  const phasesBox = el('div', 'chips');
  content.phases.forEach(ph => {
    const on = save.settings.phasesEnabled[ph.id] !== false;
    const c = el('button', 'chip-toggle' + (on ? ' on' : ''), `${ph.id}. ${ph.title_it}`);
    c.type = 'button';
    c.onclick = () => {
      save.settings.phasesEnabled[ph.id] = save.settings.phasesEnabled[ph.id] === false;
      c.classList.toggle('on');
      persist(true);
    };
    phasesBox.appendChild(c);
  });
  p.appendChild(field(t('parents.phases_enabled'), phasesBox));

  // Temi attivi
  const themesBox = el('div', 'chips');
  allThemes().forEach(theme => {
    const on = !save.settings.themesDisabled.includes(theme);
    const c = el('button', 'chip-toggle' + (on ? ' on' : ''), theme);
    c.type = 'button';
    c.onclick = () => {
      const set = new Set(save.settings.themesDisabled);
      if (set.has(theme)) set.delete(theme); else set.add(theme);
      save.settings.themesDisabled = [...set];
      c.classList.toggle('on');
      persist(true);
    };
    themesBox.appendChild(c);
  });
  p.appendChild(field(t('parents.themes_enabled'), themesBox));

  // Audio
  p.appendChild(switchRow(t('parents.music'), save.settings.music, (on) => {
    setMusicEnabled(on);
    persist(true);
  }));
  p.appendChild(switchRow(t('parents.sfx'), save.settings.sfx, (on) => {
    save.settings.sfx = on; persist(true);
  }));

  // Scavalcare la soglia di padronanza fra le fasi
  p.appendChild(switchRow(t('parents.unlock_all_phases'), save.settings.unlockAllPhases, (on) => {
    save.settings.unlockAllPhases = on; persist(true);
  }, t('parents.unlock_all_phases_hint')));

  // Pausa vacanza
  p.appendChild(switchRow(t('parents.vacation_mode'), save.settings.vacation, (on) => {
    save.settings.vacation = on; persist(true);
  }, t('parents.vacation_hint')));

  // Email Kindle
  const mail = document.createElement('input');
  mail.type = 'email';
  mail.value = save.settings.kindleEmail || '';
  mail.placeholder = 'nome@kindle.com';
  mail.oninput = () => { save.settings.kindleEmail = mail.value.trim(); persist(); };
  p.appendChild(field(t('parents.kindle_email_label'), mail, t('parents.kindle_email_hint')));

  // Cambio PIN
  const pinBtn = el('button', 'btn btn-ghost', t('parents.pin_change'));
  pinBtn.onclick = () => renderPinPad(t('parents.pin_setup_title'), t('parents.pin_setup_hint'), async (pin) => {
    await setPin(pin);
    renderDashboard();
    return true;
  });
  p.appendChild(pinBtn);

  // Stato audio pre-generato
  const audioBox = el('div', 'card-box');
  audioBox.appendChild(el('h3', null, t('parents.audio_status')));
  audioBox.appendChild(el('div', 'hint',
    `${audioIndex.files.size} ${t('parents.audio_files')}. ${t('parents.audio_fallback')}`));
  audioBox.appendChild(el('div', 'hint', `Versione app ${CONFIG.appVersion} · contenuti ${content.raw?.contentVersion || '?'}`));
  p.appendChild(audioBox);

  return p;
}

/* ------------------------------------------------------------------ */
/* Pannello: progressi                                                 */
/* ------------------------------------------------------------------ */

function stat(value, label) {
  const s = el('div', 'stat');
  s.appendChild(el('b', null, String(value)));
  s.appendChild(el('span', null, label));
  return s;
}

function panelProgress() {
  const p = el('div', 'panel');

  const grid = el('div', 'stat-grid');
  grid.appendChild(stat(save.streak.current, t('parents.stats_streak')));
  grid.appendChild(stat(save.streak.best, t('parents.stats_best_streak')));
  grid.appendChild(stat(masteredCount(), t('parents.stats_mastered')));
  grid.appendChild(stat(seenCount(), t('parents.stats_seen')));
  const acc = overallAccuracy();
  grid.appendChild(stat(acc === null ? '—' : `${acc}%`, t('parents.stats_accuracy')));
  grid.appendChild(stat(save.stats.totalRounds, t('parents.stats_sessions')));
  grid.appendChild(stat(Math.round(save.stats.totalMinutes), t('parents.stats_minutes')));
  p.appendChild(grid);

  // Curriculum: avanzamento per fase, con la soglia che apre la successiva
  const cfg = curriculumConfig();
  const curr = el('div', 'card-box');
  curr.appendChild(el('h3', null, t('parents.curriculum_title')));
  curr.appendChild(el('div', 'hint', t('parents.curriculum_intro')));
  curr.appendChild(el('div', 'hint',
    `${t('parents.phase_threshold_label')}: ${Math.round(cfg.phaseUnlockRatio * 100)}%`));
  curr.appendChild(el('div', 'hint', t('parents.mastery_explained')));

  playablePhases().forEach(phase => {
    const info = getPhase(phase);
    const pr = phaseProgress(phase);

    const box = el('div', 'phase-report');
    const head = el('div', 'phase-report-head');
    head.appendChild(el('b', null, `${t('ui.phase_label')} ${phase} — ${info?.title_it || ''}`));
    head.appendChild(el('span', 'badge ' + (pr.reached ? 'badge-sent' : 'badge-todo'),
      `${pr.mastered}/${pr.total} · ${Math.round(pr.ratio * 100)}%`));
    box.appendChild(head);
    if (info?.goal_it) box.appendChild(el('div', 'hint', info.goal_it));

    const ul = el('ul', 'list-plain');
    content.worlds.filter(w => w.phase === phase).forEach(w => {
      const u = unitProgress(w);
      const li = el('li');
      const line = el('div');
      line.appendChild(el('b', null, `${w.unit}. ${w.title_it}`));
      line.appendChild(el('span', 'hint',
        `  ${u.done}/${u.total} incontrate · ${u.mastered}/${u.total} ${t('ui.mastered_label')}`));
      li.appendChild(line);
      if (w.objective_it) {
        li.appendChild(el('div', 'hint', `${t('parents.objective_label')}: ${w.objective_it}`));
      }
      const st = structuresOf(w).map(x => x.pattern).join('  ·  ');
      if (st) li.appendChild(el('div', 'hint mono', `${t('parents.structure_label')}: ${st}`));
      if (u.completed) li.appendChild(el('span', 'badge badge-sent', ' completata'));
      ul.appendChild(li);
    });
    box.appendChild(ul);
    curr.appendChild(box);
  });
  p.appendChild(curr);

  // Parole piu' difficili: utile per ripassare insieme a voce
  const hard = hardestItems(6);
  if (hard.length) {
    const box = el('div', 'card-box');
    box.appendChild(el('h3', null, t('parents.stats_difficult')));
    const list = el('ul', 'list-plain');
    hard.forEach(h => {
      const item = getItem(h.id);
      if (!item) return;
      list.appendChild(el('li', null, `${item.en} (${item.it}) — ${h.wrong} errori`));
    });
    box.appendChild(list);
    p.appendChild(box);
  }

  return p;
}

/* ------------------------------------------------------------------ */
/* Pannello: mini-ebook (fase 4)                                       */
/* ------------------------------------------------------------------ */

const EBOOK_STATUS = {
  todo: 'parents.ebooks_status_todo',
  generated: 'parents.ebooks_status_generated',
  sent: 'parents.ebooks_status_sent'
};

function ebookUnlocked(ebook) {
  if (!ebook.unlockAfterWorld) return true;
  const w = content.worldById.get(ebook.unlockAfterWorld);
  return Boolean(w && unitProgress(w).completed);
}

/**
 * Costruisce il prompt di generazione del mini-ebook.
 * L'idea e' che resti un graded reader vero: solo vocabolario gia' sbloccato
 * nel gioco, pochissime parole nuove per pagina, frasi cortissime.
 */
function buildEbookPrompt(ebook) {
  const vocab = (ebook.vocabularyUsed || [])
    .map(getItem)
    .filter(Boolean)
    .map(i => `${i.en} (${i.it})`);

  // Tutto il vocabolario che il bambino ha gia' incontrato nel gioco.
  const known = Object.keys(save.progress.srs)
    .map(getItem)
    .filter(Boolean)
    .map(i => i.en);

  return [
    `Scrivi un mini-ebook in inglese per un bambino di 7 anni, in stile graded reader.`,
    ``,
    `Titolo: "${ebook.title}"`,
    `Trama: ${ebook.synopsis_it}`,
    `Lunghezza: circa ${ebook.targetWords} parole totali.`,
    `Massimo ${ebook.newWordsPerPage} parola nuova per pagina.`,
    ``,
    `Vocabolario obbligatorio da usare e ripetere piu' volte:`,
    vocab.map(v => `- ${v}`).join('\n'),
    ``,
    `Vocabolario gia' noto al bambino (puoi usarlo liberamente):`,
    known.length ? known.join(', ') : '(nessuno ancora)',
    ``,
    `Regole:`,
    `- frasi cortissime (massimo 6 parole), una o due per pagina;`,
    `- ripeti volutamente le stesse strutture per consolidare;`,
    `- tema fantasy/avventura coerente col gioco (draghi, dinosauri, creature magiche originali);`,
    `- tono positivo, nessuna paura, nessun pericolo reale;`,
    `- indica per ogni pagina una breve descrizione dell'illustrazione;`,
    `- output in formato Markdown, una pagina per sezione.`
  ].join('\n');
}

function panelEbooks() {
  const p = el('div', 'panel');
  p.appendChild(el('p', 'hint', t('parents.ebooks_intro')));

  content.ebooks.forEach(ebook => {
    const rec = save.ebooks[ebook.id] || { status: 'todo' };
    const unlocked = ebookUnlocked(ebook);

    const box = el('div', 'card-box');
    const head = el('div');
    head.style.display = 'flex';
    head.style.justifyContent = 'space-between';
    head.style.gap = '10px';
    head.appendChild(el('h3', null, `${ebook.order}. ${ebook.title}`));

    const badgeCls = !unlocked ? 'badge badge-locked'
      : rec.status === 'sent' ? 'badge badge-sent'
      : rec.status === 'generated' ? 'badge badge-generated' : 'badge badge-todo';
    head.appendChild(el('span', badgeCls,
      unlocked ? t(EBOOK_STATUS[rec.status] || EBOOK_STATUS.todo) : t('parents.ebooks_locked')));
    box.appendChild(head);

    box.appendChild(el('div', 'hint', ebook.synopsis_it));
    box.appendChild(el('div', 'hint',
      `Vocabolario: ${(ebook.vocabularyUsed || []).map(id => getItem(id)?.en).filter(Boolean).join(', ')}`));

    if (unlocked) {
      const row = el('div', 'row');

      const copy = el('button', 'btn btn-ghost btn-parent-small', t('parents.ebooks_copy_prompt'));
      copy.onclick = async () => {
        const text = buildEbookPrompt(ebook);
        try {
          await navigator.clipboard.writeText(text);
          copy.textContent = t('parents.ebooks_prompt_copied');
        } catch {
          // Se la clipboard non e' disponibile si mostra il testo da copiare a mano.
          const pre = el('pre', 'code-hint', text);
          pre.style.whiteSpace = 'pre-wrap';
          box.appendChild(pre);
        }
        setTimeout(() => { copy.textContent = t('parents.ebooks_copy_prompt'); }, 2500);
      };
      row.appendChild(copy);

      const select = document.createElement('select');
      [['todo', EBOOK_STATUS.todo], ['generated', EBOOK_STATUS.generated], ['sent', EBOOK_STATUS.sent]]
        .forEach(([value, key]) => {
          const o = document.createElement('option');
          o.value = value;
          o.textContent = t(key);
          if (rec.status === value) o.selected = true;
          select.appendChild(o);
        });
      select.onchange = () => {
        save.ebooks[ebook.id] = { status: select.value, updatedAt: new Date().toISOString() };
        persist(true);
        renderDashboard();
      };
      row.appendChild(select);
      box.appendChild(row);

      if (save.settings.kindleEmail) {
        box.appendChild(el('div', 'hint', `Invio a: ${save.settings.kindleEmail}`));
      }
    }

    p.appendChild(box);
  });

  return p;
}

/* ------------------------------------------------------------------ */
/* Pannello: cartoni e film (fase 5)                                   */
/* ------------------------------------------------------------------ */

function panelMedia() {
  const p = el('div', 'panel');
  p.appendChild(el('p', 'hint', t('parents.media_intro')));
  content.media.forEach(m => {
    const box = el('div', 'card-box');
    box.appendChild(el('h3', null, m.title));
    box.appendChild(el('div', 'hint', m.level_it || ''));
    box.appendChild(el('div', 'hint', m.note || ''));
    p.appendChild(box);
  });
  return p;
}

/* ------------------------------------------------------------------ */
/* Pannello: dati e backup                                             */
/* ------------------------------------------------------------------ */

function panelData() {
  const p = el('div', 'panel');

  const box = el('div', 'card-box');
  box.appendChild(el('h3', null, t('parents.export')));
  box.appendChild(el('div', 'hint', t('parents.export_hint')));
  const exp = el('button', 'btn btn-parent-small', t('parents.export'));
  exp.onclick = () => exportSaveFile();
  box.appendChild(exp);
  p.appendChild(box);

  const importBox = el('div', 'card-box');
  importBox.appendChild(el('h3', null, t('parents.import')));
  const file = document.createElement('input');
  file.type = 'file';
  file.accept = 'application/json,.json';
  file.style.display = 'none';
  const msg = el('div', 'hint', '');
  file.onchange = async () => {
    const f = file.files?.[0];
    if (!f) return;
    if (!confirm(t('parents.import_confirm'))) { file.value = ''; return; }
    const ok = await importSaveFile(f);
    msg.textContent = ok ? t('parents.import_ok') : t('parents.import_error');
    if (ok) setTimeout(() => location.reload(), 900);
  };
  const imp = el('button', 'btn btn-ghost btn-parent-small', t('parents.import'));
  imp.onclick = () => file.click();
  importBox.appendChild(imp);
  importBox.appendChild(file);
  importBox.appendChild(msg);
  p.appendChild(importBox);

  const dangerBox = el('div', 'card-box');
  dangerBox.appendChild(el('h3', null, t('parents.reset')));
  const reset = el('button', 'btn btn-ghost btn-parent-small', t('parents.reset'));
  reset.onclick = () => {
    if (!confirm(t('parents.reset_confirm'))) return;
    resetSave();
    location.reload();
  };
  dangerBox.appendChild(reset);
  p.appendChild(dangerBox);

  // Nota sulla privacy: e' un'informazione utile, non un dettaglio legale.
  const privacy = el('div', 'card-box');
  privacy.appendChild(el('h3', null, 'Privacy'));
  privacy.appendChild(el('div', 'hint',
    "Tutti i dati (nome, progressi, impostazioni) restano su questo dispositivo, " +
    "dentro il browser. Il gioco non invia nulla a nessun server: gli audio sono " +
    "file gia' presenti nel progetto, generati una volta sola offline. " +
    "Nessuna pubblicita', nessun tracciamento, nessun contenuto esterno."));
  p.appendChild(privacy);

  return p;
}
