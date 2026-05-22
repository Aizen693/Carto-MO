"""
Inoreader API client — OAuth 2.0, rate limiting, retry, refresh token.

Hypothèses documentées :
  - Les stream_ids sont URL-encodés dans le chemin de la requête.
  - L'API /edit-tag accepte un seul article par appel (i=...). Certaines
    implémentations acceptent des listes via `i` répété ; si les actions
    bulk sont lentes, modifier _bulk_edit pour passer plusieurs `i`.
  - La pagination utilise le champ `continuation` retourné par l'API.
  - L'endpoint /tag/list retourne les dossiers avec type="folder" ;
    si ce champ est absent, tous les labels sont traités comme tags.
"""

import time
import logging
import urllib.parse
from dataclasses import dataclass
from typing import Any, Optional

import httpx

logger = logging.getLogger(__name__)

BASE_URL = "https://www.inoreader.com/reader/api/0"
TOKEN_URL = "https://www.inoreader.com/oauth2/token"
AUTH_URL  = "https://www.inoreader.com/oauth2/auth"


@dataclass
class InoreaderConfig:
    app_id: str
    app_key: str
    client_id: str
    client_secret: str
    access_token: str
    refresh_token: str


class InoreaderAPIError(Exception):
    def __init__(self, status_code: int, message: str) -> None:
        self.status_code = status_code
        super().__init__(f"HTTP {status_code}: {message}")


class InoreaderAuthError(InoreaderAPIError):
    pass


