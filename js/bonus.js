/**
 * I giochi bonus: brevi, rari, senza game over. Un premio contro la
 * monotonia, con l'inglese dentro in modo passivo.
 *
 * "Bolle": le bolle salgono e rimbalzano con dentro le illustrazioni; la
 * voce dice una parola, si scoppia la bolla giusta. Sbagliare non costa
 * nulla: la bolla trema e basta. Dopo 45 secondi, "Fine!".
 *
 * Il modello (BubbleWorld) e' separato dal disegno, cosi' si testa senza
 * browser vero. Altri giochini possono entrare con lo stesso contratto:
 * play({ items, showWritten }) che si risolve a fine partita.
 */

import { CONFIG } from './config.js';
import { t, artIndex, getItem } from './content-loader.js';
import { save, persist } from './state.js';
import { spriteSvg, audioOrb } from './minigames.js';
import { speakItem, sfxCorrect, sfxTap, stopVoice } from './audio.js';
import { burstConfetti } from './effects.js';
import { mascotSay, renderMascot } from './mascot.js';
import { showScreen } from './screens.js';

/* ------------------------------------------------------------------ */
/* Quando scatta (puro)                                                */
/* ------------------------------------------------------------------ */

/**
 * @param {number} stars stelle della partita appena finita (1-3)
 * @param {{roundsSince:number, todayCount:number, poolSize:number, cfg?:object}} o
 */
export function planBonus(stars, o) {
  const cfg = o.cfg || CONFIG.bonus;
  if (stars < 3) return false;
  if (o.roundsSince < cfg.everyRounds) return false;
  if (o.todayCount >= cfg.perDay) return false;
  if (o.poolSize < cfg.minPool) return false;
  return true;
}

/** Le parole di un gruppo che hanno un PNG (le bolle si disegnano su canvas). */
export function bubblePool(items, extra = []) {
  const seen = new Set();
  const out = [];
  for (const raw of [...items, ...extra]) {
    // content.words non porta `kind`: lo ha la copia in byId. Si normalizza.
    const it = raw && (getItem(raw.id) || raw);
    if (!it || it.kind !== 'word') continue;
    if (!artIndex.sprites.has(it.sprite) || seen.has(it.sprite)) continue;
    seen.add(it.sprite);
    out.push(it);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Quale gioco (puro)                                                  */
/* ------------------------------------------------------------------ */

export const BONUS_GAMES = ['bubbles', 'moles', 'basket'];

/** A caso fra i giochi, senza ripetere l'ultimo giocato. */
export function pickBonus(last, rng = Math.random) {
  const scelte = BONUS_GAMES.filter(g => g !== last);
  return scelte[Math.floor(rng() * scelte.length)] || BONUS_GAMES[0];
}

/* ------------------------------------------------------------------ */
/* Spunta!: il modello                                                 */
/* ------------------------------------------------------------------ */

/**
 * Nove buchi; le figure spuntano una alla volta, restano un attimo e
 * rientrano. Il bersaglio ricompare entro `guarantee` spunte: l'attesa
 * non deve mai diventare lunga.
 */
export class MoleWorld {
  constructor({ w, h, items, rng = Math.random, guarantee = 2 }) {
    this.w = w; this.h = h; this.items = items; this.rng = rng; this.guarantee = guarantee;
    this.holes = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      this.holes.push({ i: r * 3 + c, cx: (c + 0.5) / 3, cy: 0.22 + r * 0.3, mole: null });
    }
    this.target = null;
    this.sinceTarget = 0;
    this.clock = 0;
    this.nextPop = 0.4;
    this.interval = 0.95;
    this.upTime = 1.15;
  }

  freeHoles() { return this.holes.filter(h => !h.mole); }

  /** Fa spuntare qualcosa: il bersaglio se e' ora, altrimenti una figura a caso. */
  next() {
    const free = this.freeHoles();
    if (!free.length) return null;
    const hole = free[Math.floor(this.rng() * free.length)];
    const visibleTarget = this.holes.some(h => h.mole && h.mole.item === this.target);
    let item;
    if (this.target && !visibleTarget && (this.sinceTarget >= this.guarantee - 1 || this.rng() < 0.45)) {
      item = this.target;
      this.sinceTarget = 0;
    } else {
      const others = this.items.filter(it => it !== this.target);
      item = others[Math.floor(this.rng() * others.length)] || this.target;
      this.sinceTarget += 1;
    }
    hole.mole = { item, t: 0, up: 0, done: false, wobble: 0 };
    return hole;
  }

  step(dt) {
    this.clock += dt;
    if (this.clock >= this.nextPop) {
      this.next();
      this.nextPop = this.clock + this.interval;
      this.interval = Math.max(0.6, this.interval * 0.985);   // piano piano piu' svelto
    }
    for (const h of this.holes) {
      const m = h.mole;
      if (!m) continue;
      m.t += dt;
      const rise = 0.22;
      if (m.t < rise) m.up = m.t / rise;
      else if (m.t < rise + this.upTime) m.up = 1;
      else m.up = Math.max(0, 1 - (m.t - rise - this.upTime) / rise);
      if (m.t > rise * 2 + this.upTime) h.mole = null;
      if (m.wobble > 0) m.wobble = Math.max(0, m.wobble - dt * 3);
    }
  }

  /** Raggio di una figura, in pixel. */
  radius() { return Math.min(this.w / 3, this.h / 3.4) * 0.36; }

  /** La figura spuntata sotto il dito (solo se e' fuori dal buco). */
  hit(x, y) {
    const r = this.radius();
    for (const h of this.holes) {
      const m = h.mole;
      if (!m || m.up < 0.5) continue;
      const cx = h.cx * this.w, cy = h.cy * this.h - r * m.up;
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy <= (r * 1.15) ** 2) return h;
    }
    return null;
  }

  /** Presa: la figura scompare subito. */
  take(hole) { hole.mole = null; }

  setTarget(item) { this.target = item; this.sinceTarget = 0; }
}

