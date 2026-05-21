"""
Moteur de scoring local et configurable.

Score final = somme de bonus/malus selon :
  - mots-clés trouvés dans le titre
  - mots-clés trouvés dans le corps (résumé + contenu)
  - source appartenant à une liste prioritaire
  - mots-clés négatifs trouvés dans le texte complet
"""

import re
from dataclasses import dataclass, field

import pandas as pd


@dataclass
class ScoringConfig:
    title_keywords: list[str]   = field(default_factory=list)
    body_keywords: list[str]    = field(default_factory=list)
    priority_sources: list[str] = field(default_factory=list)
    negative_keywords: list[str]= field(default_factory=list)
    title_keyword_bonus: float  = 3.0
    body_keyword_bonus: float   = 1.0
    source_bonus: float         = 2.0
    negative_keyword_malus: float = -2.0

    def is_empty(self) -> bool:
        return not any([
            self.title_keywords, self.body_keywords,
            self.priority_sources, self.negative_keywords,
        ])


def _count_matches(text: str, keywords: list[str]) -> int:
    if not text or not keywords:
        return 0
    text_lower = text.lower()
    return sum(
        1 for kw in keywords
        if re.search(r"\b" + re.escape(kw.lower()) + r"\b", text_lower)
    )


def score_row(row: pd.Series, config: ScoringConfig) -> float:
    title  = str(row.get("title", ""))
    body   = f"{row.get('summary', '')} {row.get('content', '')}"
    source = str(row.get("source", ""))

    s = 0.0
    s += _count_matches(title, config.title_keywords)  * config.title_keyword_bonus
    s += _count_matches(body,  config.body_keywords)   * config.body_keyword_bonus
    s += _count_matches(f"{title} {body}", config.negative_keywords) * config.negative_keyword_malus

    if config.priority_sources:
        src_lower = source.lower()
        if any(ps.lower() in src_lower for ps in config.priority_sources):
            s += config.source_bonus

    return round(s, 2)


def apply_scoring(df: pd.DataFrame, config: ScoringConfig) -> pd.DataFrame:
    if df.empty:
        return df
    df = df.copy()
    df["score"] = df.apply(lambda row: score_row(row, config), axis=1)
    return df
