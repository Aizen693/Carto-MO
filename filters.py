"""
Logique de filtrage côté client (pandas) et gestion des profils JSON.
"""

import json
import logging
import re
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Optional

import pandas as pd

logger = logging.getLogger(__name__)

FILTERS_DIR = Path("saved_filters")


@dataclass
class FilterConfig:
    name: str = "default"
    search_text: str = ""
    sources: list[str]   = field(default_factory=list)
    folders: list[str]   = field(default_factory=list)
    tags: list[str]      = field(default_factory=list)
    date_from: Optional[date] = None
    date_to: Optional[date]   = None
    show_read: bool     = True
    show_unread: bool   = True
    show_starred: bool  = True
    show_unstarred: bool= True
    include_keywords: list[str] = field(default_factory=list)
    exclude_keywords: list[str] = field(default_factory=list)
    min_words: int  = 0
    max_words: int  = 100_000
    sort_by: str    = "published_at"
    sort_ascending: bool = False


# ── Filter application ─────────────────────────────────────────────────────────

def _kw_mask(df: pd.DataFrame, keywords: list[str]) -> pd.Series:
    """Masque booléen : au moins un mot-clé présent dans titre+résumé+contenu."""
    combined = (
        df["title"].fillna("") + " " +
        df["summary"].fillna("") + " " +
        df["content"].fillna("")
    ).str.lower()
    patterns = [r"\b" + re.escape(kw.lower()) + r"\b" for kw in keywords]
    mask = pd.Series([False] * len(df), index=df.index)
    for pat in patterns:
        mask |= combined.str.contains(pat, regex=True, na=False)
    return mask


def apply_filters(df: pd.DataFrame, config: FilterConfig) -> pd.DataFrame:
    if df.empty:
        return df

    f = df.copy()

    # Recherche texte libre — mot entier uniquement (\b évite "Somali" pour "mali")
    if config.search_text.strip():
        q = r"\b" + re.escape(config.search_text.strip().lower()) + r"\b"
        text_mask = (
            f["title"].str.lower().str.contains(q, regex=True, na=False) |
            f["summary"].str.lower().str.contains(q, regex=True, na=False) |
            f["content"].str.lower().str.contains(q, regex=True, na=False)
        )
        f = f[text_mask]

    # Source
    if config.sources:
        f = f[f["source"].isin(config.sources)]

    # Dossier
    if config.folders:
        f = f[f["folder"].isin(config.folders)]

    # Tags (correspondance partielle : tag demandé contenu dans la liste csv)
    if config.tags:
        tag_mask = f["tags"].apply(
            lambda cell: any(tag in cell for tag in config.tags)
        )
        f = f[tag_mask]

    # Plage de dates
    if "published_at" in f.columns:
        dates = pd.to_datetime(f["published_at"], errors="coerce").dt.date
        if config.date_from:
            f = f[dates >= config.date_from]
        if config.date_to:
            f = f[dates <= config.date_to]

    # Statut lu
    if not config.show_read:
        f = f[~f["is_read"]]
    if not config.show_unread:
        f = f[f["is_read"]]

    # Statut favori
    if not config.show_starred:
        f = f[~f["is_starred"]]
    if not config.show_unstarred:
        f = f[f["is_starred"]]

    # Mots-clés requis
    if config.include_keywords:
        f = f[_kw_mask(f, config.include_keywords)]

    # Mots-clés exclus
    if config.exclude_keywords:
        f = f[~_kw_mask(f, config.exclude_keywords)]

    # Longueur
    if "word_count" in f.columns:
        f = f[(f["word_count"] >= config.min_words) & (f["word_count"] <= config.max_words)]

    # Tri
    if config.sort_by in f.columns:
        f = f.sort_values(config.sort_by, ascending=config.sort_ascending, na_position="last")

    return f.reset_index(drop=True)


# ── Profile persistence ────────────────────────────────────────────────────────

def _config_to_dict(config: FilterConfig) -> dict:
    return {
        "name": config.name,
        "search_text": config.search_text,
        "sources": config.sources,
        "folders": config.folders,
        "tags": config.tags,
        "date_from": config.date_from.isoformat() if config.date_from else None,
        "date_to":   config.date_to.isoformat()   if config.date_to   else None,
        "show_read":     config.show_read,
        "show_unread":   config.show_unread,
        "show_starred":  config.show_starred,
        "show_unstarred":config.show_unstarred,
        "include_keywords": config.include_keywords,
        "exclude_keywords": config.exclude_keywords,
        "min_words":   config.min_words,
        "max_words":   config.max_words,
        "sort_by":     config.sort_by,
        "sort_ascending": config.sort_ascending,
    }


def save_filter_profile(config: FilterConfig) -> Path:
    FILTERS_DIR.mkdir(parents=True, exist_ok=True)
    path = FILTERS_DIR / f"{config.name}.json"
    path.write_text(json.dumps(_config_to_dict(config), indent=2, ensure_ascii=False), encoding="utf-8")
    logger.info("Filter profile saved: %s", path)
    return path


def load_filter_profile(name: str) -> FilterConfig:
    path = FILTERS_DIR / f"{name}.json"
    if not path.exists():
        raise FileNotFoundError(f"Profile '{name}' not found at {path}")
    data = json.loads(path.read_text(encoding="utf-8"))
    date_from = date.fromisoformat(data.pop("date_from")) if data.get("date_from") else None
    date_to   = date.fromisoformat(data.pop("date_to"))   if data.get("date_to")   else None
    config = FilterConfig(**data)
    config.date_from = date_from
    config.date_to   = date_to
    return config


def delete_filter_profile(name: str) -> None:
    path = FILTERS_DIR / f"{name}.json"
    path.unlink(missing_ok=True)


def list_filter_profiles() -> list[str]:
    FILTERS_DIR.mkdir(parents=True, exist_ok=True)
    return sorted(p.stem for p in FILTERS_DIR.glob("*.json"))
