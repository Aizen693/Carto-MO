"""
Utilitaires : logging, chargement de config, helpers texte.
"""

import logging
import os
import re
from pathlib import Path

from dotenv import load_dotenv


def setup_logging(level: str = "INFO") -> None:
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s [%(levelname)-8s] %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )


def load_config() -> dict[str, str]:
    """Charge les variables depuis .env (local) ou st.secrets (Streamlit Cloud)."""
    # Essai Streamlit secrets en premier (Streamlit Cloud)
    try:
        import streamlit as st
        if hasattr(st, "secrets") and "INOREADER_CLIENT_ID" in st.secrets:
            return {
                "app_id":        st.secrets.get("INOREADER_APP_ID", ""),
                "app_key":       st.secrets.get("INOREADER_APP_KEY", ""),
                "client_id":     st.secrets.get("INOREADER_CLIENT_ID", ""),
                "client_secret": st.secrets.get("INOREADER_CLIENT_SECRET", ""),
                "access_token":  st.secrets.get("INOREADER_ACCESS_TOKEN", ""),
                "refresh_token": st.secrets.get("INOREADER_REFRESH_TOKEN", ""),
            }
    except Exception:
        pass

    # Fallback : fichier .env local
    env_path = Path(".env")
    if env_path.exists():
        load_dotenv(env_path)
    else:
        load_dotenv()

    return {
        "app_id":         os.getenv("INOREADER_APP_ID", ""),
        "app_key":        os.getenv("INOREADER_APP_KEY", ""),
        "client_id":      os.getenv("INOREADER_CLIENT_ID", ""),
        "client_secret":  os.getenv("INOREADER_CLIENT_SECRET", ""),
        "access_token":   os.getenv("INOREADER_ACCESS_TOKEN", ""),
        "refresh_token":  os.getenv("INOREADER_REFRESH_TOKEN", ""),
    }


def missing_keys(config: dict[str, str]) -> list[str]:
    """Retourne les clés obligatoires manquantes (access_token optionnel)."""
    required = ["app_id", "app_key", "client_id", "client_secret", "refresh_token"]
    return [k for k in required if not config.get(k)]


# URL Supabase du projet Carto Algorint — non secrète (déjà publique côté site).
DEFAULT_SUPABASE_URL = "https://lwgrjdpuagnvvzmdbyzb.supabase.co"


def load_supabase_creds() -> tuple[str, str]:
    """Retourne (url, service_key) pour le coffre durable des jetons.

    Seule la clé service (rôle service_role) est secrète : à mettre dans les
    secrets Streamlit / .env sous SUPABASE_SERVICE_KEY, jamais commitée.
    L'URL a une valeur par défaut, donc un seul secret suffit à l'activer.
    """
    url = service_key = ""
    try:
        import streamlit as st
        if hasattr(st, "secrets"):
            url = st.secrets.get("SUPABASE_URL", "") or ""
            service_key = st.secrets.get("SUPABASE_SERVICE_KEY", "") or ""
    except Exception:
        pass
    if not url:
        url = os.getenv("SUPABASE_URL", "")
    if not service_key:
        service_key = os.getenv("SUPABASE_SERVICE_KEY", "")
    return (url or DEFAULT_SUPABASE_URL), service_key


def truncate(text: str, max_len: int = 200) -> str:
    if not text:
        return ""
    return text[:max_len] + "…" if len(text) > max_len else text


def highlight_keywords(text: str, keywords: list[str]) -> str:
    """Entoure les mots-clés de ** pour le rendu Markdown Streamlit."""
    result = text
    for kw in keywords:
        if not kw:
            continue
        pat = re.compile(re.escape(kw), re.IGNORECASE)
        result = pat.sub(lambda m: f"**{m.group(0)}**", result)
    return result


def top_words(texts: list[str], n: int = 20, min_len: int = 4) -> list[tuple[str, int]]:
    """Retourne les N mots les plus fréquents d'une liste de textes."""
    from collections import Counter

    STOPWORDS = {
        "le", "la", "les", "de", "du", "des", "un", "une", "et", "en", "à", "au",
        "aux", "pour", "dans", "sur", "avec", "par", "que", "qui", "est", "sont",
        "the", "a", "an", "of", "to", "in", "is", "and", "for", "on", "at", "it",
        "this", "that", "was", "with", "from", "or", "be", "as", "by", "are",
    }
    counter: Counter = Counter()
    for text in texts:
        tokens = re.findall(r"\b[a-zA-ZÀ-ÿ]{" + str(min_len) + r",}\b", text.lower())
        counter.update(t for t in tokens if t not in STOPWORDS)
    return counter.most_common(n)
