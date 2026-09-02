/**
 * Effetti visivi di feedback.
 *
 * Tre varianti diverse per la risposta giusta (coriandoli, pioggia di stelle,
 * onda di scintille) che ruotano a ogni risposta: in un uso quotidiano la
 * stessa animazione ripetuta stanca in fretta.
 *
 * Tutto su un unico canvas a tutto schermo che non intercetta i tocchi.
 */

const COLORS = ['#ffb02e', '#ff7a4d', '#22c55e', '#38bdf8', '#a855f7', '#facc15', '#f472b6'];

let canvas = null;
let ctx = null;
let particles = [];
let running = false;
let reduceMotion = false;

export function initEffects() {
  canvas = document.getElementById('fx-canvas');
  if (!canvas) return;
  ctx = canvas.getContext('2d');
  reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  resize();
  window.addEventListener('resize', resize, { passive: true });
}

function resize() {
  if (!canvas) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function spawn(list) {
  if (reduceMotion) return;
  particles.push(...list);
  if (!running) { running = true; requestAnimationFrame(tick); }
}

function tick() {
  if (!ctx) { running = false; return; }
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  particles = particles.filter(p => p.life > 0);
  for (const p of particles) {
    p.life -= 1;
    p.x += p.vx;
    p.y += p.vy;
    p.vy += p.gravity;
    p.vx *= 0.99;
    p.rot += p.vr;

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.fade));
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.fillStyle = p.color;
    if (p.shape === 'star') drawStar(ctx, p.size);
    else if (p.shape === 'circle') { ctx.beginPath(); ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2); ctx.fill(); }
    else ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
    ctx.restore();
  }

  if (particles.length) requestAnimationFrame(tick);
  else { running = false; ctx.clearRect(0, 0, canvas.width, canvas.height); }
}

function drawStar(c, size) {
  const spikes = 5, outer = size / 2, inner = outer * 0.45;
  c.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI / spikes) * i - Math.PI / 2;
    c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  c.closePath();
  c.fill();
}

function base(x, y) {
  return {
    x, y, rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
    color: COLORS[(Math.random() * COLORS.length) | 0],
    size: 8 + Math.random() * 10,
    gravity: 0.22, life: 70, fade: 70, shape: 'rect'
  };
}

/** Variante 0: coriandoli che esplodono dal punto toccato. */
export function burstConfetti(x, y) {
  const list = [];
  for (let i = 0; i < 34; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 3 + Math.random() * 7;
    list.push({ ...base(x, y), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 3 });
  }
  spawn(list);
}

/** Variante 1: pioggia di stelle dall'alto. */
export function starShower() {
  const list = [];
  for (let i = 0; i < 26; i++) {
    list.push({
      ...base(Math.random() * window.innerWidth, -20 - Math.random() * 120),
      vx: (Math.random() - 0.5) * 1.6, vy: 2 + Math.random() * 3,
      gravity: 0.05, shape: 'star', size: 12 + Math.random() * 12,
      life: 120, fade: 120
    });
  }
  spawn(list);
}

/** Variante 2: onda di bollicine che sale dal basso. */
export function bubbleWave() {
  const list = [];
  for (let i = 0; i < 30; i++) {
    list.push({
      ...base(Math.random() * window.innerWidth, window.innerHeight + 20),
      vx: (Math.random() - 0.5) * 1.2, vy: -(2.5 + Math.random() * 3),
      gravity: -0.02, shape: 'circle', size: 10 + Math.random() * 16,
      life: 100, fade: 100
    });
  }
  spawn(list);
}

/** Effetto grande per lo sblocco di una creatura. */
export function celebrate() {
  burstConfetti(window.innerWidth / 2, window.innerHeight * 0.4);
  setTimeout(starShower, 160);
}

/**
 * Ruota fra le tre varianti.
 * @param {number} index contatore delle risposte corrette
 * @param {{x:number,y:number}} [origin] punto toccato
 */
export function celebrateCorrect(index, origin) {
  const variant = index % 3;
  if (variant === 0) burstConfetti(origin?.x ?? window.innerWidth / 2, origin?.y ?? window.innerHeight / 2);
  else if (variant === 1) starShower();
  else bubbleWave();
}

/* ------------------------------------------------------------------ */
/* Messaggio a comparsa                                                */
/* ------------------------------------------------------------------ */

let toastTimer = null;

export function toast(text, good = true, ms = 1500) {
  const old = document.querySelector('.feedback-toast');
  old?.remove();
  clearTimeout(toastTimer);

  const el = document.createElement('div');
  el.className = 'feedback-toast' + (good ? ' is-good' : '');
  el.textContent = text;
  document.body.appendChild(el);
  toastTimer = setTimeout(() => el.remove(), ms);
}
