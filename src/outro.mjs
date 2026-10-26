// Closing call-to-action cards (like / share / subscribe). Every size is expressed in vh,
// so the same HTML renders identically at 240p, 1080p or 2K - only the capture size changes.
// All motion is transform/opacity only, which stays smooth in headless software rendering.

export const OUTRO_VARIANTS = ['pills', 'trio', 'channel', 'type', 'burst', 'champion'];

const T = {
  kick: 'ENJOYED THE TOURNAMENT?',
  before: 'BEFORE YOU GO',
  thanks: 'THANKS FOR WATCHING!',
  like: 'LIKE',
  likeHint: 'Show some love',
  share: 'SHARE',
  shareHint: 'Send it to a friend',
  sub: 'SUBSCRIBE',
  subbed: 'SUBSCRIBED',
  subHint: 'Join the channel',
  bell: 'Turn on notifications',
  next: 'See you in the next tournament!',
  more: 'FOR MORE EPIC FIGHTS',
  champ: 'CHAMPION',
};

const ICON = {
  like: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M2 21h4V9H2v12zm20-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L13.17 1 6.59 7.59C6.22 7.95 6 8.45 6 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z"/></svg>',
  share: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/></svg>',
  sub: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg>',
  cursor: '<svg viewBox="0 0 24 24"><path d="M5 3l14 8-6 2 4 7-3 1.5-4-7-5 4z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>',
};

const COL = { like: '#2f8bff', share: '#17c9a0', sub: '#ff2e4d' };

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const rnd = (a, b) => a + Math.random() * (b - a);

export function pickOutro(choice) {
  if (!choice || choice === 'random') return OUTRO_VARIANTS[Math.floor(Math.random() * OUTRO_VARIANTS.length)];
  if (!OUTRO_VARIANTS.includes(choice)) throw new Error(`Unknown outro "${choice}". Use random, none or one of: ${OUTRO_VARIANTS.join(', ')}`);
  return choice;
}

