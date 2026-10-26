// Visual extras: the pre-match card injected into the recorded game page, and the
// frame / title plate PNGs that wrap each highlight clip. Every size is in vh so the
// look is identical at 240p, 1080p or 2K.
import { join } from 'node:path';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const FX_TEXT = {
  en: {
    match: 'MATCH',
    group: 'GROUP STAGE',
    groupName: 'GROUP {x}',
    matchOf: 'Match {i} of {n}',
    final: 'FINAL',
    semifinal: 'SEMIFINAL',
    quarterfinal: 'QUARTERFINAL',
    round: 'ROUND {n}',
    highlight: 'HIGHLIGHT',
    fighters: '{n} FIGHTERS',
    vs: 'VS',
  },
  vi: {
    match: 'TRẬN',
    group: 'VÒNG BẢNG',
    groupName: 'BẢNG {x}',
    matchOf: 'Trận {i} / {n}',
    final: 'CHUNG KẾT',
    semifinal: 'BÁN KẾT',
    quarterfinal: 'TỨ KẾT',
    round: 'VÒNG {n}',
    highlight: 'ĐIỂM NHẤN',
    fighters: '{n} CHIẾN BINH',
    vs: 'VS',
  },
};

// Text entries with {placeholders} are plain strings so the whole table can be sent into the page.
export const fmt = (tpl, vars) => tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k]);
export const textFor = (lang) => FX_TEXT[lang] ?? FX_TEXT.en;

// "Quarterfinal" -> "QUARTERFINAL" / "TỨ KẾT"; group matches -> "GROUP STAGE · GROUP B".
export function stageLabel(T, { kind, roundName, g }) {
  if (kind === 'group') return `${T.group} · ${fmt(T.groupName, { x: String.fromCharCode(65 + (g || 0)) })}`;
  const n = roundName || '';
  if (/^final/i.test(n)) return T.final;
  if (/^semi/i.test(n)) return T.semifinal;
  if (/^quarter/i.test(n)) return T.quarterfinal;
  const num = (n.match(/\d+/) || [''])[0];
  return num ? fmt(T.round, { n: num }) : n.toUpperCase();
}

