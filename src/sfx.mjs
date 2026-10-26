import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const SR = 44100;
const TAU = Math.PI * 2;
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

class Track {
  constructor(seconds) {
    this.n = Math.ceil(seconds * SR);
    this.l = new Float32Array(this.n);
    this.r = new Float32Array(this.n);
    this.seconds = seconds;
  }
  add(i, v, pan = 0) {
    if (i < 0 || i >= this.n) return;
    this.l[i] += v * (1 - Math.max(0, pan));
    this.r[i] += v * (1 + Math.min(0, pan));
  }
  // Plucked / bell-like tone with an exponential decay and a few harmonics.
  tone(at, freq, len, gain, { pan = 0, attack = 0.005, decay = 4, harmonics = [1, 0.35, 0.15], shimmer = 0 } = {}) {
    const start = Math.floor(at * SR);
    const total = Math.floor(len * SR);
    for (let k = 0; k < total; k++) {
      const t = k / SR;
      const env = Math.min(1, t / attack) * Math.exp(-decay * t);
      let s = 0;
      harmonics.forEach((h, j) => { s += h * Math.sin(TAU * freq * (j + 1) * t + (shimmer ? Math.sin(TAU * 5 * t) * shimmer : 0)); });
      this.add(start + k, s * env * gain, pan);
    }
  }
  // Soft sustained chord tone for pads and drones.
  pad(at, freq, len, gain, pan = 0) {
    const start = Math.floor(at * SR);
    const total = Math.floor(len * SR);
    const edge = Math.min(0.5, len / 3);
    for (let k = 0; k < total; k++) {
      const t = k / SR;
      const env = Math.min(1, t / edge, (len - t) / edge);
      const s = Math.sin(TAU * freq * t) + 0.5 * Math.sin(TAU * freq * 1.003 * t) + 0.25 * Math.sin(TAU * freq * 2 * t);
      this.add(start + k, s * env * gain, pan);
    }
  }
  // Noise swept through a one-pole low-pass whose cutoff moves from lo to hi.
  sweep(at, len, gain, { lo = 0.02, hi = 0.6, rising = true, pan = 0 } = {}) {
    const start = Math.floor(at * SR);
    const total = Math.floor(len * SR);
    let y = 0;
    for (let k = 0; k < total; k++) {
      const p = k / total;
      const a = lo + (hi - lo) * (rising ? p * p : (1 - p) * (1 - p));
      y += a * ((Math.random() * 2 - 1) - y);
      const env = rising ? p ** 2 : (1 - p) ** 1.5;
      this.add(start + k, y * env * gain * 3, pan);
    }
  }
  // Pitch-gliding sine for risers, whooshes and booms.
  glide(at, len, f0, f1, gain, { curve = 1, pan = 0, fade = 'in' } = {}) {
    const start = Math.floor(at * SR);
    const total = Math.floor(len * SR);
    let ph = 0;
    for (let k = 0; k < total; k++) {
      const p = k / total;
      const f = f0 + (f1 - f0) * p ** curve;
      ph += (TAU * f) / SR;
      const env = fade === 'in' ? p : fade === 'out' ? 1 - p : Math.sin(Math.PI * p);
      this.add(start + k, Math.sin(ph) * env * gain, pan);
    }
  }
  boom(at, gain) {
    this.glide(at, 1.4, 90, 38, gain, { fade: 'out' });
    this.sweep(at, 0.9, gain * 0.7, { lo: 0.4, hi: 0.02, rising: false });
    this.tone(at, 55, 1.6, gain * 0.8, { decay: 2.4, harmonics: [1, 0.4] });
  }
  sparkle(at, gain, base = 84) {
    [0, 4, 7, 12].forEach((o, i) => this.tone(at + i * 0.045, hz(base + o), 0.9, gain * 0.5, { decay: 5, harmonics: [1, 0.2], pan: (i % 2 ? 0.5 : -0.5) }));
  }
  chime(at, midi, gain) {
    this.tone(at, hz(midi), 1.6, gain, { decay: 2.6, harmonics: [1, 0.5, 0.25, 0.12] });
    this.tone(at, hz(midi + 12), 1.2, gain * 0.35, { decay: 3.4, harmonics: [1, 0.2] });
    this.sparkle(at + 0.02, gain * 0.6, midi + 24);
  }
  fadeEnds(inSec, outSec) {
    for (let i = 0; i < this.n; i++) {
      const t = i / SR;
      const g = Math.min(1, t / Math.max(inSec, 1e-3), (this.seconds - t) / Math.max(outSec, 1e-3));
      this.l[i] *= g;
      this.r[i] *= g;
    }
  }
  write(path) {
    let peak = 0;
    for (let i = 0; i < this.n; i++) peak = Math.max(peak, Math.abs(this.l[i]), Math.abs(this.r[i]));
    const norm = peak > 0 ? 0.89 / peak : 1;
    const data = Buffer.alloc(44 + this.n * 4);
    data.write('RIFF', 0); data.writeUInt32LE(36 + this.n * 4, 4); data.write('WAVEfmt ', 8);
    data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(2, 22);
    data.writeUInt32LE(SR, 24); data.writeUInt32LE(SR * 4, 28); data.writeUInt16LE(4, 32); data.writeUInt16LE(16, 34);
    data.write('data', 36); data.writeUInt32LE(this.n * 4, 40);
    for (let i = 0; i < this.n; i++) {
      data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, this.l[i] * norm)) * 32767), 44 + i * 4);
      data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, this.r[i] * norm)) * 32767), 46 + i * 4);
    }
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, data);
    return path;
  }
}