const css = `
*{margin:0;padding:0;box-sizing:border-box}
:root{--e:cubic-bezier(.22,1,.36,1);--o:cubic-bezier(.34,1.56,.64,1)}
html,body{width:100%;height:100%;overflow:hidden;background:#05070d;color:#fff;font-family:"Inter","Noto Sans","Segoe UI",Roboto,Arial,sans-serif}
body:not(.go) *{animation-play-state:paused!important}
.bg{position:fixed;inset:-4%;background-size:cover;background-position:center;animation:bgzoom 9s linear both}
.shade{position:fixed;inset:0;background:radial-gradient(ellipse at 50% 45%,rgba(8,12,28,.55),rgba(3,5,12,.93) 85%),linear-gradient(to bottom,rgba(0,0,0,.35),transparent 30%,rgba(0,0,0,.5))}
.aura{position:fixed;width:90vh;height:90vh;border-radius:50%;background:radial-gradient(circle,var(--c) 0%,transparent 65%);opacity:.18;animation:aura 4s ease-in-out infinite}
.sp{position:fixed;bottom:-4vh;border-radius:50%;background:#fff;opacity:0;animation:drift linear infinite}
.stage{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3.4vh;text-align:center;padding:0 6vh}
.kick{font-size:6.4vh;font-weight:900;letter-spacing:.05em;color:#ffd23f;text-shadow:0 .5vh 0 #000,0 0 4vh rgba(255,210,63,.5);animation:rise .8s var(--e) both}
.small{font-size:3.4vh;font-weight:700;color:#dfe6f7;opacity:.95;text-shadow:0 .3vh 0 #000;animation:rise .8s var(--e) var(--d,1.8s) both}
.col{display:flex;flex-direction:column;gap:2.2vh;align-items:center}
.pill{position:relative;overflow:hidden;display:flex;align-items:center;gap:3vh;width:78vh;padding:1.8vh 4vh 1.8vh 2vh;border-radius:8vh;background:linear-gradient(135deg,rgba(255,255,255,.16),rgba(255,255,255,.05));border:.3vh solid rgba(255,255,255,.28);box-shadow:0 2vh 5vh rgba(0,0,0,.5)}
.pill.l{animation:inL .9s var(--e) var(--d) both}
.pill.r{animation:inR .9s var(--e) var(--d) both}
.pill.sub{border-color:rgba(255,46,77,.75);animation:inR .9s var(--e) var(--d) both,pulse 1.4s ease-in-out 2.8s infinite}
.pill::after{content:"";position:absolute;top:0;bottom:0;width:30%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.35),transparent);transform:translateX(-120%);animation:shine 1.1s ease-in-out var(--sd,1.6s) both}
.ic{flex:none;display:flex;align-items:center;justify-content:center;width:9.5vh;height:9.5vh;border-radius:50%;background:var(--c);color:#fff;box-shadow:0 0 3.5vh var(--c)}
.ic svg{width:5.4vh;height:5.4vh}
.tx{display:flex;flex-direction:column;align-items:flex-start;text-align:left}
.tx b{font-size:5.2vh;font-weight:900;letter-spacing:.05em;line-height:1.05;text-shadow:0 .4vh 0 rgba(0,0,0,.6)}
.tx span{font-size:2.8vh;font-weight:600;color:#dbe3f5;opacity:.9}
.bellrow{display:flex;align-items:center;gap:2vh;font-size:3.2vh;font-weight:700;text-shadow:0 .3vh 0 #000;animation:rise .8s var(--e) var(--bd,2.2s) both}
.bellrow svg{width:4.4vh;height:4.4vh;color:#ffd23f;transform-origin:50% 10%;animation:ring 1.3s ease-in-out calc(var(--bd,2.2s) + .4s) infinite}
.trio{display:flex;gap:9vh;align-items:flex-start}
.bd{display:flex;flex-direction:column;align-items:center;gap:2.4vh;animation:pop .8s var(--o) var(--d) both}
.orb{position:relative;display:flex;align-items:center;justify-content:center;width:25vh;height:25vh;border-radius:50%;background:radial-gradient(circle at 35% 28%,rgba(255,255,255,.55),var(--c) 55%);box-shadow:0 0 7vh var(--c),inset 0 -1.5vh 3vh rgba(0,0,0,.25);color:#fff}
.orb.xl{width:34vh;height:34vh}
.orb svg{width:12.5vh;height:12.5vh;filter:drop-shadow(0 .6vh .6vh rgba(0,0,0,.35))}
.orb.xl svg{width:17vh;height:17vh}
.orb i{position:absolute;inset:0;border-radius:50%;border:.6vh solid var(--c);opacity:0;animation:ripple 1.8s ease-out var(--rd,2.4s) infinite}
.lab{font-size:5.4vh;font-weight:900;letter-spacing:.06em;text-shadow:0 .5vh 0 #000}
.chan{display:flex;flex-direction:column;align-items:center;gap:2.6vh}
.av{position:relative;width:26vh;height:26vh;border-radius:50%;animation:pop .9s var(--o) .2s both}
.av::before{content:"";position:absolute;inset:0;border-radius:50%;background:conic-gradient(#ff2e4d,#ffd23f,#17c9a0,#2f8bff,#ff2e4d);animation:spin 3.5s linear infinite}
.av-in{position:absolute;inset:.9vh;border-radius:50%;overflow:hidden;display:flex;align-items:center;justify-content:center;background:radial-gradient(ellipse at 50% 75%,#2a3760,#0b0f1c 80%)}
.av-in img{width:88%;height:88%;object-fit:contain;object-position:center bottom}
.av-in svg{width:60%;height:60%;color:#ff2e4d;filter:drop-shadow(0 .5vh .5vh rgba(0,0,0,.5))}
.title{font-size:7vh;font-weight:900;letter-spacing:.03em;text-shadow:0 .6vh 0 #000;animation:rise .8s var(--e) .7s both}
.row{display:flex;align-items:center;gap:2.4vh;animation:rise .8s var(--e) 1.1s both}
.subwrap{position:relative}
.subbtn{position:relative;display:flex;align-items:center;justify-content:center;min-width:46vh;padding:2.2vh 5vh;border-radius:6vh;background:#ff2e4d;font-size:5vh;font-weight:900;letter-spacing:.06em;box-shadow:0 1.4vh 4vh rgba(255,46,77,.5);animation:bgswap .3s ease 3.1s both}
.subbtn .s1{animation:fout .25s ease 3.1s both}
.subbtn .s2{position:absolute;opacity:0;animation:fin .25s ease 3.15s both}
.belbtn{width:11vh;height:11vh;border-radius:50%;background:rgba(255,255,255,.14);border:.3vh solid rgba(255,255,255,.3);display:flex;align-items:center;justify-content:center}
.belbtn svg{width:5.6vh;height:5.6vh;color:#ffd23f;transform-origin:50% 10%;animation:ring 1.3s ease-in-out 3.3s 2}
.chips{display:flex;gap:2vh;animation:rise .8s var(--e) 1.6s both}
.chip{display:flex;align-items:center;gap:1.2vh;padding:1.2vh 2.6vh;border-radius:5vh;background:rgba(255,255,255,.12);border:.25vh solid rgba(255,255,255,.28);font-size:3vh;font-weight:800;letter-spacing:.05em}
.chip svg{width:3.4vh;height:3.4vh;color:var(--c)}
.cursor{position:absolute;right:-3vh;bottom:-6vh;width:7vh;height:7vh;opacity:0;filter:drop-shadow(0 .5vh .6vh rgba(0,0,0,.6));animation:cur 1.3s var(--e) 1.7s both,press .35s ease 3s both}
.words{display:flex;flex-direction:column;gap:1.2vh;align-items:flex-start}
.w{display:flex;align-items:center;gap:3vh;font-size:15vh;font-weight:900;line-height:1;letter-spacing:.02em;color:var(--c);text-shadow:0 1vh 0 #000,0 0 6vh var(--c);animation:sweep .9s var(--e) var(--d) both}
.w svg{width:12vh;height:12vh;flex:none;filter:drop-shadow(0 .8vh 0 #000)}
.scene{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4vh;opacity:0;animation:scene 1.9s ease-in-out var(--d) both}
.scene.last{animation:sceneIn .8s var(--o) var(--d) both}
.big{font-size:11vh;font-weight:900;letter-spacing:.06em;text-shadow:0 .9vh 0 #000,0 0 6vh var(--c)}
.split{display:flex;align-items:center;gap:9vh}
.cp{display:flex;flex-direction:column;align-items:center;gap:2vh;animation:inL .9s var(--e) .2s both}
.cpcard{position:relative;width:38vh;height:52vh;border-radius:2.2vh;overflow:hidden;border:.45vh solid #ffd23f;background:radial-gradient(ellipse at 50% 75%,#2a3760,#0b0f1c 80%);box-shadow:0 0 7vh rgba(255,210,63,.5),0 2vh 5vh rgba(0,0,0,.6)}
.cpcard img{position:absolute;left:6%;top:5%;width:88%;height:88%;object-fit:contain;object-position:center bottom}
.cpcard .ph{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.35)}
.cpcard .ph svg{width:18vh;height:18vh}
.cpk{font-size:3.6vh;font-weight:900;letter-spacing:.22em;color:#ffd23f}
.cpn{font-size:5.2vh;font-weight:900;max-width:44vh;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 .5vh 0 #000}
.rt{display:flex;flex-direction:column;align-items:flex-start;gap:2.4vh}
.rt .kick{font-size:5.2vh;text-align:left}
@keyframes bgzoom{from{transform:scale(1)}to{transform:scale(1.12)}}
@keyframes aura{0%,100%{opacity:.18;transform:scale(1)}50%{opacity:.34;transform:scale(1.12)}}
@keyframes drift{0%{transform:translateY(0);opacity:0}15%{opacity:.8}100%{transform:translateY(-110vh);opacity:0}}
@keyframes rise{from{opacity:0;transform:translateY(3vh)}to{opacity:1;transform:none}}
@keyframes inL{from{opacity:0;transform:translateX(-30vh)}to{opacity:1;transform:none}}
@keyframes inR{from{opacity:0;transform:translateX(30vh)}to{opacity:1;transform:none}}
@keyframes pop{from{opacity:0;transform:scale(.5)}to{opacity:1;transform:scale(1)}}
@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.045)}}
@keyframes ring{0%{transform:rotate(0)}10%{transform:rotate(16deg)}20%{transform:rotate(-14deg)}30%{transform:rotate(11deg)}40%{transform:rotate(-8deg)}50%{transform:rotate(5deg)}60%,100%{transform:rotate(0)}}
@keyframes ripple{from{opacity:.75;transform:scale(.9)}to{opacity:0;transform:scale(1.9)}}
@keyframes shine{from{transform:translateX(-120%)}to{transform:translateX(480%)}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes sweep{from{clip-path:inset(-5vh 100% -5vh -5vh)}to{clip-path:inset(-5vh -5vh -5vh -5vh)}}
@keyframes fout{to{opacity:0}}
@keyframes fin{to{opacity:1}}
@keyframes bgswap{to{background:#3b4154;box-shadow:0 1vh 3vh rgba(0,0,0,.5)}}
@keyframes cur{from{opacity:0;transform:translate(16vh,14vh)}to{opacity:1;transform:translate(0,0)}}
@keyframes press{0%{transform:translate(0,0) scale(1)}50%{transform:translate(0,0) scale(.78)}100%{transform:translate(0,0) scale(1)}}
@keyframes scene{0%{opacity:0;transform:scale(.7)}14%{opacity:1;transform:scale(1)}86%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(1.12)}}
@keyframes sceneIn{from{opacity:0;transform:scale(.7)}to{opacity:1;transform:scale(1)}}
`;