const MATCH_CARD_CSS = `
#vid-match{position:fixed;inset:0;z-index:2147483000;visibility:visible!important;pointer-events:none;display:flex;align-items:center;justify-content:center;
  font-family:"Inter","Noto Sans","Segoe UI",Roboto,Arial,sans-serif;color:#fff;animation:vmFade var(--vm-dur) linear both}
#vid-match *{visibility:visible!important;box-sizing:border-box}
#vid-match .vm-dim{position:absolute;inset:0;background:radial-gradient(ellipse at center,rgba(4,7,16,.5),rgba(4,7,16,.86))}
#vid-match .vm-panel{position:relative;display:flex;flex-direction:column;align-items:center;gap:2.2vh;animation:vmPanel .5s cubic-bezier(.2,1.3,.4,1) both;max-width:96vw}
#vid-match .vm-head{display:flex;align-items:center;gap:2.4vh}
#vid-match .vm-no{display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:12vh;padding:.8vh 2.4vh;border-radius:1.6vh;
  background:linear-gradient(180deg,#ffe27a,#ffb300);color:#241700;box-shadow:0 0 4vh rgba(255,190,0,.55),0 .8vh 0 #8a5a00}
#vid-match .vm-no small{font-size:2.2vh;font-weight:900;letter-spacing:.2em;line-height:1}
#vid-match .vm-no b{font-size:7.4vh;font-weight:900;line-height:1}
#vid-match .vm-stage{display:flex;flex-direction:column;gap:.6vh;align-items:flex-start}
#vid-match .vm-stage h1{margin:0;font-size:7.6vh;font-weight:900;letter-spacing:.05em;line-height:1;color:#ffd23f;text-shadow:0 .7vh 0 #000,0 0 5vh rgba(255,210,63,.55)}
#vid-match .vm-stage p{margin:0;font-size:3.4vh;font-weight:800;letter-spacing:.14em;color:#e8ecf5;text-shadow:0 .4vh 0 #000}
#vid-match .vm-line{width:78vh;max-width:90vw;height:.7vh;border-radius:99vh;background:linear-gradient(90deg,transparent,#ffd23f,transparent);box-shadow:0 0 3vh rgba(255,210,63,.6)}
#vid-match .vm-row{display:flex;align-items:center;justify-content:center;gap:2.6vh}
#vid-match .vm-fc{position:relative;display:flex;flex-direction:column;align-items:center;animation:vmCard .55s cubic-bezier(.2,1.4,.4,1) both}
#vid-match .vm-img{position:relative;border-radius:1.8vh;overflow:hidden;border:.4vh solid rgba(255,255,255,.55);background:radial-gradient(ellipse at 50% 78%,#32427a 0%,#0b0f1c 82%);box-shadow:0 1.2vh 3.5vh rgba(0,0,0,.65),0 0 3vh rgba(120,160,255,.28)}
#vid-match .vm-img img{position:absolute;left:6%;top:5%;width:88%;height:88%;object-fit:contain;object-position:center bottom;filter:drop-shadow(0 .6vh .9vh rgba(0,0,0,.65))}
#vid-match .vm-img .ph{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:12vh;font-weight:900;color:rgba(255,255,255,.22)}
#vid-match .vm-nm{margin-top:1.2vh;max-width:100%;padding:.7vh 2vh;border-radius:99vh;background:rgba(0,0,0,.72);border:.3vh solid rgba(255,255,255,.35);font-weight:900;letter-spacing:.02em;line-height:1.1;text-align:center;border-radius:2.2vh;text-shadow:0 .3vh 0 #000}
#vid-match .vm-ch{margin-top:.5vh;font-weight:700;color:#aab6d4;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
#vid-match .vm-vs{font-size:12vh;font-weight:900;color:#ff3b3b;line-height:1;text-shadow:0 .9vh 0 #000,0 0 7vh rgba(255,60,60,.8);animation:vmVs .5s cubic-bezier(.2,1.8,.4,1) .35s both}
#vid-match .vm-vs.sm{font-size:6vh}
#vid-match.final .vm-stage h1{color:#ff5a4d;text-shadow:0 .7vh 0 #000,0 0 6vh rgba(255,60,60,.75)}
#vid-match.final .vm-no{background:linear-gradient(180deg,#ff8a7a,#ff3b30);color:#fff;box-shadow:0 0 4vh rgba(255,60,60,.7),0 .8vh 0 #7a0f08}
#vid-match.final .vm-line{background:linear-gradient(90deg,transparent,#ff4d4d,transparent);box-shadow:0 0 3vh rgba(255,60,60,.7)}
#vid-match.final .vm-img{border-color:#ffb3a8;box-shadow:0 1.2vh 3.5vh rgba(0,0,0,.65),0 0 4vh rgba(255,70,60,.5)}
@keyframes vmFade{0%{opacity:0}8%{opacity:1}86%{opacity:1}100%{opacity:0}}
@keyframes vmPanel{from{transform:translateY(5vh) scale(.88)}to{transform:none}}
@keyframes vmCard{from{opacity:0;transform:translateY(8vh) scale(.8)}to{opacity:1;transform:none}}
@keyframes vmVs{from{opacity:0;transform:scale(3)}to{opacity:1;transform:scale(1)}}
`;

