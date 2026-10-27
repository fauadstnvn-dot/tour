"""English, SEO-friendly YouTube title / description / tags via DeepSeek (with a safe fallback)."""
from __future__ import annotations

import json
import os
import random
import re
import time
from pathlib import Path

import requests

DEEPSEEK_URL = "https://api.deepseek.com/chat/completions"
DEEPSEEK_MODEL = os.environ.get("DEEPSEEK_MODEL", "deepseek-flash")
DEEPSEEK_RETRIES = 3
NON_ENGLISH_RE = re.compile(r"[\u00C0-\u024F\u1E00-\u1EFF\u0370-\u04FF\u0E00-\u0E7F\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF]")
REQUIRED_KEYS = ("title", "description", "tags")

ANGLES = [
    "a mystery question: nobody knows who will be left standing, so the viewer should guess",
    "an underdog question: could a lesser-known fighter from the list upset the favourites?",
    "a brutal survival bracket: many enter, one walks out, the group stage already hurts",
    "a dream-matchup feel: fans picking their favourite fighter and watching it fight for glory",
    "a prediction challenge: invite viewers to guess the champion before the final",
    "pure arena chaos: relentless back-to-back fights with no commentary, just the action",
]
TITLE_PATTERNS = [
    "a question title such as 'Can <Fighter> Survive <N> Fighters?' using a spotlight fighter",
    "a number-led title such as '<N> Fighters, 1 Champion: <specific hook>'",
    "a stakes title such as 'The Last Fighter Standing: <Fighter A> or Someone Else?' using spotlight fighters only",
    "a bold-claim title such as '<Fighter> Takes On The Whole Roster' (only if that fighter is a spotlight fighter)",
    "a mystery title such as '<N> Fighters Enter, Who Is Left Standing?'",
]

TONES = ["curious", "dramatic", "playful", "competitive", "cinematic", "casual fan-to-fan", "tense", "hype but honest"]
HISTORY_FILE = Path(__file__).with_name("title_history.json")
HISTORY_KEEP = 40

TITLE_MAX = 90
DESC_MAX = 4500
TAGS_MAX_CHARS = 450

SYSTEM_PROMPT = (
    "You are a YouTube SEO copywriter for a 2D fighting tournament animation channel. "
    "Write ALL output strictly in English only (international audience); never use Vietnamese or any other language. "
    "Never use clickbait the video cannot deliver, never invent story, characters or features that are not in the facts, "
    "never mention that you are an AI, and never mention file names, hosts or URLs. Reply with ONE JSON object only."
)


_EXTERNAL_HISTORY: list[str] | None = None


def set_history(titles: list[str] | None) -> None:
    """Use a history supplied by the caller (e.g. loaded from MySQL) instead of the local file."""
    global _EXTERNAL_HISTORY
    _EXTERNAL_HISTORY = None if titles is None else [str(t) for t in titles][-HISTORY_KEEP:]


def load_history() -> list[str]:
    if _EXTERNAL_HISTORY is not None:
        return _EXTERNAL_HISTORY
    try:
        data = json.loads(HISTORY_FILE.read_text(encoding="utf-8"))
        return [str(t) for t in data][-HISTORY_KEEP:]
    except Exception:  # noqa: BLE001
        return []


def save_history(title: str) -> None:
    if _EXTERNAL_HISTORY is not None:
        return
    try:
        HISTORY_FILE.write_text(json.dumps((load_history() + [title])[-HISTORY_KEEP:], ensure_ascii=False, indent=1),
                                encoding="utf-8")
    except OSError as exc:
        print(f"  ! could not save title history: {exc}")


