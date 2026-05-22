"""
Inoreader Dashboard — application Streamlit de veille.

Trois pages :
  Veille    — liste des articles : recherche, filtres, sélection, triage
  Analyse   — tableaux de bord analytiques
  Réglages  — scoring local + profils de filtre sauvegardés
"""

import html
import logging
from datetime import datetime

import pandas as pd
import streamlit as st

from data_processing import normalize_articles, articles_to_dataframe
from exports import to_csv_bytes, to_excel_bytes, to_json_bytes, get_urls_text
from filters import (
    FilterConfig,
    apply_filters,
    delete_filter_profile,
    list_filter_profiles,
    load_filter_profile,
    save_filter_profile,
)
from inoreader_client import InoreaderAPIError, InoreaderClient, InoreaderConfig
from scoring import ScoringConfig, apply_scoring
from utils import highlight_keywords, load_config, missing_keys, setup_logging, top_words

setup_logging()
logger = logging.getLogger(__name__)

PAGE_SIZE = 50

# Séparateur de hiérarchie des libellés Inoreader : un libellé « Dossier/Sujet »
# est rangé dans le dossier « Dossier ». La structure des dossiers vit donc dans
# Inoreader même (le nom du libellé) — persistante et partagée, jamais perdue.
DOSSIER_SEP = "/"

SORT_OPTIONS = ["published_at", "score", "source", "word_count", "title"]
SORT_LABELS = {
    "published_at": "Date de publication",
    "score":        "Score",
    "source":       "Source",
    "word_count":   "Longueur",
    "title":        "Titre",
}
FILTER_KEYS = [
    "f_sources", "f_folders", "f_tags", "f_from", "f_to",
    "f_read", "f_unread", "f_starred", "f_unstarred",
    "f_inc", "f_exc", "f_minw", "f_maxw", "f_sort", "f_asc",
]

# ── Page config ──────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="Veille — Algor Int",
    page_icon="📰",
    layout="wide",
    initial_sidebar_state="expanded",
)

st.logo("algor_int_logo.jpg", size="large")

st.markdown(
    """
    <style>
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

    html, body, .stApp, [data-testid="stAppViewContainer"],
    [data-testid="stSidebar"], button, input, textarea, select {
        font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
    }
    .stApp, [data-testid="stAppViewContainer"] { background: #FFFFFF; }

    [data-testid="stHeader"] {
        background: rgba(255,255,255,0.7);
        backdrop-filter: saturate(140%) blur(14px);
        -webkit-backdrop-filter: saturate(140%) blur(14px);
        border-bottom: 1px solid rgba(24,20,40,0.08);
    }
    [data-testid="stLogo"] { height: 2.6rem; width: auto; }

    h1, h2, h3, h4, h5 {
        font-family: 'Plus Jakarta Sans', sans-serif;
        color: #181428; font-weight: 700; letter-spacing: -0.01em;
    }
    h1 { font-size: 1.8rem; }
    h2 { font-size: 1.3rem; }
    h3 { font-size: 1.05rem; }

    /* Sidebar — compacte */
    [data-testid="stSidebar"] {
        min-width: 290px; max-width: 320px;
        background: #F5F3FA;
        border-right: 1px solid rgba(24,20,40,0.08);
    }
    [data-testid="stSidebar"] h3 { color: #6B3FA0; }

    /* Boutons */
    .stButton > button, .stDownloadButton > button,
    .stFormSubmitButton > button, [data-testid="stPopover"] button {
        border-radius: 8px; font-weight: 600;
        border: 1px solid rgba(24,20,40,0.14);
        white-space: nowrap;
        min-width: 0;
        transition: border-color .15s ease, background .15s ease,
                    color .15s ease, transform .15s ease, box-shadow .15s ease;
    }
    /* Empêche le retour à la ligne caractère par caractère du libellé */
    .stButton > button p, .stDownloadButton > button p,
    .stFormSubmitButton > button p, [data-testid="stPopover"] button p,
    .stButton > button div, [data-testid="stPopover"] button div {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .stButton > button:hover, .stDownloadButton > button:hover,
    [data-testid="stPopover"] button:hover {
        border-color: #6B3FA0; color: #6B3FA0;
        transform: translateY(-1px);
        box-shadow: 0 8px 22px -12px rgba(107,63,160,0.5);
    }
    .stButton > button[kind="primary"],
    .stFormSubmitButton > button[kind="primary"],
    [data-testid="stBaseButton-primary"],
    [data-testid="stBaseButton-primaryFormSubmit"] {
        background: #6B3FA0; border-color: #6B3FA0; color: #FFFFFF;
    }
    .stButton > button[kind="primary"]:hover,
    .stFormSubmitButton > button[kind="primary"]:hover,
    [data-testid="stBaseButton-primary"]:hover,
    [data-testid="stBaseButton-primaryFormSubmit"]:hover {
        background: #5A2F8C; border-color: #5A2F8C; color: #FFFFFF;
        transform: translateY(-1px);
        box-shadow: 0 10px 26px -10px rgba(107,63,160,0.55);
    }

    /* Metrics */
    [data-testid="stMetric"] {
        background: #FFFFFF;
        border: 1px solid rgba(24,20,40,0.08);
        border-radius: 12px; padding: 12px 16px;
        box-shadow: 0 1px 0 rgba(24,20,40,0.04), 0 8px 24px -8px rgba(24,20,40,0.08);
    }
    [data-testid="stMetricValue"] { color: #6B3FA0; font-weight: 700; }
    [data-testid="stMetricLabel"] {
        color: #6E6982; text-transform: uppercase; letter-spacing: 0.08em;
        font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 0.66rem;
    }

    [data-baseweb="input"], [data-baseweb="textarea"], [data-baseweb="select"] > div {
        border-radius: 8px;
    }
    .stTextInput input:focus, .stNumberInput input:focus,
    .stDateInput input:focus, .stTextArea textarea:focus {
        border-color: #6B3FA0; box-shadow: 0 0 0 1px #6B3FA0;
    }

    [data-testid="stSidebar"] [role="radiogroup"] label {
        border-radius: 8px; padding: 2px 6px;
        transition: background .15s ease;
    }
    [data-testid="stSidebar"] [role="radiogroup"] label:hover {
        background: rgba(107,63,160,0.06);
    }

    [data-testid="stExpander"] {
        border: 1px solid rgba(24,20,40,0.08);
        border-radius: 12px;
    }
    [data-testid="stExpander"] summary:hover { color: #6B3FA0; }

    [data-testid="stDataFrame"], [data-testid="stTable"] {
        border-radius: 10px; overflow: hidden;
    }
    [data-testid="stSlider"] [role="slider"] { background-color: #6B3FA0; }
    [data-testid="stAlert"] { border-radius: 10px; }
    a, a:visited { color: #6B3FA0; }
    a:hover { color: #5A2F8C; }
    hr { border-color: rgba(24,20,40,0.08); margin: 0.8rem 0; }
    .stDataFrame { font-size: 13px; }

    /* ── Cartes d'article ──────────────────────────────────────────────── */
    [data-testid="stVerticalBlockBorderWrapper"] {
        border-radius: 14px;
        transition: box-shadow .15s ease, transform .15s ease;
    }
    .card-meta {
        font-family: 'JetBrains Mono', ui-monospace, monospace;
        font-size: 0.72rem; color: #6E6982; letter-spacing: 0.02em;
        margin-bottom: 2px;
    }
    .card-dot {
        display: inline-block; width: 7px; height: 7px;
        border-radius: 50%; margin-right: 6px; vertical-align: middle;
    }
    .card-dot.unread { background: #6B3FA0; }
    .card-dot.read   { background: transparent; border: 1px solid #B9B3C9; }
    .card-title {
        font-weight: 700; font-size: 1rem; line-height: 1.35;
        color: #181428; margin: 2px 0 6px;
    }
    .card-title.read { color: #6E6982; font-weight: 600; }
    .card-excerpt {
        font-size: 0.83rem; color: #6E6982; line-height: 1.45;
        margin-bottom: 8px;
    }
    .card-badges { margin-bottom: 2px; }
    .chip {
        display: inline-block; padding: 1px 9px; margin: 0 5px 4px 0;
        border-radius: 999px; font-size: 0.7rem; font-weight: 600;
        background: #EDE7F6; color: #6B3FA0;
    }
    .badge-score {
        display: inline-block; padding: 1px 9px; margin: 0 6px 4px 0;
        border-radius: 999px; font-size: 0.7rem; font-weight: 700;
        font-family: 'JetBrains Mono', ui-monospace, monospace;
    }
    .badge-score.high { background: #6B3FA0; color: #FFFFFF; }
    .badge-score.mid  { background: #EDE7F6; color: #6B3FA0; }
    .badge-score.low  { background: #F0EEF5; color: #8A8499; }
    </style>
    """,
    unsafe_allow_html=True,
)