/* ------------------------------------------------------------------ */
/* Il modello                                                          */
/* ------------------------------------------------------------------ */

export class BubbleWorld {
  constructor({ w, h, rng = Math.random }) {
    this.w = w; this.h = h; this.rng = rng;
    this.r = Math.max(34, Math.min(w, h) * 0.1);
    this.bubbles = [];
    this.seq = 0;
  }

  spawn(item) {
    const r = this.r;
    const b = {
      id: ++this.seq, item, r,
      x: r + this.rng() * Math.max(1, this.w - 2 * r),
      y: this.h + r,                       // entra dal basso
      vx: (this.rng() - 0.5) * 90,
      vy: -(55 + this.rng() * 35),
      wobble: 0
    };
    this.bubbles.push(b);
    return b;
  }

  /** Avanza di dt secondi: le bolle rimbalzano sulle quattro pareti. */
  step(dt) {
    for (const b of this.bubbles) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx); }
      if (b.x > this.w - b.r) { b.x = this.w - b.r; b.vx = -Math.abs(b.vx); }
      if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy); }
      if (b.y > this.h - b.r && b.vy > 0) { b.y = this.h - b.r; b.vy = -Math.abs(b.vy); }
      if (b.wobble > 0) b.wobble = Math.max(0, b.wobble - dt * 3);
    }
  }

  /** La bolla sotto il dito, quella disegnata sopra alle altre. */
  hit(x, y) {
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i];
      const dx = x - b.x, dy = y - b.y;
      if (dx * dx + dy * dy <= b.r * b.r) return b;
    }
    return null;
  }

  pop(id) {
    this.bubbles = this.bubbles.filter(b => b.id !== id);
  }

  resize(w, h) {
    const k = this.r;
    this.w = w; this.h = h;
    this.r = Math.max(34, Math.min(w, h) * 0.1);
    for (const b of this.bubbles) { b.r = this.r; b.x = (b.x / k) * this.r; }
  }
}

