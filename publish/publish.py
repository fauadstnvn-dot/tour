"""Read YouTube credentials from MySQL (column token_arena) -> DeepSeek SEO -> upload + thumbnail -> num + 1."""
from __future__ import annotations

import argparse
from datetime import datetime, timedelta, timezone
import json
import os
import re
import sys
import time
from pathlib import Path

import pymysql
import requests

from .metadata import generate

TABLE = "tb_bao_secret"
TOKEN_COLUMN = "token_arena"
MAX_NUM = 9
TOKEN_URL = "https://oauth2.googleapis.com/token"
THUMB_URL = "https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId={video_id}"
UPLOAD_URL = "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status"
HAS_TOKEN = f"{TOKEN_COLUMN} IS NOT NULL AND TRIM({TOKEN_COLUMN}) <> ''"


class AccountError(Exception):
    """Problem with this account only (bad token, quota): try the next one."""


def connect():
    return pymysql.connect(
        host=os.environ["DB_HOST"], port=int(os.environ.get("DB_PORT") or 3306),
        user=os.environ["DB_USER"], password=os.environ["DB_PASS"], database=os.environ["DB_NAME"],
        charset="utf8mb4", cursorclass=pymysql.cursors.DictCursor,
        connect_timeout=30, read_timeout=60, write_timeout=60, autocommit=True,
    )


def run_db(work, attempts: int = 5):
    """Fresh connection per operation (uploads take minutes; the host drops idle connections)."""
    last: Exception | None = None
    for attempt in range(1, attempts + 1):
        db = None
        try:
            db = connect()
            return work(db)
        except pymysql.err.Error as exc:
            last = exc
            print(f"  ! MySQL error ({exc}), retry {attempt}/{attempts}")
            time.sleep(min(5 * attempt, 20))
        finally:
            if db is not None:
                try:
                    db.close()
                except Exception:
                    pass
    raise RuntimeError(f"MySQL unreachable after {attempts} tries: {last}")


def candidates() -> list[dict]:
    sql = (f"SELECT client_id, client_secret, {TOKEN_COLUMN} AS token, COALESCE(num, 0) AS num "
           f"FROM {TABLE} WHERE {HAS_TOKEN} AND COALESCE(num, 0) < %s ORDER BY RAND()")

    def work(db):
        with db.cursor() as cur:
            cur.execute(sql, (MAX_NUM,))
            rows = cur.fetchall()
            if rows:
                return rows
            cur.execute(f"UPDATE {TABLE} SET num = 0 WHERE {HAS_TOKEN}")
            print(f"  All accounts used (num >= {MAX_NUM}) -> reset num=0 for {cur.rowcount} rows")
            cur.execute(sql, (MAX_NUM,))
            return cur.fetchall()

    return run_db(work)


def valid_access_token(row: dict) -> str:
    try:
        tokens = json.loads(row["token"])
    except (TypeError, ValueError) as exc:
        raise AccountError(f"{TOKEN_COLUMN} is not valid JSON") from exc
    expires_at = tokens.get("saved_at", 0) + tokens.get("expires_in", 3600) - 300
    if tokens.get("access_token") and time.time() < expires_at:
        return tokens["access_token"]
    if not tokens.get("refresh_token"):
        raise AccountError("missing refresh_token")
    r = requests.post(TOKEN_URL, data={
        "client_id": row["client_id"], "client_secret": row["client_secret"],
        "refresh_token": tokens["refresh_token"], "grant_type": "refresh_token",
    }, timeout=60)
    if r.status_code != 200:
        raise AccountError(f"token refresh failed ({r.status_code}): {r.text[:200]}")
    new = r.json()
    new.setdefault("refresh_token", tokens["refresh_token"])
    new.setdefault("scope", tokens.get("scope"))
    new["saved_at"] = int(time.time())

    def save(db):
        with db.cursor() as cur:
            cur.execute(f"UPDATE {TABLE} SET {TOKEN_COLUMN} = %s WHERE client_id = %s",
                        (json.dumps(new), row["client_id"]))

    run_db(save)
    return new["access_token"]


def increment_num(client_id: str) -> None:
    def work(db):
        with db.cursor() as cur:
            cur.execute(f"UPDATE {TABLE} SET num = COALESCE(num, 0) + 1 WHERE client_id = %s", (client_id,))

    run_db(work)


def sanitize(info: dict, with_tags: bool = True) -> dict:
    def strip(text: str) -> str:
        return re.sub(r"[<>\x00-\x08\x0b\x0c\x0e-\x1f]", "", str(text or "")).replace("\r", "")

    title = " ".join(strip(info.get("title")).split())
    if len(title) > 100:
        title = title[:100].rsplit(" ", 1)[0]
    desc = strip(info.get("description"))
    while len(desc.encode("utf-8")) > 4900:
        desc = desc[:-100]
    tags, seen, total = [], set(), 0
    if with_tags:
        for t in info.get("tags") or []:
            t = re.sub(r"[<>\",#]", "", str(t)).strip()
            if not t or len(t) > 30 or t.lower() in seen or total + len(t) + 3 > 450:
                continue
            seen.add(t.lower())
            tags.append(t)
            total += len(t) + 3
    return {"title": title or "2D Fighting Tournament", "description": desc.strip(), "tags": tags}


def next_publish_at(hhmm: str) -> str | None:
    """Next occurrence of HH:MM UTC as RFC3339, or None if empty/invalid/less than 20 minutes away."""
    try:
        h, m = (int(x) for x in hhmm.strip().split(":"))
    except ValueError:
        return None
    now = datetime.now(timezone.utc)
    target = now.replace(hour=h, minute=m, second=0, microsecond=0)
    if target - now < timedelta(minutes=20):
        # Today's slot is (almost) gone: release now rather than wait a full day.
        return None
    return target.strftime("%Y-%m-%dT%H:%M:%S.000Z")