# ── Session state ────────────────────────────────────────────────────────────

def _init_state() -> None:
    defaults: dict = {
        "articles_df":    pd.DataFrame(),
        "filtered_df":    pd.DataFrame(),
        "client":         None,
        "subscriptions":  [],
        "folders":        [],
        "tags_list":      [],
        "scoring_config": ScoringConfig(),
        "flt":            FilterConfig(),
        "selection":      set(),
        "table_key":      0,
        "page_index":     0,
        "user_labels":    [],
        "empty_dossiers": [],
        "auto_loaded":    False,
    }
    for k, v in defaults.items():
        if k not in st.session_state:
            st.session_state[k] = v

_init_state()

# ── Client ───────────────────────────────────────────────────────────────────

def get_client() -> InoreaderClient | None:
    if st.session_state.client is not None:
        return st.session_state.client
    cfg = load_config()
    missing = missing_keys(cfg)
    if missing:
        st.error(f"Variables manquantes dans .env : {', '.join(missing)}")
        return None
    try:
        client = InoreaderClient(InoreaderConfig(**cfg))
        st.session_state.client = client
        return client
    except Exception as exc:
        st.error(f"Impossible d'initialiser le client : {exc}")
        return None


def load_metadata(client: InoreaderClient) -> None:
    try:
        st.session_state.subscriptions = client.list_subscriptions()
        folders, tag_names = [], []
        for t in client.list_tags():
            tid = t.get("id", "")
            if "/label/" not in tid:
                continue
            label = tid.split("/label/")[-1].strip()
            if not label:
                continue
            (folders if t.get("type") == "folder" else tag_names).append(label)
        st.session_state.folders   = sorted(set(folders))
        st.session_state.tags_list = sorted(set(tag_names))
    except Exception as exc:
        st.warning(f"Erreur métadonnées : {exc}")
        logger.exception("load_metadata failed")


def load_articles(
    client: InoreaderClient,
    source_type: str,
    source_value: str,
    max_articles: int,
    exclude_read: bool,
    start_ts: int | None,
    end_ts: int | None,
) -> None:
    kwargs: dict = {}
    if exclude_read:
        kwargs["exclude_read"] = True
    if start_ts:
        kwargs["start_time"] = start_ts
    if end_ts:
        kwargs["end_time"] = end_ts

    stream_map = {
        "all":     "user/-/state/com.google/reading-list",
        "starred": "user/-/state/com.google/starred",
    }
    if source_type in stream_map:
        stream_id = stream_map[source_type]
    elif source_type == "feed":
        stream_id = f"feed/{source_value}" if source_value else stream_map["all"]
    elif source_type in ("folder", "tag"):
        stream_id = f"user/-/label/{source_value}" if source_value else stream_map["all"]
    else:
        stream_id = stream_map["all"]

    try:
        items = client.get_all_pages(stream_id, max_articles=max_articles, **kwargs)
        df = articles_to_dataframe(normalize_articles(items))
        df = apply_scoring(df, st.session_state.scoring_config)
        st.session_state.articles_df = df
        st.session_state.selection   = set()
        _recompute()
        st.success(f"{len(df)} articles chargés.")
    except InoreaderAPIError as exc:
        st.error(f"Erreur API Inoreader : {exc}")
    except Exception as exc:
        st.error(f"Erreur inattendue : {exc}")
        logger.exception("load_articles failed")


# ── Filtrage ──────────────────────────────────────────────────────────────────

def _recompute() -> None:
    """Recalcule filtered_df depuis articles_df et le filtre courant."""
    df = st.session_state.articles_df
    flt = st.session_state.flt
    st.session_state.filtered_df = apply_filters(df, flt) if not df.empty else df
    st.session_state.page_index  = 0
    st.session_state.table_key  += 1


def _on_search_change() -> None:
    st.session_state.flt.search_text = st.session_state.get("search_box", "")
    _recompute()


def _read_filter_widgets() -> FilterConfig:
    s = st.session_state
    return FilterConfig(
        search_text     = s.flt.search_text,
        sources         = s.get("f_sources", []),
        folders         = s.get("f_folders", []),
        tags            = s.get("f_tags", []),
        date_from       = s.get("f_from"),
        date_to         = s.get("f_to"),
        show_read       = s.get("f_read", True),
        show_unread     = s.get("f_unread", True),
        show_starred    = s.get("f_starred", True),
        show_unstarred  = s.get("f_unstarred", True),
        include_keywords= [k.strip() for k in s.get("f_inc", "").split(",") if k.strip()],
        exclude_keywords= [k.strip() for k in s.get("f_exc", "").split(",") if k.strip()],
        min_words       = int(s.get("f_minw", 0)),
        max_words       = int(s.get("f_maxw", 100_000)),
        sort_by         = s.get("f_sort", "published_at"),
        sort_ascending  = s.get("f_asc", False),
    )


