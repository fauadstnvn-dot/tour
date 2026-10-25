# Tournament video renderer

Renders your tournament game (`index.php` on your host) into an MP4 at 240p.
A headless Chromium opens the game, starts a tournament, records until the
champion is crowned, then ffmpeg encodes the recording to H.264 at 240p.

Characters, weapons, skills, referee and scenery are not stored in this repo.
The game page loads them from the `skills/`, `scenery` and character folders on
your host, so whatever is on the host is what appears in the video.

## Requirements

- Node.js 20+
- ffmpeg on PATH
- Your game reachable by URL, with the asset pack on the server so it auto-loads

## Usage

```bash
npm install
npx playwright install --with-deps chromium

node src/render.mjs
node src/render.mjs --url https://nangmua.vn/2d/2d/ --fighters 32 --speed 2
```

You can also set `GAME_URL` and `FIGHTERS` as environment variables.

| Option | Default | Meaning |
| --- | --- | --- |
| `--url` | `$GAME_URL` or `https://nangmua.vn/2d/2d/` | Game page on your host |
| `--fighters` | 16 | Contestants, multiple of 4 |
| `--out` | `output/tournament.mp4` | Output file |
| `--height` | 240 | Output height (240 = 240p) |
| `--fps` | 25 | Output frame rate |
| `--speed` | 1 | Game speed slider (0.2 - 2) |
| `--capture-height` | 480 | Browser capture size before downscaling |
| `--max-minutes` | 60 | Stop recording after this long |
| `--end-wait` | 8 | Seconds kept after the champion screen |
| `--intro` | `random` | Hook intro: `random`, `none`, `who`, `survive`, `predict`, `versus`, `countdown`, `elim` |
| `--intro-seconds` | 5 | Intro length |
| `--highlights` | 4 | Highlight clips between intro and game (0 = off) |
| `--highlight-before` / `--highlight-after` | 4 / 1 | Seconds kept before / after each match end |
| `--lang` | `en` | Intro text language (`en`, `vi`) |
| `--crf` | 24 (20 from 1080p) | x264 quality, lower = better |
| `--full-page` | off | Record the whole page, not only the arena |
| `--headed` | off | Show the browser window |

## Video structure

1. Hook intro (random per video): a "who will win" name roulette, a fighter countdown,
   a pick-your-champion grid, a VS clash, a 3-2-1 start, or an elimination guess.
   It uses a portrait of every real fighter (their own character, weapon and shield,
   captured from the game's viewer) over cut-in frames of your arena.
2. Highlights: a few short clips cut from the tournament itself. The final is never
   used, so the champion is not spoiled.
3. The full tournament.

Highlight clips need `window.__rig.tour` from the current `index.php`. Upload the
updated `index.php` to your host first; without it, clips are cut from tournament
panel changes instead and may be less accurate.

## 2K output

```bash
node src/render.mjs --height 1440
```

The capture size follows the output height, and every intro size is in `vh`, so layout
is identical at any resolution. Rendering at 1440p is slower and needs more CPU/RAM.

## GitHub Actions

`Actions > Render tournament video > Run workflow`. Set the repository variable
`GAME_URL` (Settings > Variables) or fill the `url` input. The MP4 is uploaded as
the `tournament-video` artifact.

## Notes

- Recording runs in real time, so a 16-fighter tournament takes as long as it plays.
  Raise `--speed` to shorten it.
- The video has no audio.
- If the page does not auto-load the asset pack, the script waits for the character
  catalog and fails after `--load-timeout` seconds (default 120).
- The arena-only view relies on the `#stage` element; use `--full-page` if your
  layout changes.
