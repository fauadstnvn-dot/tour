#!/usr/bin/env node
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { buildIntroHtml, pickVariant, VARIANTS } from './intro.mjs';
import { buildOutroHtml, pickOutro, OUTRO_VARIANTS } from './outro.mjs';
import { makeIntroAudio, makeOutroAudio } from './sfx.mjs';

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
    'end-wait': { type: 'string', default: '0.6' },
    outro: { type: 'string', default: 'random' },
    'outro-seconds': { type: 'string', default: '6' },
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
  --end-wait       Seconds kept after the newspaper scene of the final ends (default 0.6)
  --outro          Like/share/subscribe outro: random (default), none, or ${OUTRO_VARIANTS.join(' | ')}
  --outro-seconds  Outro length (default 6, minimum 5)
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
const outroChoice = opt.outro === 'none' ? null : pickOutro(opt.outro);
const outroSeconds = Math.max(5, Number(opt['outro-seconds']));
const endWait = Math.max(0, Number(opt['end-wait']));
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

// Runs in the page: crops a PNG to the bounding box of its non-transparent pixels.
async function trimTransparent(b64) {
  const img = new Image();
  img.src = `data:image/png;base64,${b64}`;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height).data;
  let minX = c.width, minY = c.height, maxX = -1, maxY = -1;
  for (let yy = 0; yy < c.height; yy++) {
    for (let xx = 0; xx < c.width; xx++) {
      if (d[(yy * c.width + xx) * 4 + 3] > 24) {
        if (xx < minX) minX = xx;
        if (xx > maxX) maxX = xx;
        if (yy < minY) minY = yy;
        if (yy > maxY) maxY = yy;
      }
    }
  }
  if (maxX < 0) return null;
  const pad = 4;
  minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
  maxX = Math.min(c.width - 1, maxX + pad); maxY = Math.min(c.height - 1, maxY + pad);
  const o = document.createElement('canvas');
  o.width = maxX - minX + 1;
  o.height = maxY - minY + 1;
  o.getContext('2d').drawImage(c, minX, minY, o.width, o.height, 0, 0, o.width, o.height);
  return o.toDataURL('image/png').split(',')[1];
}

// Portrait of each fighter: a separate, unrecorded page selects the fighter's character,
// weapon and shield in the game's own viewer and screenshots the character.
async function capturePortraits(list) {
  const blank = () => list.map(() => null);
  const pctx = await browser.newContext({ viewport: { width: capW, height: capH }, deviceScaleFactor: 1 });
  try {
    const pp = await pctx.newPage();
    await pp.goto(opt.url, { waitUntil: 'load', timeout: 60_000 });
    await pp.waitForFunction(
      () => window.__rig && window.__rig.catalog && window.__rig.catalog().char.length > 0,
      null,
      { timeout: Number(opt['load-timeout']) * 1000 },
    );
    await pp.addStyleTag({
      content: `
        html, body, .stage-wrap, #stage { background: transparent !important; }
        #stage::before, #stage::after { display: none !important; }
        body * { visibility: hidden !important; }
        #stage, #stage * { visibility: visible !important; }
        #stage .hud, #stage button, #stage .btn, #status, #tour-panel, #tour-champ, #bk-ov { display: none !important; }
        #stage { position: fixed !important; inset: 0 !important; width: 100vw !important; height: 100vh !important;
                 max-width: none !important; max-height: none !important; margin: 0 !important; z-index: 99999; }
      `,
    });
    await pp.evaluate(() => window.dispatchEvent(new Event('resize')));
    const clip = { x: Math.round(capW * 0.3), y: Math.round(capH * 0.1), width: Math.round(capW * 0.4), height: Math.round(capH * 0.8) };
    const out = [];
    for (const f of list) {
      const ok = await pp.evaluate(({ char, weapon, shield }) => {
        const r = window.__rig;
        const c = r.catalog();
        const find = (k, p) => (p ? c[k].find((i) => i.path === p) || null : null);
        const ch = find('char', char);
        if (!ch) return false;
        r.select('char', ch);
        r.select('weapon', find('weapon', weapon));
        r.select('shield', find('shield', shield));
        return true;
      }, f);
      if (!ok) { out.push(null); continue; }
      await pp.waitForTimeout(450);
      const png = (await pp.screenshot({ type: 'png', omitBackground: true, clip })).toString('base64');
      out.push(await pp.evaluate(trimTransparent, png));
    }
    return out;
  } catch (e) {
    log('Portrait capture failed:', e.message.split('\n')[0]);
    return blank();
  } finally {
    await pctx.close();
  }
}