def _render_filter_form(df: pd.DataFrame) -> None:
    flt = st.session_state.flt

    sources = sorted(df["source"].dropna().unique())
    folders = sorted(f for f in df["folder"].dropna().unique() if f)
    tags: set[str] = set()
    for cell in df["tags"].dropna():
        for t in cell.split(","):
            if t.strip():
                tags.add(t.strip())

    st.multiselect("Sources",  sources,      default=flt.sources, key="f_sources")
    st.multiselect("Dossiers", folders,      default=flt.folders, key="f_folders")
    st.multiselect("Tags",     sorted(tags), default=flt.tags,    key="f_tags")

    c1, c2 = st.columns(2)
    c1.date_input("Du", value=flt.date_from, key="f_from")
    c2.date_input("Au", value=flt.date_to,   key="f_to")

    st.markdown("**Statut**")
    c1, c2 = st.columns(2)
    with c1:
        st.checkbox("Lus",     value=flt.show_read,    key="f_read")
        st.checkbox("Favoris", value=flt.show_starred, key="f_starred")
    with c2:
        st.checkbox("Non lus",     value=flt.show_unread,    key="f_unread")
        st.checkbox("Non favoris", value=flt.show_unstarred, key="f_unstarred")

    st.text_input("Contient les mots", value=", ".join(flt.include_keywords),
                  key="f_inc", placeholder="IA, sécurité")
    st.text_input("Exclut les mots", value=", ".join(flt.exclude_keywords),
                  key="f_exc", placeholder="crypto, publicité")

    c1, c2 = st.columns(2)
    c1.number_input("Mots min", 0, 50_000,  value=flt.min_words, key="f_minw")
    c2.number_input("Mots max", 0, 100_000, value=flt.max_words, key="f_maxw")

    sort_idx = SORT_OPTIONS.index(flt.sort_by) if flt.sort_by in SORT_OPTIONS else 0
    st.selectbox("Trier par", SORT_OPTIONS, index=sort_idx, key="f_sort",
                 format_func=lambda x: SORT_LABELS[x])
    st.checkbox("Ordre croissant", value=flt.sort_ascending, key="f_asc")

    st.divider()
    b1, b2 = st.columns(2)
    if b1.button("Appliquer", type="primary", use_container_width=True, key="btn_apply"):
        st.session_state.flt = _read_filter_widgets()
        _recompute()
        st.rerun()
    if b2.button("Réinitialiser", use_container_width=True, key="btn_reset"):
        for k in FILTER_KEYS:
            st.session_state.pop(k, None)
        st.session_state.pop("search_box", None)
        st.session_state.flt = FilterConfig()
        _recompute()
        st.rerun()

    with st.expander("Sauvegarder ce filtre"):
        fname = st.text_input("Nom du profil", key="save_fname", label_visibility="collapsed",
                              placeholder="Nom du profil…")
        if st.button("Sauvegarder", key="btn_save_filter") and fname.strip():
            fc = _read_filter_widgets()
            fc.name = fname.strip()
            save_filter_profile(fc)
            st.success(f"Profil « {fname.strip()} » sauvegardé.")


# ── Sidebar ───────────────────────────────────────────────────────────────────

def render_sidebar() -> str:
    with st.sidebar:
        st.markdown("### Veille Algor Int")

        page = st.radio(
            "Navigation",
            ["Veille", "Analyse", "Réglages"],
            label_visibility="collapsed",
        )

        st.divider()
        st.markdown("### Charger")

        source_type = st.selectbox(
            "Source",
            ["all", "starred", "feed", "folder", "tag"],
            format_func=lambda x: {
                "all": "Tous les articles", "starred": "Favoris",
                "feed": "Flux", "folder": "Dossier", "tag": "Libellé",
            }[x],
        )

        source_value = ""
        subs = st.session_state.subscriptions
        if source_type == "feed":
            feed_map = {s.get("title", s.get("id", "?")): s.get("url", "") for s in subs}
            if feed_map:
                source_value = feed_map.get(st.selectbox("Flux", list(feed_map.keys())), "")
            else:
                source_value = st.text_input("URL du flux RSS")
        elif source_type == "folder":
            folders = st.session_state.folders
            source_value = st.selectbox("Dossier", folders) if folders \
                else st.text_input("Nom du dossier")
        elif source_type == "tag":
            tags = st.session_state.tags_list
            source_value = st.selectbox("Libellé", tags) if tags \
                else st.text_input("Nom du libellé")

        max_articles = st.slider("Nb max d'articles", 50, 2000, 500, step=50)
        exclude_read = st.checkbox("Articles non lus uniquement")

        with st.expander("Plage de dates"):
            c1, c2 = st.columns(2)
            start_date = c1.date_input("Depuis",   value=None, key="load_from")
            end_date   = c2.date_input("Jusqu'au", value=None, key="load_to")
        start_ts = int(datetime.combine(start_date, datetime.min.time()).timestamp()) if start_date else None
        end_ts   = int(datetime.combine(end_date,   datetime.max.time()).timestamp()) if end_date   else None

        if st.button("Rafraîchir", use_container_width=True, type="primary"):
            client = get_client()
            if client:
                with st.spinner("Chargement…"):
                    if not subs:
                        load_metadata(client)
                    load_articles(client, source_type, source_value,
                                  max_articles, exclude_read, start_ts, end_ts)
                st.rerun()

        if st.button("Synchroniser les métadonnées", use_container_width=True):
            client = get_client()
            if client:
                with st.spinner("Synchronisation…"):
                    load_metadata(client)
                st.success(f"{len(st.session_state.subscriptions)} abonnements.")

    return page


# ── Page Veille ───────────────────────────────────────────────────────────────

