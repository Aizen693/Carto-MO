"""
Export des articles sélectionnés en CSV, Excel, JSON et liste d'URLs.
"""

import io
from pathlib import Path

import pandas as pd

EXPORTS_DIR = Path("exports")

# Colonnes exportées (on exclut id et content brut par défaut)
EXPORT_COLS = [
    "title", "source", "folder", "tags", "author",
    "published_at", "url", "summary",
    "is_read", "is_starred", "word_count", "score",
]


def _clean(df: pd.DataFrame) -> pd.DataFrame:
    cols = [c for c in EXPORT_COLS if c in df.columns]
    return df[cols].copy()


def to_csv_bytes(df: pd.DataFrame) -> bytes:
    return _clean(df).to_csv(index=False).encode("utf-8-sig")  # BOM pour Excel


def to_excel_bytes(df: pd.DataFrame) -> bytes:
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        clean = _clean(df)
        # published_at doit être timezone-naive pour openpyxl
        if "published_at" in clean.columns:
            clean["published_at"] = pd.to_datetime(clean["published_at"], errors="coerce").dt.tz_localize(None)
        clean.to_excel(writer, index=False, sheet_name="Articles")
    return buf.getvalue()


def to_json_bytes(df: pd.DataFrame) -> bytes:
    return (
        _clean(df)
        .to_json(orient="records", indent=2, force_ascii=False, date_format="iso")
        .encode("utf-8")
    )


def get_urls_text(df: pd.DataFrame) -> str:
    if "url" not in df.columns:
        return ""
    return "\n".join(u for u in df["url"].dropna().tolist() if u)


def save_to_disk(name: str, content: bytes, suffix: str) -> Path:
    EXPORTS_DIR.mkdir(parents=True, exist_ok=True)
    path = EXPORTS_DIR / f"{name}{suffix}"
    path.write_bytes(content)
    return path