/* ------------------------------------------------------------------ */
/* Il gioco sullo schermo                                              */
/* ------------------------------------------------------------------ */

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

function loadImage(sprite) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = `${CONFIG.artBase}${sprite}.png`;
  });
}

/**
 * Gioca a "Bolle". Si risolve a fine partita (o al salta) con il punteggio.
 * @param {{items:Array, showWritten:boolean, seconds?:number, rng?:()=>number}} o
 */
export async function playBubbles(o) {
  const items = o.items.slice(0, 6);
  const seconds = o.seconds ?? CONFIG.bonus.seconds;
  const rng = o.rng || Math.random;
  const stage = document.getElementById('bonus-stage');
  const canvas = document.getElementById('bonus-canvas');
  const target = document.getElementById('bonus-target');
  const scoreEl = document.getElementById('bonus-score');
  const timeEl = document.getElementById('bonus-time');
  const end = document.getElementById('bonus-end');
  const skip = document.getElementById('bonus-skip');
  const ctx = canvas.getContext('2d');
  end.hidden = true; end.innerHTML = '';
  scoreEl.textContent = '0';
  timeEl.style.width = '100%';
  showScreen('bonus');

  const images = new Map(await Promise.all(items.map(async it => [it.sprite, await loadImage(it.sprite)])));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const fit = () => {
    const r = stage.getBoundingClientRect();
    canvas.width = Math.floor(r.width * dpr); canvas.height = Math.floor(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return r;
  };
  let rect = fit();
  const world = new BubbleWorld({ w: rect.width, h: rect.height, rng });
  for (const it of items) world.spawn(it);
  // Sparpagliate all'inizio, non tutte sul fondo.
  for (const b of world.bubbles) b.y = b.r + rng() * (world.h - 2 * b.r);
  const onResize = () => { rect = fit(); world.resize(rect.width, rect.height); };
  window.addEventListener('resize', onResize);

  let score = 0;
  let current = null;
  let finished = false;
  let orb = null;
  const say = (it) => { stopVoice(); speakItem(it); };
  const nextTarget = () => {
    const alive = world.bubbles.map(b => b.item);
    const scelte = alive.filter(it => it !== current);
    current = scelte[Math.floor(rng() * scelte.length)] || alive[0];
    target.innerHTML = '';
    orb = audioOrb(current);
    target.appendChild(orb);
    if (o.showWritten) target.appendChild(el('p', 'word-written', current.en));
    else target.appendChild(el('p', 'game-prompt', t('bonus.bubbles_prompt')));
    say(current);
  };

  const draw = () => {
    ctx.clearRect(0, 0, rect.width, rect.height);
    for (const b of world.bubbles) {
      const s = 1 + Math.sin(b.wobble * 12) * 0.08 * b.wobble;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.scale(s, 1 / s);
      const g = ctx.createRadialGradient(-b.r * 0.35, -b.r * 0.35, b.r * 0.1, 0, 0, b.r);
      g.addColorStop(0, 'rgba(255,255,255,.55)');
      g.addColorStop(0.6, 'rgba(180,220,255,.22)');
      g.addColorStop(1, 'rgba(120,180,255,.35)');
      ctx.beginPath(); ctx.arc(0, 0, b.r, 0, Math.PI * 2);
      ctx.fillStyle = g; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.stroke();
      const img = images.get(b.item.sprite);
      if (img) { const d = b.r * 1.3; ctx.drawImage(img, -d / 2, -d / 2, d, d); }
      ctx.beginPath(); ctx.arc(-b.r * 0.4, -b.r * 0.45, b.r * 0.18, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.fill();
      ctx.restore();
    }
  };

  const t0 = performance.now();
  let last = t0;
  let raf = 0;
  const loop = (now) => {
    if (finished) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    world.step(dt);
    draw();
    const left = Math.max(0, 1 - (now - t0) / (seconds * 1000));
    timeEl.style.width = `${left * 100}%`;
    if (left <= 0) { fine(); return; }
    raf = requestAnimationFrame(loop);
  };

  const onTap = (ev) => {
    if (finished) return;
    const r = canvas.getBoundingClientRect();
    const b = world.hit(ev.clientX - r.left, ev.clientY - r.top);
    if (!b) return;
    if (b.item === current) {
      score += 1; scoreEl.textContent = String(score);
      sfxCorrect(score % 3);
      burstConfetti(ev.clientX, ev.clientY);
      world.pop(b.id);
      world.spawn(b.item);   // la stessa parola rientra dal basso: il gruppo resta
      nextTarget();
    } else {
      sfxTap();
      b.wobble = 1;
      b.vy = -Math.abs(b.vy) - 40;
    }
  };
  canvas.addEventListener('pointerdown', onTap);

  let risolvi;
  const done = new Promise(res => { risolvi = res; });
  const fine = () => {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(raf);
    canvas.removeEventListener('pointerdown', onTap);
    window.removeEventListener('resize', onResize);
    skip.onclick = null;
    stopVoice();
    save.stats.bonusPlayed = (save.stats.bonusPlayed || 0) + 1;
    save.daily.bonusCount = (save.daily.bonusCount || 0) + 1;
    persist(true);
    end.innerHTML = '';
    end.appendChild(el('p', 'h-title', t('bonus.done')));
    end.appendChild(el('p', 'h-sub', t('bonus.popped').replace('{n}', score)));
    const go = el('button', 'btn btn-lg', t('ui.continue_button'));
    end.appendChild(go);
    end.hidden = false;
    mascotSay('bonus_end', {});
    go.onclick = () => { sfxTap(); stopVoice(); risolvi({ popped: score }); };
  };
  skip.onclick = () => { sfxTap(); fine(); };

  // Espone il mondo per le prove automatiche (niente di sensibile).
  playBubbles.world = world;
  nextTarget();
  raf = requestAnimationFrame(loop);
  return done;
}


/* ------------------------------------------------------------------ */
/* Il cestino: il modello                                              */
/* ------------------------------------------------------------------ */

/**
 * Le figure cadono dall'alto; sotto c'e' un cestino che si trascina a
 * destra e a sinistra. Si prende solo quella detta dalla voce: le altre
 * rimbalzano via dal bordo del cestino senza costare nulla. E' il gioco
 * col controllo continuo che manca a Bolle e Spunta.
 */
export class BasketWorld {
  constructor({ w, h, items, rng = Math.random }) {
    this.w = w; this.h = h; this.items = items; this.rng = rng;
    this.falling = [];
    this.basket = { x: w / 2, w: Math.max(120, Math.min(w * 0.26, 220)), h: 26 };
    this.target = null;
    this.clock = 0;
    this.nextDrop = 0.5;
    this.interval = 1.25;
    this.speed = Math.max(90, h * 0.22);
    this.sinceTarget = 0;
    this.seq = 0;
  }

  radius() { return Math.max(34, Math.min(this.w, this.h) * 0.1); }

  /** Lascia cadere una figura: il bersaglio entro due cadute, altrimenti a caso. */
  drop() {
    const r = this.radius();
    const visibleTarget = this.falling.some(f => f.item === this.target);
    let item;
    if (this.target && !visibleTarget && (this.sinceTarget >= 1 || this.rng() < 0.45)) { item = this.target; this.sinceTarget = 0; }
    else { const others = this.items.filter(it => it !== this.target); item = others[Math.floor(this.rng() * others.length)] || this.target; this.sinceTarget += 1; }
    const f = { id: ++this.seq, item, x: r + this.rng() * Math.max(1, this.w - 2 * r), y: -r, r, vy: this.speed * (0.85 + this.rng() * 0.3), bounced: false };
    this.falling.push(f);
    return f;
  }

  moveBasket(x) { this.basket.x = Math.min(this.w - this.basket.w / 2, Math.max(this.basket.w / 2, x)); }

  /** Avanza di dt secondi; restituisce le figure che sono entrate nel cestino. */
  step(dt) {
    this.clock += dt;
    if (this.clock >= this.nextDrop) { this.drop(); this.nextDrop = this.clock + this.interval; this.interval = Math.max(0.8, this.interval * 0.985); }
    const caught = [];
    const top = this.h - this.basket.h - 10;
    for (const f of this.falling) {
      f.y += f.vy * dt;
      const inX = Math.abs(f.x - this.basket.x) < this.basket.w / 2;
      if (!f.bounced && f.y + f.r >= top && f.y < top + this.basket.h && inX) {
        if (f.item === this.target) caught.push(f);
        else { f.bounced = true; f.vy = -f.vy * 0.5; f.vx = (f.x < this.basket.x ? -1 : 1) * 120; }
      }
      if (f.bounced) { f.x += (f.vx || 0) * dt; f.vy += 500 * dt; }
    }
    this.falling = this.falling.filter(f => !caught.includes(f) && f.y - f.r < this.h + 40);
    return caught;
  }

  setTarget(item) { this.target = item; this.sinceTarget = 0; }
}

/* ------------------------------------------------------------------ */
/* Spunta!: il gioco sullo schermo                                     */
/* ------------------------------------------------------------------ */

export async function playMoles(o) {
  const items = o.items.slice(0, 6);
  const seconds = o.seconds ?? CONFIG.bonus.seconds;
  const rng = o.rng || Math.random;
  const stage = document.getElementById('bonus-stage');
  const canvas = document.getElementById('bonus-canvas');
  const target = document.getElementById('bonus-target');
  const scoreEl = document.getElementById('bonus-score');
  const timeEl = document.getElementById('bonus-time');
  const end = document.getElementById('bonus-end');
  const skip = document.getElementById('bonus-skip');
  const ctx = canvas.getContext('2d');
  end.hidden = true; end.innerHTML = '';
  scoreEl.textContent = '0';
  timeEl.style.width = '100%';
  showScreen('bonus');

  const images = new Map(await Promise.all(items.map(async it => [it.sprite, await loadImage(it.sprite)])));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const fit = () => {
    const r = stage.getBoundingClientRect();
    canvas.width = Math.floor(r.width * dpr); canvas.height = Math.floor(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return r;
  };
  let rect = fit();
  const world = new MoleWorld({ w: rect.width, h: rect.height, items, rng });
  const onResize = () => { rect = fit(); world.w = rect.width; world.h = rect.height; };
  window.addEventListener('resize', onResize);

  let score = 0;
  let current = null;
  let finished = false;
  const nextTarget = () => {
    const scelte = items.filter(it => it !== current);
    current = scelte[Math.floor(rng() * scelte.length)] || items[0];
    world.setTarget(current);
    target.innerHTML = '';
    target.appendChild(audioOrb(current));
    if (o.showWritten) target.appendChild(el('p', 'word-written', current.en));
    else target.appendChild(el('p', 'game-prompt', t('bonus.moles_prompt')));
    stopVoice(); speakItem(current);
  };

  const draw = () => {
    ctx.clearRect(0, 0, rect.width, rect.height);
    const r = world.radius();
    for (const h of world.holes) {
      const cx = h.cx * rect.width, cy = h.cy * rect.height;
      // il retro del buco
      ctx.beginPath(); ctx.ellipse(cx, cy, r * 1.25, r * 0.42, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#17123A'; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.stroke();
      const m = h.mole;
      if (m && m.up > 0) {
        const img = images.get(m.item.sprite);
        const d = r * 2;
        const y = cy - r * m.up;
        ctx.save();
        // si vede solo cio' che sta sopra la meta' del buco
        ctx.beginPath(); ctx.rect(cx - d, cy - d * 2, d * 2, d * 2 + r * 0.05); ctx.clip();
        const s = 1 + Math.sin(m.wobble * 12) * 0.08 * m.wobble;
        ctx.translate(cx, y); ctx.scale(s, 1 / s);
        if (img) ctx.drawImage(img, -d / 2, -d / 2, d, d);
        ctx.restore();
      }
      // il bordo davanti del buco
      ctx.beginPath(); ctx.ellipse(cx, cy, r * 1.25, r * 0.42, 0, 0, Math.PI);
      ctx.fillStyle = '#2B2140'; ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx, cy, r * 1.25, r * 0.42, 0, 0, Math.PI * 2);
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.stroke();
    }
  };

  const t0 = performance.now();
  let last = t0;
  let raf = 0;
  const loop = (now) => {
    if (finished) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    world.step(dt);
    draw();
    const left = Math.max(0, 1 - (now - t0) / (seconds * 1000));
    timeEl.style.width = `${left * 100}%`;
    if (left <= 0) { fine(); return; }
    raf = requestAnimationFrame(loop);
  };

  const onTap = (ev) => {
    if (finished) return;
    const r = canvas.getBoundingClientRect();
    const h = world.hit(ev.clientX - r.left, ev.clientY - r.top);
    if (!h) return;
    if (h.mole.item === current) {
      score += 1; scoreEl.textContent = String(score);
      sfxCorrect(score % 3);
      burstConfetti(ev.clientX, ev.clientY);
      world.take(h);
      nextTarget();
    } else {
      sfxTap();
      h.mole.wobble = 1;
    }
  };
  canvas.addEventListener('pointerdown', onTap);

  let risolvi;
  const done = new Promise(res => { risolvi = res; });
  const fine = () => {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(raf);
    canvas.removeEventListener('pointerdown', onTap);
    window.removeEventListener('resize', onResize);
    skip.onclick = null;
    stopVoice();
    save.stats.bonusPlayed = (save.stats.bonusPlayed || 0) + 1;
    save.daily.bonusCount = (save.daily.bonusCount || 0) + 1;
    persist(true);
    end.innerHTML = '';
    end.appendChild(el('p', 'h-title', t('bonus.done')));
    end.appendChild(el('p', 'h-sub', t('bonus.hits').replace('{n}', score)));
    const go = el('button', 'btn btn-lg', t('ui.continue_button'));
    end.appendChild(go);
    end.hidden = false;
    mascotSay('bonus_end', {});
    go.onclick = () => { sfxTap(); stopVoice(); risolvi({ popped: score }); };
  };
  skip.onclick = () => { sfxTap(); fine(); };

  playMoles.world = world;
  nextTarget();
  raf = requestAnimationFrame(loop);
  return done;
}

/* ------------------------------------------------------------------ */
/* Il cestino: il gioco sullo schermo                                  */
/* ------------------------------------------------------------------ */

export async function playBasket(o) {
  const items = o.items.slice(0, 6);
  const seconds = o.seconds ?? CONFIG.bonus.seconds;
  const rng = o.rng || Math.random;
  const stage = document.getElementById('bonus-stage');
  const canvas = document.getElementById('bonus-canvas');
  const target = document.getElementById('bonus-target');
  const scoreEl = document.getElementById('bonus-score');
  const timeEl = document.getElementById('bonus-time');
  const end = document.getElementById('bonus-end');
  const skip = document.getElementById('bonus-skip');
  const ctx = canvas.getContext('2d');
  end.hidden = true; end.innerHTML = '';
  scoreEl.textContent = '0';
  timeEl.style.width = '100%';
  showScreen('bonus');

  const images = new Map(await Promise.all(items.map(async it => [it.sprite, await loadImage(it.sprite)])));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const fit = () => {
    const r = stage.getBoundingClientRect();
    canvas.width = Math.floor(r.width * dpr); canvas.height = Math.floor(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return r;
  };
  let rect = fit();
  const world = new BasketWorld({ w: rect.width, h: rect.height, items, rng });
  const onResize = () => { rect = fit(); world.w = rect.width; world.h = rect.height; };
  window.addEventListener('resize', onResize);

  let score = 0;
  let current = null;
  let finished = false;
  const nextTarget = () => {
    const scelte = items.filter(it => it !== current);
    current = scelte[Math.floor(rng() * scelte.length)] || items[0];
    world.setTarget(current);
    target.innerHTML = '';
    target.appendChild(audioOrb(current));
    if (o.showWritten) target.appendChild(el('p', 'word-written', current.en));
    else target.appendChild(el('p', 'game-prompt', t('bonus.basket_prompt')));
    stopVoice(); speakItem(current);
  };

  const draw = () => {
    ctx.clearRect(0, 0, rect.width, rect.height);
    for (const f of world.falling) {
      const img = images.get(f.item.sprite);
      const d = f.r * 2;
      if (img) ctx.drawImage(img, f.x - d / 2, f.y - d / 2, d, d);
    }
    // il cestino: una ciotola ambra col bordo scuro
    const b = world.basket; const by = rect.height - b.h - 10;
    ctx.beginPath();
    ctx.moveTo(b.x - b.w / 2, by); ctx.lineTo(b.x + b.w / 2, by);
    ctx.lineTo(b.x + b.w / 2 - 14, by + b.h + 12); ctx.lineTo(b.x - b.w / 2 + 14, by + b.h + 12); ctx.closePath();
    ctx.fillStyle = '#FFB02E'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = '#2B2140'; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(b.x, by, b.w / 2, 7, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#C9821A'; ctx.fill(); ctx.stroke();
  };

  const t0 = performance.now();
  let last = t0;
  let raf = 0;
  const loop = (now) => {
    if (finished) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const caught = world.step(dt);
    for (const f of caught) {
      score += 1; scoreEl.textContent = String(score);
      sfxCorrect(score % 3);
      const r = canvas.getBoundingClientRect();
      burstConfetti(r.left + f.x, r.top + f.y);
      nextTarget();
    }
    draw();
    const left = Math.max(0, 1 - (now - t0) / (seconds * 1000));
    timeEl.style.width = `${left * 100}%`;
    if (left <= 0) { fine(); return; }
    raf = requestAnimationFrame(loop);
  };

  // Il cestino segue il dito (o il mouse) finche' e' premuto, o anche solo il tocco.
  const onMove = (ev) => {
    if (finished) return;
    const r = canvas.getBoundingClientRect();
    world.moveBasket(ev.clientX - r.left);
  };
  const onDown = (ev) => { onMove(ev); canvas.setPointerCapture?.(ev.pointerId); };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);

  let risolvi;
  const done = new Promise(res => { risolvi = res; });
  const fine = () => {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(raf);
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    window.removeEventListener('resize', onResize);
    skip.onclick = null;
    stopVoice();
    save.stats.bonusPlayed = (save.stats.bonusPlayed || 0) + 1;
    save.daily.bonusCount = (save.daily.bonusCount || 0) + 1;
    persist(true);
    end.innerHTML = '';
    end.appendChild(el('p', 'h-title', t('bonus.done')));
    end.appendChild(el('p', 'h-sub', t('bonus.caught').replace('{n}', score)));
    const go = el('button', 'btn btn-lg', t('ui.continue_button'));
    end.appendChild(go);
    end.hidden = false;
    mascotSay('bonus_end', {});
    go.onclick = () => { sfxTap(); stopVoice(); risolvi({ popped: score }); };
  };
  skip.onclick = () => { sfxTap(); fine(); };

  playBasket.world = world;
  nextTarget();
  raf = requestAnimationFrame(loop);
  return done;
}

/* ------------------------------------------------------------------ */
/* Il dispatcher: quale gioco bonus, e via                             */
/* ------------------------------------------------------------------ */

const GIOCHI = { bubbles: playBubbles, moles: playMoles, basket: playBasket };

/** Sceglie un gioco bonus (mai lo stesso due volte di fila) e lo gioca. */
export async function playBonus(o) {
  const quale = pickBonus(save.stats.lastBonus || '', o.rng);
  save.stats.lastBonus = quale;
  persist();
  return GIOCHI[quale](o);
}
