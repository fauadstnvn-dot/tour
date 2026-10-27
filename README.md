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

GAME_URL=<your game address> node src/render.mjs
GAME_URL=<your game address> node src/render.mjs --fighters 32 --speed 2
```

You can also set `GAME_URL` and `FIGHTERS` as environment variables.

| Option | Default | Meaning |
| --- | --- | --- |
| `--url` | `$GAME_URL` (required, no default) | Game page on your host; keep it secret |
| `--fighters` | 16 | Contestants, multiple of 4 |
| `--out` | `output/tournament.mp4` | Output file |
| `--height` | 240 | Output height (240 = 240p) |
| `--fps` | 25 | Output frame rate |
| `--speed` | 1 | Game speed slider (0.2 - 2) |
| `--capture-height` | 480 | Browser capture size before downscaling |
| `--max-minutes` | 300 | Stop recording after this long |
| `--end-wait` | 8 | Seconds kept after the champion screen |
| `--intro` | `random` | Hook intro: `random`, `none`, `who`, `survive`, `predict`, `versus`, `countdown`, `elim` |
| `--intro-seconds` | 5 | Intro length |
| `--highlights` | 4 | Highlight clips between intro and game (0 = off) |
| `--highlight-before` / `--highlight-after` | 5 / 1 | Seconds kept before / after each KO (clips never leave the fight itself) |
| `--lang` | `en` | Text language for intro, match cards and highlight frames (`en`, `vi`) |
| `--video-minutes` | 0 | Cut the tournament footage to N minutes for quick tests (0 = full tournament) |
| `--match-card` | 3.4 | Seconds of the card shown before every match (match number, stage, fighter portraits + names), 0 = off |
| `--crf` | 24 (20 from 1080p) | x264 quality, lower = better |
| `--full-page` | off | Record the whole page, not only the arena |
| `--headed` | off | Show the browser window |

## Video structure

1. Hook intro (random per video): a "who will win" name roulette, a fighter countdown,
   a pick-your-champion grid, a VS clash, a 3-2-1 start, or an elimination guess.
   It uses a portrait of every real fighter (their own character, weapon and shield,
   captured from the game's viewer) over cut-in frames of your arena.
2. Highlights: a "HIGHLIGHTS" title card, then a few short clips cut only from inside real
   fights (never from pre-match cards, brackets or results), the closest fights first. Each
   clip sits in an animated gold frame with a title plate (highlight number, fighters, stage).
   The final is never used, so the champion is not spoiled.
3. The full tournament. Every match opens with a card: match number, stage (group / round of
   16 / quarterfinal / ...), and the portrait and name of each fighter.

Highlight clips need `window.__rig.tour` from the current `index.php`. Upload the
updated `index.php` to your host first; without it, clips are cut from tournament
panel changes instead and may be less accurate.

## 2K output

```bash
node src/render.mjs --height 1440
```

The capture size follows the output height, and every intro size is in `vh`, so layout
is identical at any resolution. The character speech box (top left) is also sized from the
frame height, so it is larger at 1080p / 2K. Intro grids are fitted to the 16:9 frame, so
no fighter card is cut off. Rendering at 1440p is slower and needs more CPU/RAM.

## Scenery: why a video could come out with plain stands, and the fix

Characters, skills and scenery all load from your host at record time. The host
runs a bot shield that sometimes answers a request - far more often from
GitHub's datacentre IPs than from a home browser - with **HTTP 200 and an HTML
"please wait, your request is being verified" page** instead of the real
content. For scenery that was fatal and silent:

- the scenery **list** was fetched once; parsing the HTML as JSON failed inside
  a swallowed `.catch(function () {})`, so the Scenery dropdown stayed empty;
- each scenery **layer** was loaded once with the error swallowed, so a
  "200 HTML" layer simply disappeared;
- this renderer only counted HTTP status >= 400 as a failure, so it logged
  "HTTP 200" and carried on, and after a 60 s wait it continued without
  scenery for the whole tournament.

Fixed on both sides - upload the matching `index.php` together with this
renderer:

- `index.php` validates that the list really is JSON and retries it (up to 6
  attempts), retries every layer (up to 4), logs and counts failures, serves
  layer URLs with the script name included, sends binary files before the
  JSON header, and exposes `window.__rig.reloadScenery()` /
  `window.__rig.currentScenery()`.
- The renderer checks **content types**, not just status codes (a scenery
  response that is not `application/json` / `image/*` is logged as failed),
  retries the scenery load - in-page, then by reloading the game - and then
  **fails the run** instead of silently producing a scenery-less video.
  Pass `--allow-no-scenery` only if plain stands are acceptable.
- The browser presents a normal Chrome user agent (no `HeadlessChrome`,
  no `navigator.webdriver`), which the shield fingerprints.

If runs still fail with "Scenery is required but the host returned none",
the shield is challenging this runner persistently: on the host, whitelist
the game folder / disable the verification page for `?api=` requests, or the
renderer cannot get past it no matter how often it retries.

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


## Secrets (GitHub: Settings > Secrets and variables > Actions > Secrets)

| Secret | Purpose |
| --- | --- |
| `GAME_URL` | The full game address (the former hard-coded link). Never stored in the repo; it is masked by GitHub and also scrubbed from the renderer's own logs. Delete the old `GAME_URL` repository *variable* if you set one. |
| `DEEPSEEK_API_KEY` | DeepSeek key for the English SEO title, description and tags |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASS` | MySQL on your host (table `tb_bao_secret`) |

## Publishing to YouTube

After rendering, `python -m publish.publish` does the following:

1. Reads `output/tournament.json` (fighters, stages, chapter timestamps and spoiler-free notable moments written by the renderer), then asks DeepSeek for an English SEO title, description and tags. The champion is never revealed. If DeepSeek is unavailable, a built-in fallback text is used.
2. Picks a random account from `tb_bao_secret` that has a value in column **`token_arena`** and `num < 9` (when all are used it resets `num` to 0). It refreshes the OAuth token if needed and saves it back to `token_arena`.
3. Uploads the video, then sets the thumbnail `output/tournament.thumb.jpg`, then adds 1 to `num` and deletes the local files.

`--dry-run` generates the metadata only.

## Thumbnail

The renderer builds a 1280x720 thumbnail (under 2 MB): a saturated in-game frame, three random non-finalist fighters plus a mystery "?" card, an "N FIGHTERS" headline and "ONLY ONE CHAMPION". Finalists are never shown in the thumbnail, intro or title.


## Description timestamps

The renderer computes where each match starts in the final video (intro + highlights + cards included) and writes `chapters` to `tournament.json`. `publish/metadata.py` appends them as a YouTube `Timestamps:` block (0:00 first, 10 s apart, trimmed to fit the 5000-byte limit). The final is listed without fighter names. DeepSeek also receives `notable_moments` (closest win, fastest KO, longest fight, flawless wins) taken only from rounds before the semifinals.