// Injects a watcher into the recorded game page. Whenever the tournament moves on to a new match it
// overlays a card with the match number, the stage, and the portrait + name of every fighter.
export async function installMatchCard(page, { portraits, lang, seconds }) {
  const T = textFor(lang);
  await page.evaluate(
    ({ portraits, T, seconds, css }) => {
      if (window.__matchCardInstalled) return;
      window.__matchCardInstalled = true;
      const style = document.createElement('style');
      style.textContent = css;
      document.head.appendChild(style);
      const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
      const fmt = (tpl, vars) => tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k]);
      const stageName = (t) => {
        const n = t.roundName || '';
        if (/^final/i.test(n)) return T.final;
        if (/^semi/i.test(n)) return T.semifinal;
        if (/^quarter/i.test(n)) return T.quarterfinal;
        const num = (n.match(/\d+/) || [''])[0];
        return num ? fmt(T.round, { n: num }) : n.toUpperCase();
      };
      const show = (t) => {
        const m = t.cur;
        const k = m.ids.length;
        const isGroup = m.kind === 'group';
        const title = isGroup ? T.group : stageName(t);
        const sub = isGroup
          ? `${fmt(T.groupName, { x: String.fromCharCode(65 + (m.g || 0)) })}  ·  ${fmt(T.fighters, { n: k })}`
          : fmt(T.matchOf, { i: t.matchIdx, n: t.stageTotal });
        const ch = k <= 2 ? 44 : k === 3 ? 38 : 34;
        const fs = k <= 2 ? 3.6 : 3;
        const cards = m.ids
          .map((e, i) => {
            const img = portraits[e.id];
            const body = img ? `<img src="data:image/png;base64,${img}" alt="">` : `<div class="ph">?</div>`;
            const sep = i < k - 1 ? `<div class="vm-vs${k > 2 ? ' sm' : ''}">${esc(T.vs)}</div>` : '';
            return `<div class="vm-fc" style="animation-delay:${(0.12 + i * 0.1).toFixed(2)}s;width:${(ch * 0.9).toFixed(1)}vh">
              <div class="vm-img" style="width:${(ch * 0.9).toFixed(1)}vh;height:${ch}vh">${body}</div>
              <div class="vm-nm" style="font-size:${fs}vh">${esc(e.name)}</div>
              <div class="vm-ch" style="font-size:${(fs * 0.68).toFixed(2)}vh">${esc((e.char && e.char.name) || '')}</div>
            </div>${sep}`;
          })
          .join('');
        const old = document.getElementById('vid-match');
        if (old) old.remove();
        const el = document.createElement('div');
        el.id = 'vid-match';
        if (t.isFinal) el.classList.add('final');
        el.style.setProperty('--vm-dur', `${seconds}s`);
        el.innerHTML = `<div class="vm-dim"></div><div class="vm-panel">
          <div class="vm-head"><div class="vm-no"><small>${esc(T.match)}</small><b>${t.matchNo}</b></div>
          <div class="vm-stage"><h1>${esc(title)}</h1><p>${esc(sub)}</p></div></div>
          <div class="vm-line"></div><div class="vm-row">${cards}</div></div>`;
        document.body.appendChild(el);
        window.__matchCardAt = Date.now();
        setTimeout(() => { if (el.isConnected) el.remove(); }, seconds * 1000 + 200);
      };
      let last = null;
      setInterval(() => {
        const t = window.__rig && window.__rig.tour;
        if (!t || !t.cur || t.cur === last) return;
        last = t.cur;
        show(t);
      }, 60);
    },
    { portraits, T, seconds, css: MATCH_CARD_CSS },
  );
}

// Where the game footage sits inside a highlight frame (shared by the PNGs and the ffmpeg filter).
export function frameRect(W, H) {
  const even = (n) => Math.round(n / 2) * 2;
  const w = even(W * 0.86);
  const h = even(H * 0.8);
  return { w, h, x: Math.round((W - w) / 2), y: Math.round(H * 0.135) };
}

export const FRAME_HTML = (W, H) => {
  const r = frameRect(W, H);
  const pct = (v, total) => `${((v / total) * 100).toFixed(3)}%`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px;background:transparent;overflow:hidden}