const pill = (k, label, hint, side, d) =>
  `<div class="pill ${side}${k === 'sub' ? ' sub' : ''}" style="--c:${COL[k]};--d:${d}s;--sd:${(d + 0.9).toFixed(2)}s"><div class="ic">${ICON[k]}</div><div class="tx"><b>${label}</b><span>${hint}</span></div></div>`;

const pills3 = (d0 = 0.5) =>
  pill('like', T.like, T.likeHint, 'r', d0) + pill('share', T.share, T.shareHint, 'l', d0 + 0.45) + pill('sub', T.sub, T.subHint, 'r', d0 + 0.9);

const bellRow = (bd = 2.2) => `<div class="bellrow" style="--bd:${bd}s">${ICON.bell}<span>${T.bell}</span></div>`;

const orb = (k, extra = '', rd = 2.4) =>
  `<div class="orb ${extra}" style="--c:${COL[k]};--rd:${rd}s">${ICON[k]}${k === 'sub' ? `<i></i><i style="--rd:${(rd + 0.6).toFixed(1)}s"></i>` : ''}</div>`;

function body(variant, champion) {
  switch (variant) {
    case 'trio':
      return `<div class="stage"><div class="kick">${T.kick}</div><div class="trio">${
        ['like', 'share', 'sub'].map((k, i) =>
          `<div class="bd" style="--d:${(0.5 + i * 0.4).toFixed(2)}s">${orb(k, '', 2.4 + i * 0.2)}<div class="lab">${T[k]}</div></div>`).join('')
      }</div><div class="small" style="--d:1.9s">${T.next}</div></div>`;

    case 'channel': {
      const avatar = champion && champion.img ? `<img src="data:image/png;base64,${champion.img}" alt="">` : ICON.sub;
      return `<div class="stage"><div class="chan"><div class="av"><div class="av-in">${avatar}</div></div>
<div class="title">${T.thanks}</div>
<div class="row"><div class="subwrap"><div class="subbtn"><span class="s1">${T.sub}</span><span class="s2">${T.subbed}</span></div><div class="cursor">${ICON.cursor}</div></div><div class="belbtn">${ICON.bell}</div></div>
<div class="chips"><div class="chip" style="--c:${COL.like}">${ICON.like}${T.like}</div><div class="chip" style="--c:${COL.share}">${ICON.share}${T.share}</div></div></div></div>`;
    }

    case 'type':
      return `<div class="stage"><div class="kick" style="font-size:4.6vh">${T.before}</div><div class="words">${
        [['like', 0.4], ['share', 1.0], ['sub', 1.6]].map(([k, d]) =>
          `<div class="w" style="--c:${COL[k]};--d:${d}s">${ICON[k]}<span>${T[k]}</span></div>`).join('')
      }</div><div class="small" style="--d:2.7s">${T.more}</div></div>`;

    case 'burst': {
      const scene = (k, d, last) =>
        `<div class="scene${last ? ' last' : ''}" style="--c:${COL[k]};--d:${d}s">${orb(k, 'xl', d + 0.4).replace('<i></i>', '<i></i>')}<div class="big">${T[k]}</div>${last ? bellRow(d + 0.8) : ''}</div>`;
      const rings = (k, d) => scene(k, d, k === 'sub');
      return rings('like', 0.1) + rings('share', 1.9) + rings('sub', 3.7);
    }

    case 'champion': {
      const card = champion && champion.img
        ? `<img src="data:image/png;base64,${champion.img}" alt="">`
        : `<div class="ph">${ICON.sub}</div>`;
      const left = champion && champion.name
        ? `<div class="cp"><div class="cpcard">${card}</div><div class="cpk">${T.champ}</div><div class="cpn">${esc(champion.name)}</div></div>`
        : `<div class="cp"><div class="cpcard">${card}</div><div class="cpk">${T.thanks}</div></div>`;
      return `<div class="stage"><div class="split">${left}<div class="rt"><div class="kick">${T.kick}</div><div class="col">${pills3(0.7)}</div>${bellRow(2.6)}</div></div></div>`;
    }

    case 'pills':
    default:
      return `<div class="stage"><div class="kick">${T.kick}</div><div class="col">${pills3()}</div>${bellRow()}</div>`;
  }
}

export function buildOutroHtml({ variant = 'pills', shots = [], champion = null }) {
  const shot = shots.length ? shots[Math.floor(Math.random() * shots.length)] : null;
  const bg = shot
    ? `background-image:url(data:image/jpeg;base64,${shot})`
    : 'background:radial-gradient(circle at 50% 40%,#2a3354,#05070d)';
  const sparks = Array.from({ length: 16 }, () => {
    const size = rnd(0.6, 1.5).toFixed(2);
    return `<i class="sp" style="left:${rnd(2, 98).toFixed(1)}vw;width:${size}vh;height:${size}vh;animation-duration:${rnd(5, 9).toFixed(1)}s;animation-delay:${rnd(0, 5).toFixed(1)}s"></i>`;
  }).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head>
<body><div class="bg" style="${bg}"></div><div class="shade"></div>
<div class="aura" style="left:-15vh;top:-20vh;--c:#2f8bff"></div><div class="aura" style="right:-15vh;bottom:-25vh;--c:#ff2e4d;animation-delay:-2s"></div>
${sparks}${body(variant, champion)}
<script>window.__go=function(){document.body.classList.add('go')};</script></body></html>`;
}
