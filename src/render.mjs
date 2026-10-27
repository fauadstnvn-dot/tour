#!/usr/bin/env node
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { buildIntroHtml, buildTitleCardHtml, introText, pickVariant, VARIANTS } from './intro.mjs';
import { highlightChain, installMatchCard, renderHighlightAssets, stageLabel, textFor } from './fx.mjs';
import { buildOutroHtml, pickOutro, OUTRO_VARIANTS } from './outro.mjs';
import { makeIntroAudio, makeOutroAudio } from './sfx.mjs';

const { values: opt } = parseArgs({
  options: {
    url: { type: 'string', default: process.env.GAME_URL || '' },
    fighters: { type: 'string', default: process.env.FIGHTERS ?? '16' },
    out: { type: 'string', default: process.env.OUT ?? 'output/tournament.mp4' },
    height: { type: 'string', default: '240' },
    fps: { type: 'string', default: '25' },
    speed: { type: 'string', default: '1' },
    'capture-height': { type: 'string', default: '480' },
    'max-minutes': { type: 'string', default: '300' },
    'video-minutes': { type: 'string', default: '0' },
    'end-wait': { type: 'string', default: '0.6' },
    outro: { type: 'string', default: 'random' },
    'outro-seconds': { type: 'string', default: '6' },
    'load-timeout': { type: 'string', default: '0' },
    retries: { type: 'string', default: process.env.RETRIES ?? '5' },
    'retry-delay': { type: 'string', default: '10' },
    intro: { type: 'string', default: 'random' },
    'intro-seconds': { type: 'string', default: '5' },
    highlights: { type: 'string', default: '4' },
    'highlight-before': { type: 'string', default: '5' },
    'highlight-after': { type: 'string', default: '1' },
    lang: { type: 'string', default: 'en' },
    'match-card': { type: 'string', default: '3.4' },
    crf: { type: 'string' },
    'full-page': { type: 'boolean', default: false },
    'allow-no-scenery': { type: 'boolean', default: false },
    headed: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (opt.help || !opt.url) {
  if (!opt.help) console.error('GAME_URL is not set. Provide it as the GAME_URL secret / environment variable (the game address is never stored in the repository).');
  console.log(`Usage: node src/render.mjs [options]   (game address: env GAME_URL)

  --url            Game URL on your host (or env GAME_URL). Characters, skills,
                   referee and scenery are loaded by the page from that host.
  --fighters       Number of contestants, multiple of 4 (default 16)
  --out            Output mp4 (default output/tournament.mp4)
  --height         Output height in px, 240 = 240p (default 240)
  --fps            Output frame rate (default 25)
  --speed          Game speed slider 0.2 - 2 (default 1)
  --capture-height Browser capture height before downscale (default 480)
  --max-minutes    Abort after this many minutes of recording (default 300)
  --video-minutes  Cut the tournament footage to this many minutes, for quick tests (default 0 = full tournament)
  --end-wait       Seconds kept after the newspaper scene of the final ends (default 0.6)
  --outro          Like/share/subscribe outro: random (default), none, or ${OUTRO_VARIANTS.join(' | ')}
  --outro-seconds  Outro length (default 6, minimum 5)
  --load-timeout   Seconds to wait for the page to open per attempt (default 0 = no limit)
  --retries        Max attempts to load game data, reloading on failure (default 5)
  --retry-delay    Base seconds between reloads, grows per attempt (default 10)
  --intro          Hook intro: random (default), none, or ${VARIANTS.join(' | ')}
  --intro-seconds  Intro length (default 5)
  --highlights     Number of highlight clips between intro and game, 0 = off (default 4)
  --highlight-before / --highlight-after  Seconds kept around each KO, always inside the fight (default 5 / 1)
  --lang           Intro / match card / highlight text language: en | vi (default en)
  --match-card     Seconds of the pre-match card (match number, stage, fighters), 0 = off (default 3.4)
  --crf            x264 quality, lower = better (default 24, or 20 from 1080p up)
  --full-page      Record the whole page instead of only the arena
  --allow-no-scenery  Keep recording even when the host returns no scenery (default: fail the run after retries, so a scenery-less video is never produced silently)
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
const loadTimeoutMs = Math.max(0, Number(opt['load-timeout'])) * 1000;
const matchCardSeconds = Math.max(0, Number(opt['match-card']));
const highlightCount = Math.max(0, Math.floor(Number(opt.highlights)));
const tmpDir = resolve('.tmp-video');
mkdirSync(dirname(outFile), { recursive: true });
mkdirSync(tmpDir, { recursive: true });
for (const f of readdirSync(tmpDir)) rmSync(join(tmpDir, f), { recursive: true, force: true });

// The game address is a secret: scrub it (and its host) from every line that reaches the logs.
const secretParts = (() => {
  try {
    const u = new URL(opt.url);
    return [opt.url, u.href, u.origin, u.host].filter(Boolean).sort((a, b) => b.length - a.length);
  } catch { return [opt.url].filter(Boolean); }
})();
const redact = (v) => {
  if (typeof v !== 'string') return v;
  let t = v;
  for (const part of secretParts) t = t.split(part).join('***');
  return t;
};
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a.map(redact));

// The host's bot shield fingerprints headless browsers (HeadlessChrome UA,
// navigator.webdriver) and intermittently answers with an HTML verification
// page instead of the real file - from GitHub's datacentre IPs far more often
// than from a home browser. Present a normal Chrome identity on every context
// so the game, scenery and music requests are treated as a regular visit.
const REAL_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const browser = await chromium.launch({
  headless: !opt.headed,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', '--mute-audio', '--disable-blink-features=AutomationControlled'],
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
  const sw = maxX - minX + 1;
  const sh = maxY - minY + 1;
  const k = Math.min(1, 520 / sh);
  const o = document.createElement('canvas');
  o.width = Math.max(1, Math.round(sw * k));
  o.height = Math.max(1, Math.round(sh * k));
  o.getContext('2d').drawImage(c, minX, minY, sw, sh, 0, 0, o.width, o.height);
  return o.toDataURL('image/png').split(',')[1];
}

// Portrait of each fighter: a separate, unrecorded page selects the fighter's character,
// weapon and shield in the game's own viewer and screenshots the character.
async function capturePortraits(list) {
  const blank = () => list.map(() => null);
  const pctx = await browser.newContext({ viewport: { width: capW, height: capH }, deviceScaleFactor: 1, userAgent: REAL_UA });
  try {
    const pp = await pctx.newPage();
    await pp.goto(opt.url, { waitUntil: 'domcontentloaded', timeout: loadTimeoutMs });
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
  userAgent: REAL_UA,
  recordVideo: { dir: tmpDir, size: { width: capW, height: capH } },
});
// Playwright's recordVideo has no sound. The game plays every sound through HTMLMediaElement
// (music and skill mp3), so each play/stop is logged here with a timestamp and mixed later.
await context.addInitScript(() => {
  try { Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => undefined, configurable: true }); } catch {}
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
  for (const type of ['pointerdown', 'touchstart']) document.dispatchEvent(new Event(type, { bubbles: true }));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift', bubbles: true }));
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
const sceneryStats = { list: null, listBadType: 0, files: 0, failed: 0, badType: 0 };
page.on('response', (res) => {
  const u = res.url();
  // A response is only a success when the CONTENT matches: the host's bot
  // shield answers blocked requests with HTTP 200 and an HTML verification
  // page, which the old status-only check counted as a good scenery response
  // while the browser dropped the 'image' (it was HTML) and the JSON.parse
  // of the list failed silently inside the page.
  const ct = (res.headers()['content-type'] || '').toLowerCase();
  if (u.includes('api=scenery-file')) {
    sceneryStats.files++;
    const wrongType = !ct.startsWith('image/');
    if (wrongType) sceneryStats.badType++;
    if (res.status() >= 400 || wrongType) { sceneryStats.failed++; log(`Scenery file failed: HTTP ${res.status()} content-type ${ct || '?'} ${decodeURIComponent(u).split('?api=')[1]}`); }
  } else if (u.includes('api=scenery')) {
    sceneryStats.list = res.status();
    if (!ct.includes('json')) { sceneryStats.listBadType++; log(`Scenery list answered HTTP ${res.status()} but content-type ${ct || '?'} (not JSON - host verification page?)`); }
    else log(`Scenery list answered HTTP ${res.status()}`);
  }
});
page.on('requestfailed', (req) => {
  if (req.url().includes('api=scenery')) log(`Scenery request failed: ${req.failure()?.errorText} ${decodeURIComponent(req.url()).split('?api=')[1]}`);
});

const maxAttempts = Math.max(1, Number(opt.retries));
const retryDelayMs = Number(opt['retry-delay']) * 1000;
let loaded = false;
for (let attempt = 1; attempt <= maxAttempts && !loaded; attempt++) {
  try {
    log(`Opening game page (attempt ${attempt}/${maxAttempts})`);
    // Not 'load': that waits for every image/audio/font, and one stalled asset on a slow host times out the whole attempt.
    // The wait for the character catalog below is the real readiness check.
    const res = await page.goto(opt.url, { waitUntil: 'domcontentloaded', timeout: loadTimeoutMs });
    if (res && res.status() >= 400) throw new Error(`HTTP ${res.status()} from host`);
    log(`Host answered HTTP ${res ? res.status() : '?'}`);
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
  console.error('Could not load game data from the game host after ' + maxAttempts + ' attempts.');
  await context.close();
  await browser.close();
  process.exit(1);
}
const counts = await page.evaluate(() => {
  const c = window.__rig.catalog();
  return Object.fromEntries(Object.keys(c).map((k) => [k, c[k].length]));
});
log('Catalog:', JSON.stringify(counts));

// The video-only styles and the music-gesture / speed setup, as functions: a
// scenery retry may have to reload the page, and a reload drops both, so the
// retry path re-applies them (see the scenery section below).
async function applyVideoStyles() {
  await page.addStyleTag({
    content: `
    /* video only: no clickable buttons anywhere */
    #bk-ov, #bk-go, #stage button, #stage .btn, #status { display: none !important; }
    #stage [hidden] { display: none !important; }
    /* before the tournament starts the stage shows setup hints */
    body:not(.vid-live) #stage .hud { display: none !important; }
    .vid-live #stage .hud { display: none !important; }
    /* character speech (top left): sized from the frame height, so it grows with 1080p / 2K output */
    #speech-box { left: max(14px, 1.6vh) !important; top: max(68px, 9vh) !important; width: min(36%, max(240px, 44vh)) !important; }
    #speech-list { gap: max(6px, .9vh) !important; }
    #speech-box .sp { font-size: max(12px, 2.3vh) !important; line-height: 1.25 !important; padding: .55vh 1.2vh !important;
      border-left-width: max(3px, .5vh) !important; border-radius: 1vh !important; background: rgba(8,12,20,.82) !important; -webkit-line-clamp: 3 !important; }
    #speech-box .sp b { font-size: max(11px, 2vh) !important; margin-right: .8vh !important; }
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
}
await applyVideoStyles();

async function primeGamePage() {
  // The game's music starts only after a user gesture; its handler is a plain document listener.
  await page.evaluate(() => {
    for (const type of ['pointerdown', 'touchstart']) document.dispatchEvent(new Event(type, { bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift', bubbles: true }));
  });
  await page.evaluate((speed) => {
    const s = document.getElementById('speed');
    if (s) { s.value = String(speed); s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); }
  }, opt.speed);
}
await primeGamePage();

const shuffled = (a) => a.map((v) => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);

// Decide every fighter's look up front (character, weapon, shield), so portraits can be captured before
// the tournament starts and the pre-match cards / intro have a real picture for each fighter.
const catalogPaths = await page.evaluate(() => {
  const c = window.__rig.catalog();
  return { char: c.char.map((i) => i.path), weapon: c.weapon.map((i) => i.path), shield: c.shield.map((i) => i.path) };
});
const pickList = [];
{
  let pool = shuffled(catalogPaths.char);
  for (let i = 0; i < fighters; i++) {
    if (i > 0 && i % pool.length === 0) pool = shuffled(pool);
    pickList.push({
      char: pool[i % pool.length],
      weapon: catalogPaths.weapon.length ? catalogPaths.weapon[Math.floor(Math.random() * catalogPaths.weapon.length)] : null,
      shield: catalogPaths.shield.length && Math.random() < 0.6 ? catalogPaths.shield[Math.floor(Math.random() * catalogPaths.shield.length)] : null,
    });
  }
}
log(`Capturing ${pickList.length} fighter portraits...`);
const portraits = await capturePortraits(pickList);

// The game fills its Scenery dropdown from the host a moment after the characters; the first match must not start before that.
async function readSceneCount(timeoutMs) {
  return page
    .waitForFunction(() => {
      const s = document.getElementById('scenery');
      return s && s.options.length > 2 ? s.options.length - 2 : false;
    }, null, { timeout: timeoutMs })
    .then((h) => h.jsonValue())
    .catch(() => 0);
}
let sceneCount = await readSceneCount(60_000);
// Before this fix, a single empty answer here (one verification-page response
// to the scenery list, common from GitHub IPs) was logged once and the run
// carried on scenery-less for its whole length. Now the load is retried -
// in-page first (the updated index.php can re-fetch the list itself), then
// by reloading the game - and a run that still gets no scenery FAILS,
// unless --allow-no-scenery was passed.
for (let sceneryTry = 1; !sceneCount && sceneryTry <= 3; sceneryTry++) {
  log(`No scenery from the host yet (try ${sceneryTry}/3; list HTTP ${sceneryStats.list ?? 'never requested'}, list wrong-type responses: ${sceneryStats.listBadType}, scenery files failed: ${sceneryStats.failed}/${sceneryStats.files}). Retrying...`);
  const viaPage = await page.evaluate(() => (window.__rig && typeof window.__rig.reloadScenery === 'function' ? window.__rig.reloadScenery() : -1)).catch(() => -1);
  if (viaPage > 0) {
    sceneCount = viaPage;
  } else {
    sceneCount = await readSceneCount(15_000);
  }
  if (!sceneCount) {
    log('Reloading the game page to retry the scenery load...');
    await page.reload({ waitUntil: 'domcontentloaded', timeout: loadTimeoutMs > 0 ? loadTimeoutMs : 60_000 }).catch(() => {});
    await page.waitForFunction(
      () => window.__rig && window.__rig.catalog && window.__rig.catalog().char.length > 0,
      null,
      { timeout: 60_000 },
    ).catch(() => {});
    await applyVideoStyles().catch(() => {});
    await primeGamePage().catch(() => {});
    sceneCount = await readSceneCount(30_000);
  }
}
if (!sceneCount && !opt['allow-no-scenery']) {
  console.error(`Scenery is required but the host returned none after retries (list HTTP ${sceneryStats.list ?? 'never requested'}, wrong-type list responses: ${sceneryStats.listBadType}). Refusing to record a scenery-less video - check the host's bot protection for this runner, or pass --allow-no-scenery to record with plain stands.`);
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
  process.exit(1);
}
// Drive the game's own setScenery() directly and AWAIT the promise it returns,
// so a pick is only reported once the page confirms that scene is current.
// (Selecting via the dropdown happens too, so the game's per-match random
// roll stays off, but the renderer's confirmation no longer depends on the
// synthetic change event chain alone.)
async function driveScenery(id) {
  const attempt = page.evaluate((sceneId) => {
    if (window.__rig && typeof window.__rig.setScenery === 'function') {
      return window.__rig.setScenery(sceneId).then((sc) => (sc ? sc.id : null));
    }
    return 'no-api';
  }, id).catch((e) => 'error:' + String(e && e.message || e).split('\n')[0]);
  return Promise.race([attempt, page.waitForTimeout(45_000).then(() => 'timeout')]);
}
// Pick scenery through the game's own dropdown, one scene per match, so the recorder does not depend
// on the game's random roll. Returns the chosen scene, or null when nothing could be selected.
async function pickScenery() {
  const picked = await page.evaluate(() => {
    const s = document.getElementById('scenery');
    const opts = s ? [...s.options].filter((o) => o.value && o.value !== '__random__') : [];
    if (!opts.length) return null;
    const o = opts[Math.floor(Math.random() * opts.length)];
    s.value = o.value;
    s.dispatchEvent(new Event('change', { bubbles: true }));
    return { id: o.value, name: o.textContent };
  });
  if (!picked) return null;
  const confirmed = await driveScenery(picked.id);
  if (confirmed === picked.id) {
    log(`Scenery drive: ${picked.id} confirmed current by the page.`);
  } else {
    log(`Scenery drive: ${picked.id} NOT confirmed (page answered: ${confirmed}).`);
    const dbg = await page.evaluate(() => ({
      state: window.__sceneryState ? { status: window.__sceneryState.status, current: window.__sceneryState.current, failedLayers: window.__sceneryState.failedLayers, lastError: window.__sceneryState.lastError } : null,
      current: window.__rig && window.__rig.currentScenery ? (window.__rig.currentScenery() || {}).id || null : 'n/a',
      select: document.getElementById('scenery') ? document.getElementById('scenery').value : 'n/a',
    })).catch(() => null);
    log('Scenery debug:', JSON.stringify(dbg));
  }
  return picked;
}
if (sceneCount) {
  log(`Scenery: ${sceneCount} scenes available from the host.`);
  const first = await pickScenery();
  log(`Scenery selected: ${first ? `${first.name} (${first.id})` : 'none'}`);
  // No DOM check here: before the tournament the page sits in 1-fighter
  // viewer mode, whose stage shows no scenery or stands at all by design, so
  // waiting for scenery <image> elements here only ever produced a false
  // 45 s alarm. The stage is verified during the first fight (see the
  // recording loop), which is also when it matters for the video.
} else {
  log(`WARNING: the host returned no scenery (list HTTP ${sceneryStats.list ?? 'never requested'}); the background will be plain stands (--allow-no-scenery).`);
}

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
// The tournament just rolled its entrants; give each one the look that was photographed above.
const entrantInfo = await page.evaluate((picks) => {
  const t = window.__rig.tour;
  const c = window.__rig.catalog();
  const find = (k, p) => (p ? c[k].find((i) => i.path === p) || null : null);
  return t.entrants.map((e, i) => {
    const p = picks[i];
    if (p) {
      e.char = find('char', p.char) || e.char;
      e.weapon = find('weapon', p.weapon);
      e.shield = find('shield', p.shield);
    }
    return { id: e.id, name: e.name };
  });
}, pickList);
const portraitById = Object.fromEntries(entrantInfo.map((e) => [e.id, portraits[e.id] ?? null]));
// Let the first tournament frame render, then cut everything recorded before it.
await page.waitForFunction(() => {
  const p = document.getElementById('tour-panel');
  return !!p && !p.hidden;
}, null, { timeout: 30_000 }).catch(() => {});
await page.waitForTimeout(500);
if (matchCardSeconds > 0) await installMatchCard(page, { portraits: portraitById, lang: opt.lang, seconds: matchCardSeconds });
await page.evaluate(() => document.body.classList.add('vid-live'));
const trimSeconds = (Date.now() - recordingStartedAt) / 1000;
log(`Tournament of ${fighters} fighters started. Recording... (trimming first ${trimSeconds.toFixed(1)}s)`);

const introFighters = entrantInfo.map((e) => ({ id: e.id, name: e.name, img: portraitById[e.id] }));

// Match-end moments (the game logs "<match>: X wins") used to cut the highlight clips.
const events = [];
let seenLog = 0;
let sceneryVerified = false;
let lastSceneryMatch = null;
let lastPanel = '';
const shots = [];
let lastShotAt = 0;
const startedAt = Date.now();
let lastReport = 0;
const maxMs = Number(opt['max-minutes']) * 60_000;
const videoLimitSeconds = Math.max(0, Number(opt['video-minutes'])) * 60;
// The recording ends with the newspapers about the winner of the final (the game's #news-wall).
let sawPapers = false;
let lastPaperAt = 0;
let mainEnd = null;

// Per-match fight timeline: when the real fight began, when the KO happened, and how close it was.
const matches = new Map();
function trackMatch(m, now) {
  if (!m) return;
  let rec = matches.get(m.no);
  if (!rec) {
    rec = { no: m.no, label: m.label, kind: m.kind, roundName: m.roundName, g: m.g, isFinal: m.isFinal, names: m.names, seen: now, fightStart: null, ko: null, winner: null, minHp: m.hp.map(() => 1) };
    matches.set(m.no, rec);
  }
  if (rec.ko !== null && !m.over) { rec.ko = null; rec.fightStart = null; rec.winner = null; rec.minHp = m.hp.map(() => 1); }
  if (m.go && !m.over && rec.fightStart === null) rec.fightStart = now;
  if (!m.over) m.hp.forEach((v, i) => { if (v < rec.minHp[i]) rec.minHp[i] = v; });
  if (m.over && rec.ko === null && rec.fightStart !== null) { rec.ko = now; rec.winner = m.winner; }
}
for (;;) {
  const snap = await page.evaluate(() => {
    const matchSnap = () => {
      const r = window.__rig;
      const t = r.tour;
      if (!t || !t.cur) return null;
      const d = r.duel;
      const k = t.cur.ids.length;
      return {
        no: t.matchNo,
        label: t.cur.label || '',
        kind: t.cur.kind,
        roundName: t.roundName,
        g: t.cur.g,
        isFinal: !!t.isFinal,
        names: t.cur.ids.map((e) => e.name),
        go: !d.intro || !!d.intro.go,
        over: !!d.over,
        winner: d.winner && d.winner.entrant ? d.winner.entrant.name : null,
        hp: r.app.fighters.slice(0, k).map((p) => (p.maxHp ? Math.max(0, p.hp) / p.maxHp : 1)),
        card: !!document.getElementById('vid-match'),
      };
    };
    const c = document.getElementById('tour-champ');
    const t = window.__rig.tour;
    return {
      champion: !!(t && t.log && t.log.some((l) => /^CHAMPION/.test(l))) || (!!c && !c.hidden),
      isFinal: !!(t && t.isFinal),
      papers: !!document.getElementById('news-wall'),
      log: t && t.log ? t.log.slice() : null,
      panel: document.getElementById('tour-panel')?.innerText ?? '',
      match: matchSnap(),
    };
  });
  const now = (Date.now() - recordingStartedAt) / 1000;
  trackMatch(snap.match, now);
  if (snap.log) {
    for (; seenLog < snap.log.length; seenLog++) {
      const line = snap.log[seenLog];
      if (/wins$/.test(line) && !/bye/i.test(line)) events.push({ t: now, line });
    }
  } else if (lastPanel && snap.panel !== lastPanel) {
    events.push({ t: now, line: snap.panel });
  }
  lastPanel = snap.panel;
  if (sceneCount && snap.match && snap.match.no !== lastSceneryMatch) {
    if (lastSceneryMatch !== null) {
      const next = await pickScenery();
      log(`Scenery for match ${snap.match.no}: ${next ? next.name : 'unchanged'}`);
    }
    lastSceneryMatch = snap.match.no;
  }
  if (!sceneryVerified && sceneCount && snap.match && snap.match.go) {
    sceneryVerified = true;
    const checkStage = async () => page.evaluate(() => ({
      current: window.__rig && window.__rig.currentScenery ? (window.__rig.currentScenery() || {}).id || null : 'n/a',
      images: [...document.querySelectorAll('image')].filter((e) => { const h = e.getAttribute('href') || ''; return h.includes('scenery-file') || h.startsWith('blob:'); }).length,
      hrefs: [...document.querySelectorAll('image')].slice(0, 4).map((e) => (e.getAttribute('href') || '').slice(0, 60)),
    })).catch(() => null);
    let st = await checkStage();
    log(`Scenery stage check (match ${snap.match.no}, fighting): current=${st ? st.current : '?'} sceneryImages=${st ? st.images : '?'} sampleHrefs=${st ? JSON.stringify(st.hrefs) : '?'}`);
    try { await page.screenshot({ path: join(dirname(outFile), 'debug-stage.png') }); log('Saved output/debug-stage.png for visual checking.'); } catch {}
    if (st && !st.images) {
      log('Scenery is NOT on the fighting stage - driving it again and probing one layer...');
      const next = await pickScenery();
      log(`Scenery re-drive: ${next ? next.name : 'none'}`);
      await page.waitForTimeout(6000);
      st = await checkStage();
      log(`Scenery stage re-check: current=${st ? st.current : '?'} sceneryImages=${st ? st.images : '?'}`);
      const probe = await page.evaluate(async () => {
        const out = { state: window.__sceneryState ? { status: window.__sceneryState.status, current: window.__sceneryState.current, failedLayers: window.__sceneryState.failedLayers, lastError: window.__sceneryState.lastError } : null };
        try {
          const defs = window.__rig.sceneryDefs();
          const firstDef = defs[Object.keys(defs)[0]];
          const url = firstDef && firstDef.layers && (firstDef.layers.sky || Object.values(firstDef.layers)[0]);
          out.url = url;
          try { const r = await fetch(url, { cache: 'no-store' }); const b = await r.blob(); out.fetch = { status: r.status, type: b.type, size: b.size }; } catch (e) { out.fetch = { error: String(e) }; }
          out.image = await new Promise((res) => { const im = new Image(); const to = setTimeout(() => res({ timeout: true }), 15000); im.onload = () => { clearTimeout(to); res({ ok: true, w: im.naturalWidth, h: im.naturalHeight }); }; im.onerror = () => { clearTimeout(to); res({ error: true }); }; im.src = url + '&probe=' + Date.now(); });
        } catch (e) { out.error = String((e && e.message) || e); }
        return out;
      }).catch((e) => ({ error: String((e && e.message) || e) }));
      log('Scenery probe:', JSON.stringify(probe));
      try { await page.screenshot({ path: join(dirname(outFile), 'debug-stage.png') }); } catch {}
    }
  }
  if (videoLimitSeconds > 0 && now - trimSeconds >= videoLimitSeconds) {
    log(`Test length of ${opt['video-minutes']} min reached, cutting the tournament footage here.`);
    mainEnd = now;
    break;
  }
  if (snap.isFinal && snap.papers) { sawPapers = true; lastPaperAt = now; }
  if (sawPapers && !snap.papers) { mainEnd = lastPaperAt + endWait; break; }
  // No newspapers in this final (the game sometimes has no reporters): stop right after the champion is decided.
  if (snap.champion && !snap.papers) { mainEnd = (sawPapers ? lastPaperAt : now) + endWait; break; }
  const elapsed = Date.now() - startedAt;
  // Arena frames for the intro backgrounds: only real fighting, never a card, bracket or newspaper scene.
  if (shots.length < 8 && elapsed - lastShotAt > 3500 && elapsed > 2500 && snap.match && snap.match.go && !snap.match.over && !snap.match.card) {
    lastShotAt = elapsed;
    shots.push((await page.screenshot({ type: 'jpeg', quality: 88 })).toString('base64'));
  }
  if (elapsed > maxMs) { log('Time limit reached, stopping early.'); break; }
  if (elapsed - lastReport > 30_000) {
    lastReport = elapsed;
    const txt = await page.evaluate(() => document.getElementById('tour-panel')?.innerText?.slice(0, 80) ?? '');
    log(`Recording ${(elapsed / 60_000).toFixed(1)} min`, txt.replace(/\s+/g, ' '));
  }
  await page.waitForTimeout(250);
}
const nowSeconds = () => (Date.now() - recordingStartedAt) / 1000;
if (mainEnd === null) mainEnd = nowSeconds();
log(sawPapers ? 'Final newspapers shown. Finishing the game footage...' : 'Champion decided. Finishing the game footage...');
const remaining = mainEnd - nowSeconds();
if (remaining > 0) await page.waitForTimeout(remaining * 1000);
mainEnd = Math.min(mainEnd, nowSeconds());

const recordingEndedAt = Date.now();
const championInfo = await page.evaluate(() => {
  const c = window.__rig && window.__rig.tour && window.__rig.tour.champion;
  return c ? { id: c.id, name: c.name } : null;
});
const championName = championInfo ? championInfo.name : null;
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
    const file = join(audioDir, `a${audioFiles.size}.bin`);
    const dataUri = src.match(/^data:[^,]*;base64,(.*)$/s);
    if (dataUri) {
      // Sounds synthesized inside the game (animal voices) come as data: URIs, not downloadable URLs.
      writeFileSync(file, Buffer.from(dataUri[1], 'base64'));
    } else {
      const res = await context.request.get(src, { timeout: 30_000 });
      if (!res.ok()) throw new Error(`HTTP ${res.status()}`);
      writeFileSync(file, await res.body());
    }
    audioFiles.set(src, file);
  } catch (e) {
    log(`Could not download sound ${src.slice(0, 80)}: ${e.message}`);
  }
}
let mixable = instances.filter((i) => audioFiles.has(i.src));
const isMusic = (i) => /\/music\//i.test(decodeURIComponent(i.src));
// How much of the footage that actually ends up in the video (after the trimmed start) has music under it.
const footageStart = trimSeconds;
const musicCovered = mixable.filter(isMusic).reduce((s, i) => s + Math.max(0, Math.min(i.start + i.dur, recordingSeconds) - Math.max(i.start, footageStart)), 0);
const footageSeconds = Math.max(0, recordingSeconds - footageStart);
for (const i of mixable.filter(isMusic)) log(`Music: ${decodeURIComponent(i.src).split('/').slice(-2).join('/')} at ${i.start.toFixed(1)}s for ${i.dur.toFixed(1)}s`);
if (footageSeconds > 5 && musicCovered < footageSeconds * 0.5) {
  // The game page did not keep its music playing during the recording, so loop its background track instead.
  try {
    log(`Music covers only ${musicCovered.toFixed(0)}s of ${footageSeconds.toFixed(0)}s of footage; adding looped background music from the host.`);
    const list = await (await context.request.get(new URL('?api=music', opt.url).href, { timeout: 30_000 })).json();
    const track = (list.nhac_nen || [])[0];
    if (!track) throw new Error('host has no nhac_nen track');
    const url = new URL(track, opt.url).href;
    const res = await context.request.get(url, { timeout: 30_000 });
    if (!res.ok()) throw new Error(`HTTP ${res.status()}`);
    const file = join(audioDir, `a${audioFiles.size}.bin`);
    writeFileSync(file, await res.body());
    audioFiles.set(url, file);
    mixable = mixable.filter((i) => !(isMusic(i) && i.start >= footageStart));
    mixable.push({ src: url, start: footageStart, dur: footageSeconds, off: 0, vol: 0.22, loop: true });
  } catch (e) {
    log(`Could not add fallback music: ${e.message}`);
  }
}
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
    const introWithImages = introFighters;
  log(`Rendering intro "${introChoice}" (${introSeconds}s)...`);
  intro = await recordCard(
    buildIntroHtml({ variant: introChoice, fighters: introWithImages, shots, lang: opt.lang, seconds: introSeconds }),
    introSeconds,
    'intro',
  );
}

let outro = null;
if (outroChoice) {
  const champion = championInfo ? { name: championInfo.name, img: portraitById[championInfo.id] ?? null } : null;
  log(`Rendering outro "${outroChoice}" (${outroSeconds}s)...`);
  outro = await recordCard(buildOutroHtml({ variant: outroChoice, shots, champion }), outroSeconds, 'outro');
}
// Highlights are cut only from inside real fights: from (at most) `before` seconds ahead of the KO, never
// earlier than the start of the fight or the end of the pre-match card, up to `after` seconds past the KO.
// Nothing before the fight (cards, walk-in) or after it (bracket, results) can end up in a clip.
// The final is never used, so the champion is not spoiled.
const before = Number(opt['highlight-before']);
const after = Number(opt['highlight-after']);
const cardGuard = matchCardSeconds + 0.5;
const clipCandidates = [];
for (const m of matches.values()) {
  if (m.isFinal || m.ko === null || m.fightStart === null) continue;
  const start = Math.max(m.ko - before, m.fightStart + 0.3, m.seen + cardGuard, trimSeconds + 0.5);
  const end = m.ko + after;
  if (end - start < 2.5) continue;
  const wi = m.names.indexOf(m.winner);
  const closeness = wi >= 0 ? 1 - m.minHp[wi] : 0;
  clipCandidates.push({ ...m, start, end, score: closeness + Math.random() * 0.35 });
}
const picked = clipCandidates.sort((a, b) => b.score - a.score).slice(0, highlightCount).sort((a, b) => a.start - b.start);
log(`Highlights: ${picked.length} clip(s)`, picked.map((p) => `${p.label}: ${p.names.join(' vs ')}`).join(' | '));

const FXT = textFor(opt.lang);
const IT = introText(opt.lang);
const HL_CARD_SECONDS = 2.2;
const MAIN_CARD_SECONDS = 1.8;
let hlAssets = null;
let hlCard = null;
let mainCard = null;
if (picked.length) {
  hlAssets = await renderHighlightAssets(browser, {
    W: outW,
    H: outHeight,
    dir: tmpDir,
    plates: picked.map((m, i) => ({
      title: `${FXT.highlight} ${i + 1}/${picked.length}`,
      line1: m.names.length === 2 ? m.names.join(`   ${FXT.vs}   `) : m.names.join('  ·  '),
      line2: stageLabel(FXT, m),
    })),
  });
  hlCard = await recordCard(buildTitleCardHtml({ title: IT.hlTitle, sub: IT.hlSub, shots, seconds: HL_CARD_SECONDS }), HL_CARD_SECONDS, 'hlcard');
  mainCard = await recordCard(buildTitleCardHtml({ title: IT.mainTitle, sub: IT.mainSub, shots, seconds: MAIN_CARD_SECONDS, tone: 'red' }), MAIN_CARD_SECONDS, 'maincard');
}

// Metadata for SEO (title / description) and a click-worthy YouTube thumbnail.
const videoShort = outFile.replace(/\.mp4$/i, '');
const thumbPath = `${videoShort}.thumb.jpg`;
try {
  await renderThumbnail();
} catch (e) {
  log(`Thumbnail failed (video is still produced): ${redact(String(e.message).split('\n')[0])}`);
}
const stageNames = [...new Set([...matches.values()].map((m) => m.roundName).filter(Boolean))];
const finalMatch = [...matches.values()].find((m) => m.isFinal);
writeFileSync(`${videoShort}.json`, JSON.stringify({
  fighters,
  fighterNames: introFighters.map((f) => f.name),
  champion: championName,
  finalists: finalMatch ? finalMatch.names : [],
  stages: stageNames,
  highlights: picked.map((m) => ({ label: m.label, names: m.names })),
  durationSeconds: Math.round(mainEnd - trimSeconds),
  height: outHeight,
  thumbnail: existsSync(thumbPath) ? thumbPath : null,
}, null, 2));

async function renderThumbnail() {
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const pool = introFighters.filter((f) => f.img);
  const rnd = pool.slice().sort(() => Math.random() - 0.5);
  const finalists = finalMatch ? finalMatch.names : [];
  // Prefer the two finalists (a VS clash), otherwise four random fighters.
  let stars = finalists.map((n) => pool.find((f) => f.name === n)).filter(Boolean);
  if (stars.length < 2) stars = rnd.slice(0, Math.min(4, rnd.length));
  const shot = shots.length ? shots[Math.floor(shots.length / 2)] : null;
  const duel = stars.length === 2;
  const headline = duel ? 'WHO WINS?' : `${fighters} FIGHTERS`;
  const sub = duel ? `${fighters} FIGHTERS \u2022 ONE CHAMPION` : 'ONLY ONE CHAMPION';
  const cards = stars.map((f, i) => `
    <div class="c c${i}${duel ? ' duel' : ''}"><img src="data:image/png;base64,${f.img}" alt=""><span>${esc(f.name.toUpperCase())}</span></div>`).join(duel ? '<div class="vs">VS</div>' : '');
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box;margin:0}
  body{width:1280px;height:720px;overflow:hidden;position:relative;font-family:'Noto Sans','DejaVu Sans',Impact,sans-serif;font-weight:900;color:#fff;background:#10131c}
  .bg{position:absolute;inset:-30px;background:${shot ? `url(data:image/jpeg;base64,${shot})` : 'linear-gradient(135deg,#7f1d1d,#1e1b4b)'} center/cover;filter:saturate(1.7) contrast(1.15) brightness(.6) blur(${shot ? 3 : 0}px)}
  .glow{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 70%,rgba(250,204,21,.45),transparent 60%),linear-gradient(180deg,rgba(0,0,0,.7) 0,transparent 36%,transparent 64%,rgba(0,0,0,.85) 100%)}
  .row{position:absolute;left:0;right:0;top:150px;bottom:110px;display:flex;align-items:flex-end;justify-content:center;gap:24px}
  .c{position:relative;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:flex-end}
  .c img{max-height:92%;max-width:340px;object-fit:contain;filter:drop-shadow(0 0 22px rgba(0,0,0,.9)) drop-shadow(0 0 6px rgba(250,204,21,.7))}
  .c.duel img{max-width:420px;max-height:100%}
  .c0.duel img{transform:scale(1.08)}
  .c span{margin-top:6px;font-size:30px;letter-spacing:1px;-webkit-text-stroke:6px #000;paint-order:stroke fill;color:#fde047}
  .vs{align-self:center;font-size:130px;color:#ef4444;-webkit-text-stroke:10px #000;paint-order:stroke fill;transform:rotate(-8deg);text-shadow:0 0 40px rgba(239,68,68,.9)}
  h1{position:absolute;top:18px;left:0;right:0;text-align:center;font-size:118px;line-height:1;color:#facc15;-webkit-text-stroke:12px #000;paint-order:stroke fill;letter-spacing:2px;text-shadow:0 10px 0 rgba(0,0,0,.5)}
  .sub{position:absolute;bottom:26px;left:0;right:0;text-align:center;font-size:58px;color:#fff;-webkit-text-stroke:9px #000;paint-order:stroke fill}
  .bar{position:absolute;left:0;right:0;bottom:0;height:12px;background:#facc15}
  </style></head><body><div class="bg"></div><div class="glow"></div><h1>${esc(headline)}</h1>
  <div class="row">${cards}</div><div class="sub">${esc(sub)}</div><div class="bar"></div></body></html>`;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  try {
    const p = await ctx.newPage();
    await p.setContent(html, { waitUntil: 'load' });
    await p.evaluate(() => document.fonts.ready);
    for (const quality of [92, 82, 70, 55]) {
      const buf = await p.screenshot({ type: 'jpeg', quality });
      writeFileSync(thumbPath, buf);
      if (buf.length <= 2 * 1024 * 1024) break;
    }
    log('Thumbnail written:', thumbPath);
  } finally {
    await ctx.close();
  }
}
await browser.close();

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
      ins.push(...(s.loop ? ['-stream_loop', '-1'] : []), '-ss', Math.max(0, s.off).toFixed(3), '-t', s.dur.toFixed(3), '-i', audioFiles.get(s.src));
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
// audio: 'silent' (needs a duration), 'game' (cut from the mixed game audio) or { wav }.
// fx: { frame, plate } wraps the footage in the animated highlight frame (blurred backdrop, gold frame, title plate).
const addSegment = (file, start, duration, audio, fadeIn = 0, fadeOut = 0, fx = null) => {
  const i = chains.length;
  const dur = ['-t', duration.toFixed(2)];
  const vIdx = inputCount++;
  inputs.push('-ss', start.toFixed(2), ...dur, '-i', file);
  const fadeChain = (name) => [
    fadeIn ? `${name}=t=in:st=0:d=${fadeIn}` : '',
    fadeOut ? `${name}=t=out:st=${(duration - fadeOut).toFixed(2)}:d=${fadeOut}` : '',
  ].filter(Boolean).map((f) => `,${f}`).join('');
  const aIdx = inputCount++;
  if (audio === 'silent') {
    inputs.push('-f', 'lavfi', '-t', duration.toFixed(2), '-i', 'anullsrc=r=44100:cl=stereo');
  } else if (typeof audio === 'object') {
    inputs.push('-t', duration.toFixed(2), '-i', audio.wav);
  } else {
    inputs.push('-ss', start.toFixed(2), ...dur, '-i', gameAudioPath ?? file);
  }
  let chain;
  if (fx) {
    const frameIdx = inputCount++;
    inputs.push('-loop', '1', '-framerate', String(opt.fps), '-t', duration.toFixed(2), '-i', fx.frame);
    const plateIdx = inputCount++;
    inputs.push('-loop', '1', '-framerate', String(opt.fps), '-t', duration.toFixed(2), '-i', fx.plate);
    chain = highlightChain({ i, vIdx, frameIdx, plateIdx, outW, outH: outHeight, norm, fades: fadeChain('fade') });
  } else {
    chain = `[${vIdx}:v]setpts=PTS-STARTPTS,${norm}${fadeChain('fade')}[v${i}]`;
  }
  chain += `;[${aIdx}:a]asetpts=PTS-STARTPTS,${normA}${fadeChain('afade')}[a${i}]`;
  chains.push(chain);
};
const silentOrGame = gameAudioPath ? 'game' : 'silent';
const introAudio = intro ? { wav: makeIntroAudio(join(audioDir, 'intro.wav'), introSeconds) } : null;
const outroAudio = outro ? { wav: makeOutroAudio(join(audioDir, 'outro.wav'), outroSeconds) } : null;
if (intro) addSegment(intro.path, intro.trim, introSeconds, introAudio);
if (hlCard) addSegment(hlCard.path, hlCard.trim, HL_CARD_SECONDS, { wav: makeIntroAudio(join(audioDir, 'highlights.wav'), HL_CARD_SECONDS) }, 0, 0.15);
picked.forEach((m, i) => addSegment(videoPath, m.start, m.end - m.start, silentOrGame, 0.2, 0.2, { frame: hlAssets.frame, plate: hlAssets.plates[i] }));
if (mainCard) addSegment(mainCard.path, mainCard.trim, MAIN_CARD_SECONDS, 'silent', 0.15, 0.2);
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
