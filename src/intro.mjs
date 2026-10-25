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
  },
};

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const shuffle = (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

export function pickVariant(choice) {
  if (!choice || choice === 'random') return VARIANTS[Math.floor(Math.random() * VARIANTS.length)];
  if (!VARIANTS.includes(choice)) throw new Error(`Unknown intro "${choice}". Use random, none or one of: ${VARIANTS.join(', ')}`);
  return choice;
}

const css = (seconds, bg) => `
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;overflow:hidden;background:#05070d;color:#fff;font-family:"Inter","Noto Sans","Segoe UI",Roboto,Arial,sans-serif}
body:not(.go) *{animation-play-state:paused!important}
.bg{position:fixed;inset:-6vh;background:${bg ? `center/cover url(data:image/jpeg;base64,${bg})` : 'radial-gradient(circle at 50% 40%,#2a3354,#05070d)'};filter:blur(1.6vh) brightness(.36) saturate(1.25);animation:zoom ${seconds + 1}s linear both}
.vig{position:fixed;inset:0;background:radial-gradient(ellipse at center,transparent 30%,rgba(0,0,0,.8))}
.wrap{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4vh;text-align:center;padding:0 6vh}
.kicker{font-size:7.5vh;font-weight:900;letter-spacing:.04em;line-height:1.05;color:#ffd23f;text-shadow:0 .5vh 0 #000,0 0 4vh rgba(255,210,63,.55);animation:pop .45s cubic-bezier(.2,1.6,.4,1) both}
.big{font-size:26vh;font-weight:900;line-height:1;text-shadow:0 1vh 0 #000,0 0 6vh rgba(255,80,60,.6)}
.name{font-size:9vh;font-weight:900;text-shadow:0 .6vh 0 #000}
.sub{font-size:4.6vh;font-weight:700;color:#e8ecf5;opacity:.92;animation:pop .45s cubic-bezier(.2,1.6,.4,1) both}
.foot{position:fixed;left:0;right:0;bottom:4vh;text-align:center;font-size:3.6vh;font-weight:800;letter-spacing:.2em;color:#fff;opacity:.85;animation:blink 1s ease-in-out infinite}
.slot{min-width:70vh;padding:3vh 6vh;border:.6vh solid #ffd23f;border-radius:3vh;background:rgba(0,0,0,.55);font-size:11vh;font-weight:900;white-space:nowrap;box-shadow:0 0 6vh rgba(255,210,63,.4)}
.slot.final{color:#ff4d4d;border-color:#ff4d4d;font-size:20vh;animation:shake .35s ease-in-out 3,pop .3s both}
.grid{display:grid;gap:1.6vh 2vh;width:100%;max-width:150vh}
.chip{padding:1.6vh 1vh;border-radius:1.6vh;background:rgba(255,255,255,.1);border:.3vh solid rgba(255,255,255,.28);font-size:4.2vh;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:0;transform:scale(.6)}
.chip.in{animation:pop .3s cubic-bezier(.2,1.6,.4,1) both}
.chip.dead{opacity:.28!important;text-decoration:line-through;text-decoration-thickness:.5vh;text-decoration-color:#ff4d4d;border-color:#ff4d4d;transition:all .2s}
.chip.last{filter:blur(.8vh);transform:scale(1.25);border-color:#ffd23f;background:rgba(255,210,63,.25);transition:all .5s}
.side{position:fixed;top:50%;font-size:10vh;font-weight:900;white-space:nowrap;text-shadow:0 .6vh 0 #000}
.side.l{left:6vh;transform:translateY(-50%);animation:inL .45s cubic-bezier(.2,1,.3,1) both;color:#6ec6ff}
.side.r{right:6vh;transform:translateY(-50%);animation:inR .45s cubic-bezier(.2,1,.3,1) .15s both;color:#ff8a6e}
.vs{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);font-size:30vh;font-weight:900;color:#ff3b3b;text-shadow:0 1vh 0 #000,0 0 8vh rgba(255,60,60,.8);animation:slam .4s cubic-bezier(.2,1.8,.4,1) .55s both}
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

function body(variant, names, t, seconds) {
  const n = names.length;
  const ms = seconds * 1000;
  const list = JSON.stringify(shuffle(names));
  const cols = n <= 16 ? 4 : n <= 36 ? 6 : 8;
  const shown = shuffle(names).slice(0, 32);

  switch (variant) {
    case 'who':
      return {
        html: `<div class="wrap"><div class="kicker">${esc(t.who)}</div><div class="slot" id="slot">?</div><div class="sub" style="animation-delay:.6s">${esc(t.whoSub)}</div></div>`,
        js: `const names=${list},slot=document.getElementById('slot');let i=0,d=55;const t0=performance.now();
(function tick(){if(performance.now()-t0>${ms * 0.72}){slot.textContent='?';slot.classList.add('final');return}
slot.textContent=names[i++%names.length];d=Math.min(380,d*1.07);setTimeout(tick,d)})();`,
      };
    case 'survive':
      return {
        html: `<div class="wrap"><div class="big num" id="num">${n}</div><div class="kicker" style="animation-delay:.1s">${esc(t.survive)}</div><div class="sub" id="end" style="opacity:0">${esc(t.surviveEnd)}</div></div>`,
        js: `const num=document.getElementById('num');let c=${n};const step=Math.max(40,${ms * 0.7}/Math.max(1,${n - 1}));
const iv=setInterval(()=>{c--;num.textContent=c;num.classList.remove('num');void num.offsetWidth;num.classList.add('num');
if(c<=1){clearInterval(iv);const e=document.getElementById('end');e.style.opacity=1;e.style.animation='pop .45s cubic-bezier(.2,1.6,.4,1) both'}},step);`,
      };
    case 'predict':
      return {
        html: `<div class="wrap" style="gap:3vh"><div class="kicker">${esc(t.predict)}</div><div class="grid" style="grid-template-columns:repeat(${cols},1fr)">${shown.map((x, i) => `<div class="chip in" style="animation-delay:${((i * ms * 0.5) / shown.length / 1000).toFixed(2)}s">${esc(x)}</div>`).join('')}</div><div class="sub" style="animation-delay:${(seconds * 0.55).toFixed(2)}s">${esc(t.predictCta)}</div></div>`,
        js: '',
      };
    case 'versus': {
      const [a, b] = shuffle(names);
      return {
        html: `<div class="wrap" style="justify-content:flex-start;padding-top:9vh"><div class="kicker">${esc(t.versusTop)}</div></div><div class="side l">${esc(a)}</div><div class="side r">${esc(b)}</div><div class="vs">VS</div><div class="flash"></div><div class="wrap" style="justify-content:flex-end;padding-bottom:12vh"><div class="sub" style="animation-delay:1.1s">${esc(t.versusBottom)}</div></div>`,
        js: '',
      };
    }
    case 'countdown':
      return {
        html: `<div class="wrap"><div class="big num" id="num">3</div><div class="sub" style="animation-delay:.2s">${esc(t.countdownSub(n))}</div></div>`,
        js: `const num=document.getElementById('num'),seq=['3','2','1',${JSON.stringify(t.fight)}],step=${(ms * 0.22).toFixed(0)};
seq.forEach((s,i)=>setTimeout(()=>{num.textContent=s;if(i===3){num.style.color='#ff4d4d'}num.classList.remove('num');void num.offsetWidth;num.classList.add('num')},i*step));`,
      };
    case 'elim':
    default: {
      const g = shuffle(names).slice(0, 32);
      return {
        html: `<div class="wrap" style="gap:3vh"><div class="kicker" style="font-size:6vh">${esc(t.elim)}</div><div class="grid" id="g" style="grid-template-columns:repeat(${cols},1fr)">${g.map((x) => `<div class="chip in">${esc(x)}</div>`).join('')}</div></div>`,
        js: `const chips=[...document.querySelectorAll('.chip')].sort(()=>Math.random()-.5),keep=chips.pop(),step=Math.max(40,${ms * 0.72}/Math.max(1,chips.length));
chips.forEach((c,i)=>setTimeout(()=>c.classList.add('dead'),400+i*step));
setTimeout(()=>keep.classList.add('last'),400+chips.length*step+150);`,
      };
    }
  }
}

export function buildIntroHtml({ variant, names, bg, lang = 'en', seconds = 5 }) {
  const t = TEXT[lang] ?? TEXT.en;
  const { html, js } = body(variant, names.length ? names : ['???'], t, seconds);
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css(seconds, bg)}</style></head>
<body><div class="bg"></div><div class="vig"></div>${html}<div class="foot">${esc(t.watch)}</div>
<script>window.__go=function(){document.body.classList.add('go');${js}};</script></body></html>`;
}