def upload(access_token: str, mp4: Path, info: dict, privacy: str, category: str, kids: bool, publish_at: str | None = None) -> str:
    try:
        return _upload(access_token, mp4, sanitize(info), privacy, category, kids, publish_at)
    except requests.HTTPError as exc:
        if exc.response is None or exc.response.status_code != 400:
            raise
        print(f"  ! YouTube 400 ({exc.response.text[:300]}), retrying without tags/language")
        return _upload(access_token, mp4, sanitize(info, with_tags=False), privacy, category, kids, publish_at, minimal=True)


def _upload(access_token, mp4: Path, info, privacy, category, kids, publish_at=None, minimal=False) -> str:
    body = {"snippet": {"title": info["title"], "description": info["description"], "categoryId": str(category)},
            "status": {"privacyStatus": privacy, "selfDeclaredMadeForKids": kids}}
    if publish_at:
        body["status"]["privacyStatus"] = "private"
        body["status"]["publishAt"] = publish_at
    if info["tags"]:
        body["snippet"]["tags"] = info["tags"]
    if not minimal:
        body["snippet"]["defaultLanguage"] = "en"
        body["snippet"]["defaultAudioLanguage"] = "en"
    size = mp4.stat().st_size
    init = requests.post(UPLOAD_URL, json=body, timeout=60, headers={
        "Authorization": f"Bearer {access_token}", "X-Upload-Content-Type": "video/mp4",
        "X-Upload-Content-Length": str(size)})
    if init.status_code in (401, 403):
        raise AccountError(f"YouTube refused ({init.status_code}): {init.text[:300]}")
    if not init.ok:
        raise requests.HTTPError(f"{init.status_code}: {init.text[:500]}", response=init)
    location = init.headers["Location"]
    for attempt in range(3):
        with mp4.open("rb") as fh:
            r = requests.put(location, data=fh, timeout=3600,
                             headers={"Content-Type": "video/mp4", "Content-Length": str(size)})
        if r.status_code in (200, 201):
            return r.json()["id"]
        if r.status_code in (401, 403):
            raise AccountError(f"upload refused ({r.status_code}): {r.text[:300]}")
        print(f"  ! upload try {attempt + 1} failed {r.status_code}, retrying")
        time.sleep(10 * (attempt + 1))
    raise RuntimeError("Upload failed after 3 tries")


def set_thumbnail(access_token: str, video_id: str, jpg: Path) -> bool:
    """Custom thumbnails need a phone-verified channel; failure only warns."""
    r = requests.post(THUMB_URL.format(video_id=video_id), timeout=120, data=jpg.read_bytes(),
                      headers={"Authorization": f"Bearer {access_token}", "Content-Type": "image/jpeg"})
    if r.status_code == 200:
        return True
    hint = (" (channel must be verified by phone at youtube.com/verify to use custom thumbnails)"
            if r.status_code == 403 else "")
    print(f"  ! Thumbnail not set ({r.status_code}){hint}: {r.text[:200]}")
    return False


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--video", default="output/tournament.mp4")
    ap.add_argument("--privacy", default=os.environ.get("YT_PRIVACY", "public"),
                    choices=["public", "unlisted", "private"])
    ap.add_argument("--category", default="20", help="20 = Gaming")
    ap.add_argument("--made-for-kids", action="store_true")
    ap.add_argument("--publish-at", default="", help="Release time HH:MM UTC (video is uploaded private and goes public then)")
    ap.add_argument("--dry-run", action="store_true", help="Only generate metadata; no upload, no DB change")
    args = ap.parse_args()

    mp4 = Path(args.video)
    meta_path = mp4.with_suffix(".json")
    thumb = mp4.with_suffix(".thumb.jpg")
    if not mp4.exists():
        sys.exit(f"Video not found: {mp4}")
    meta = json.loads(meta_path.read_text(encoding="utf-8")) if meta_path.exists() else {}

    meta["dry_run"] = args.dry_run
    info = generate(meta)
    print(f"Title: {info['title']}\nTags: {', '.join(info['tags'])}")
    mp4.with_suffix(".youtube.json").write_text(json.dumps(info, ensure_ascii=False, indent=2), encoding="utf-8")
    if args.dry_run:
        return

    publish_at = next_publish_at(args.publish_at) if args.publish_at else None
    print(f"Release: {publish_at or 'immediately (' + args.privacy + ')'}")
    for row in candidates():
        print(f"Trying account client_id={row['client_id'][:12]}... (num={row['num']})")
        try:
            token = valid_access_token(row)
            video_id = upload(token, mp4, info, args.privacy, args.category, args.made_for_kids, publish_at)
        except AccountError as exc:
            print(f"  ! skipping this account: {exc}")
            continue
        print(f"Uploaded: https://youtu.be/{video_id}")
        if thumb.exists():
            try:
                ok = False
                for attempt in range(3):
                    ok = set_thumbnail(valid_access_token(row), video_id, thumb)
                    if ok:
                        print("  Thumbnail set")
                        break
                    time.sleep(15)
            except Exception as exc:  # noqa: BLE001
                print(f"  ! Thumbnail failed (video is up): {exc}")
        else:
            print("  ! No thumbnail file found, YouTube will auto-pick a frame")
        try:
            increment_num(row["client_id"])
            print("  num +1")
        except RuntimeError as exc:
            print(f"  ! Uploaded but num was not incremented: {exc}")
        for p in (mp4, meta_path, thumb, mp4.with_suffix(".youtube.json")):
            p.unlink(missing_ok=True)
        return
    sys.exit("No account could upload")


if __name__ == "__main__":
    main()
