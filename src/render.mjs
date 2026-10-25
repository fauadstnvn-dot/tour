#!/usr/bin/env node
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, existsSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { buildIntroHtml, pickVariant, VARIANTS } from './intro.mjs';

const { values: opt } = parseArgs({
  options: {
    url: { type: 'string', default: process.env.GAME_URL || 'https://nangmua.vn/2d/2d/' },
    fighters: { type: 'string', default: process.env.FIGHTERS ?? '16' },
    out: { type: 'string', default: process.env.OUT ?? 'output/tournament.mp4' },
    height: { type: 'string', default: '240' },
    fps: { type: 'string', default: '25' },
    speed: { type: 'string', default: '1' },
    'capture-height': { type: 'string', default: '480' },
    'max-minutes': { type: 'string', default: '60' },
    'end-wait': { type: 'string', default: '8' },
    'load-timeout': { type: 'string', default: '120' },
    retries: { type: 'string', default: process.env.RETRIES ?? '5' },
    'retry-delay': { type: 'string', default: '10' },
    intro: { type: 'string', default: 'random' },
    'intro-seconds': { type: 'string', default: '5' },
    highlights: { type: 'string', default: '4' },
    'highlight-before': { type: 'string', default: '4' },
    'highlight-after': { type: 'string', default: '1' },
    lang: { type: 'string', default: 'en' },
    crf: { type: 'string' },
    'full-page': { type: 'boolean', default: false },
    headed: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (opt.help || !opt.url) {
  console.log(`Usage: node src/render.mjs --url https://your-host/index.php [options]

  --url            Game URL on your host (or env GAME_URL). Characters, skills,
                   referee and scenery are loaded by the page from that host.
  --fighters       Number of contestants, multiple of 4 (default 16)
  --out            Output mp4 (default output/tournament.mp4)
  --height         Output height in px, 240 = 240p (default 240)
  --fps            Output frame rate (default 25)
  --speed          Game speed slider 0.2 - 2 (default 1)
  --capture-height Browser capture height before downscale (default 480)
  --max-minutes    Abort after this many minutes of recording (default 60)
  --end-wait       Seconds to keep recording after the champion appears (default 8)
  --retries        Max attempts to load game data, reloading on failure (default 5)
  --retry-delay    Base seconds between reloads, grows per attempt (default 10)
  --intro          Hook intro: random (default), none, or ${VARIANTS.join(' | ')}
  --intro-seconds  Intro length (default 5)
  --highlights     Number of highlight clips between intro and game, 0 = off (default 4)
  --highlight-before / --highlight-after  Seconds kept around each KO (default 4 / 1)
  --lang           Intro text language: en | vi (default en)
  --crf            x264 quality, lower = better (default 24, or 20 from 1080p up)
  --full-page      Record the whole page instead of only the arena
  --headed         Show the browser window`);
  process.exit(opt.help ? 0 : 1);
}

const fighters = Number(opt.fighters);
if (!Number.isInteger(fighters) || fighters < 4 || fighters % 4 !== 0) {
  console.error('--fighters must be a multiple of 4 (4, 8, 16, 32 ...)');
  process.exit(1);
}

const outFile = resolve(opt.out);
const outHeight = Math.round(Number(opt.height) / 2) * 2;
// Never capture below the output height, so 1080p / 1440p (2K) output is not upscaled.
const capH = Math.max(Math.round(Number(opt['capture-height']) / 2) * 2, outHeight);
const capW = Math.round((capH * 16) / 9 / 2) * 2;
const outW = Math.round((outHeight * 16) / 9 / 2) * 2;
const crf = opt.crf ?? (outHeight >= 1080 ? '20' : '24');
const introChoice = opt.intro === 'none' ? null : pickVariant(opt.intro);
const introSeconds = Math.max(2, Number(opt['intro-seconds']));
const highlightCount = Math.max(0, Math.floor(Number(opt.highlights)));
const tmpDir = resolve('.tmp-video');
mkdirSync(dirname(outFile), { recursive: true });
mkdirSync(tmpDir, { recursive: true });
for (const f of readdirSync(tmpDir)) rmSync(join(tmpDir, f), { recursive: true, force: true });

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const browser = await chromium.launch({
  headless: !opt.headed,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', '--mute-audio'],
});
const context = await browser.newContext({
  viewport: { width: capW, height: capH },
  deviceScaleFactor: 1,
  recordVideo: { dir: tmpDir, size: { width: capW, height: capH } },
});
const recordingStartedAt = Date.now();
const page = await context.newPage();
page.on('pageerror', (e) => log('page error:', e.message));

const maxAttempts = Math.max(1, Number(opt.retries));
const retryDelayMs = Number(opt['retry-delay']) * 1000;
let loaded = false;
for (let attempt = 1; attempt <= maxAttempts && !loaded; attempt++) {
  try {
    log(`Opening ${opt.url} (attempt ${attempt}/${maxAttempts})`);
    const res = await page.goto(opt.url, { waitUntil: 'load', timeout: 60_000 });
    if (res && res.status() >= 400) throw new Error(`HTTP ${res.status()} from host`);
    log('Waiting for characters to load from the host...');
    await page.waitForFunction(
      () => window.__rig && window.__rig.catalog && window.__rig.catalog().char.length > 0,
      null,
      { timeout: Number(opt['load-timeout']) * 1000 },
    );
    loaded = true;
  } catch (e) {
    log(`Load failed: ${e.message.split('\n')[0]}`);
    if (attempt < maxAttempts) {
      const wait = retryDelayMs * attempt;
      log(`Reloading in ${(wait / 1000).toFixed(0)}s...`);
      await page.waitForTimeout(wait);
    }
  }
}
if (!loaded) {
  console.error(`Could not load game data from ${opt.url} after ${maxAttempts} attempts.`);
  await context.close();
  await browser.close();
  process.exit(1);
}
const counts = await page.evaluate(() => {
  const c = window.__rig.catalog();
  return Object.fromEntries(Object.keys(c).map((k) => [k, c[k].length]));
});
log('Catalog:', JSON.stringify(counts));

await page.addStyleTag({
  content: `
    /* video only: no clickable buttons anywhere */
    #bk-ov, #bk-go, #stage button, #stage .btn, #status { display: none !important; }
    #stage [hidden] { display: none !important; }
    /* before the tournament starts the stage shows setup hints */
    body:not(.vid-live) #stage .hud { display: none !important; }
    .vid-live #stage .hud { display: none !important; }
  `,
});
if (!opt['full-page']) {
  await page.addStyleTag({
    content: `
      body * { visibility: hidden !important; }
      #stage, #stage * { visibility: visible !important; }
      #stage [hidden], #stage [hidden] * { visibility: hidden !important; }
      #stage { position: fixed !important; inset: 0 !important; width: 100vw !important; height: 100vh !important;
               max-width: none !important; max-height: none !important; margin: 0 !important; z-index: 99999; }
    `,
  });
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
}

await page.evaluate((speed) => {
  const s = document.getElementById('speed');
  if (s) { s.value = String(speed); s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); }
}, opt.speed);

await page.evaluate((n) => {
  const sel = document.getElementById('tour-size');
  if (![...sel.options].some((o) => o.value === String(n))) {
    const o = document.createElement('option');
    o.value = String(n); o.textContent = `${n} fighters`;
    sel.appendChild(o);
  }
  sel.value = String(n);
  sel.dispatchEvent(new Event('change', { bubbles: true }));
}, fighters);
// Let the first tournament frame render, then cut everything recorded before it.
await page.waitForFunction(() => {
  const p = document.getElementById('tour-panel');
  return !!p && !p.hidden;
}, null, { timeout: 30_000 }).catch(() => {});
await page.waitForTimeout(500);
await page.evaluate(() => document.body.classList.add('vid-live'));
const trimSeconds = (Date.now() - recordingStartedAt) / 1000;
log(`Tournament of ${fighters} fighters started. Recording... (trimming first ${trimSeconds.toFixed(1)}s)`);

const shuffled = (a) => a.map((v) => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
const rawNames = await page.evaluate(() => {
  const r = window.__rig;
  const t = r.tour;
  if (t && t.entrants && t.entrants.length) return t.entrants.map((e) => e.name);
  return r.catalog().char.map((c) => c.name);
});
const fighterNames = [...new Set(rawNames.filter(Boolean))];
const introNames = rawNames.length >= fighters ? fighterNames.slice(0, fighters) : shuffled(fighterNames).slice(0, fighters);

// Match-end moments (the game logs "<match>: X wins") used to cut the highlight clips.
const events = [];
let seenLog = 0;
let lastPanel = '';
const shots = [];
let lastShotAt = 0;
const startedAt = Date.now();
let lastReport = 0;
const maxMs = Number(opt['max-minutes']) * 60_000;
for (;;) {
  const snap = await page.evaluate(() => {
    const c = document.getElementById('tour-champ');
    const t = window.__rig.tour;
    return {
      done: !!c && !c.hidden,
      log: t && t.log ? t.log.slice() : null,
      panel: document.getElementById('tour-panel')?.innerText ?? '',
    };
  });
  const now = (Date.now() - recordingStartedAt) / 1000;
  if (snap.log) {
    for (; seenLog < snap.log.length; seenLog++) {
      const line = snap.log[seenLog];
      if (/wins$/.test(line) && !/bye/i.test(line)) events.push({ t: now, line });
    }
  } else if (lastPanel && snap.panel !== lastPanel) {
    events.push({ t: now, line: snap.panel });
  }
  lastPanel = snap.panel;
  if (snap.done) break;
  const elapsed = Date.now() - startedAt;
  if (shots.length < 8 && elapsed - lastShotAt > 3500 && elapsed > 2500) {
    lastShotAt = elapsed;
    shots.push((await page.screenshot({ type: 'jpeg', quality: 88 })).toString('base64'));
  }
  if (elapsed > maxMs) { log('Time limit reached, stopping early.'); break; }
  if (elapsed - lastReport > 30_000) {
    lastReport = elapsed;
    const txt = await page.evaluate(() => document.getElementById('tour-panel')?.innerText?.slice(0, 80) ?? '');
    log(`Recording ${(elapsed / 60_000).toFixed(1)} min`, txt.replace(/\s+/g, ' '));
  }
  await page.waitForTimeout(500);
}
log('Champion crowned. Finishing...');
await page.waitForTimeout(Number(opt['end-wait']) * 1000);

const videoPath = await page.video().path();
await context.close();

let intro = null;
if (introChoice) {
  log(`Rendering intro "${introChoice}" (${introSeconds}s)...`);
  const introCtx = await browser.newContext({
    viewport: { width: capW, height: capH },
    deviceScaleFactor: 1,
    recordVideo: { dir: join(tmpDir, 'intro'), size: { width: capW, height: capH } },
  });
  const t0 = Date.now();
  const ip = await introCtx.newPage();
  await ip.setContent(
    buildIntroHtml({ variant: introChoice, names: introNames, shots, lang: opt.lang, seconds: introSeconds }),
    { waitUntil: 'load' },
  );
  await ip.evaluate(() => document.fonts.ready);
  const introTrim = (Date.now() - t0) / 1000 + 0.05;
  await ip.evaluate(() => window.__go());
  await ip.waitForTimeout(introSeconds * 1000 + 300);
  const introPath = await ip.video().path();
  await introCtx.close();
  intro = { path: introPath, trim: introTrim };
}
await browser.close();

// The last "wins" is the final, which would spoil the champion, so it is never a highlight.
const before = Number(opt['highlight-before']);
const after = Number(opt['highlight-after']);
const candidates = events.slice(0, -1).filter((e) => e.t - before > trimSeconds + 0.5);
const lastTwo = candidates.slice(-2);
const picked = [...lastTwo, ...shuffled(candidates.slice(0, -2))].slice(0, highlightCount).sort((a, b) => a.t - b.t);
log(`Highlights: ${picked.length} clip(s)`, picked.map((p) => p.line).join(' | '));

if (!existsSync(videoPath) || statSync(videoPath).size === 0) {
  console.error('No video was recorded.');
  process.exit(1);
}

log(`Encoding ${outW}x${outHeight} MP4 with ffmpeg (crf ${crf})...`);
const inputs = [];
const chains = [];
const norm = `scale=${outW}:${outHeight}:flags=lanczos,setsar=1,fps=${opt.fps},format=yuv420p`;
const addSegment = (file, start, duration, fade) => {
  const i = chains.length;
  inputs.push('-ss', start.toFixed(2), ...(duration ? ['-t', duration.toFixed(2)] : []), '-i', file);
  const fades = fade ? `,fade=t=in:st=0:d=0.15,fade=t=out:st=${(duration - 0.15).toFixed(2)}:d=0.15` : '';
  chains.push(`[${i}:v]setpts=PTS-STARTPTS,${norm}${fades}[v${i}]`);
};
if (intro) addSegment(intro.path, intro.trim, introSeconds, false);
for (const e of picked) addSegment(videoPath, e.t - before, before + after, true);
addSegment(videoPath, trimSeconds, 0, false);
const labels = chains.map((_, i) => `[v${i}]`).join('');
const args = [
  '-y', ...inputs,
  '-filter_complex', `${chains.join(';')};${labels}concat=n=${chains.length}:v=1:a=0[v]`,
  '-map', '[v]',
  '-c:v', 'libx264', '-preset', outHeight >= 1080 ? 'medium' : 'slow', '-crf', crf, '-pix_fmt', 'yuv420p',
  '-movflags', '+faststart', '-an', outFile,
];
await new Promise((res, rej) => {
  const ff = spawn('ffmpeg', args, { stdio: 'inherit' });
  ff.on('error', (e) => rej(new Error(`Could not run ffmpeg: ${e.message}`)));
  ff.on('close', (code) => (code === 0 ? res() : rej(new Error(`ffmpeg exited with code ${code}`))));
});

rmSync(tmpDir, { recursive: true, force: true });
log('Done:', outFile);