def _words(t: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", t.lower()))


def _similar(a: str, b: str) -> bool:
    wa, wb = _words(a), _words(b)
    return bool(wa and wb) and len(wa & wb) / len(wa | wb) >= 0.55


def pick_title(candidates, history: list[str]) -> str | None:
    for c in candidates or []:
        t = _clean_title(c)
        if 40 <= len(t) <= TITLE_MAX and not any(_similar(t, h) for h in history):
            return t
    return None


def roster_mix(profiles: list) -> dict:
    """Counts of weapons and fighting styles across the whole roster (no results, so no spoilers)."""
    out: dict = {}
    for key in ("weapon", "style", "shield"):
        counts: dict[str, int] = {}
        for p in profiles:
            v = p.get(key)
            if v:
                counts[str(v)] = counts.get(str(v), 0) + 1
        top = sorted(counts.items(), key=lambda kv: -kv[1])[:5]
        if top:
            out[key + "s"] = {k: v for k, v in top}
    unarmed = sum(1 for p in profiles if not p.get("weapon"))
    if unarmed:
        out["unarmed_fighters"] = unarmed
    return out


def profile_digest(profiles: list, spotlight: list) -> list:
    wanted = set(spotlight or [])
    out = []
    for p in profiles:
        if p.get("name") in wanted:
            out.append({k: p[k] for k in ("name", "weapon", "shield", "style", "skill") if p.get(k) not in (None, "")})
    return out


def build_facts(meta: dict) -> dict:
    seconds = int(meta.get("durationSeconds") or 0)
    minutes, sec = divmod(seconds, 60)
    names = [n for n in meta.get("fighterNames", []) if n]
    others = list(names)
    spotlight = random.sample(others, min(4, len(others)))
    return {
        "fighters": meta.get("fighters"),
        "fighter_names": names[:32],
        "spotlight_fighters": spotlight,
        "creative_angle": random.choice(ANGLES),
        "title_pattern": random.choice(TITLE_PATTERNS),
        "tone": random.choice(TONES),
        "recent_titles_to_avoid": load_history()[-25:],
        "tournament_stats": meta.get("stats") or {},
        "fighter_profiles": profile_digest(meta.get("fighterProfiles") or [], spotlight),
        "roster_mix": roster_mix(meta.get("fighterProfiles") or []),
        "unique_id": random.randint(1000, 9999),
        "stages": meta.get("stages") or [],
        "highlight_clips": len(meta.get("highlights") or []),
        "notable_moments": (meta.get("notable") or [])[:6],
        "length": f"{minutes}:{sec:02d}",
        "format": "2D fighting tournament with group stage and knockout rounds, no narration",
    }


def build_prompt(facts: dict) -> str:
    return (
        "Create YouTube metadata for THIS specific video. It must read as unique to this video and could not be "
        "pasted onto any other tournament upload.\n"
        f"FACTS: {json.dumps(facts, ensure_ascii=False)}\n\n"
        "Rules:\n"
        "- Use real fighter names from the facts (spotlight_fighters first) in the title, the opening line, the bullet "
        "list and the tags. Never invent fighters, powers, backstories or results.\n"
        "- notable_moments are real events from the early rounds. Weave 2-4 of them into the two paragraphs as concrete "
        "teasers (e.g. a razor-thin win, a very fast knockout); copy names and numbers exactly, do not exaggerate or add "
        "other details.\n"
        "- fighter_profiles describe the spotlight fighters (weapon, shield, fighting style, skill rating out of 100) and "
        "roster_mix summarises the weapons and styles in the whole roster. Use them for concrete hooks "
        "(for example 'a counter-attacker with a spear' or 'N fighters carry swords'), but never claim a profile "
        "decides who wins.\n"
        "- tournament_stats are real numbers about the early rounds; use one or two of them in titles or text when they "
        "fit. Write in the given tone. recent_titles_to_avoid are previous uploads: do not reuse their wording, "
        "structure, opening words or hook.\n"
        "- Follow creative_angle and title_pattern from the facts. Avoid these overused phrases: 'epic', 'ultimate', "
        "'you won't believe', 'must watch', 'insane', 'like never before'.\n"
        "- Do NOT name, hint at or guess the finalists or the champion; they are secret. Keep the final a mystery.\n"
        "- Do NOT write timestamps, chapter lists or the line 'Chapters'; they are added automatically.\n"
        "- The viewer-facing hook must promise only what the video shows: group stage, knockout rounds, a final, "
        "no narration.\n\n"
        "Return JSON with exactly these keys:\n"
        f'- "title": string, 50-{TITLE_MAX - 20} characters, main keyword (fighting tournament / 2D fighting game / '
        "battle) within the first 40 characters, include the fighter count or a spotlight fighter name, max 1 emoji, "
        "no ALL CAPS words.\n"
        f'- "title_candidates": array of 8 clearly different titles (different structure, opening word and hook each), '
        f"every one 50-{TITLE_MAX - 20} characters and following the same title rules.\n"
        '- "description": string, 900-2500 characters. Line 1: a hook about the stakes (one champion, many fighters) with the main '
        "keywords, without naming any finalist. Then 2 short paragraphs about how the bracket plays out (group stage, knockouts, the final) without "
        "spoiling the winner, using the creative angle. Then 'Fighters in this tournament:' with a bullet list of up to "
        "12 names from the facts. Then one sentence on who it is for (fighting game, tournament and 2D animation fans) "
        "and one question inviting viewers to comment their predicted winner. End with 3-5 hashtags. "
        "At most one like/subscribe request, no links.\n"
        '- "tags": array of 15-25 strings, each under 30 characters, lowercase, mixing broad terms with specific ones '
        "(spotlight fighter names, tournament formats), no hashtags, no duplicates.\n"
    )


def _clean_tags(tags, extra=()) -> list[str]:
    out, seen, total = [], set(), 0
    for t in list(tags or []) + list(extra):
        t = re.sub(r"[#<>\",]", "", str(t)).strip().lower()
        if not t or len(t) > 30 or t in seen:
            continue
        if total + len(t) + 1 > TAGS_MAX_CHARS:
            break
        seen.add(t)
        out.append(t)
        total += len(t) + 1
    return out


def _clean_title(title: str, limit: int = TITLE_MAX) -> str:
    title = re.sub(r"[<>]", "", str(title)).strip().strip('"')
    if len(title) > limit:
        title = title[:limit].rsplit(" ", 1)[0]
    return title


def fallback(facts: dict) -> dict:
    n = facts.get("fighters") or 16
    names = facts.get("fighter_names") or []
    spot = facts.get("spotlight_fighters") or names[:1]
    bullets = "\n".join(f"- {x}" for x in names[:12])
    title = (f"{spot[0]} and {n - 1} Rivals: 2D Fighting Tournament" if spot else f"{n} Fighters, One Champion: 2D Fighting Tournament")
    hook = f"{n} fighters enter a 2D fighting tournament and only one champion remains. Who is it?"
    moments = "".join(f"- {m}\n" for m in facts.get("notable_moments") or [])
    desc = (
        f"{hook}\n\n"
        f"{n} fighters enter, only one survives. Follow the group stage, the knockout rounds and the final.\n\n"
        + (f"Moments to watch:\n{moments}\n" if moments else "")
        + (f"Fighters in this tournament:\n{bullets}\n\n" if bullets else "")
        + "Made for fans of fighting games, tournaments and 2D animation. No narration, just pure action. "
        "Who is your pick to win? Tell us in the comments.\n\n#fightinggame #tournament #2danimation"
    )
    return {"title": _clean_title(title), "description": desc, "tags": []}


def _stamp(seconds: float) -> str:
    total = int(seconds)
    h, rem = divmod(total, 3600)
    m, s = divmod(rem, 60)
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"


def build_chapters(chapters: list, budget: int) -> str:
    """YouTube chapter lines: starts at 0:00, at least 3, each at least 10 s apart, ascending, within `budget` chars."""
    items = sorted(((float(c.get("t", 0)), re.sub(r"[<>\n]", " ", str(c.get("title", ""))).strip()) for c in chapters or []),
                   key=lambda x: x[0])
    kept: list[tuple[float, str]] = []
    for t, title in items:
        if not title:
            continue
        if kept and t - kept[-1][0] < 10:
            if len(kept) == 1:  # too close to the 0:00 chapter: merge the names
                kept[0] = (0.0, f"{kept[0][1]} + {title}"[:90])
            continue
        kept.append((t, title[:90]))
    if kept and kept[0][0] > 0:
        kept[0] = (0.0, kept[0][1])
    if len(kept) < 3:
        return ""
    # Drop middle entries evenly if the list does not fit the description budget.
    def render(lst):
        return "\n".join(f"{_stamp(t)} {title}" for t, title in lst)
    while len(render(kept)) > budget and len(kept) > 3:
        drop = max(1, len(kept) // 12)
        step = max(2, len(kept) // drop)
        kept = [x for i, x in enumerate(kept) if i == 0 or i == len(kept) - 1 or i % step != 0]
    text = render(kept)
    return text if len(text) <= budget else ""


def add_chapters(description: str, chapters: list) -> str:
    """Insert the timestamps before the trailing hashtag line(s) of the description."""
    lines = description.rstrip().split("\n")
    tail: list[str] = []
    while lines and (not lines[-1].strip() or all(w.startswith("#") for w in lines[-1].split())):
        tail.insert(0, lines.pop())
    body = "\n".join(lines).rstrip()
    hashtags = "\n".join(tail).strip()
    budget = 4700 - len(body) - len(hashtags) - len("\n\nTimestamps:\n\n")
    block = build_chapters(chapters, budget)
    if not block:
        return description
    out = f"{body}\n\nTimestamps:\n{block}"
    return f"{out}\n\n{hashtags}" if hashtags else out


def generate(meta: dict, api_key: str | None = None) -> dict:
    facts = build_facts(meta)
    api_key = api_key or os.environ.get("DEEPSEEK_API_KEY", "")
    result = None
    if api_key:
        prompt = build_prompt(facts)
        for attempt in range(1, DEEPSEEK_RETRIES + 1):
            try:
                r = requests.post(
                    DEEPSEEK_URL,
                    headers={"Authorization": f"Bearer {api_key}"},
                    json={
                        "model": DEEPSEEK_MODEL,
                        "messages": [{"role": "system", "content": SYSTEM_PROMPT},
                                     {"role": "user", "content": prompt}],
                        "response_format": {"type": "json_object"},
                        "thinking": {"type": "disabled"},
                        "temperature": 1.3,
                        "max_tokens": 3500,
                    },
                    timeout=120,
                )
                r.raise_for_status()
                data = json.loads(r.json()["choices"][0]["message"]["content"])
                if not isinstance(data, dict):
                    raise ValueError("result is not a JSON object")
                missing = [k for k in REQUIRED_KEYS if not data.get(k)]
                if missing:
                    raise ValueError(f"missing fields: {', '.join(missing)}")
                if NON_ENGLISH_RE.search(json.dumps(data, ensure_ascii=False)):
                    raise ValueError("content contains non-English characters")
                result = data
                break
            except Exception as exc:  # noqa: BLE001
                print(f"  ! DeepSeek error (try {attempt}/{DEEPSEEK_RETRIES}): {exc}")
                if attempt < DEEPSEEK_RETRIES:
                    time.sleep(2 * attempt)
        if result is None:
            print("  ! DeepSeek failed, using fallback text")
    else:
        print("  ! DEEPSEEK_API_KEY missing, using fallback text")

    base = fallback(facts)
    result = result if isinstance(result, dict) else {}
    history = load_history()
    title = (pick_title(result.get("title_candidates"), history)
             or pick_title([result.get("title")], history)
             or _clean_title(result.get("title") or base["title"]))
    description = str(result.get("description") or base["description"]).replace("<", "").replace(">", "")
    tags = _clean_tags(result.get("tags"), extra=["fighting tournament", "2d fighting game", "tournament",
                                                  "fighting game animation", *facts["fighter_names"][:6]])
    description = description[:DESC_MAX].strip()
    description = add_chapters(description, meta.get("chapters") or [])
    if not meta.get("dry_run"):
        save_history(title)
    return {"title": title, "description": description, "tags": tags}
