"""
Script standalone pour obtenir les tokens OAuth2 Inoreader lors du premier usage.

Usage :
  python oauth_setup.py

Le script :
  1. Affiche l'URL d'autorisation à ouvrir dans le navigateur
  2. Demande le code de redirection
  3. Échange le code contre access_token + refresh_token
  4. Affiche les lignes à copier dans .env

Prérequis : INOREADER_CLIENT_ID, INOREADER_CLIENT_SECRET dans .env
"""

import os
import sys
import webbrowser

import httpx
from dotenv import load_dotenv

load_dotenv()

TOKEN_URL = "https://www.inoreader.com/oauth2/token"
AUTH_URL  = "https://www.inoreader.com/oauth2/auth"
REDIRECT_URI = "http://localhost:8080"    # doit correspondre à votre app Inoreader


def main() -> None:
    client_id     = os.getenv("INOREADER_CLIENT_ID", "").strip()
    client_secret = os.getenv("INOREADER_CLIENT_SECRET", "").strip()

    if not client_id or not client_secret:
        sys.exit(
            "Erreur : INOREADER_CLIENT_ID et INOREADER_CLIENT_SECRET "
            "doivent être définis dans .env"
        )

    # scope laissé vide volontairement : Inoreader accorde alors l'accès
    # lecture ET écriture (favoris, libellés). `scope=read` = lecture seule.
    auth_url = (
        f"{AUTH_URL}"
        f"?client_id={client_id}"
        f"&redirect_uri={REDIRECT_URI}"
        f"&response_type=code"
        f"&state=inoreader_dashboard"
    )

    print("\n=== Inoreader OAuth2 Setup ===")
    print(f"\n1. Ouvrez cette URL dans votre navigateur :\n\n   {auth_url}\n")

    try:
        webbrowser.open(auth_url)
    except Exception:
        pass

    print(f"2. Après autorisation, vous serez redirigé vers {REDIRECT_URI}?code=XXXX")
    print("   Copiez la valeur du paramètre 'code' dans l'URL.\n")

    code = input("3. Collez le code ici : ").strip()
    if not code:
        sys.exit("Code vide, abandon.")
    # Nettoie automatiquement si l'utilisateur a collé l'URL complète ou le code avec &state=...
    if "localhost" in code or "http" in code:
        import urllib.parse as _up
        qs = _up.urlparse(code).query
        code = _up.parse_qs(qs).get("code", [code])[0]
    code = code.split("&")[0].strip()

    print("\nÉchange du code contre les tokens...")
    resp = httpx.post(
        TOKEN_URL,
        data={
            "grant_type":    "authorization_code",
            "code":          code,
            "redirect_uri":  REDIRECT_URI,
            "client_id":     client_id,
            "client_secret": client_secret,
        },
    )

    if resp.status_code != 200:
        sys.exit(f"Erreur lors de l'échange : {resp.status_code} — {resp.text}")

    data = resp.json()
    access_token  = data.get("access_token", "")
    refresh_token = data.get("refresh_token", "")

    if not access_token:
        sys.exit(f"Réponse inattendue : {data}")

    print("\n✓ Tokens obtenus avec succès ! Ajoutez ces lignes à votre .env :\n")
    print(f"INOREADER_ACCESS_TOKEN={access_token}")
    print(f"INOREADER_REFRESH_TOKEN={refresh_token}")
    print()


if __name__ == "__main__":
    main()
