#!/usr/bin/env node
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, existsSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { parseArgs } from 'node:util';

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
const capH = Math.round(Number(opt['capture-height']) / 2) * 2;
const capW = Math.round((capH * 16) / 9 / 2) * 2;
const tmpDir = resolve('.tmp-video');
mkdirSync(dirname(outFile), { recursive: true });
mkdirSync(tmpDir, { recursive: true });
for (const f of readdirSync(tmpDir)) rmSync(join(tmpDir, f), { force: true });

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

log('Opening', opt.url);
await page.goto(opt.url, { waitUntil: 'load', timeout: 60_000 });

log('Waiting for characters to load from the host...');
await page.waitForFunction(
  () => window.__rig && window.__rig.catalog && window.__rig.catalog().char.length > 0,
  null,
  { timeout: Number(opt['load-timeout']) * 1000 },
);
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

const startedAt = Date.now();
let lastReport = 0;
const maxMs = Number(opt['max-minutes']) * 60_000;
for (;;) {
  const done = await page.evaluate(() => {
    const c = document.getElementById('tour-champ');
    return !!c && !c.hidden;
  });
  if (done) break;
  const elapsed = Date.now() - startedAt;
  if (elapsed > maxMs) { log('Time limit reached, stopping early.'); break; }
  if (elapsed - lastReport > 30_000) {
    lastReport = elapsed;
    const txt = await page.evaluate(() => document.getElementById('tour-panel')?.innerText?.slice(0, 80) ?? '');
    log(`Recording ${(elapsed / 60_000).toFixed(1)} min`, txt.replace(/\s+/g, ' '));
  }
  await page.waitForTimeout(1000);
}
log('Champion crowned. Finishing...');
await page.waitForTimeout(Number(opt['end-wait']) * 1000);

const videoPath = await page.video().path();
await context.close();
await browser.close();

if (!existsSync(videoPath) || statSync(videoPath).size === 0) {
  console.error('No video was recorded.');
  process.exit(1);
}

log(`Encoding ${outHeight}p MP4 with ffmpeg...`);
const args = [
  '-y', '-i', videoPath,
  '-ss', trimSeconds.toFixed(2),
  '-vf', `scale=-2:${outHeight}:flags=lanczos,fps=${opt.fps}`,
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-pix_fmt', 'yuv420p',
  '-movflags', '+faststart', '-an', outFile,
];
await new Promise((res, rej) => {
  const ff = spawn('ffmpeg', args, { stdio: 'inherit' });
  ff.on('error', (e) => rej(new Error(`Could not run ffmpeg: ${e.message}`)));
  ff.on('close', (code) => (code === 0 ? res() : rej(new Error(`ffmpeg exited with code ${code}`))));
});

rmSync(tmpDir, { recursive: true, force: true });
log('Done:', outFile);
