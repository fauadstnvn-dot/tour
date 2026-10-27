// Hook intros. Every size is expressed in vh, so the same HTML renders
// identically at 240p, 1080p or 2K (1440p) - only the capture size changes.

export const VARIANTS = ['who', 'survive', 'predict', 'versus', 'countdown', 'elim'];

const TEXT = {
  en: {
    who: 'WHO WILL WIN?',
    whoSub: 'Only one name is left standing',
    survive: 'FIGHTERS LEFT',
    surviveEnd: 'ONLY ONE WILL REMAIN',
    predict: 'PICK YOUR CHAMPION',
    predictCta: 'COMMENT YOUR PICK BEFORE IT STARTS',
    versusTop: 'WHO WALKS AWAY?',
    versusBottom: 'ONLY ONE ADVANCES',
    fight: 'FIGHT!',
    countdownSub: (n) => `${n} FIGHTERS  ·  1 CHAMPION`,
    elim: 'CAN YOU GUESS THE LAST ONE STANDING?',
    watch: 'WATCH TO THE END',
    highlightNote: 'A FEW HIGHLIGHTS FROM THIS VIDEO',
    hlTitle: 'HIGHLIGHTS',
    hlSub: 'The best fighting moments',
    mainTitle: 'THE FULL TOURNAMENT',
    mainSub: 'From the first match to the champion',
  },
  vi: {
    who: 'AI SẼ CHIẾN THẮNG?',
    whoSub: 'Chỉ một cái tên còn đứng vững',
    survive: 'CHIẾN BINH CÒN LẠI',
    surviveEnd: 'CHỈ MỘT NGƯỜI SỐNG SÓT',
    predict: 'CHỌN NHÀ VÔ ĐỊCH CỦA BẠN',
    predictCta: 'BÌNH LUẬN DỰ ĐOÁN TRƯỚC KHI XEM',
    versusTop: 'AI SẼ BƯỚC TIẾP?',
    versusBottom: 'CHỈ MỘT NGƯỜI THẮNG',
    fight: 'CHIẾN!',
    countdownSub: (n) => `${n} CHIẾN BINH  ·  1 NHÀ VÔ ĐỊCH`,
    elim: 'BẠN ĐOÁN ĐƯỢC NGƯỜI CUỐI CÙNG?',
    watch: 'XEM ĐẾN CUỐI',
    highlightNote: 'VÀI ĐIỂM NHẤN TRONG VIDEO',
    hlTitle: 'ĐIỂM NHẤN',
    hlSub: 'Những pha giao tranh hay nhất',
    mainTitle: 'TOÀN BỘ GIẢI ĐẤU',
    mainSub: 'Từ trận mở màn đến nhà vô địch',
  },
};

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const shuffle = (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

export const introText = (lang) => TEXT[lang] ?? TEXT.en;

export function pickVariant(choice) {
  if (!choice || choice === 'random') return VARIANTS[Math.floor(Math.random() * VARIANTS.length)];
  if (!VARIANTS.includes(choice)) throw new Error(`Unknown intro "${choice}". Use random, none or one of: ${VARIANTS.join(', ')}`);
  return choice;
}

// Sharp arena frames cut quickly behind the text so real fighters are visible from frame one.
const reel = (shots, seconds) => {
  if (!shots.length) return '<div class="bg"></div>';
  const slot = Math.max(0.7, seconds / shots.length);
  return `<div class="reel">${shots.map((s, i) =>
    `<div class="shot" style="background-image:url(data:image/jpeg;base64,${s});animation-delay:${(i * slot).toFixed(2)}s,${(i * slot).toFixed(2)}s;animation-duration:.2s,${(slot * 2).toFixed(2)}s"></div>`).join('')}</div>`;
};

const css = (seconds) => `
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;overflow:hidden;background:#05070d;color:#fff;font-family:"Inter","Noto Sans","Segoe UI",Roboto,Arial,sans-serif}
body:not(.go) *{animation-play-state:paused!important}
.bg{position:fixed;inset:0;background:radial-gradient(circle at 50% 40%,#2a3354,#05070d)}
.reel{position:fixed;inset:0;background:#05070d}
.shot{position:absolute;inset:0;background-size:cover;background-position:center;opacity:0;filter:brightness(.8) saturate(1.2);animation-name:shotIn,shotZoom;animation-fill-mode:both,both;animation-timing-function:ease-out,linear}
.vig{position:fixed;inset:0;background:linear-gradient(to bottom,rgba(0,0,0,.55),rgba(0,0,0,.1) 35%,rgba(0,0,0,.1) 60%,rgba(0,0,0,.7)),radial-gradient(ellipse at center,transparent 40%,rgba(0,0,0,.6))}
.big,.kicker,.sub{text-shadow:0 .5vh 0 #000,0 0 3vh rgba(0,0,0,.9)}
@keyframes shotIn{from{opacity:0}to{opacity:1}}
@keyframes shotZoom{from{transform:scale(1.02)}to{transform:scale(1.14)}}
.wrap{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4vh;text-align:center;padding:0 6vh}
.kicker{font-size:7.5vh;font-weight:900;letter-spacing:.04em;line-height:1.05;color:#ffd23f;text-shadow:0 .5vh 0 #000,0 0 4vh rgba(255,210,63,.55);animation:pop .45s cubic-bezier(.2,1.6,.4,1) both}
.big{font-size:26vh;font-weight:900;line-height:1;text-shadow:0 1vh 0 #000,0 0 6vh rgba(255,80,60,.6)}
.name{font-size:9vh;font-weight:900;text-shadow:0 .6vh 0 #000}
.sub{font-size:4.6vh;font-weight:700;color:#e8ecf5;opacity:.92;animation:pop .45s cubic-bezier(.2,1.6,.4,1) both}
.foot{position:fixed;left:0;right:0;bottom:3vh;text-align:center;display:flex;flex-direction:column;align-items:center;gap:.8vh}
.foot .note{font-size:3vh;font-weight:900;letter-spacing:.16em;color:#1a1200;background:linear-gradient(90deg,#ffb300,#ffe27a 50%,#ffb300);padding:.6vh 3vh;border-radius:99vh;box-shadow:0 0 3vh rgba(255,190,0,.6);animation:pop .5s cubic-bezier(.2,1.6,.4,1) .3s both}
.foot .watch{font-size:2.8vh;font-weight:800;letter-spacing:.24em;color:#fff;opacity:.9;text-shadow:0 .3vh 0 #000;animation:blink 1s ease-in-out infinite}
.hero{font-size:3.4vh;box-shadow:0 0 8vh rgba(255,210,63,.45);animation:pop .5s cubic-bezier(.2,1.6,.4,1) both}
.hero.final{border-color:#ff4d4d;box-shadow:0 0 8vh rgba(255,60,60,.7);animation:shake .35s ease-in-out 3}
.card{position:relative;border-radius:1.6vh;overflow:hidden;border:.35vh solid rgba(255,255,255,.4);background:radial-gradient(ellipse at 50% 75%,#2a3760 0%,#0b0f1c 80%);box-shadow:0 1vh 3vh rgba(0,0,0,.6);flex:none}
.card img{position:absolute;left:6%;top:6%;width:88%;height:84%;object-fit:contain;object-position:center bottom;display:block;filter:drop-shadow(0 .5vh .8vh rgba(0,0,0,.6))}
.card .ph{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:8em;font-weight:900;color:rgba(255,255,255,.25)}
.card .nm{position:absolute;left:0;right:0;bottom:0;padding:.9em .3em .35em;background:linear-gradient(transparent,rgba(0,0,0,.92));font-weight:800;line-height:1.08;text-align:center;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;text-shadow:0 .2em 0 #000}
.card.in{opacity:0;animation:pop .3s cubic-bezier(.2,1.6,.4,1) both}
.card.dead{filter:grayscale(1) brightness(.35);border-color:#ff4d4d;transition:all .25s}
.card.dead::after,.card.dead::before{content:"";position:absolute;inset:0}
.card.dead::after{background:linear-gradient(to top right,transparent calc(50% - .3vh),#ff4d4d calc(50% - .3vh),#ff4d4d calc(50% + .3vh),transparent calc(50% + .3vh))}
.card.dead::before{background:linear-gradient(to bottom right,transparent calc(50% - .3vh),#ff4d4d calc(50% - .3vh),#ff4d4d calc(50% + .3vh),transparent calc(50% + .3vh))}
.card.sil img{filter:brightness(0)}
.card.sil .nm{color:#ffd23f}
.card.last{border-color:#ffd23f;transform:scale(1.18);box-shadow:0 0 5vh rgba(255,210,63,.7);transition:all .5s}
.grid{display:flex;flex-wrap:wrap;gap:1.6vh;justify-content:center;align-content:flex-start;max-width:96vw}
.strip{display:flex;gap:1.4vh;justify-content:center}
.top{display:flex;align-items:center;justify-content:center;gap:4vh}
.big2{font-size:14vh;font-weight:900;line-height:1;color:#fff;text-shadow:0 .8vh 0 #000,0 0 5vh rgba(255,80,60,.6)}
.fc{position:fixed;top:50%}
.fc.l{left:20vh;animation:inL .45s cubic-bezier(.2,1,.3,1) both}
.fc.r{right:20vh;animation:inR .45s cubic-bezier(.2,1,.3,1) .15s both}
.vs{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);font-size:22vh;font-weight:900;color:#ff3b3b;text-shadow:0 1vh 0 #000,0 0 8vh rgba(255,60,60,.8);animation:slam .4s cubic-bezier(.2,1.8,.4,1) .55s both}
.flash{position:fixed;inset:0;background:#fff;opacity:0;animation:flash .35s ease-out .55s both}
.num{animation:pop .35s cubic-bezier(.2,1.8,.4,1) both}
@keyframes zoom{from{transform:scale(1.08)}to{transform:scale(1.3)}}
@keyframes pop{from{opacity:0;transform:scale(.4)}to{opacity:1;transform:scale(1)}}
@keyframes slam{from{opacity:0;transform:translate(-50%,-50%) scale(3)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}
@keyframes inL{from{opacity:0;transform:translate(-60vh,-50%)}to{opacity:1;transform:translate(0,-50%)}}
@keyframes inR{from{opacity:0;transform:translate(60vh,-50%)}to{opacity:1;transform:translate(0,-50%)}}
@keyframes flash{0%{opacity:.95}100%{opacity:0}}
@keyframes blink{50%{opacity:.35}}
@keyframes shake{25%{transform:translateX(-1vh)}75%{transform:translateX(1vh)}}
`;

const portrait = (f) => (f.img ? `data:image/png;base64,${f.img}` : '');

const card = (f, ch, cls = '') =>
  `<div class="card ${cls}" style="width:${(ch * 0.9).toFixed(1)}vh;height:${ch}vh;font-size:${Math.max(ch * 0.085, 1.8).toFixed(1)}vh">${
    f.img ? `<img src="${portrait(f)}" alt="">` : '<div class="ph">?</div>'}<span class="nm">${esc(f.name)}</span></div>`;

// Largest card size that fits `count` cards inside a 16:9 canvas without clipping:
// every column count is tried and the best fit of width and height wins.
const CANVAS_W = (100 * 16) / 9;
function gridFor(count, header, footer = 15) {
  const gap = 1.6;
  const availW = CANVAS_W - 10;
  const availH = 100 - header - footer;
  let best = { cols: 1, ch: 1 };
  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols);
    const byH = (availH - (rows - 1) * gap) / rows;
    const byW = (availW - (cols - 1) * gap) / (cols * 0.9);
    const ch = Math.min(byH, byW, 40);
    if (ch > best.ch) best = { cols, ch };
  }
  return { cols: best.cols, ch: Number(best.ch.toFixed(1)) };
}
// The "last one standing" is never a real fighter: a neutral mystery card is mixed in so the
// intro cannot reveal (or accidentally match) the real champion.
const withMystery = (list) => {
  const real = list.slice(0, Math.max(1, list.length - 1));
  const at = Math.floor(Math.random() * (real.length + 1));
  return [...real.slice(0, at), { name: '???', mystery: true }, ...real.slice(at)];
};
const gridStyle = (cols, ch) => `width:${(cols * ch * 0.9 + (cols - 1) * 1.6 + 0.6).toFixed(1)}vh`;