.f{position:absolute;left:${pct(r.x, W)};top:${pct(r.y, H)};width:${pct(r.w, W)};height:${pct(r.h, H)};
  border:.9vh solid transparent;border-image:linear-gradient(135deg,#fff3b0,#ffb300 30%,#8a5a00 50%,#ffe27a 70%,#ffb300) 1;
  box-shadow:0 0 4vh rgba(255,190,0,.75),0 0 9vh rgba(255,150,0,.4),inset 0 0 3.5vh rgba(255,200,60,.55),inset 0 0 .5vh rgba(0,0,0,.8)}
.f::before{content:"";position:absolute;inset:.5vh;border:.25vh solid rgba(255,255,255,.55)}
.c{position:absolute;width:5.4vh;height:5.4vh;border:.8vh solid #fff3b0;filter:drop-shadow(0 0 1.2vh #ffb300)}
.c.tl{left:-1.9vh;top:-1.9vh;border-right:0;border-bottom:0}
.c.tr{right:-1.9vh;top:-1.9vh;border-left:0;border-bottom:0}
.c.bl{left:-1.9vh;bottom:-1.9vh;border-right:0;border-top:0}
.c.br{right:-1.9vh;bottom:-1.9vh;border-left:0;border-top:0}
.d{position:absolute;width:2.4vh;height:2.4vh;background:radial-gradient(circle,#fff 0%,#ffe27a 45%,#ffb300 100%);transform:rotate(45deg);box-shadow:0 0 2vh #ffb300}
.d.tl{left:-3vh;top:-3vh}.d.tr{right:-3vh;top:-3vh}.d.bl{left:-3vh;bottom:-3vh}.d.br{right:-3vh;bottom:-3vh}
.d.t{left:calc(50% - 1.2vh);bottom:-3.2vh}
</style></head><body><div class="f">
<i class="c tl"></i><i class="c tr"></i><i class="c bl"></i><i class="c br"></i>
<i class="d tl"></i><i class="d tr"></i><i class="d bl"></i><i class="d br"></i><i class="d t"></i>
</div></body></html>`;
};

export const PLATE_HTML = ({ title, line1, line2 }) => `<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{background:transparent;font-family:"Inter","Noto Sans","Segoe UI",Roboto,Arial,sans-serif}
#plate{display:inline-flex;flex-direction:column;align-items:center;padding:2.4vh 3vh 3.2vh}
.r{position:relative;z-index:2;padding:.9vh 6.4vh;border-radius:1.2vh;background:linear-gradient(180deg,#fff0a6,#ffb300 55%,#d98200);color:#2a1800;
  font-size:4vh;font-weight:900;letter-spacing:.18em;white-space:nowrap;box-shadow:0 0 3.5vh rgba(255,190,0,.8),0 .7vh 0 #7a4b00}
.r::before,.r::after{content:"";position:absolute;top:50%;width:1.4vh;height:1.4vh;background:#2a1800;transform:translateY(-50%) rotate(45deg)}
.r::before{left:1.8vh}.r::after{right:1.8vh}
.b{margin-top:-.6vh;padding:2vh 5vh 1.3vh;border-radius:0 0 1.6vh 1.6vh;background:linear-gradient(180deg,rgba(8,12,24,.94),rgba(16,22,42,.9));
  border:.3vh solid rgba(255,210,90,.75);border-top:0;box-shadow:0 1vh 3vh rgba(0,0,0,.6);display:flex;flex-direction:column;align-items:center;gap:.4vh;max-width:150vh}
.l1{font-size:4.4vh;font-weight:900;color:#fff;letter-spacing:.04em;text-shadow:0 .4vh 0 #000;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:140vh}
.l2{font-size:2.6vh;font-weight:800;color:#ffd23f;letter-spacing:.16em}
</style></head><body><div id="plate"><div class="r">${esc(title)}</div><div class="b"><div class="l1">${esc(line1)}</div><div class="l2">${esc(line2)}</div></div></div></body></html>`;

// Renders the decorative frame and one title plate per highlight as transparent PNGs.
export async function renderHighlightAssets(browser, { W, H, plates, dir }) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  try {
    const page = await ctx.newPage();
    await page.setContent(FRAME_HTML(W, H), { waitUntil: 'load' });
    const frame = join(dir, 'hl-frame.png');
    await page.screenshot({ path: frame, omitBackground: true });
    const out = [];
    for (let i = 0; i < plates.length; i++) {
      await page.setContent(PLATE_HTML(plates[i]), { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      const file = join(dir, `hl-plate-${i}.png`);
      await page.locator('#plate').screenshot({ path: file, omitBackground: true });
      out.push(file);
    }
    return { frame, plates: out };
  } finally {
    await ctx.close();
  }
}

// ffmpeg filter chain that places a clip inside the highlight frame: blurred + darkened copy of the clip as
// backdrop, the clip itself in the frame rectangle, the gold frame fading in, and the title plate sliding down.
// `norm` is the shared scale/fps/format filter, `fades` the optional ",fade=..." suffix.
export function highlightChain({ i, vIdx, frameIdx, plateIdx, outW, outH, norm, fades = '' }) {
  const r = frameRect(outW, outH);
  const lowW = Math.max(2, Math.round(outW / 24) * 2);
  const lowH = Math.max(2, Math.round(outH / 24) * 2);
  const plateY = Math.round(outH * 0.022);
  return [
    `[${vIdx}:v]setpts=PTS-STARTPTS,${norm},split=2[bs${i}][fs${i}]`,
    `[bs${i}]scale=${lowW}:${lowH},boxblur=3:2,scale=${outW}:${outH}:flags=bilinear,eq=brightness=-0.3:saturation=1.3[bb${i}]`,
    `[fs${i}]scale=${r.w}:${r.h}:flags=lanczos[fg${i}]`,
    `[bb${i}][fg${i}]overlay=${r.x}:${r.y}[bo${i}]`,
    `[${frameIdx}:v]format=rgba,fade=t=in:st=0:d=0.4:alpha=1[fr${i}]`,
    `[${plateIdx}:v]format=rgba,fade=t=in:st=0.2:d=0.35:alpha=1[pl${i}]`,
    `[bo${i}][fr${i}]overlay=0:0:format=auto[bf${i}]`,
    `[bf${i}][pl${i}]overlay=x='(W-w)/2':y='min(${plateY},-h+(t/0.5)*(${plateY}+h))':eval=frame:format=auto,format=yuv420p${fades}[v${i}]`,
  ].join(';');
}
