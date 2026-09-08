/**
 * I dialoghi: dal riconoscere all'usare in uno scambio.
 *
 * La creatura dell'unita' dice una battuta (voce modello), il bambino
 * sceglie fra tre risposte (puo' ascoltarle prima), la creatura reagisce.
 * Una risposta fuori posto riceve un "hmm, riprova" senza costo e resta
 * tutto com'era. E' un albero pre-registrato, non un interlocutore: ma le
 * formule diventano cose che si dicono a qualcuno.
 */

import { content, t } from './content-loader.js';
import { shuffle } from './srs.js';
import { spriteSvg } from './minigames.js';
import { speakLine, stopVoice, sfxTap, sfxCorrect } from './audio.js';
import { mascotSay } from './mascot.js';
import { burstConfetti } from './effects.js';

export function dialogueFor(worldId) {
  return content.dialogues.find(d => d.worldId === worldId) || null;
}

/** Percorsi audio: gli stessi che genera tools/generate-audio.mjs. */
export function lineAudio(dialogue, turn, kind) {
  return turn === null ? `en/dialog.${dialogue.id}.${kind}.mp3` : `en/dialog.${dialogue.id}.${turn}.${kind}.mp3`;
}

/**
 * Decide se una partita dell'unita' finisce col dialogo: sempre le prime
 * due volte, poi una su tre. Puro, per il test.
 */
export function wantsDialogue(plays, rng = Math.random) {
  if (plays < 2) return true;
  return rng() < 0.34;
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

/** Il turno di dialogo, con lo stesso contratto dei mini-giochi. */
export async function gameDialogue(api) {
  const { host, dialogue, onRepeat } = api;
  const creature = content.creatures.find(c => c.id === dialogue.creatureId);
  host.innerHTML = '';
  host.appendChild(el('p', 'game-prompt', t('games.dialogue_prompt')));
  const stage = el('div', 'dlg-stage');
  const who = el('div', 'dlg-creature');
  if (creature) who.appendChild(spriteSvg(creature.sprite));
  const bubble = el('div', 'dlg-bubble');
  const enLine = el('p', 'dlg-en', '');
  const itLine = el('p', 'dlg-it', '');
  bubble.appendChild(enLine); bubble.appendChild(itLine);
  const top = el('div', 'dlg-top');
  top.appendChild(who); top.appendChild(bubble);
  stage.appendChild(top);
  const replies = el('div', 'dlg-replies');
  stage.appendChild(replies);
  host.appendChild(stage);

  await mascotSay('dialogue_start', { avatar: document.getElementById('play-mascot') });

  const say = async (en, it, rel) => {
    enLine.textContent = en; itLine.textContent = it || '';
    who.classList.add('is-speaking');
    stopVoice();
    await speakLine(rel, en, 'en-GB');
    who.classList.remove('is-speaking');
  };

  for (let ti = 0; ti < dialogue.turns.length; ti++) {
    const turn = dialogue.turns[ti];
    replies.innerHTML = '';
    await say(turn.say.en, turn.say.it, lineAudio(dialogue, ti, 'say'));
    const ordine = shuffle(turn.replies.map((r, k) => ({ r, k })));
    await new Promise(resolve => {
      for (const { r, k } of ordine) {
        const btn = el('button', 'choice-text dlg-reply');
        btn.type = 'button';
        const orb = el('span', 'dlg-orb');
        orb.appendChild(spriteSvg('sp-icon-sound'));
        btn.appendChild(orb);
        btn.appendChild(el('span', 'dlg-reply-en', r.en));
        btn.appendChild(el('span', 'dlg-reply-it', r.it));
        // Il piccolo altoparlante fa solo ascoltare; il resto del bottone risponde.
        orb.addEventListener('click', (ev) => { ev.stopPropagation(); sfxTap(); stopVoice(); speakLine(lineAudio(dialogue, ti, `r${k}`), r.en, 'en-GB'); });
        btn.addEventListener('click', async (ev) => {
          sfxTap();
          [...replies.children].forEach(b => { b.disabled = true; });
          if (k === 0) {
            btn.classList.add('is-correct');
            sfxCorrect(ti);
            burstConfetti(ev.clientX, ev.clientY);
            onRepeat?.();
            await speakLine(lineAudio(dialogue, ti, `r${k}`), r.en, 'en-GB');
            await say(turn.good.en, turn.good.it, lineAudio(dialogue, ti, 'good'));
            resolve();
          } else {
            btn.classList.add('is-wrong');
            const h = dialogue.hm[ti % dialogue.hm.length];
            await speakLine(lineAudio(dialogue, ti, `r${k}`), r.en, 'en-GB');
            await say(h.en, '', lineAudio(dialogue, null, `hm${ti % dialogue.hm.length}`));
            btn.classList.remove('is-wrong');
            btn.classList.add('is-dim');
            [...replies.children].forEach(b => { if (!b.classList.contains('is-dim')) b.disabled = false; });
            // La battuta della creatura torna a schermo per rileggerla.
            enLine.textContent = turn.say.en; itLine.textContent = turn.say.it;
          }
        });
        replies.appendChild(btn);
      }
    });
    await new Promise(r => setTimeout(r, 600));
  }
  api.fx?.good?.(null, true, null);
  await mascotSay('correct_2', { avatar: document.getElementById('play-mascot') });
}