function body(variant, fighters, t, seconds, total) {
  const n = total || fighters.length;
  const ms = seconds * 1000;
  const shown = shuffle(fighters).slice(0, 32);

  switch (variant) {
    case 'who': {
      const data = JSON.stringify(shuffle(fighters).map((f) => ({ n: f.name, i: portrait(f) })));
      return {
        html: `<div class="wrap"><div class="kicker">${esc(t.who)}</div>${card(shuffle(fighters)[0], 46, 'hero').replace('<img ', '<img id="himg" ').replace('<span class="nm">', '<span class="nm" id="hnm">').replace('class="card hero"', 'id="hero" class="card hero"')}<div class="sub" style="animation-delay:.6s">${esc(t.whoSub)}</div></div>`,
        js: `const F=${data},hero=document.getElementById('hero'),img=document.getElementById('himg'),nm=document.getElementById('hnm');let i=0,d=60;const t0=performance.now();
(function tick(){if(performance.now()-t0>${ms * 0.72}){hero.classList.add('final');if(img)img.style.display='none';const q=document.createElement('div');q.className='ph';q.textContent='?';hero.insertBefore(q,hero.firstChild);nm.textContent='???';return}
const f=F[i++%F.length];if(img&&f.i)img.src=f.i;nm.textContent=f.n;d=Math.min(380,d*1.07);setTimeout(tick,d)})();`,
      };
    }
    case 'survive': {
      const grid = withMystery(shown);
      const { cols, ch } = gridFor(grid.length, 23, 22);
      return {
        html: `<div class="wrap" style="gap:2.5vh;justify-content:flex-start;padding-top:5vh"><div class="top"><div class="big2 num" id="num">${n}</div><div class="kicker" style="font-size:6vh">${esc(t.survive)}</div></div><div class="grid" id="g" style="${gridStyle(cols, ch)}">${grid.map((f) => card(f, ch, f.mystery ? 'mys' : '')).join('')}</div><div class="sub" id="end" style="opacity:0">${esc(t.surviveEnd)}</div></div>`,
        js: `const num=document.getElementById('num'),keep=document.querySelector('.card.mys'),cards=[...document.querySelectorAll('.card:not(.mys)')].sort(()=>Math.random()-.5);let c=${n};
const total=Math.max(1,${n - 1}),step=Math.max(50,${ms * 0.7}/total);
const iv=setInterval(()=>{c--;num.textContent=c;num.classList.remove('num');void num.offsetWidth;num.classList.add('num');
const v=cards.pop();if(v)v.classList.add('dead');
if(c<=1){clearInterval(iv);keep.classList.add('last');const e=document.getElementById('end');e.style.opacity=1;e.style.animation='pop .45s cubic-bezier(.2,1.6,.4,1) both'}},step);`,
      };
    }
    case 'predict': {
      const { cols, ch } = gridFor(shown.length, 16, 26);
      return {
        html: `<div class="wrap" style="gap:2.5vh;justify-content:flex-start;padding-top:5vh"><div class="kicker" style="font-size:6.5vh">${esc(t.predict)}</div><div class="grid" style="${gridStyle(cols, ch)}">${shown.map((f, i) => card(f, ch, 'in').replace('class="card in"', `class="card in" data-d="${i}"`).replace('style="', `style="animation-delay:${((i * ms * 0.5) / shown.length / 1000).toFixed(2)}s;`)).join('')}</div><div class="sub" style="animation-delay:${(seconds * 0.55).toFixed(2)}s">${esc(t.predictCta)}</div></div>`,
        js: '',
      };
    }
    case 'versus': {
      const [a, b] = shuffle(fighters);
      return {
        html: `<div class="wrap" style="justify-content:flex-start;padding-top:6vh"><div class="kicker">${esc(t.versusTop)}</div></div><div class="fc l" style="transform:translateY(-50%)">${card(a, 46)}</div><div class="fc r" style="transform:translateY(-50%)">${card(b || a, 46)}</div><div class="vs">VS</div><div class="flash"></div><div class="wrap" style="justify-content:flex-end;padding-bottom:15vh"><div class="sub" style="animation-delay:1.1s">${esc(t.versusBottom)}</div></div>`,
        js: '',
      };
    }
    case 'countdown': {
      const strip = shuffle(fighters).slice(0, 7);
      return {
        html: `<div class="wrap" style="gap:3vh"><div class="big num" id="num">3</div><div class="sub" style="animation-delay:.2s">${esc(t.countdownSub(n))}</div><div class="strip" style="margin-top:2vh">${strip.map((f, i) => card(f, 22, 'in').replace('style="', `style="animation-delay:${(0.15 * i).toFixed(2)}s;`)).join('')}</div></div>`,
        js: `const num=document.getElementById('num'),seq=['3','2','1',${JSON.stringify(t.fight)}],step=${(ms * 0.22).toFixed(0)};
seq.forEach((s,i)=>setTimeout(()=>{num.textContent=s;if(i===3){num.style.color='#ff4d4d'}num.classList.remove('num');void num.offsetWidth;num.classList.add('num')},i*step));`,
      };
    }
    case 'elim':
    default: {
      const grid = withMystery(shown);
      const { cols, ch } = gridFor(grid.length, 16, 16);
      return {
        html: `<div class="wrap" style="gap:2.5vh;justify-content:flex-start;padding-top:5vh"><div class="kicker" style="font-size:5.6vh">${esc(t.elim)}</div><div class="grid" style="${gridStyle(cols, ch)}">${grid.map((f) => card(f, ch, f.mystery ? 'mys' : '')).join('')}</div></div>`,
        js: `const keep=document.querySelector('.card.mys'),cards=[...document.querySelectorAll('.card:not(.mys)')].sort(()=>Math.random()-.5),step=Math.max(50,${ms * 0.7}/Math.max(1,cards.length));
cards.forEach((c,i)=>setTimeout(()=>c.classList.add('dead'),400+i*step));
setTimeout(()=>keep.classList.add('last'),400+cards.length*step+150);`,
      };
    }
  }
}

