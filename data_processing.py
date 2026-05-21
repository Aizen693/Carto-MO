"""
Normalisation des réponses API Inoreader en objets Article et DataFrame pandas.
"""

import logging
import re
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

import pandas as pd

logger = logging.getLogger(__name__)


@dataclass
class Article:
    id: str
    title: str
    url: str
    source_title: str
    source_id: str
    folder: str
    tags: list[str]
    author: str
    published_at: Optional[datetime]
    fetched_at: datetime
    summary: str           # texte brut, tronqué à 600 chars
    content: str           # texte brut, tronqué à 3000 chars
    is_read: bool
    is_starred: bool
    word_count: int = 0
    score: float = 0.0


# ── HTML stripping ─────────────────────────────────────────────────────────────

_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE  = re.compile(r"\s+")


def strip_html(html: str) -> str:
    if not html:
        return ""
    text = _TAG_RE.sub(" ", html)
    return _WS_RE.sub(" ", text).strip()


# ── Helpers ────────────────────────────────────────────────────────────────────

def _best_url(canonical: list, alternate: list) -> str:
    for lst in (canonical or [], alternate or []):
        for item in lst:
            href = item.get("href", "")
            if href:
                return href
    return ""


def _parse_categories(categories: list[str]) -> tuple[str, list[str]]:
    """Retourne (folder, tags) depuis la liste de catégories d'un article.

    Les catégories com.google/* sont des états système, pas des labels utilisateur.
    Les labels utilisateur ont la forme : user/{id}/label/{name}
    On ne peut pas distinguer dossiers de tags à ce niveau — on retourne
    tous les labels, le premier trouvé sera considéré dossier principal.
    """
    folder = ""
    tags: list[str] = []
    for cat in categories:
        if "/label/" in cat and "state" not in cat:
            label = cat.split("/label/")[-1].strip()
            if label:
                if not folder:
                    folder = label
                tags.append(label)
    return folder, tags


def _word_count(texts: list[str]) -> int:
    combined = " ".join(t for t in texts if t)
    return len(combined.split())


# ── Main normalizer ────────────────────────────────────────────────────────────

def normalize_item(item: dict, fetched_at: datetime) -> Article:
    categories = item.get("categories", [])
    folder, tags = _parse_categories(categories)

    origin = item.get("origin", {})
    source_title = origin.get("title", "")
    source_id    = origin.get("streamId", "")

    summary_obj = item.get("summary") or {}
    content_obj = item.get("content") or {}
    summary_html = summary_obj.get("content", "")
    content_html = content_obj.get("content", "") or summary_html  # fallback

    summary_text = strip_html(summary_html)[:600]
    content_text = strip_html(content_html)[:3000]

    is_read    = "user/-/state/com.google/read"    in categories
    is_starred = "user/-/state/com.google/starred" in categories

    pub_ts = item.get("published") or item.get("updated")
    published_at = datetime.fromtimestamp(int(pub_ts)) if pub_ts else None

    title = strip_html(item.get("title", "")).strip()
    wc = _word_count([title, summary_text, content_text])

    return Article(
        id=item.get("id", ""),
        title=title,
        url=_best_url(item.get("canonical", []), item.get("alternate", [])),
        source_title=source_title,
        source_id=source_id,
        folder=folder,
        tags=tags,
        author=item.get("author", ""),
        published_at=published_at,
        fetched_at=fetched_at,
        summary=summary_text,
        content=content_text,
        is_read=is_read,
        is_starred=is_starred,
        word_count=wc,
    )


def normalize_articles(items: list[dict]) -> list[Article]:
    fetched_at = datetime.now()
    articles: list[Article] = []
    for item in items:
        try:
            articles.append(normalize_item(item, fetched_at))
        except Exception as exc:
            logger.warning("Skipping malformed article: %s", exc)
    logger.info("Normalized %d/%d articles.", len(articles), len(items))
    return articles


# ── DataFrame conversion ───────────────────────────────────────────────────────

DISPLAY_COLUMNS = [
    "id", "title", "source", "folder", "tags", "author",
    "published_at", "fetched_at", "url",
    "summary", "content",
    "is_read", "is_starred",
    "word_count", "score",
]


def articles_to_dataframe(articles: list[Article]) -> pd.DataFrame:
    """Convertit une liste d'Article en DataFrame avec types stricts."""
    if not articles:
        return pd.DataFrame(columns=DISPLAY_COLUMNS)

    rows = [
        {
            "id":           a.id,
            "title":        a.title,
            "source":       a.source_title,
            "folder":       a.folder,
            "tags":         ", ".join(a.tags),
            "author":       a.author,
            "published_at": a.published_at,
            "fetched_at":   a.fetched_at,
            "url":          a.url,
            "summary":      a.summary,
            "content":      a.content,
            "is_read":      a.is_read,
            "is_starred":   a.is_starred,
            "word_count":   a.word_count,
            "score":        a.score,
        }
        for a in articles
    ]
    df = pd.DataFrame(rows)
    df["published_at"] = pd.to_datetime(df["published_at"], errors="coerce")
    df["fetched_at"]   = pd.to_datetime(df["fetched_at"],   errors="coerce")
    df["is_read"]      = df["is_read"].astype(bool)
    df["is_starred"]   = df["is_starred"].astype(bool)
    df["word_count"]   = df["word_count"].astype(int)
    df["score"]        = df["score"].astype(float)
    # Fill string NaN
    for col in ("title", "source", "folder", "tags", "author", "url", "summary", "content"):
        df[col] = df[col].fillna("")
    return df
