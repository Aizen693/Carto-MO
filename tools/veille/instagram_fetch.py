#!/usr/bin/env python3
"""Pont Instaloader -> collecteur de veille (tools/veille/lib/instagram.mjs).

Instagram refuse tout acces anonyme (401 des la premiere requete, teste le
21/09/2026) : il faut une session Instaloader creee a la main, une fois, par
l'analyste avec un compte DEDIE a la veille (jamais son compte personnel) :

    pip install instaloader
    instaloader --login <compte_veille>      # demande le mot de passe, cree la session

Ce script ne manipule jamais de mot de passe : il recharge uniquement la
session enregistree par Instaloader (~/.config/instaloader/session-<compte>).

Sortie : un objet JSON par ligne sur stdout, au format d'item du collecteur.
Les erreurs par source vont sur stderr, prefixees par [!], sans interrompre
les autres sources.

Usage :
    python3 instagram_fetch.py --user <compte_veille> --profiles a,b \
        [--hashtags x,y] [--max-age 3] [--per-source 12]
"""

import argparse
import json
import sys
import time
from datetime import datetime, timedelta, timezone
from itertools import islice


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--user", required=True, help="compte Instaloader dont la session est chargee")
    p.add_argument("--profiles", default="", help="comptes publics a lire, separes par des virgules")
    p.add_argument("--hashtags", default="", help="hashtags sans #, separes par des virgules")
    p.add_argument("--max-age", type=float, default=3, help="age maximum d'un post, en jours")
    p.add_argument("--per-source", type=int, default=12, help="posts lus au plus par compte ou hashtag")
    p.add_argument("--check", action="store_true", help="teste la session et chaque source, sans sortie d'items")
    return p.parse_args()


def split(s):
    return [x.strip().lstrip("@#") for x in s.split(",") if x.strip()]


def item_from_post(post, via):
    caption = (post.caption or "").strip()
    geotag = None
    try:
        loc = post.location  # une requete de plus, seulement si le post est geotague
        if loc and loc.lat is not None and loc.lng is not None:
            geotag = {"name": loc.name, "lat": loc.lat, "lon": loc.lng}
    except Exception:
        pass
    return {
        "source": "instagram",
        "source_url": f"https://www.instagram.com/p/{post.shortcode}/",
        "author": f"@{post.owner_username}",
        "published_at": post.date_utc.replace(tzinfo=timezone.utc).isoformat(),
        "text": caption,
        "media": [],
        "audience": str(post.likes) if post.likes is not None else None,
        "query": via,
        "geotag": geotag,
    }


def main():
    a = parse_args()
    try:
        import instaloader
    except ImportError:
        print("[!] instaloader absent : pip install instaloader", file=sys.stderr)
        return 2

    L = instaloader.Instaloader(
        download_pictures=False, download_videos=False, download_video_thumbnails=False,
        download_geotags=False, download_comments=False, save_metadata=False,
        quiet=True, max_connection_attempts=1,
    )
    try:
        L.load_session_from_file(a.user)
    except FileNotFoundError:
        print(f"[!] session absente pour {a.user} : lancer `instaloader --login {a.user}`", file=sys.stderr)
        return 3

    since = datetime.now(timezone.utc) - timedelta(days=a.max_age)
    sources = [("profil", n) for n in split(a.profiles)] + [("hashtag", n) for n in split(a.hashtags)]
    failed = 0

    for kind, name in sources:
        label = f"@{name}" if kind == "profil" else f"#{name}"
        t0 = time.time()
        try:
            if kind == "profil":
                posts = instaloader.Profile.from_username(L.context, name).get_posts()
            else:
                posts = instaloader.Hashtag.from_name(L.context, name).get_posts_resumable()
            n = 0
            for post in islice(posts, a.per_source):
                date = post.date_utc.replace(tzinfo=timezone.utc)
                # Les profils sont chronologiques (hors posts epingles) : on
                # continue au lieu de s'arreter pour ne pas rater un epingle.
                if date < since:
                    continue
                n += 1
                if not a.check:
                    print(json.dumps(item_from_post(post, label), ensure_ascii=False), flush=True)
            if a.check:
                print(json.dumps({"check": label, "ok": True, "items": n, "ms": int((time.time() - t0) * 1000)}), flush=True)
        except Exception as e:  # une source en echec n'arrete pas les autres
            failed += 1
            msg = f"{type(e).__name__}: {str(e)[:160]}"
            print(f"[!] {label} : {msg}", file=sys.stderr)
            if a.check:
                print(json.dumps({"check": label, "ok": False, "error": msg}), flush=True)
        time.sleep(2)  # rythme humain entre deux sources, limite le risque de blocage

    return 1 if sources and failed == len(sources) else 0


if __name__ == "__main__":
    sys.exit(main())