// Tense, cinematic build-up: drone, rhythmic pulse, rising sweep and a big hit just before the end.
export function makeIntroAudio(path, seconds) {
  const t = new Track(seconds);
  const bpm = 124;
  const step = 60 / bpm / 2;
  const hit = Math.max(1.2, seconds - 0.9);
  t.pad(0, hz(33), seconds, 0.22);
  t.pad(0, hz(45), seconds, 0.12, 0.3);
  const scale = [57, 60, 64, 67, 64, 60, 62, 65];
  for (let i = 0, at = 0.25; at < hit; i++, at += step) {
    const grow = 0.35 + 0.65 * (at / hit);
    t.tone(at, hz(scale[i % scale.length]), 0.35, 0.16 * grow, { decay: 7, harmonics: [1, 0.3], pan: i % 2 ? 0.4 : -0.4 });
    if (i % 2 === 0) t.tone(at, hz(33), 0.25, 0.4 * grow, { decay: 11, harmonics: [1, 0.5] });
  }
  t.sweep(0, hit, 0.35, { lo: 0.01, hi: 0.5, rising: true });
  t.glide(0, hit, 160, 1400, 0.1, { curve: 2.4 });
  t.boom(hit, 0.9);
  t.sparkle(hit + 0.03, 0.35, 81);
  t.sweep(hit, 1.0, 0.18, { lo: 0.5, hi: 0.03, rising: false });
  t.fadeEnds(0.05, 0.35);
  return t.write(path);
}

// Upbeat and bright: warm pad, bouncing arpeggio, and rising chime hits on each call to action.
export function makeOutroAudio(path, seconds) {
  const t = new Track(seconds);
  const bpm = 118;
  const step = 60 / bpm / 2;
  const chords = [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]];
  const bar = step * 8;
  for (let b = 0; b * bar < seconds; b++) {
    const c = chords[b % chords.length];
    c.forEach((m, j) => t.pad(b * bar, hz(m - 12), bar + 0.3, 0.1, j % 2 ? 0.3 : -0.3));
    t.tone(b * bar, hz(c[0] - 24), bar * 0.9, 0.3, { decay: 2.2, harmonics: [1, 0.4] });
    for (let k = 0; k < 8; k++) {
      const at = b * bar + k * step;
      t.tone(at, hz(c[k % 3] + (k % 2 ? 12 : 0)), 0.3, 0.1, { decay: 8, harmonics: [1, 0.25], pan: k % 2 ? 0.5 : -0.5 });
      if (k % 4 === 0) t.tone(at, hz(36), 0.22, 0.35, { decay: 14, harmonics: [1, 0.6] });
    }
  }
  [[0.55, 72], [1.45, 76], [2.35, 79]].forEach(([at, midi]) => {
    if (at < seconds - 1) {
      t.sweep(at - 0.3, 0.3, 0.12, { lo: 0.02, hi: 0.4, rising: true });
      t.chime(at, midi, 0.38);
    }
  });
  const finale = Math.min(3.4, seconds - 1.6);
  if (finale > 0) {
    t.chime(finale, 84, 0.42);
    t.chime(finale + 0.12, 88, 0.3);
    t.boom(finale, 0.35);
  }
  t.fadeEnds(0.3, 0.9);
  return t.write(path);
}
