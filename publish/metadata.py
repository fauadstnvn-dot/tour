"""English, SEO-friendly YouTube title / description / tags via DeepSeek (with a safe fallback)."""
from __future__ import annotations

import json
import os
import random
import re
import time

import requests

DEEPSEEK_URL = "https://api.deepseek.com/chat/completions"
DEEPSEEK_MODEL = os.environ.get("DEEPSEEK_MODEL", "deepseek-flash")
DEEPSEEK_RETRIES = 3
NON_ENGLISH_RE = re.compile(r"[\u00C0-\u024F\u1E00-\u1EFF\u0370-\u04FF\u0E00-\u0E7F\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF]")
REQUIRED_KEYS = ("title", "description", "tags")

ANGLES = [
    "a rivalry: build the story around the two finalists clashing",
    "an underdog question: could a lesser-known fighter from the list upset the favourites?",
    "a brutal survival bracket: many enter, one walks out, the group stage already hurts",
    "a dream-matchup feel: fans picking their favourite fighter and watching it fight for glory",
    "a prediction challenge: invite viewers to guess the winner before the final",
    "pure arena chaos: relentless back-to-back fights with no commentary, just the action",
]
TITLE_PATTERNS = [
    "'<Fighter A> vs <Fighter B>: <short hook>' using the two finalists",
    "a question title such as 'Can <Fighter> Survive <N> Fighters?'",
    "a number-led title such as '<N> Fighters, 1 Winner: <specific hook>'",
    "a stakes title such as 'The Last Fighter Standing: <Fighter A> or <Fighter B>?'",
    "a bold-claim title such as '<Fighter> Takes On The Whole Roster' (only if that fighter is in the facts)",
]

TITLE_MAX = 90
DESC_MAX = 4500
TAGS_MAX_CHARS = 450

SYSTEM_PROMPT = (
    "You are a YouTube SEO copywriter for a 2D fighting tournament animation channel. "
    "Write ALL output strictly in English only (international audience); never use Vietnamese or any other language. "
    "Never use clickbait the video cannot deliver, never invent story, characters or features that are not in the facts, "
    "never mention that you are an AI, and never mention file names, hosts or URLs. Reply with ONE JSON object only."
)


def build_facts(meta: dict) -> dict:
    seconds = int(meta.get("durationSeconds") or 0)
    minutes, sec = divmod(seconds, 60)
    names = [n for n in meta.get("fighterNames", []) if n]
    finalists = meta.get("finalists") or []
    others = [n for n in names if n not in finalists]
    spotlight = random.sample(others, min(4, len(others)))
    return {
        "fighters": meta.get("fighters"),
        "fighter_names": names[:32],
        "spotlight_fighters": spotlight,
        "creative_angle": random.choice(ANGLES),
        "title_pattern": random.choice(TITLE_PATTERNS),
        "unique_id": random.randint(1000, 9999),
        "finalists": meta.get("finalists") or [],
        "stages": meta.get("stages") or [],
        "highlight_clips": len(meta.get("highlights") or []),
        "length": f"{minutes}:{sec:02d}",
        "format": "2D fighting tournament with group stage and knockout rounds, no narration",
    }


def build_prompt(facts: dict) -> str:
    return (
        "Create YouTube metadata for THIS specific video. It must read as unique to this video and could not be "
        "pasted onto any other tournament upload.\n"
        f"FACTS: {json.dumps(facts, ensure_ascii=False)}\n\n"
        "Rules:\n"
        "- Use real fighter names from the facts (the finalists above all, then spotlight_fighters) in the title, "
        "the opening line, the bullet list and the tags. Never invent fighters, powers, backstories or results.\n"
        "- Follow creative_angle and title_pattern from the facts. Avoid these overused phrases: 'epic', 'ultimate', "
        "'you won't believe', 'must watch', 'insane', 'like never before'.\n"
        "- Do NOT reveal or hint at who wins (the champion is unknown to you). Finalists may be named.\n"
        "- The viewer-facing hook must promise only what the video shows: group stage, knockout rounds, a final, "
        "no narration.\n\n"
        "Return JSON with exactly these keys:\n"
        f'- "title": string, 50-{TITLE_MAX - 20} characters, main keyword (fighting tournament / 2D fighting game / '
        "battle) within the first 40 characters, include the fighter count or a finalist name, max 1 emoji, "
        "no ALL CAPS words.\n"
        '- "description": string, 900-2500 characters. Line 1: a hook naming the finalists and the stakes with the main '
        "keywords. Then 2 short paragraphs about how the bracket plays out (group stage, knockouts, the final) without "
        "spoiling the winner, using the creative angle. Then 'Fighters in this tournament:' with a bullet list of up to "
        "12 names from the facts. Then one sentence on who it is for (fighting game, tournament and 2D animation fans) "
        "and one question inviting viewers to comment their predicted winner. End with 3-5 hashtags. "
        "At most one like/subscribe request, no links.\n"
        '- "tags": array of 15-25 strings, each under 30 characters, lowercase, mixing broad terms with specific ones '
        "(fighter names, '<a> vs <b>', tournament formats), no hashtags, no duplicates.\n"
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
    fin = facts.get("finalists") or []
    bullets = "\n".join(f"- {x}" for x in names[:12])
    versus = f"{fin[0]} vs {fin[1]}" if len(fin) == 2 else None
    title = f"{versus}: {n}-Fighter 2D Fighting Tournament" if versus else f"{n} Fighters, One Winner: 2D Fighting Tournament"
    hook = (f"{fin[0]} and {fin[1]} fight for the title in a {n}-fighter 2D fighting tournament. Who takes it?"
            if versus else f"Watch a {n}-fighter 2D fighting tournament from the group stage to the grand final.")
    desc = (
        f"{hook}\n\n"
        f"{n} fighters enter, only one survives. Follow the group stage, the knockout rounds and the final.\n\n"
        + (f"Fighters in this tournament:\n{bullets}\n\n" if bullets else "")
        + "Made for fans of fighting games, tournaments and 2D animation. No narration, just pure action. "
        "Who is your pick to win? Tell us in the comments.\n\n#fightinggame #tournament #2danimation"
    )
    return {"title": _clean_title(title), "description": desc, "tags": []}


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
    title = _clean_title(result.get("title") or base["title"])
    description = str(result.get("description") or base["description"]).replace("<", "").replace(">", "")
    tags = _clean_tags(result.get("tags"), extra=["fighting tournament", "2d fighting game", "tournament",
                                                  "fighting game animation", *facts["fighter_names"][:6]])
    return {"title": title, "description": description[:DESC_MAX].strip(), "tags": tags}