export function buildIntroHtml({ variant, fighters, total = 0, shots = [], lang = 'en', seconds = 5 }) {
  const t = TEXT[lang] ?? TEXT.en;
  const list = fighters.length ? fighters : [{ name: '???' }];
  const { html, js } = body(variant, list, t, seconds, total);
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css(seconds)}</style></head>
<body>${reel(shots, seconds)}<div class="vig"></div>${html}<div class="foot"><div class="note">${esc(t.highlightNote)}</div><div class="watch">${esc(t.watch)}</div></div>
<script>window.__go=function(){document.body.classList.add('go');${js}};</script></body></html>`;
}

// Short full-screen title card (e.g. "HIGHLIGHTS") shown between the intro, the clips and the full tournament.
export function buildTitleCardHtml({ title, sub, shots = [], seconds = 2.2, tone = 'gold' }) {
  const color = tone === 'red' ? '#ff5a4d' : '#ffd23f';
  const glow = tone === 'red' ? 'rgba(255,70,60,.65)' : 'rgba(255,210,63,.6)';
  const extra = `
.tc{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3vh;text-align:center;padding:0 6vh}
.tc .t{font-size:15vh;font-weight:900;letter-spacing:.06em;line-height:1;color:${color};text-shadow:0 .9vh 0 #000,0 0 7vh ${glow};animation:tcIn .55s cubic-bezier(.2,1.5,.4,1) both}
.tc .s{font-size:4.4vh;font-weight:800;letter-spacing:.12em;color:#fff;text-shadow:0 .4vh 0 #000;animation:pop .5s cubic-bezier(.2,1.6,.4,1) .3s both}
.tc .bar{height:.9vh;border-radius:99vh;background:linear-gradient(90deg,transparent,${color},transparent);box-shadow:0 0 3vh ${glow};animation:bar .7s ease-out .15s both}
.tc .bar.b{animation-delay:.25s}
.spark{position:fixed;width:1.4vh;height:1.4vh;border-radius:50%;background:${color};box-shadow:0 0 2.5vh ${color};opacity:0;animation:spark 1.6s ease-out infinite}
@keyframes tcIn{from{opacity:0;transform:scale(2.2);letter-spacing:.4em}to{opacity:1;transform:scale(1);letter-spacing:.06em}}
@keyframes bar{from{width:0;opacity:0}to{width:70vh;opacity:1}}
@keyframes spark{0%{opacity:0;transform:translateY(0) scale(.4)}25%{opacity:1}100%{opacity:0;transform:translateY(-12vh) scale(1.2)}}
`;
  const sparks = Array.from({ length: 14 }, (_, i) => {
    const x = 12 + ((i * 53) % 77);
    const y = 38 + ((i * 29) % 40);
    return `<i class="spark" style="left:${x}vw;top:${y}vh;animation-delay:${(i * 0.13).toFixed(2)}s"></i>`;
  }).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css(seconds)}${extra}</style></head>
<body>${reel(shots, seconds)}<div class="vig"></div><div class="tc"><div class="bar"></div><div class="t">${esc(title)}</div><div class="bar b"></div><div class="s">${esc(sub)}</div></div>${sparks}
<script>window.__go=function(){document.body.classList.add('go')};</script></body></html>`;
}