const context = await browser.newContext({
  viewport: { width: capW, height: capH },
  deviceScaleFactor: 1,
  recordVideo: { dir: tmpDir, size: { width: capW, height: capH } },
});
// Playwright's recordVideo has no sound. The game plays every sound through HTMLMediaElement
// (music and skill mp3), so each play/stop is logged here with a timestamp and mixed later.
await context.addInitScript(() => {
  const log = (window.__audioLog = []);
  const ids = new WeakMap();
  let next = 1;
  const idOf = (el) => {
    if (!ids.has(el)) ids.set(el, next++);
    return ids.get(el);
  };
  const proto = HTMLMediaElement.prototype;
  const origPlay = proto.play;
  const origPause = proto.pause;
  // `src` is the URL the game just assigned; `currentSrc` still holds the previous track at this point.
  proto.play = function (...args) {
  const src = this.src || this.currentSrc;
  const id = idOf(this);
  const t = Date.now();
  if (src) log.push({ k: 'play', id, t, src, off: this.currentTime || 0, vol: this.volume, muted: this.muted });
  const result = origPlay.apply(this, args);
  if (result && result.catch) result.catch(() => log.push({ k: 'stop', id, t: Date.now() }));
  return result;
  };
  // The game swaps tracks by assigning `src` without calling pause(), so close the old instance here.
  const srcDesc = Object.getOwnPropertyDescriptor(proto, 'src');
  if (srcDesc && srcDesc.set) {
  Object.defineProperty(proto, 'src', {
  ...srcDesc,
  set(value) {
  log.push({ k: 'stop', id: idOf(this), t: Date.now() });
  srcDesc.set.call(this, value);
  },
  });
  }
  // The game sets `unlocked = false` whenever play() is interrupted and only a new gesture re-enables
  // the music. A real visitor clicks again; the renderer has nobody to click, so keep re-sending it.
  const sendGesture = () => {
  for (const type of ['pointerdown', 'keydown', 'touchstart']) document.dispatchEvent(new Event(type, { bubbles: true }));
  };
  setInterval(sendGesture, 400);
  proto.pause = function (...args) {
    log.push({ k: 'stop', id: idOf(this), t: Date.now() });
    return origPause.apply(this, args);
  };
  document.addEventListener('ended', (e) => {
    if (e.target instanceof HTMLMediaElement) log.push({ k: 'stop', id: idOf(e.target), t: Date.now() });
  }, true);
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

// The game's music starts only after a user gesture; its handler is a plain document listener.
await page.evaluate(() => {
  for (const type of ['pointerdown', 'keydown', 'touchstart']) document.dispatchEvent(new Event(type, { bubbles: true }));
});

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
const rawFighters = await page.evaluate(() => {
  const r = window.__rig;
  const t = r.tour;
  const path = (x) => (x && x.path) || null;
  if (t && t.entrants && t.entrants.length) {
    return t.entrants.map((e) => ({ name: e.name, char: path(e.char), weapon: path(e.weapon), shield: path(e.shield) }));
  }
  return r.catalog().char.map((c) => ({ name: c.name, char: path(c) }));
});
const fighterPool = rawFighters.filter((f) => f.name);
const introFighters = (fighterPool.length >= fighters ? fighterPool : shuffled(fighterPool)).slice(0, fighters);

// Match-end moments (the game logs "<match>: X wins") used to cut the highlight clips.
const events = [];
let seenLog = 0;
let lastPanel = '';
const shots = [];
let lastShotAt = 0;
const startedAt = Date.now();
let lastReport = 0;
const maxMs = Number(opt['max-minutes']) * 60_000;
// The recording ends with the newspapers about the winner of the final (the game's #news-wall).
let sawPapers = false;
let lastPaperAt = 0;
let mainEnd = null;
for (;;) {
  const snap = await page.evaluate(() => {
    const c = document.getElementById('tour-champ');
    const t = window.__rig.tour;
    return {
      champion: !!(t && t.log && t.log.some((l) => /^CHAMPION/.test(l))) || (!!c && !c.hidden),
      isFinal: !!(t && t.isFinal),
      papers: !!document.getElementById('news-wall'),
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
  if (snap.isFinal && snap.papers) { sawPapers = true; lastPaperAt = now; }
  if (sawPapers && !snap.papers) { mainEnd = lastPaperAt + endWait; break; }
  // No newspapers in this final (the game sometimes has no reporters): stop right after the champion is decided.
  if (snap.champion && !snap.papers) { mainEnd = (sawPapers ? lastPaperAt : now) + endWait; break; }
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
const nowSeconds = () => (Date.now() - recordingStartedAt) / 1000;
if (mainEnd === null) mainEnd = nowSeconds();
log(sawPapers ? 'Final newspapers shown. Finishing the game footage...' : 'Champion decided. Finishing the game footage...');
const remaining = mainEnd - nowSeconds();
if (remaining > 0) await page.waitForTimeout(remaining * 1000);
mainEnd = Math.min(mainEnd, nowSeconds());

const recordingEndedAt = Date.now();
const championName = await page.evaluate(() => (window.__rig && window.__rig.tour && window.__rig.tour.champion && window.__rig.tour.champion.name) || null);
const audioLog = await page.evaluate(() => window.__audioLog || []);
const recordingSeconds = (recordingEndedAt - recordingStartedAt) / 1000;

// Pair each play with its stop to get {src, start, duration, offset, volume} instances.
const instances = [];
const open = new Map();
const closeAt = (id, t) => {
  const p = open.get(id);
  if (!p) return;
  open.delete(id);
  const dur = (t - p.t) / 1000;
  if (dur > 0.03) instances.push({ src: p.src, start: (p.t - recordingStartedAt) / 1000, dur, off: p.off, vol: p.vol });
};
for (const e of audioLog) {
  if (e.k === 'play') {
    closeAt(e.id, e.t);
    if (!e.muted && e.vol > 0) open.set(e.id, e);
  } else closeAt(e.id, e.t);
}
for (const id of [...open.keys()]) closeAt(id, recordingEndedAt);

const audioDir = join(tmpDir, 'audio');
mkdirSync(audioDir, { recursive: true });
const audioFiles = new Map();
for (const src of new Set(instances.map((i) => i.src))) {
  try {
    const res = await context.request.get(src, { timeout: 30_000 });
    if (!res.ok()) throw new Error(`HTTP ${res.status()}`);
    const file = join(audioDir, `a${audioFiles.size}.bin`);
    writeFileSync(file, await res.body());
    audioFiles.set(src, file);
  } catch (e) {
    log(`Could not download sound ${src}: ${e.message}`);
  }
}
const mixable = instances.filter((i) => audioFiles.has(i.src));
  const musicCount = mixable.filter((i) => /\/music\//i.test(decodeURIComponent(i.src))).length;
  const musicSeconds = mixable.filter((i) => /\/music\//i.test(decodeURIComponent(i.src))).reduce((s, i) => s + i.dur, 0);
  log(`Audio: ${mixable.length} sound instance(s) from ${audioFiles.size} file(s); music: ${musicCount} track(s), ${musicSeconds.toFixed(0)}s of ${recordingSeconds.toFixed(0)}s`);
  if (!musicCount) log('WARNING: no background music was captured. Check that ?api=music returns tracks on the host.');

const videoPath = await page.video().path();
await context.close();

// Records a self-contained animated HTML card (intro / outro) and returns where its animation starts.
async function recordCard(html, seconds, dirName) {
  const ctx = await browser.newContext({
    viewport: { width: capW, height: capH },
    deviceScaleFactor: 1,
    recordVideo: { dir: join(tmpDir, dirName), size: { width: capW, height: capH } },
  });
  const t0 = Date.now();
  const p = await ctx.newPage();
  await p.setContent(html, { waitUntil: 'load' });
  await p.evaluate(() => document.fonts.ready);
  const trim = (Date.now() - t0) / 1000 + 0.05;
  await p.evaluate(() => window.__go());
  await p.waitForTimeout(seconds * 1000 + 300);
  const path = await p.video().path();
  await ctx.close();
  return { path, trim };
}

let intro = null;
if (introChoice) {
  log(`Capturing ${introFighters.length} fighter portraits...`);
  const portraits = await capturePortraits(introFighters);
  const introWithImages = introFighters.map((f, i) => ({ ...f, img: portraits[i] }));
  log(`Rendering intro "${introChoice}" (${introSeconds}s)...`);
  intro = await recordCard(
    buildIntroHtml({ variant: introChoice, fighters: introWithImages, shots, lang: opt.lang, seconds: introSeconds }),
    introSeconds,
    'intro',
  );
}

let outro = null;
if (outroChoice) {
  let champion = championName ? { name: championName, img: null } : null;
  if (champion && (outroChoice === 'champion' || outroChoice === 'channel')) {
    const match = fighterPool.find((f) => f.name === championName);
    if (match) {
      const [img] = await capturePortraits([match]);
      champion = { name: championName, img };
    }
  }
  log(`Rendering outro "${outroChoice}" (${outroSeconds}s)...`);
  outro = await recordCard(buildOutroHtml({ variant: outroChoice, shots, champion }), outroSeconds, 'outro');
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

const runFfmpeg = (args, stdio = 'inherit') =>
  new Promise((res, rej) => {
    const ff = spawn('ffmpeg', args, { stdio });
    ff.on('error', (e) => rej(new Error(`Could not run ffmpeg: ${e.message}`)));
    ff.on('close', (code) => (code === 0 ? res() : rej(new Error(`ffmpeg exited with code ${code}`))));
  });

// Mixes every logged sound onto one WAV that shares the video recording's timeline.
// Done in batches so ffmpeg never has to open thousands of inputs at once.
async function mixGameAudio(list, totalSeconds, outPath) {
  const SR = 44100;
  const BATCH = 60;
  const partials = [];
  for (let b = 0; b < list.length; b += BATCH) {
    const batch = list.slice(b, b + BATCH);
    const ins = [];
    const chs = [];
    batch.forEach((s, i) => {
      ins.push('-ss', Math.max(0, s.off).toFixed(3), '-t', s.dur.toFixed(3), '-i', audioFiles.get(s.src));
      const delay = Math.max(0, Math.round(s.start * 1000));
      const fadeOut = Math.min(0.25, s.dur / 2);
      chs.push(
        `[${i}:a]aresample=${SR},aformat=channel_layouts=stereo,volume=${Math.min(1, s.vol).toFixed(3)},` +
        `afade=t=out:st=${Math.max(0, s.dur - fadeOut).toFixed(3)}:d=${fadeOut.toFixed(3)},adelay=${delay}|${delay}[s${i}]`,
      );
    });
    const mixed = batch.length === 1 ? '[s0]anull[m]' : `${batch.map((_, i) => `[s${i}]`).join('')}amix=inputs=${batch.length}:normalize=0:duration=longest[m]`;
    const part = join(audioDir, `part${partials.length}.wav`);
    await runFfmpeg(['-y', '-loglevel', 'error', ...ins, '-filter_complex', `${chs.join(';')};${mixed}`, '-map', '[m]', '-ar', String(SR), '-ac', '2', part]);
    partials.push(part);
  }
  const ins = partials.flatMap((p) => ['-i', p]);
  const labels = partials.map((_, i) => `[${i}:a]`).join('');
  const mixAll = partials.length === 1 ? '[0:a]anull[m]' : `${labels}amix=inputs=${partials.length}:normalize=0:duration=longest[m]`;
  await runFfmpeg([
    '-y', '-loglevel', 'error', ...ins,
    '-filter_complex', `${mixAll};[m]alimiter=limit=0.95,apad[o]`,
    '-map', '[o]', '-t', totalSeconds.toFixed(2), '-ar', String(SR), '-ac', '2', outPath,
  ]);
}

let gameAudioPath = null;
if (mixable.length) {
  try {
    log('Mixing game audio...');
    gameAudioPath = join(audioDir, 'game.wav');
    await mixGameAudio(mixable, recordingSeconds + 2, gameAudioPath);
  } catch (e) {
    log(`Audio mix failed, video will be silent: ${e.message}`);
    gameAudioPath = null;
  }
}

log(`Encoding ${outW}x${outHeight} MP4 with ffmpeg (crf ${crf})...`);
const inputs = [];
const chains = [];
const norm = `scale=${outW}:${outHeight}:flags=lanczos,setsar=1,fps=${opt.fps},format=yuv420p`;
const normA = 'aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo';
let inputCount = 0;
// audio: 'silent' (needs a duration), 'game' (cut from the mixed game audio) or none.
const addSegment = (file, start, duration, audio, fadeIn = 0, fadeOut = 0) => {
  const i = chains.length;
  const dur = ['-t', duration.toFixed(2)];
  const vIdx = inputCount++;
  inputs.push('-ss', start.toFixed(2), ...dur, '-i', file);
  const fadeChain = (v, a) => [
    fadeIn ? `${v}=t=in:st=0:d=${fadeIn}` : '',
    fadeOut ? `${v}=t=out:st=${(duration - fadeOut).toFixed(2)}:d=${fadeOut}` : '',
  ].filter(Boolean).map((s) => `,${s.replace(/^[a-z]+/, a)}`).join('');
  const fades = fadeChain('fade', 'fade');
  let chain = `[${vIdx}:v]setpts=PTS-STARTPTS,${norm}${fades}[v${i}]`;
  const aIdx = inputCount++;
  if (audio === 'silent') {
    inputs.push('-f', 'lavfi', '-t', duration.toFixed(2), '-i', 'anullsrc=r=44100:cl=stereo');
  } else if (typeof audio === 'object') {
    inputs.push('-t', duration.toFixed(2), '-i', audio.wav);
  } else {
    inputs.push('-ss', start.toFixed(2), ...dur, '-i', gameAudioPath ?? file);
  }
  const aFades = fadeChain('afade', 'afade');
  chain += `;[${aIdx}:a]asetpts=PTS-STARTPTS,${normA}${aFades}[a${i}]`;
  chains.push(chain);
};
const silentOrGame = gameAudioPath ? 'game' : 'silent';
const introAudio = intro ? { wav: makeIntroAudio(join(audioDir, 'intro.wav'), introSeconds) } : null;
const outroAudio = outro ? { wav: makeOutroAudio(join(audioDir, 'outro.wav'), outroSeconds) } : null;
if (intro) addSegment(intro.path, intro.trim, introSeconds, introAudio);
for (const e of picked) addSegment(videoPath, e.t - before, before + after, silentOrGame, 0.15, 0.15);
// Main game footage runs to the end of the final's newspaper scene and fades out into the outro.
addSegment(videoPath, trimSeconds, Math.max(1, mainEnd - trimSeconds), silentOrGame, 0, 0.6);
if (outro) addSegment(outro.path, outro.trim, outroSeconds, outroAudio, 0.5, 0.5);
if (!gameAudioPath) log('No game audio captured; the video will be silent.');
const labels = chains.map((_, i) => `[v${i}][a${i}]`).join('');
const args = [
  '-y', ...inputs,
  '-filter_complex', `${chains.join(';')};${labels}concat=n=${chains.length}:v=1:a=1[v][a]`,
  '-map', '[v]', '-map', '[a]',
  '-c:v', 'libx264', '-preset', outHeight >= 1080 ? 'medium' : 'slow', '-crf', crf, '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '128k',
  '-movflags', '+faststart', outFile,
];
await runFfmpeg(args);

rmSync(tmpDir, { recursive: true, force: true });
log('Done:', outFile);
