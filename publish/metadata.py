"""English, SEO-friendly YouTube title / description / tags via DeepSeek (with a safe fallback)."""
from __future__ import annotations

import json
import os
import re
import time

import requests

DEEPSEEK_URL = "https://api.deepseek.com/chat/completions"
DEEPSEEK_MODEL = os.environ.get("DEEPSEEK_MODEL", "deepseek-flash")
DEEPSEEK_RETRIES = 3
NON_ENGLISH_RE = re.compile(r"[\u00C0-\u024F\u1E00-\u1EFF\u0370-\u04FF\u0E00-\u0E7F\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF]")
REQUIRED_KEYS = ("title", "description", "tags")

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
    return {
        "fighters": meta.get("fighters"),
        "fighter_names": names[:32],
        "finalists": meta.get("finalists") or [],
        "stages": meta.get("stages") or [],
        "highlight_clips": len(meta.get("highlights") or []),
        "length": f"{minutes}:{sec:02d}",
        "format": "2D fighting tournament with group stage and knockout rounds, no narration",
    }


def build_prompt(facts: dict) -> str:
    return (
        "Create YouTube metadata for this video.\n"
        f"FACTS: {json.dumps(facts, ensure_ascii=False)}\n\n"
        "Do NOT reveal the champion (it is not in the facts); keep the outcome a mystery.\n"
        "Return JSON with exactly these keys:\n"
        f'- "title": string, 55-{TITLE_MAX - 20} characters, primary keyword near the start '
        "(e.g. fighting tournament, 2D battle royale), mention the number of fighters, max 1 emoji, no ALL CAPS words.\n"
        '- "description": string, 900-2500 characters. First 2 sentences contain the main keywords. Then: what happens '
        "(group stage, knockout rounds, highlights, the final), a bullet list of notable fighters from the facts, "
        "who it is for (fighting game, tournament and animation fans), and end with 3-5 hashtags. "
        "Ask for likes/subscribes at most once, no links.\n"
        '- "tags": array of 15-25 strings, each under 30 characters, lowercase, broad and specific mixed, '
        "no hashtags, no duplicates.\n"
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
    bullets = "\n".join(f"- {x}" for x in names[:12])
    desc = (
        f"Watch a {n}-fighter 2D fighting tournament from the group stage to the grand final. "
        "Who will be crowned champion?\n\n"
        f"{n} fighters enter, only one survives. Enjoy the highlight clips, the knockout rounds and a dramatic final.\n\n"
        + (f"Featured fighters:\n{bullets}\n\n" if bullets else "")
        + "Made for fans of fighting games, tournaments and 2D animation. No narration, just pure action.\n\n"
        "#fightinggame #tournament #2danimation"
    )
    return {"title": _clean_title(f"{n} Fighters, One Champion: Epic 2D Fighting Tournament"),
            "description": desc, "tags": []}


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