class InoreaderClient:
    """Client synchrone pour l'API Inoreader.

    Gère : authentification Bearer, refresh automatique du token,
    rate limiting (2 req/s par défaut), retries exponentiels.
    """

    MIN_INTERVAL = 0.5   # secondes entre deux requêtes
    MAX_RETRIES  = 3

    def __init__(self, config: InoreaderConfig) -> None:
        self.config = config
        self.access_token = config.access_token
        self._http = httpx.Client(timeout=30.0, follow_redirects=True)
        self._last_req: float = 0.0

    # ── Internal helpers ───────────────────────────────────────────────────────

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.access_token}",
            "AppId": self.config.app_id,
            "AppKey": self.config.app_key,
        }

    def _rate_limit(self) -> None:
        elapsed = time.time() - self._last_req
        if elapsed < self.MIN_INTERVAL:
            time.sleep(self.MIN_INTERVAL - elapsed)
        self._last_req = time.time()

    def _refresh_access_token(self) -> bool:
        try:
            resp = self._http.post(
                TOKEN_URL,
                data={
                    "grant_type": "refresh_token",
                    "refresh_token": self.config.refresh_token,
                    "client_id": self.config.client_id,
                    "client_secret": self.config.client_secret,
                },
            )
            if resp.status_code == 200:
                data = resp.json()
                self.access_token = data["access_token"]
                if "refresh_token" in data:
                    self.config.refresh_token = data["refresh_token"]
                logger.info("Access token refreshed.")
                return True
            logger.error("Token refresh failed (%d): %s", resp.status_code, resp.text[:200])
            return False
        except Exception as exc:
            logger.error("Token refresh exception: %s", exc)
            return False

    def _request(
        self,
        method: str,
        url: str,
        retries: int = MAX_RETRIES,
        **kwargs: Any,
    ) -> Any:
        self._rate_limit()
        for attempt in range(retries):
            try:
                resp = self._http.request(method, url, headers=self._headers(), **kwargs)

                if resp.status_code == 401 and attempt == 0:
                    logger.info("401 — trying token refresh.")
                    if self._refresh_access_token():
                        continue
                    raise InoreaderAuthError(401, "Token refresh failed.")

                if resp.status_code == 429:
                    wait = int(resp.headers.get("Retry-After", 60))
                    logger.warning("Rate-limited. Waiting %ds.", wait)
                    time.sleep(wait)
                    continue

                if resp.status_code >= 400:
                    raise InoreaderAPIError(resp.status_code, resp.text[:300])

                return resp.json()

            except InoreaderAPIError:
                raise
            except Exception as exc:
                if attempt >= retries - 1:
                    raise
                wait = 2 ** attempt
                logger.warning("Request attempt %d failed: %s. Retry in %ds.", attempt + 1, exc, wait)
                time.sleep(wait)

        # Toutes les tentatives ont fini en `continue` (refresh + 429 répétés) :
        # on lève une erreur explicite plutôt que de renvoyer None silencieusement.
        raise InoreaderAPIError(429, f"Aucune réponse après {retries} tentatives pour {url}")

    def get(self, path: str, **params: Any) -> Any:
        return self._request("GET", f"{BASE_URL}{path}", params={k: v for k, v in params.items() if v is not None})

    def post(self, path: str, **data: Any) -> Any:
        return self._request("POST", f"{BASE_URL}{path}", data={k: v for k, v in data.items() if v is not None})

    # ── Metadata ───────────────────────────────────────────────────────────────

    def list_subscriptions(self) -> list[dict]:
        """Retourne tous les abonnements RSS."""
        data = self.get("/subscription/list", output="json")
        if not isinstance(data, dict):
            raise InoreaderAPIError(502, f"Réponse inattendue de /subscription/list : {type(data).__name__}")
        return data.get("subscriptions", [])

    def list_tags(self) -> list[dict]:
        """Retourne labels/dossiers/tags. type='folder' indique un dossier."""
        data = self.get("/tag/list", output="json")
        if not isinstance(data, dict):
            raise InoreaderAPIError(502, f"Réponse inattendue de /tag/list : {type(data).__name__}")
        return data.get("tags", [])

    def user_info(self) -> dict:
        return self.get("/user-info")

    # ── Stream contents ────────────────────────────────────────────────────────

    def get_stream_contents(
        self,
        stream_id: str,
        count: int = 100,
        exclude_read: bool = False,
        start_time: Optional[int] = None,
        end_time: Optional[int] = None,
        continuation: Optional[str] = None,
    ) -> dict:
        """Récupère une page d'articles depuis un stream donné.

        stream_id exemples :
          - user/-/state/com.google/reading-list
          - user/-/state/com.google/starred
          - user/-/label/{folder_or_tag_name}
          - feed/{feed_url}
        """
        encoded = urllib.parse.quote(stream_id, safe="")
        params: dict[str, Any] = {"n": count, "output": "json"}
        if exclude_read:
            params["xt"] = "user/-/state/com.google/read"
        if start_time:
            params["ot"] = start_time
        if end_time:
            params["nt"] = end_time
        if continuation:
            params["c"] = continuation
        return self.get(f"/stream/contents/{encoded}", **params)

    def get_all_pages(
        self,
        stream_id: str,
        max_articles: int = 500,
        **kwargs: Any,
    ) -> list[dict]:
        """Pagine automatiquement jusqu'à max_articles articles."""
        items: list[dict] = []
        continuation: Optional[str] = None
        page_size = min(250, max_articles)

        while len(items) < max_articles:
            remaining = max_articles - len(items)
            batch_size = min(page_size, remaining)
            data = self.get_stream_contents(
                stream_id,
                count=batch_size,
                continuation=continuation,
                **kwargs,
            )
            if not isinstance(data, dict):
                raise InoreaderAPIError(502, f"Réponse inattendue de /stream/contents : {type(data).__name__}")
            batch = data.get("items", [])
            items.extend(batch)
            logger.debug("Fetched %d articles (total %d).", len(batch), len(items))
            continuation = data.get("continuation")
            if not continuation or len(batch) < batch_size:
                break

        return items

    # ── Shortcuts ─────────────────────────────────────────────────────────────

    def get_all_articles(self, max_articles: int = 500, **kw: Any) -> list[dict]:
        return self.get_all_pages("user/-/state/com.google/reading-list", max_articles, **kw)

    def get_unread_articles(self, max_articles: int = 500, **kw: Any) -> list[dict]:
        return self.get_all_pages(
            "user/-/state/com.google/reading-list",
            max_articles,
            exclude_read=True,
            **kw,
        )

    def get_starred_articles(self, max_articles: int = 500, **kw: Any) -> list[dict]:
        return self.get_all_pages("user/-/state/com.google/starred", max_articles, **kw)

    def get_feed_articles(self, feed_url: str, max_articles: int = 500, **kw: Any) -> list[dict]:
        stream_id = f"feed/{feed_url}"
        return self.get_all_pages(stream_id, max_articles, **kw)

    def get_folder_articles(self, folder_name: str, max_articles: int = 500, **kw: Any) -> list[dict]:
        return self.get_all_pages(f"user/-/label/{folder_name}", max_articles, **kw)

    def get_tag_articles(self, tag_name: str, max_articles: int = 500, **kw: Any) -> list[dict]:
        return self.get_all_pages(f"user/-/label/{tag_name}", max_articles, **kw)

    # ── Write actions ──────────────────────────────────────────────────────────

    def _bulk_edit(self, article_ids: list[str], **params: str) -> None:
        """Applique edit-tag sur une liste d'articles (1 appel / article)."""
        for article_id in article_ids:
            self.post("/edit-tag", i=article_id, **params)
            logger.debug("edit-tag %s -> %s", article_id[:40], params)

    def mark_as_read(self, article_ids: list[str]) -> None:
        self._bulk_edit(article_ids, a="user/-/state/com.google/read")

    def mark_as_unread(self, article_ids: list[str]) -> None:
        self._bulk_edit(article_ids, r="user/-/state/com.google/read")

    def add_star(self, article_ids: list[str]) -> None:
        self._bulk_edit(article_ids, a="user/-/state/com.google/starred")

    def remove_star(self, article_ids: list[str]) -> None:
        self._bulk_edit(article_ids, r="user/-/state/com.google/starred")

    def add_tag(self, article_ids: list[str], tag_name: str) -> None:
        self._bulk_edit(article_ids, a=f"user/-/label/{tag_name}")

    def remove_tag(self, article_ids: list[str], tag_name: str) -> None:
        self._bulk_edit(article_ids, r=f"user/-/label/{tag_name}")

    def rename_tag(self, old_name: str, new_name: str) -> None:
        """Renomme un libellé. Les articles classés conservent le libellé."""
        self.post(
            "/rename-tag",
            s=f"user/-/label/{old_name}",
            dest=f"user/-/label/{new_name}",
        )

    def disable_tag(self, tag_name: str) -> None:
        """Supprime un libellé : il est retiré de tous les articles."""
        self.post("/disable-tag", s=f"user/-/label/{tag_name}")

    def close(self) -> None:
        self._http.close()

    def __enter__(self) -> "InoreaderClient":
        return self

    def __exit__(self, *_: Any) -> None:
        self.close()
