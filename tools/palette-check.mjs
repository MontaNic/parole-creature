#!/usr/bin/env node
/**
 * La palette vista da chi confonde i colori.
 *
 * Legge i token da design-system.css, simula protanopia, deuteranopia e
 * tritanopia (matrici di Machado, Oliveira e Fernandes 2009, severita' 1)
 * e misura due cose:
 *   1. il contrasto WCAG delle coppie testo/fondo che il gioco usa davvero
 *      (soglia 4.5, testo normale; 3 per il testo grande dei bottoni);
 *   2. la distinguibilita' (Delta E in Lab) delle coppie di colori che
 *      portano un significato diverso nella stessa schermata: giusto contro
 *      riprova, giusto contro azione, azione contro riprova.
 * Il colore in questo gioco non e' mai l'unico segnale (c'e' sempre testo,
 * icona o animazione), ma non deve nemmeno tradire.
 *
 * Uso:  node tools/palette-check.mjs      esce con 1 se una soglia salta
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(path.join(ROOT, 'design-system.css'), 'utf8');
const tok = {};
for (const m of css.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)) tok[m[1]] = m[2];
// I token semantici puntano ad altri token (--ring-good: var(--leaf)): si risolvono.
for (const m of css.matchAll(/--([a-z0-9-]+):\s*var\(--([a-z0-9-]+)\)/g)) if (tok[m[2]] && !tok[m[1]]) tok[m[1]] = tok[m[2]];

const hex = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
const lin = (c) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// Machado et al. 2009, severita' 1.0 (RGB lineare)
const SIM = {
  protanopia:   [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
  tritanopia:   [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]]
};
const simulate = (rgb, M) => {
  const l = rgb.map(lin);
  const out = M.map(row => row[0] * l[0] + row[1] * l[1] + row[2] * l[2]);
  return out.map(v => { v = Math.max(0, Math.min(1, v)); return v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055; });
};
const lab = (rgb) => {
  const [r, g, b] = rgb.map(lin);
  let x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  let y = (r * 0.2126 + g * 0.7152 + b * 0.0722);
  let z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = v => v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116;
  [x, y, z] = [f(x), f(y), f(z)];
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
};
const deltaE = (a, b) => { const p = lab(a), q = lab(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };

let problemi = 0;
const ok = (t, d = '') => console.log(`  ok  ${t}${d ? '  — ' + d : ''}`);
const ko = (t, d = '') => { problemi++; console.log(`  KO  ${t}${d ? '  — ' + d : ''}`); };
const c = (name) => hex(tok[name] || name);

/* --- 1. contrasto testo/fondo, in visione normale e simulata --------- */
const coppieTesto = [
  ['ink', 'paper', 4.5, 'testo su carta'],
  ['ink', 'amber', 3.0, 'testo dei bottoni ambra (grande)'],
  ['ink', 'ember', 3.0, 'testo dei bottoni brace (grande)'],
  ['paper', 'night-800', 4.5, 'testo chiaro sul fondo notte'],
  ['muted-night', 'night-800', 4.5, 'testo attenuato sul fondo notte'],
  ['#06301A', 'leaf', 4.5, 'testo sui badge verdi'],
  ['ink-soft', 'paper', 4.5, 'testo secondario su carta'],
  ['paper', 'sky-deep', 3.0, 'testo sui bottoni cielo (grande)']
];
console.log('Contrasto testo/fondo (WCAG):');
for (const [fg, bg, soglia, label] of coppieTesto) {
  const base = contrast(c(fg), c(bg));
  const peggio = Math.min(base, ...Object.values(SIM).map(M => contrast(simulate(c(fg), M), simulate(c(bg), M))));
  const d = `${label}: ${base.toFixed(2)} (peggior simulazione ${peggio.toFixed(2)}, soglia ${soglia})`;
  peggio >= soglia ? ok(d) : ko(d);
}

/* --- 2. distinguibilita' delle coppie con significato diverso -------- */
const coppieSenso = [
  // Coppie che compaiono INSIEME nella stessa schermata: qui il colore deve reggere da solo.
  ['ring-good', 'ring-retry', 'anello giusto contro anello riprova'],
  ['leaf', 'amber', 'giusto contro azione'],
  ['amber', 'ember', 'azione contro riprova'],
  ['gold', 'paper', 'stella accesa contro carta']
];
// Coppie SEQUENZIALI (uno stato sostituisce l'altro, e cambia anche la forma):
// si misurano per sapere, non fanno fallire.
const coppieInfo = [
  ['leaf', 'sky', 'giusto contro trascina-qui (sequenziali, con scala diversa)']
];
const SOGLIA_DE = 20;   // sotto 20 due colori affiancati iniziano a confondersi
console.log('\nDistinguibilita\' (Delta E in Lab, soglia ' + SOGLIA_DE + '):');
for (const [a, b, label] of coppieSenso) {
  const righe = [`normale ${deltaE(c(a), c(b)).toFixed(0)}`];
  let min = deltaE(c(a), c(b));
  for (const [nome, M] of Object.entries(SIM)) {
    const de = deltaE(simulate(c(a), M), simulate(c(b), M));
    righe.push(`${nome} ${de.toFixed(0)}`);
    min = Math.min(min, de);
  }
  const d = `${label}: ${righe.join(', ')}`;
  min >= SOGLIA_DE ? ok(d) : ko(d);
}

console.log('\nSolo informative:');
for (const [a, b, label] of coppieInfo) {
  const righe = [`normale ${deltaE(c(a), c(b)).toFixed(0)}`];
  for (const [nome, M] of Object.entries(SIM)) righe.push(`${nome} ${deltaE(simulate(c(a), M), simulate(c(b), M)).toFixed(0)}`);
  console.log(`  --  ${label}: ${righe.join(', ')}`);
}

console.log();
if (problemi) { console.log(`${problemi} problemi: la palette tradisce chi confonde i colori.\n`); process.exitCode = 1; }
else console.log('La palette regge anche per chi confonde i colori.\n');