def render_veille() -> None:
    st.markdown("## Veille")

    full_df = st.session_state.articles_df
    if full_df.empty:
        st.warning(
            "Aucun article chargé. Le chargement automatique a probablement échoué "
            "(token Inoreader expiré). Régénérez-le, mettez à jour les secrets "
            "Streamlit, ou cliquez « Rafraîchir »."
        )
        st.code("python oauth_setup.py", language="bash")
        return

    filtered_df = st.session_state.filtered_df
    sel = st.session_state.selection

    c1, c2, c3 = st.columns(3)
    c1.metric("Chargés", len(full_df))
    c2.metric("Affichés", len(filtered_df))
    c3.metric("Sélection", len(sel))

    # ── Barre d'outils : recherche + filtres ───────────────────────────────
    tc1, tc2 = st.columns([5, 2])
    with tc1:
        st.text_input(
            "Recherche", key="search_box", on_change=_on_search_change,
            value=st.session_state.flt.search_text,
            placeholder="Rechercher un mot…",
            label_visibility="collapsed",
        )
    with tc2:
        with st.popover("Filtres", use_container_width=True):
            _render_filter_form(full_df)

    # ── Bascule de vue ─────────────────────────────────────────────────────
    vc1, vc2 = st.columns([3, 4])
    with vc1:
        view = st.radio(
            "Vue", ["Cartes", "Tableau"],
            horizontal=True, key="view_mode", label_visibility="collapsed",
        )
    view = view or "Cartes"

    visible = ["title", "source", "published_at", "score"]
    if view == "Tableau":
        with vc2:
            with st.popover("Colonnes affichées", use_container_width=True):
                available = ["title", "source", "folder", "tags", "author",
                             "published_at", "summary", "is_read", "word_count", "score"]
                st.multiselect(
                    "Colonnes", available, default=visible, key="col_vis",
                    format_func=lambda c: {
                        "title": "Titre", "source": "Source", "folder": "Dossier",
                        "tags": "Tags", "author": "Auteur", "published_at": "Publié",
                        "summary": "Résumé", "is_read": "Lu", "word_count": "Mots",
                        "score": "Score",
                    }[c],
                )
        visible = st.session_state.get("col_vis", visible)

    if filtered_df.empty:
        st.info("Aucun article ne correspond aux filtres courants.")
        return

    # ── Pagination ─────────────────────────────────────────────────────────
    total_rows  = len(filtered_df)
    total_pages = max(1, (total_rows - 1) // PAGE_SIZE + 1)
    page_idx    = min(st.session_state.page_index, total_pages - 1)
    start = page_idx * PAGE_SIZE
    end   = min(start + PAGE_SIZE, total_rows)
    _render_pagination(page_idx, total_pages, start, end, total_rows)

    page_df = filtered_df.iloc[start:end].copy()
    if view == "Tableau":
        _render_table(page_df, visible, sel)
    else:
        _render_cards(page_df, sel)

    _render_triage(filtered_df)
    _render_preview(filtered_df)


def _render_pagination(page_idx: int, total_pages: int,
                       start: int, end: int, total_rows: int) -> None:
    p1, p2, p3 = st.columns([2, 4, 2])
    with p1:
        if st.button("◀ Préc.", use_container_width=True, disabled=page_idx == 0):
            st.session_state.page_index = page_idx - 1
            st.session_state.table_key += 1
            st.rerun()
    with p2:
        st.markdown(
            f"<div style='text-align:center;padding-top:8px;color:#6E6982'>"
            f"Page {page_idx+1} / {total_pages} — articles {start+1}–{end} sur {total_rows}"
            f"</div>",
            unsafe_allow_html=True,
        )
    with p3:
        if st.button("Suiv. ▶", use_container_width=True, disabled=page_idx >= total_pages - 1):
            st.session_state.page_index = page_idx + 1
            st.session_state.table_key += 1
            st.rerun()


# ── Vue cartes ────────────────────────────────────────────────────────────────

def _relative_time(ts) -> str:
    if ts is None:
        return ""
    dt = pd.to_datetime(ts, errors="coerce")
    if pd.isna(dt):
        return ""
    secs = (pd.Timestamp.now() - dt).total_seconds()
    if secs < 0:
        secs = 0
    if secs < 3600:
        return f"il y a {int(secs // 60)} min"
    if secs < 86_400:
        return f"il y a {int(secs // 3600)} h"
    if secs < 7 * 86_400:
        return f"il y a {int(secs // 86_400)} j"
    return dt.strftime("%d/%m/%Y")


def _score_badge_html(score) -> str:
    try:
        s = float(score)
    except (TypeError, ValueError):
        return ""
    if s == 0:
        return ""
    cls = "high" if s >= 6 else "mid" if s > 0 else "low"
    return f"<span class='badge-score {cls}'>score {s:.1f}</span>"


def _chips_html(tags_str) -> str:
    tags = [t.strip() for t in str(tags_str or "").split(",") if t.strip()][:4]
    return "".join(f"<span class='chip'>#{html.escape(t)}</span>" for t in tags)


def _card_select(aid: str, key: str) -> None:
    sel = st.session_state.selection
    if st.session_state.get(key):
        sel.add(aid)
    else:
        sel.discard(aid)


def _card(rec: dict, sel: set) -> None:
    aid     = rec["id"]
    is_read = bool(rec.get("is_read"))
    is_star = bool(rec.get("is_starred"))
    tk      = st.session_state.table_key

    with st.container(border=True):
        dot  = "read" if is_read else "unread"
        meta = f"<span class='card-dot {dot}'></span>{html.escape(str(rec.get('source','')))}"
        rt   = _relative_time(rec.get("published_at"))
        if rt:
            meta += f"  ·  {rt}"
        st.markdown(f"<div class='card-meta'>{meta}</div>", unsafe_allow_html=True)

        tcls = "card-title read" if is_read else "card-title"
        st.markdown(
            f"<div class='{tcls}'>{html.escape(str(rec.get('title','')))}</div>",
            unsafe_allow_html=True,
        )

        excerpt = str(rec.get("summary") or "").strip()
        if excerpt:
            st.markdown(
                f"<div class='card-excerpt'>{html.escape(excerpt[:180])}…</div>",
                unsafe_allow_html=True,
            )

        badges = _score_badge_html(rec.get("score", 0.0)) + _chips_html(rec.get("tags", ""))
        if badges:
            st.markdown(f"<div class='card-badges'>{badges}</div>", unsafe_allow_html=True)

        fc = st.columns([2, 1, 1])
        with fc[0]:
            key = f"cardsel_{tk}_{aid}"
            st.checkbox("Sélectionner", value=aid in sel, key=key,
                        on_change=_card_select, args=(aid, key))
        with fc[1]:
            if st.button("★" if is_star else "☆", key=f"cardstar_{tk}_{aid}",
                         use_container_width=True, help="Favori Inoreader"):
                _toggle_star([aid], not is_star)
                st.rerun()
        with fc[2]:
            url = rec.get("url") or ""
            if url:
                st.link_button("Ouvrir", url, use_container_width=True)
            else:
                st.button("—", key=f"cardno_{tk}_{aid}", disabled=True,
                          use_container_width=True)


def _render_cards(page_df: pd.DataFrame, sel: set) -> None:
    records = page_df.to_dict("records")
    for i in range(0, len(records), 2):
        cols = st.columns(2, gap="medium")
        with cols[0]:
            _card(records[i], sel)
        if i + 1 < len(records):
            with cols[1]:
                _card(records[i + 1], sel)


# ── Vue tableau ───────────────────────────────────────────────────────────────

def _render_table(page_df: pd.DataFrame, visible: list[str], sel: set) -> None:
    display = page_df.copy()
    display.insert(0, "✓", display["id"].isin(sel))
    display.insert(1, "⭐", display["is_starred"].astype(bool))

    show_cols = ["✓", "⭐"] + [c for c in visible if c in display.columns] + ["id", "url"]
    display   = display[[c for c in show_cols if c in display.columns]]
    display   = display.rename(columns={
        "title": "Titre", "source": "Source", "folder": "Dossier",
        "tags": "Tags", "author": "Auteur", "published_at": "Publié",
        "summary": "Résumé", "is_read": "Lu", "word_count": "Mots", "score": "Score",
    })

    edited = st.data_editor(
        display,
        column_config={
            "✓":      st.column_config.CheckboxColumn("✓", width="small", help="Sélectionner"),
            "⭐":      st.column_config.CheckboxColumn("⭐", width="small", help="Favori Inoreader"),
            "Titre":  st.column_config.TextColumn("Titre", width="large"),
            "Résumé": st.column_config.TextColumn("Résumé", width="large"),
            "Score":  st.column_config.NumberColumn("Score", format="%.1f", width="small"),
            "Mots":   st.column_config.NumberColumn("Mots", width="small"),
            "Lu":     st.column_config.CheckboxColumn("Lu", width="small", disabled=True),
            "url":    st.column_config.LinkColumn("Lien", display_text="ouvrir"),
            "id":     None,
        },
        use_container_width=True,
        hide_index=True,
        num_rows="fixed",
        height=560,
        key=f"tbl_{st.session_state.table_key}",
    )

    if "✓" in edited.columns and "id" in edited.columns:
        for _, row in edited.iterrows():
            if row["✓"]:
                sel.add(row["id"])
            else:
                sel.discard(row["id"])

    if "⭐" in edited.columns and "id" in edited.columns:
        orig = dict(zip(page_df["id"], page_df["is_starred"].astype(bool)))
        to_star   = [r["id"] for _, r in edited.iterrows() if bool(r["⭐"]) and not orig.get(r["id"], False)]
        to_unstar = [r["id"] for _, r in edited.iterrows() if not bool(r["⭐"]) and orig.get(r["id"], False)]
        if to_star or to_unstar:
            if to_star:
                _toggle_star(to_star, True)
            if to_unstar:
                _toggle_star(to_unstar, False)
            st.rerun()


def _render_triage(filtered_df: pd.DataFrame) -> None:
    sel = st.session_state.selection
    n   = len(sel)

    st.divider()
    cols = st.columns([3, 1, 1, 1.2, 1.2])
    cols[0].markdown(f"**{n}** article(s) sélectionné(s)")
    if cols[1].button("Tout", use_container_width=True, help="Sélectionner les articles affichés"):
        sel.update(filtered_df["id"].tolist())
        st.session_state.table_key += 1
        st.rerun()
    if cols[2].button("Aucun", use_container_width=True, help="Vider la sélection"):
        sel.clear()
        st.session_state.table_key += 1
        st.rerun()

    sel_df = _selection_df()

    with cols[3].popover("Exporter", use_container_width=True, disabled=n == 0):
        st.download_button("CSV", to_csv_bytes(sel_df), file_name="veille.csv",
                           mime="text/csv", use_container_width=True)
        st.download_button("Excel", to_excel_bytes(sel_df), file_name="veille.xlsx",
                           mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                           use_container_width=True)
        st.download_button("JSON", to_json_bytes(sel_df), file_name="veille.json",
                           mime="application/json", use_container_width=True)
        if st.button("Liste d'URLs", use_container_width=True):
            st.text_area("URLs", value=get_urls_text(sel_df), height=150)

    with cols[4].popover("Actions", use_container_width=True, disabled=n == 0):
        st.markdown("**Statut Inoreader**")
        a1, a2 = st.columns(2)
        if a1.button("Marquer lus", use_container_width=True):
            _api_action(sel_df, lambda c, ids: c.mark_as_read(ids), "marqués lus")
        if a2.button("Marquer non lus", use_container_width=True):
            _api_action(sel_df, lambda c, ids: c.mark_as_unread(ids), "marqués non lus")
        a3, a4 = st.columns(2)
        if a3.button("Ajouter favoris", use_container_width=True):
            _toggle_star(list(sel), True)
            st.rerun()
        if a4.button("Retirer favoris", use_container_width=True):
            _toggle_star(list(sel), False)
            st.rerun()

        st.markdown("**Libellés**")
        labels = _available_labels()
        if labels:
            lbl = st.selectbox("Libellé", labels, key="triage_label",
                               label_visibility="collapsed")
            l1, l2 = st.columns(2)
            if l1.button("Classer", use_container_width=True, key="t_assign"):
                if _apply_label(lbl, add=True):
                    st.rerun()
            if l2.button("Retirer", use_container_width=True, key="t_unassign"):
                if _apply_label(lbl, add=False):
                    st.rerun()
        else:
            st.caption("Aucun libellé pour l'instant.")
        with st.expander("Nouveau libellé"):
            nl = st.text_input("Nom", key="new_label_input", label_visibility="collapsed",
                               placeholder="Nom du libellé…")
            if st.button("Créer", key="btn_create_label"):
                name = nl.strip()
                if not name:
                    st.warning("Saisissez un nom.")
                elif name in _available_labels():
                    st.info(f"« {name} » existe déjà.")
                else:
                    st.session_state.user_labels.append(name)
                    st.rerun()


def _render_preview(filtered_df: pd.DataFrame) -> None:
    with st.expander("Aperçu d'un article"):
        titles = filtered_df["title"].tolist()[:100]
        if not titles:
            return
        picked = st.selectbox("Article", titles, key="preview_pick")
        if not picked:
            return
        row = filtered_df[filtered_df["title"] == picked].iloc[0]
        kws = (st.session_state.scoring_config.title_keywords
               + st.session_state.scoring_config.body_keywords)
        left, right = st.columns([3, 1])
        with left:
            link = f"[{row['title']}]({row['url']})" if row.get("url") else row["title"]
            st.markdown(f"#### {link}")
            st.caption(
                f"{row.get('source','')}  ·  {row.get('folder','')}  ·  "
                f"{row.get('published_at','')}"
            )
            st.markdown(highlight_keywords(row.get("summary", ""), kws) or "*Pas de résumé*")
        with right:
            st.write("**Tags :**",   row.get("tags", "—"))
            st.write("**Auteur :**", row.get("author", "—"))
            st.write("**Mots :**",   row.get("word_count", 0))
            st.write("**Score :**",  row.get("score", 0.0))
            st.write("**Lu :**",     "oui" if row.get("is_read") else "non")
            st.write("**Favori :**", "oui" if row.get("is_starred") else "non")


# ── Sélection : helpers ───────────────────────────────────────────────────────

def _selection_df() -> pd.DataFrame:
    sel = st.session_state.selection
    if not sel:
        return pd.DataFrame()
    df = st.session_state.articles_df
    return df[df["id"].isin(sel)] if not df.empty else pd.DataFrame()


def _api_action(sel_df: pd.DataFrame, fn, label: str) -> None:
    client = get_client()
    if not client or sel_df.empty:
        return
    ids = sel_df["id"].tolist()
    with st.spinner(f"En cours ({len(ids)} articles)…"):
        try:
            fn(client, ids)
            st.success(f"{len(ids)} articles {label}.")
        except Exception as exc:
            st.error(f"Erreur : {exc}")


def _available_labels() -> list[str]:
    return sorted(set(st.session_state.tags_list) | set(st.session_state.user_labels))


def _update_local_tags(ids, label: str, add: bool) -> None:
    ids = set(ids)

    def _mod(cell: str) -> str:
        parts = [t.strip() for t in str(cell).split(",") if t.strip()]
        if add and label not in parts:
            parts.append(label)
        elif not add and label in parts:
            parts.remove(label)
        return ", ".join(parts)

    for key in ("articles_df", "filtered_df"):
        df = st.session_state[key]
        if not df.empty:
            mask = df["id"].isin(ids)
            df.loc[mask, "tags"] = df.loc[mask, "tags"].apply(_mod)


def _apply_label(label: str, add: bool) -> bool:
    client = get_client()
    if not client or not label:
        return False
    ids = list(st.session_state.selection)
    if not ids:
        st.warning("Aucun article sélectionné.")
        return False
    verb = "Classement" if add else "Retrait"
    with st.spinner(f"{verb} de {len(ids)} article(s)…"):
        try:
            client.add_tag(ids, label) if add else client.remove_tag(ids, label)
        except Exception as exc:
            st.error(f"Erreur Inoreader : {exc}")
            return False
    _update_local_tags(ids, label, add)
    if add and label not in st.session_state.tags_list:
        st.session_state.tags_list.append(label)
    st.session_state.table_key += 1
    done = "classés dans" if add else "retirés de"
    st.toast(f"{len(ids)} article(s) {done} « {label} ».", icon="🏷️")
    return True


# ── Gestion des libellés (CRUD) ───────────────────────────────────────────────

def _is_session_only(label: str) -> bool:
    """Vrai si le libellé n'existe encore qu'en session (pas dans Inoreader)."""
    return (label in st.session_state.user_labels
            and label not in st.session_state.tags_list)


def _label_count(label: str) -> int:
    """Nombre d'articles chargés portant ce libellé."""
    df = st.session_state.articles_df
    if df.empty:
        return 0
    return int(df["tags"].apply(
        lambda c: label in [t.strip() for t in str(c).split(",")]
    ).sum())


def _rename_in_dataframes(old: str, new: str) -> None:
    def _mod(cell: str) -> str:
        parts = [t.strip() for t in str(cell).split(",") if t.strip()]
        return ", ".join(new if p == old else p for p in parts)
    for key in ("articles_df", "filtered_df"):
        df = st.session_state[key]
        if not df.empty:
            df["tags"] = df["tags"].apply(_mod)


def _strip_label_in_dataframes(label: str) -> None:
    def _mod(cell: str) -> str:
        return ", ".join(t.strip() for t in str(cell).split(",")
                         if t.strip() and t.strip() != label)
    for key in ("articles_df", "filtered_df"):
        df = st.session_state[key]
        if not df.empty:
            df["tags"] = df["tags"].apply(_mod)


def _create_label(name: str) -> None:
    name = name.strip()
    if not name:
        st.warning("Saisissez un nom de libellé.")
        return
    if name in _available_labels():
        st.info(f"« {name} » existe déjà.")
        return
    st.session_state.user_labels.append(name)
    st.toast(f"Libellé « {name} » créé.", icon="🏷️")
    st.rerun()


def _rename_label(old: str, new: str) -> None:
    new = new.strip()
    if not new or new == old:
        return
    if new in _available_labels():
        st.warning(f"« {new} » existe déjà.")
        return
    if not _is_session_only(old):
        client = get_client()
        if not client:
            return
        with st.spinner(f"Renommage de « {old} »…"):
            try:
                client.rename_tag(old, new)
            except Exception as exc:
                st.error(f"Erreur Inoreader : {exc}")
                return
    st.session_state.tags_list = sorted(
        {new if x == old else x for x in st.session_state.tags_list})
    st.session_state.user_labels = [
        new if x == old else x for x in st.session_state.user_labels]
    _rename_in_dataframes(old, new)
    st.session_state.table_key += 1
    st.toast(f"Libellé renommé en « {new} ».", icon="🏷️")
    st.rerun()


def _delete_label(label: str) -> None:
    if not _is_session_only(label):
        client = get_client()
        if not client:
            return
        with st.spinner(f"Suppression de « {label} »…"):
            try:
                client.disable_tag(label)
            except Exception as exc:
                st.error(f"Erreur Inoreader : {exc}")
                return
    st.session_state.tags_list   = [x for x in st.session_state.tags_list if x != label]
    st.session_state.user_labels = [x for x in st.session_state.user_labels if x != label]
    _strip_label_in_dataframes(label)
    st.session_state.table_key += 1
    st.toast(f"Libellé « {label} » supprimé.", icon="🗑️")
    st.rerun()


# ── Dossiers : regroupements de libellés via la hiérarchie Inoreader ──────────
# Un dossier n'est pas stocké à part : c'est le préfixe d'un nom de libellé.
# « Afrique/AQMI » → dossier « Afrique », libellé « AQMI ». La structure vit
# donc dans Inoreader (compte unique partagé) et survit à tout redéploiement.

def _split_label(label: str) -> tuple[str | None, str]:
    """('Afrique', 'AQMI') pour « Afrique/AQMI » ; (None, label) sinon."""
    if DOSSIER_SEP in label:
        prefix, rest = label.split(DOSSIER_SEP, 1)
        return prefix.strip(), rest.strip()
    return None, label.strip()


def _dossiers_map() -> dict[str, list[str]]:
    """Dossier → libellés (noms complets) qu'il contient, d'après les préfixes."""
    mapping: dict[str, list[str]] = {}
    for lbl in _available_labels():
        dossier, _ = _split_label(lbl)
        if dossier:
            mapping.setdefault(dossier, []).append(lbl)
    return {k: sorted(v) for k, v in mapping.items()}


def _rename_one_label(old_full: str, new_full: str) -> bool:
    """Renomme un libellé (Inoreader + état local). True si succès."""
    if not _is_session_only(old_full):
        client = get_client()
        if not client:
            return False
        try:
            client.rename_tag(old_full, new_full)
        except Exception as exc:
            st.error(f"Erreur Inoreader sur « {old_full} » : {exc}")
            return False
    st.session_state.tags_list = sorted(
        {new_full if x == old_full else x for x in st.session_state.tags_list})
    st.session_state.user_labels = [
        new_full if x == old_full else x for x in st.session_state.user_labels]
    _rename_in_dataframes(old_full, new_full)
    return True


def _move_label(full_label: str, dossier: str | None) -> bool:
    """Déplace un libellé vers un dossier (ou None = hors dossier)."""
    cur, short = _split_label(full_label)
    if cur == dossier:
        return False
    new_full = f"{dossier}{DOSSIER_SEP}{short}" if dossier else short
    if new_full in _available_labels():
        st.warning(f"Un libellé « {new_full} » existe déjà.")
        return False
    return _rename_one_label(full_label, new_full)


def _create_dossier(name: str) -> None:
    name = name.strip().strip(DOSSIER_SEP)
    if not name:
        st.warning("Saisissez un nom de dossier.")
        return
    if DOSSIER_SEP in name:
        st.warning(f"Le nom d'un dossier ne peut pas contenir « {DOSSIER_SEP} ».")
        return
    if name in (set(_dossiers_map()) | set(st.session_state.empty_dossiers)):
        st.info(f"Le dossier « {name} » existe déjà.")
        return
    st.session_state.empty_dossiers.append(name)
    st.toast(f"Dossier « {name} » créé — ajoutez-y des libellés.", icon="📁")
    st.rerun()


def _rename_dossier(old: str, new: str) -> None:
    new = new.strip().strip(DOSSIER_SEP)
    if not new or new == old:
        return
    if DOSSIER_SEP in new:
        st.warning(f"Le nom d'un dossier ne peut pas contenir « {DOSSIER_SEP} ».")
        return
    if new in (set(_dossiers_map()) | set(st.session_state.empty_dossiers)):
        st.warning(f"Le dossier « {new} » existe déjà.")
        return
    members = _dossiers_map().get(old, [])
    if members:
        with st.spinner(f"Renommage du dossier « {old} »…"):
            for full in members:
                short = _split_label(full)[1]
                if not _rename_one_label(full, f"{new}{DOSSIER_SEP}{short}"):
                    return
    st.session_state.empty_dossiers = [
        new if d == old else d for d in st.session_state.empty_dossiers]
    st.session_state.table_key += 1
    st.toast(f"Dossier renommé en « {new} ».", icon="📁")
    st.rerun()


def _delete_dossier(name: str) -> None:
    """Supprime le regroupement : les libellés en sortent mais restent intacts."""
    members = _dossiers_map().get(name, [])
    if members:
        with st.spinner(f"Suppression du dossier « {name} »…"):
            for full in members:
                if not _rename_one_label(full, _split_label(full)[1]):
                    return
    st.session_state.empty_dossiers = [
        d for d in st.session_state.empty_dossiers if d != name]
    st.session_state.table_key += 1
    st.toast(f"Dossier « {name} » supprimé.", icon="🗑️")
    st.rerun()


def _toggle_star(ids: list[str], starred: bool) -> None:
    client = get_client()
    if not client or not ids:
        return
    try:
        client.add_star(ids) if starred else client.remove_star(ids)
    except Exception as exc:
        st.error(f"Erreur favori : {exc}")
        return
    for key in ("articles_df", "filtered_df"):
        df = st.session_state[key]
        if not df.empty:
            df.loc[df["id"].isin(ids), "is_starred"] = starred
    st.session_state.table_key += 1
    txt = "ajouté(s) aux favoris" if starred else "retiré(s) des favoris"
    st.toast(f"{len(ids)} article(s) {txt}.", icon="⭐")


# ── Chargement automatique ────────────────────────────────────────────────────

def _auto_load() -> None:
    if st.session_state.auto_loaded:
        return
    st.session_state.auto_loaded = True
    if missing_keys(load_config()):
        return
    client = get_client()
    if not client:
        return
    with st.spinner("Chargement des articles non lus…"):
        load_metadata(client)
        load_articles(client, "all", "", 500, exclude_read=True, start_ts=None, end_ts=None)


# ── Page Analyse ──────────────────────────────────────────────────────────────

def render_analyse() -> None:
    st.markdown("## Analyse")

    full_df = st.session_state.articles_df
    if full_df.empty:
        st.info("Chargez des articles pour afficher l'analyse.")
        return

    filt_df = st.session_state.filtered_df
    df = filt_df if not filt_df.empty else full_df

    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Chargés",  len(full_df))
    c2.metric("Affichés", len(df))
    c3.metric("Non lus",  int(df["is_read"].eq(False).sum()))
    c4.metric("Favoris",  int(df["is_starred"].eq(True).sum()))

    st.divider()
    col_l, col_r = st.columns(2)
    with col_l:
        st.markdown("#### Sources les plus actives")
        st.bar_chart(df["source"].value_counts().head(15))
    with col_r:
        st.markdown("#### Distribution temporelle")
        dates = pd.to_datetime(df["published_at"], errors="coerce").dropna()
        if not dates.empty:
            st.bar_chart(dates.dt.date.value_counts().sort_index())
        else:
            st.info("Pas de données de date.")

    col_l2, col_r2 = st.columns(2)
    with col_l2:
        st.markdown("#### Tags fréquents")
        tag_list: list[str] = []
        for cell in df["tags"].dropna():
            tag_list.extend(t.strip() for t in cell.split(",") if t.strip())
        if tag_list:
            st.bar_chart(pd.Series(tag_list).value_counts().head(20))
        else:
            st.info("Aucun tag.")
    with col_r2:
        st.markdown("#### Mots-clés des titres")
        words = top_words(df["title"].dropna().tolist(), n=20)
        if words:
            wd = pd.DataFrame(words, columns=["mot", "occurrences"]).set_index("mot")
            st.bar_chart(wd["occurrences"])

    if df["score"].abs().sum() > 0:
        st.markdown("#### Distribution des scores")
        st.bar_chart(df["score"].value_counts().sort_index())

    st.divider()
    st.markdown("#### Statistiques par source")
    stats = (
        df.groupby("source", observed=True)
        .agg(
            articles=("title", "count"),
            non_lus=("is_read", lambda x: (~x).sum()),
            favoris=("is_starred", "sum"),
            score_moyen=("score", "mean"),
            mots_moyen=("word_count", "mean"),
        )
        .round(1)
        .sort_values("articles", ascending=False)
    )
    st.dataframe(stats, use_container_width=True)


# ── Page Réglages ─────────────────────────────────────────────────────────────

def render_reglages() -> None:
    st.markdown("## Réglages")
    tab_dossiers, tab_labels, tab_scoring, tab_filtres = st.tabs(
        ["Dossiers", "Libellés", "Scoring", "Filtres sauvegardés"])
    with tab_dossiers:
        _render_dossiers()
    with tab_labels:
        _render_labels()
    with tab_scoring:
        _render_scoring()
    with tab_filtres:
        _render_saved_filters()


def _render_dossiers() -> None:
    st.caption(
        "Un dossier regroupe vos libellés (vos sujets de veille). La structure "
        "est enregistrée dans Inoreader via le nom des libellés (« Dossier/Sujet ») : "
        "elle est partagée avec l'équipe et n'est jamais perdue. Les libellés se "
        "créent dans l'onglet « Libellés »."
    )

    labels   = _available_labels()
    mapping  = _dossiers_map()
    orphans  = sorted(l for l in labels if _split_label(l)[0] is None)
    empty    = [d for d in st.session_state.empty_dossiers if d not in mapping]
    dossiers = sorted(set(mapping) | set(empty))

    c1, c2 = st.columns([4, 1])
    with c1:
        new = st.text_input(
            "Nouveau dossier", key="new_dossier", label_visibility="collapsed",
            placeholder="Nom du nouveau dossier…",
        )
    with c2:
        if st.button("Créer", type="primary", use_container_width=True,
                     key="create_dossier"):
            _create_dossier(new)

    if not dossiers:
        st.info("Aucun dossier pour l'instant. Créez-en un ci-dessus, "
                "puis rangez-y vos libellés.")
        return

    st.divider()
    for name in dossiers:
        members = mapping.get(name, [])
        with st.container(border=True):
            hc1, hc2, hc3 = st.columns([4, 1.3, 1.3])
            with hc1:
                rn = st.text_input("Nom", value=name, key=f"dosrn_{name}",
                                   label_visibility="collapsed")
                note = f"{len(members)} libellé(s)"
                if not members:
                    note += " · vide (non synchronisé)"
                st.caption(note)
            with hc2:
                if st.button("Renommer", key=f"dosbtn_{name}",
                             use_container_width=True):
                    _rename_dossier(name, rn)
            with hc3:
                with st.popover("Supprimer", use_container_width=True):
                    st.warning(
                        f"Supprimer le dossier « {name} » ? Ses libellés ne sont "
                        "pas supprimés : ils en sortent simplement et restent "
                        "disponibles sans dossier."
                    )
                    if st.button("Confirmer la suppression", type="primary",
                                 use_container_width=True, key=f"dosdel_{name}"):
                        _delete_dossier(name)

            options = sorted(set(members) | set(orphans))
            chosen = st.multiselect(
                "Libellés de ce dossier", options, default=members,
                key=f"dosset_{st.session_state.table_key}_{name}",
                format_func=lambda l: _split_label(l)[1],
                placeholder="Ajouter des libellés à ce dossier…",
            )
            if set(chosen) != set(members):
                moved = False
                for lbl in set(chosen) - set(members):   # entrent dans le dossier
                    if _move_label(lbl, name):
                        moved = True
                for lbl in set(members) - set(chosen):   # sortent du dossier
                    if _move_label(lbl, None):
                        moved = True
                if moved:
                    st.session_state.empty_dossiers = [
                        d for d in st.session_state.empty_dossiers if d != name]
                    st.session_state.table_key += 1
                    st.rerun()

    if orphans:
        st.divider()
        st.caption("Libellés sans dossier : "
                   + ", ".join(_split_label(o)[1] for o in orphans))


def _render_labels() -> None:
    st.caption(
        "Créez, renommez et supprimez vos libellés. Pour classer des articles "
        "dans un libellé, passez par la page Veille : sélectionnez des articles "
        "puis ouvrez « Actions »."
    )

    c1, c2 = st.columns([4, 1])
    with c1:
        new = st.text_input(
            "Nouveau libellé", key="mgmt_new_label", label_visibility="collapsed",
            placeholder="Nom du nouveau libellé…",
        )
    with c2:
        if st.button("Créer", use_container_width=True, type="primary",
                     key="mgmt_create"):
            _create_label(new)

    labels = _available_labels()
    if not labels:
        st.info("Aucun libellé pour l'instant. Créez-en un ci-dessus.")
        return

    st.divider()
    loaded = not st.session_state.articles_df.empty
    for label in labels:
        with st.container(border=True):
            lc1, lc2, lc3 = st.columns([4, 1.3, 1.3])
            with lc1:
                new_name = st.text_input(
                    "Nom", value=label, key=f"lblrn_{label}",
                    label_visibility="collapsed",
                )
                notes = []
                if _is_session_only(label):
                    notes.append("non synchronisé (créé en session)")
                if loaded:
                    notes.append(f"{_label_count(label)} article(s) chargé(s)")
                if notes:
                    st.caption(" · ".join(notes))
            with lc2:
                if st.button("Renommer", key=f"lblbtn_{label}",
                             use_container_width=True):
                    _rename_label(label, new_name)
            with lc3:
                with st.popover("Supprimer", use_container_width=True):
                    st.warning(
                        f"Supprimer « {label} » ? Le libellé sera retiré de "
                        "tous les articles dans Inoreader. Action irréversible."
                    )
                    if st.button("Confirmer la suppression", type="primary",
                                 use_container_width=True, key=f"lbldel_{label}"):
                        _delete_label(label)


def _render_scoring() -> None:
    st.caption(
        "Le score est calculé localement après chargement. "
        "Un score positif signale un article pertinent selon vos critères."
    )
    sc = st.session_state.scoring_config

    with st.form("scoring_form"):
        c1, c2 = st.columns(2)
        with c1:
            title_kw = st.text_area("Mots-clés titre — bonus",
                                    value="\n".join(sc.title_keywords),
                                    placeholder="Un par ligne", height=130)
            body_kw = st.text_area("Mots-clés corps — bonus",
                                   value="\n".join(sc.body_keywords),
                                   placeholder="Un par ligne", height=130)
            neg_kw = st.text_area("Mots-clés négatifs — malus",
                                  value="\n".join(sc.negative_keywords),
                                  placeholder="Un par ligne", height=100)
        with c2:
            prio_src = st.text_area("Sources prioritaires — bonus",
                                    value="\n".join(sc.priority_sources),
                                    placeholder="Un nom par ligne (partiel)", height=130)
            title_bonus = st.number_input("Bonus / mot-clé titre", value=sc.title_keyword_bonus,
                                          min_value=0.0, step=0.5)
            body_bonus  = st.number_input("Bonus / mot-clé corps", value=sc.body_keyword_bonus,
                                          min_value=0.0, step=0.5)
            src_bonus   = st.number_input("Bonus source prioritaire", value=sc.source_bonus,
                                          min_value=0.0, step=0.5)
            neg_malus   = st.number_input("Malus / mot-clé négatif", value=sc.negative_keyword_malus,
                                          max_value=0.0, step=0.5)
        submitted = st.form_submit_button("Appliquer le scoring", type="primary",
                                          use_container_width=True)

    if submitted:
        new_sc = ScoringConfig(
            title_keywords    = [k.strip() for k in title_kw.splitlines() if k.strip()],
            body_keywords     = [k.strip() for k in body_kw.splitlines()  if k.strip()],
            negative_keywords = [k.strip() for k in neg_kw.splitlines()   if k.strip()],
            priority_sources  = [k.strip() for k in prio_src.splitlines() if k.strip()],
            title_keyword_bonus    = title_bonus,
            body_keyword_bonus     = body_bonus,
            source_bonus           = src_bonus,
            negative_keyword_malus = neg_malus,
        )
        st.session_state.scoring_config = new_sc
        if not st.session_state.articles_df.empty:
            st.session_state.articles_df = apply_scoring(st.session_state.articles_df, new_sc)
            _recompute()
        st.success("Scoring recalculé.")
        st.rerun()

    if not st.session_state.articles_df.empty:
        st.divider()
        st.markdown("#### Top 20 par score")
        top20 = st.session_state.articles_df.nlargest(
            20, "score")[["title", "source", "published_at", "score"]]
        st.dataframe(top20, use_container_width=True, hide_index=True)


def _render_saved_filters() -> None:
    profiles = list_filter_profiles()
    if not profiles:
        st.info("Aucun profil sauvegardé. Créez-en un depuis le bouton « Filtres » "
                "de la page Veille.")
        return

    for name in profiles:
        with st.expander(name):
            try:
                fc = load_filter_profile(name)
                c1, c2 = st.columns([3, 1])
                with c1:
                    st.json({
                        "search":           fc.search_text,
                        "sources":          fc.sources,
                        "folders":          fc.folders,
                        "tags":             fc.tags,
                        "include_keywords": fc.include_keywords,
                        "exclude_keywords": fc.exclude_keywords,
                        "sort_by":          fc.sort_by,
                        "min_words":        fc.min_words,
                        "max_words":        fc.max_words,
                    })
                with c2:
                    if st.button("Appliquer", key=f"apply_{name}", use_container_width=True):
                        if st.session_state.articles_df.empty:
                            st.warning("Chargez d'abord des articles.")
                        else:
                            st.session_state.flt = fc
                            for k in FILTER_KEYS:
                                st.session_state.pop(k, None)
                            st.session_state.pop("search_box", None)
                            _recompute()
                            st.success(f"{len(st.session_state.filtered_df)} articles — "
                                       "rendez-vous sur la page Veille.")
                    if st.button("Supprimer", key=f"del_{name}", use_container_width=True):
                        delete_filter_profile(name)
                        st.rerun()
            except Exception as exc:
                st.error(f"Lecture impossible : {exc}")


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    _auto_load()
    page = render_sidebar()
    if page == "Veille":
        render_veille()
    elif page == "Analyse":
        render_analyse()
    elif page == "Réglages":
        render_reglages()


if __name__ == "__main__":
    main()
