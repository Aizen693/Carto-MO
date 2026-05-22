"""
Stockage durable des jetons OAuth Inoreader — table Supabase `app_secrets`.

Pourquoi : Inoreader fait tourner (rotation) le refresh token a chaque
rafraichissement. Streamlit Cloud redemarre l'app et efface memoire + disque,
et les secrets Streamlit sont en lecture seule. Sans stockage durable, l'app
repart d'un refresh token perime => HTTP 401 "Token refresh failed".

La table `app_secrets` est verrouillee (RLS active, aucune policy) : seul le
role `service_role` de Supabase y accede. La cle service est fournie via les
secrets Streamlit (SUPABASE_SERVICE_KEY), jamais commitee dans le depot.
"""

import logging
from datetime import datetime, timezone

import httpx

logger = logging.getLogger(__name__)

_KEY = "inoreader"
_TIMEOUT = 15.0


def _endpoint(supabase_url: str) -> str:
    return supabase_url.rstrip("/") + "/rest/v1/app_secrets"


def _headers(service_key: str) -> dict[str, str]:
    return {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
    }


def is_configured(supabase_url: str, service_key: str) -> bool:
    """Vrai si le coffre durable est utilisable (URL + cle service presentes)."""
    return bool(supabase_url and service_key)


def load_tokens(supabase_url: str, service_key: str) -> dict | None:
    """Lit les jetons stockes.

    Retourne {access_token, refresh_token, updated_at} ou None si rien n'est
    stocke / en cas d'erreur (l'app retombe alors sur les secrets Streamlit).
    """
    if not is_configured(supabase_url, service_key):
        return None
    try:
        resp = httpx.get(
            _endpoint(supabase_url),
            headers=_headers(service_key),
            params={"key": f"eq.{_KEY}",
                    "select": "access_token,refresh_token,updated_at"},
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
        rows = resp.json()
        if rows and rows[0].get("refresh_token"):
            return {
                "access_token": rows[0].get("access_token") or "",
                "refresh_token": rows[0].get("refresh_token") or "",
                "updated_at": rows[0].get("updated_at"),
            }
        return None
    except Exception as exc:
        logger.warning("token_store.load_tokens a echoue: %s", exc)
        return None


def save_tokens(supabase_url: str, service_key: str,
                access_token: str, refresh_token: str) -> bool:
    """Upsert des jetons courants. Retourne True si la sauvegarde a reussi."""
    if not is_configured(supabase_url, service_key) or not refresh_token:
        return False
    try:
        resp = httpx.post(
            _endpoint(supabase_url),
            headers={**_headers(service_key),
                     "Prefer": "resolution=merge-duplicates"},
            json={
                "key": _KEY,
                "access_token": access_token or "",
                "refresh_token": refresh_token,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            },
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
        logger.info("token_store: jetons Inoreader sauvegardes dans Supabase.")
        return True
    except Exception as exc:
        logger.warning("token_store.save_tokens a echoue: %s", exc)
        return False


def clear_tokens(supabase_url: str, service_key: str) -> bool:
    """Supprime la ligne stockee — force un re-amorcage depuis les secrets."""
    if not is_configured(supabase_url, service_key):
        return False
    try:
        resp = httpx.delete(
            _endpoint(supabase_url),
            headers=_headers(service_key),
            params={"key": f"eq.{_KEY}"},
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
        logger.info("token_store: ligne Inoreader supprimee.")
        return True
    except Exception as exc:
        logger.warning("token_store.clear_tokens a echoue: %s", exc)
        return False
