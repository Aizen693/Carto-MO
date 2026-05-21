"""
Inoreader Dashboard — application Streamlit principale.

Vues :
  📋 Articles   — tableau filtrable, sélection, paniers
  📊 Dashboard  — analytique (sources, dates, mots-clés, scores)
  ⚙️  Scoring   — configuration du moteur de score local
  💾 Filtres    — gestion des profils de filtre sauvegardés
"""

import logging
from collections import Counter
from datetime import datetime
from pathlib import Path

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

# ── Page config ────────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="Inoreader Dashboard",
    page_icon="📰",
    layout="wide",
    initial_sidebar_state="expanded",
)

st.markdown(
    """
    <style>
    [data-testid="stSidebar"] { min-width: 320px; max-width: 380px; }
    .metric-row { display:flex; gap:12px; margin-bottom:8px; }
    .stDataFrame { font-size: 13px; }
    div[data-testid="column"] > div { padding: 0 4px; }
    </style>
    """,
    unsafe_allow_html=True,
)

PAGE_SIZE = 50   # articles par page dans le tableau

# ── Session state ──────────────────────────────────────────────────────────────

def _init_state() -> None:
    defaults: dict = {
        "articles_df":    pd.DataFrame(),
        "filtered_df":    pd.DataFrame(),
        "client":         None,
        "subscriptions":  [],
        "folders":        [],
        "tags_list":      [],
        "scoring_config": ScoringConfig(),
        "shortlists":     {"Panier 1": set()},
        "active_shortlist": "Panier 1",
        "table_key":      0,   # incrémenté pour forcer reset du data_editor
        "page_index":     0,
    }
    for k, v in defaults.items():
        if k not in st.session_state:
            st.session_state[k] = v

_init_state()

# ── Client ─────────────────────────────────────────────────────────────────────

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
        subs = client.list_subscriptions()
        tags_raw = client.list_tags()
        st.session_state.subscriptions = subs

        folders, tag_names = [], []
        for t in tags_raw:
            tid = t.get("id", "")
            if "/label/" not in tid:
                continue
            label = tid.split("/label/")[-1].strip()
            if not label:
                continue
            # type='folder' signale un dossier ; sinon tag utilisateur
            if t.get("type") == "folder":
                folders.append(label)
            else:
                tag_names.append(label)

        st.session_state.folders   = sorted(set(folders))
        st.session_state.tags_list = sorted(set(tag_names))
    except InoreaderAPIError as exc:
        st.warning(f"Erreur métadonnées : {exc}")


# ── Article loading ────────────────────────────────────────────────────────────

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
        stream_id = f"feed/{source_value}" if source_value else "user/-/state/com.google/reading-list"
    elif source_type in ("folder", "tag"):
        stream_id = f"user/-/label/{source_value}" if source_value else "user/-/state/com.google/reading-list"
    else:
        stream_id = "user/-/state/com.google/reading-list"

    try:
        items = client.get_all_pages(stream_id, max_articles=max_articles, **kwargs)
        articles = normalize_articles(items)
        df = articles_to_dataframe(articles)
        df = apply_scoring(df, st.session_state.scoring_config)
        st.session_state.articles_df  = df
        st.session_state.filtered_df  = df.copy()
        st.session_state.page_index   = 0
        st.session_state.table_key   += 1
        st.success(f"✓ {len(df)} articles chargés.")
    except InoreaderAPIError as exc:
        st.error(f"Erreur API Inoreader : {exc}")
    except Exception as exc:
        st.error(f"Erreur inattendue : {exc}")
        logger.exception("load_articles failed")


# ── Sidebar ────────────────────────────────────────────────────────────────────

def render_sidebar() -> str:
    with st.sidebar:
        st.markdown("## 📰 Inoreader Dashboard")

        page = st.radio(
            "nav",
            ["📋 Articles", "📊 Dashboard", "⚙️ Scoring", "💾 Filtres sauvegardés"],
            label_visibility="collapsed",
        )

        st.divider()

        # Source selector
        st.markdown("### Chargement")
        source_type = st.selectbox(
            "Source",
            ["all", "starred", "feed", "folder", "tag"],
            format_func=lambda x: {
                "all":     "Tous les articles",
                "starred": "Favoris (starred)",
                "feed":    "Flux spécifique",
                "folder":  "Dossier",
                "tag":     "Tag",
            }[x],
        )

        source_value = ""
        subs = st.session_state.subscriptions

        if source_type == "feed":
            feed_map = {s.get("title", s.get("id", "?")): s.get("url", "") for s in subs}
            if feed_map:
                chosen_feed = st.selectbox("Flux", list(feed_map.keys()))
                source_value = feed_map.get(chosen_feed, "")
            else:
                source_value = st.text_input("URL du flux RSS")

        elif source_type == "folder":
            folders = st.session_state.folders
            if folders:
                source_value = st.selectbox("Dossier", folders)
            else:
                source_value = st.text_input("Nom du dossier")

        elif source_type == "tag":
            tags = st.session_state.tags_list
            if tags:
                source_value = st.selectbox("Tag", tags)
            else:
                source_value = st.text_input("Nom du tag")

        max_articles = st.slider("Nb max d'articles", 50, 2000, 500, step=50)
        exclude_read = st.checkbox("Exclure les articles lus")

        col1, col2 = st.columns(2)
        with col1:
            start_date = st.date_input("Depuis", value=None, key="load_from")
        with col2:
            end_date = st.date_input("Jusqu'au", value=None, key="load_to")

        start_ts = int(datetime.combine(start_date, datetime.min.time()).timestamp()) if start_date else None
        end_ts   = int(datetime.combine(end_date,   datetime.max.time()).timestamp()) if end_date   else None

        c1, c2 = st.columns(2)
        with c1:
            if st.button("🔄 Charger", use_container_width=True, type="primary"):
                client = get_client()
                if client:
                    with st.spinner("Chargement…"):
                        if not subs:
                            load_metadata(client)
                        load_articles(client, source_type, source_value, max_articles, exclude_read, start_ts, end_ts)
                    st.rerun()
        with c2:
            if st.button("📡 Sync méta", use_container_width=True):
                client = get_client()
                if client:
                    with st.spinner("Sync…"):
                        load_metadata(client)
                    nb = len(st.session_state.subscriptions)
                    st.success(f"{nb} abonnements.")

        # Filters — only shown when data is loaded
        df = st.session_state.articles_df
        if not df.empty:
            st.divider()
            _render_filter_panel(df)

    return page


def _render_filter_panel(df: pd.DataFrame) -> None:
    st.markdown("### Filtres")

    search = st.text_input("🔍 Recherche libre", placeholder="titre, résumé, contenu…")

    all_sources = sorted(df["source"].dropna().unique())
    sel_sources = st.multiselect("Sources", all_sources)

    all_folders = sorted(f for f in df["folder"].dropna().unique() if f)
    sel_folders = st.multiselect("Dossiers", all_folders)

    # Tags extraits du DataFrame
    all_tags: set[str] = set()
    for cell in df["tags"].dropna():
        for t in cell.split(", "):
            if t.strip():
                all_tags.add(t.strip())
    sel_tags = st.multiselect("Tags", sorted(all_tags))

    col1, col2 = st.columns(2)
    with col1:
        filter_from = st.date_input("Du", value=None, key="f_from")
    with col2:
        filter_to = st.date_input("Au", value=None, key="f_to")

    st.markdown("**Statut**")
    c1, c2 = st.columns(2)
    with c1:
        show_read    = st.checkbox("Lus",        value=True)
        show_unread  = st.checkbox("Non lus",    value=True)
    with c2:
        show_starred   = st.checkbox("Favoris",     value=True)
        show_unstarred = st.checkbox("Non favoris", value=True)

    include_kw = st.text_input("Mots-clés requis", placeholder="IA, machine learning")
    exclude_kw = st.text_input("Mots-clés exclus", placeholder="crypto, pub")

    c1, c2 = st.columns(2)
    with c1:
        min_words = st.number_input("Mots min", 0, 50000, 0)
    with c2:
        max_words = st.number_input("Mots max", 0, 100000, 100000)

    sort_by  = st.selectbox("Trier par", ["published_at", "score", "source", "word_count", "title"])
    sort_asc = st.checkbox("Ordre croissant", value=False)

    c1, c2 = st.columns(2)
    with c1:
        if st.button("▶ Appliquer", use_container_width=True, type="primary"):
            fc = FilterConfig(
                search_text=search,
                sources=sel_sources,
                folders=sel_folders,
                tags=sel_tags,
                date_from=filter_from,
                date_to=filter_to,
                show_read=show_read,
                show_unread=show_unread,
                show_starred=show_starred,
                show_unstarred=show_unstarred,
                include_keywords=[k.strip() for k in include_kw.split(",") if k.strip()],
                exclude_keywords=[k.strip() for k in exclude_kw.split(",") if k.strip()],
                min_words=int(min_words),
                max_words=int(max_words),
                sort_by=sort_by,
                sort_ascending=sort_asc,
            )
            st.session_state.filtered_df = apply_filters(df, fc)
            st.session_state.page_index  = 0
            st.session_state.table_key  += 1
            st.rerun()
    with c2:
        if st.button("✕ Reset", use_container_width=True):
            st.session_state.filtered_df = df.copy()
            st.session_state.page_index  = 0
            st.session_state.table_key  += 1
            st.rerun()

    with st.expander("💾 Sauvegarder ce filtre"):
        fname = st.text_input("Nom du profil", key="save_fname")
        if st.button("Sauvegarder", key="btn_save_filter") and fname:
            fc = FilterConfig(
                name=fname,
                search_text=search,
                sources=sel_sources,
                folders=sel_folders,
                tags=sel_tags,
                date_from=filter_from,
                date_to=filter_to,
                show_read=show_read,
                show_unread=show_unread,
                show_starred=show_starred,
                show_unstarred=show_unstarred,
                include_keywords=[k.strip() for k in include_kw.split(",") if k.strip()],
                exclude_keywords=[k.strip() for k in exclude_kw.split(",") if k.strip()],
                min_words=int(min_words),
                max_words=int(max_words),
                sort_by=sort_by,
                sort_ascending=sort_asc,
            )
            save_filter_profile(fc)
            st.success(f"Profil « {fname} » sauvegardé.")


# ── Articles page ──────────────────────────────────────────────────────────────

def render_articles_page() -> None:
    full_df     = st.session_state.articles_df
    filtered_df = st.session_state.filtered_df
    shortlists  = st.session_state.shortlists
    active_sl   = st.session_state.active_shortlist

    # ── Top metrics ────────────────────────────────────────────────────────────
    total_sel = sum(len(v) for v in shortlists.values())
    c1, c2, c3, c4, c5 = st.columns(5)
    c1.metric("Chargés",     len(full_df))
    c2.metric("Après filtres", len(filtered_df))
    c3.metric("Sélectionnés", total_sel)
    c4.metric("Sources",     full_df["source"].nunique() if not full_df.empty else 0)
    c5.metric("Abonnements", len(st.session_state.subscriptions))

    if full_df.empty:
        st.info("Aucun article chargé. Utilisez le panneau gauche pour charger des articles, puis lancez l'application OAuth si nécessaire.")
        st.code("python oauth_setup.py", language="bash")
        return

    st.divider()

    # ── Panier management ──────────────────────────────────────────────────────
    st.markdown("#### Paniers de sélection")
    c1, c2, c3, c4, c5, c6 = st.columns([2, 2, 1, 1, 1, 1])

    with c1:
        sl_names = list(shortlists.keys())
        idx = sl_names.index(active_sl) if active_sl in sl_names else 0
        chosen_sl = st.selectbox("Panier actif", sl_names, index=idx, key="sl_chooser")
        if chosen_sl != active_sl:
            st.session_state.active_shortlist = chosen_sl
            st.session_state.table_key += 1
            st.rerun()

    with c2:
        new_name = st.text_input("Nouveau panier", placeholder="Nom…", key="new_sl_name", label_visibility="collapsed")
        if st.button("➕ Créer", key="btn_new_sl") and new_name:
            st.session_state.shortlists[new_name] = set()
            st.session_state.active_shortlist = new_name
            st.session_state.table_key += 1
            st.rerun()

    with c3:
        if st.button("✅ Tout", use_container_width=True, help="Sélectionner tous les articles filtrés"):
            st.session_state.shortlists[st.session_state.active_shortlist].update(filtered_df["id"].tolist())
            st.session_state.table_key += 1
            st.rerun()

    with c4:
        if st.button("✗ Aucun", use_container_width=True, help="Désélectionner tout dans ce panier"):
            st.session_state.shortlists[st.session_state.active_shortlist].clear()
            st.session_state.table_key += 1
            st.rerun()

    with c5:
        nb_current = len(shortlists.get(st.session_state.active_shortlist, set()))
        st.metric("Dans ce panier", nb_current)

    with c6:
        if st.button("🗑 Vider", use_container_width=True):
            st.session_state.shortlists[st.session_state.active_shortlist] = set()
            st.session_state.table_key += 1
            st.rerun()

    st.divider()

    # ── Column visibility ──────────────────────────────────────────────────────
    with st.expander("🔧 Colonnes affichées"):
        available = ["title", "source", "folder", "tags", "author", "published_at", "summary", "is_read", "is_starred", "word_count", "score"]
        default   = ["title", "source", "folder", "published_at", "score", "word_count"]
        visible   = st.multiselect("Colonnes", available, default=default, key="col_vis")

    # ── Pagination ─────────────────────────────────────────────────────────────
    total_rows = len(filtered_df)
    total_pages = max(1, (total_rows - 1) // PAGE_SIZE + 1)
    page_idx = min(st.session_state.page_index, total_pages - 1)

    start = page_idx * PAGE_SIZE
    end   = min(start + PAGE_SIZE, total_rows)
    page_df = filtered_df.iloc[start:end].copy()

    pcol1, pcol2, pcol3, pcol4, pcol5 = st.columns([1, 1, 3, 1, 1])
    with pcol1:
        if st.button("⏮ Début") and page_idx > 0:
            st.session_state.page_index = 0
            st.session_state.table_key += 1
            st.rerun()
    with pcol2:
        if st.button("◀ Préc.") and page_idx > 0:
            st.session_state.page_index = page_idx - 1
            st.session_state.table_key += 1
            st.rerun()
    with pcol3:
        st.markdown(
            f"<div style='text-align:center;padding-top:8px'>"
            f"Page <b>{page_idx+1}</b> / {total_pages} "
            f"— articles {start+1}–{end} sur {total_rows}"
            f"</div>",
            unsafe_allow_html=True,
        )
    with pcol4:
        if st.button("Suiv. ▶") and page_idx < total_pages - 1:
            st.session_state.page_index = page_idx + 1
            st.session_state.table_key += 1
            st.rerun()
    with pcol5:
        if st.button("Fin ⏭") and page_idx < total_pages - 1:
            st.session_state.page_index = total_pages - 1
            st.session_state.table_key += 1
            st.rerun()

    # ── Data editor ────────────────────────────────────────────────────────────
    current_sl = st.session_state.shortlists.get(st.session_state.active_shortlist, set())

    display = page_df.copy()
    display.insert(0, "✓", display["id"].isin(current_sl))

    show_cols = ["✓"] + [c for c in visible if c in display.columns] + ["id", "url"]
    display   = display[[c for c in show_cols if c in display.columns]]

    rename_map = {
        "title": "Titre", "source": "Source", "folder": "Dossier",
        "tags": "Tags", "author": "Auteur", "published_at": "Publié",
        "summary": "Résumé", "is_read": "Lu", "is_starred": "Fav",
        "word_count": "Mots", "score": "Score", "✓": "✓",
    }
    display = display.rename(columns=rename_map)

    col_config: dict = {
        "✓":       st.column_config.CheckboxColumn("✓", width="small"),
        "Titre":   st.column_config.TextColumn("Titre", width="large"),
        "Résumé":  st.column_config.TextColumn("Résumé", width="large"),
        "Score":   st.column_config.NumberColumn("Score", format="%.1f", width="small"),
        "Mots":    st.column_config.NumberColumn("Mots", width="small"),
        "Lu":      st.column_config.CheckboxColumn("Lu",  width="small"),
        "Fav":     st.column_config.CheckboxColumn("Fav", width="small"),
        "url":     st.column_config.LinkColumn("🔗 URL", display_text="ouvrir"),
        "id":      None,   # colonne cachée
    }

    edited = st.data_editor(
        display,
        column_config=col_config,
        use_container_width=True,
        hide_index=True,
        num_rows="fixed",
        height=520,
        key=f"tbl_{st.session_state.table_key}",
    )

    # Sync checkboxes → shortlist
    if "✓" in edited.columns and "id" in edited.columns:
        sl = st.session_state.shortlists[st.session_state.active_shortlist]
        for _, row in edited.iterrows():
            rid = row["id"]
            if row["✓"]:
                sl.add(rid)
            else:
                sl.discard(rid)

    # ── Quick preview ──────────────────────────────────────────────────────────
    st.divider()
    with st.expander("🔎 Aperçu rapide d'un article"):
        if not filtered_df.empty:
            titles = filtered_df["title"].tolist()[:100]
            picked = st.selectbox("Article", titles, key="preview_pick")
            if picked:
                row = filtered_df[filtered_df["title"] == picked].iloc[0]
                kws = (
                    st.session_state.scoring_config.title_keywords
                    + st.session_state.scoring_config.body_keywords
                )
                left, right = st.columns([3, 1])
                with left:
                    link = f"[{row['title']}]({row['url']})" if row.get("url") else row["title"]
                    st.markdown(f"### {link}")
                    st.caption(
                        f"**Source :** {row.get('source','')} &nbsp;|&nbsp; "
                        f"**Dossier :** {row.get('folder','')} &nbsp;|&nbsp; "
                        f"**Publié :** {row.get('published_at','')}"
                    )
                    st.markdown(highlight_keywords(row.get("summary", ""), kws) or "*Pas de résumé*")
                with right:
                    st.write("**Tags :**",   row.get("tags", "—"))
                    st.write("**Auteur :**", row.get("author", "—"))
                    st.write("**Mots :**",   row.get("word_count", 0))
                    st.write("**Score :**",  row.get("score", 0.0))
                    st.write("**Lu :**",     "✓" if row.get("is_read") else "✗")
                    st.write("**Favori :**", "⭐" if row.get("is_starred") else "—")

    st.divider()
    render_actions_panel(filtered_df)


def render_actions_panel(filtered_df: pd.DataFrame) -> None:
    st.markdown("### Actions sur le panier actif")

    active_sl = st.session_state.active_shortlist
    sl_ids    = st.session_state.shortlists.get(active_sl, set())

    if not sl_ids:
        st.info("Aucun article dans ce panier. Cochez des lignes ou utilisez « Tout sélectionner ».")
        return

    sel_df = filtered_df[filtered_df["id"].isin(sl_ids)] if not filtered_df.empty else pd.DataFrame()
    # Compléter avec articles_df si certains sélectionnés ne sont pas dans le filtre courant
    if len(sel_df) < len(sl_ids):
        all_df = st.session_state.articles_df
        sel_df = all_df[all_df["id"].isin(sl_ids)]

    st.write(f"**{len(sl_ids)} article(s) — panier « {active_sl} »**")

    # Exports
    c1, c2, c3, c4 = st.columns(4)
    with c1:
        st.download_button(
            "📥 CSV", data=to_csv_bytes(sel_df),
            file_name=f"inoreader_{active_sl}.csv", mime="text/csv",
            use_container_width=True,
        )
    with c2:
        st.download_button(
            "📥 Excel", data=to_excel_bytes(sel_df),
            file_name=f"inoreader_{active_sl}.xlsx",
            mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            use_container_width=True,
        )
    with c3:
        st.download_button(
            "📥 JSON", data=to_json_bytes(sel_df),
            file_name=f"inoreader_{active_sl}.json", mime="application/json",
            use_container_width=True,
        )
    with c4:
        if st.button("📋 Liste d'URLs", use_container_width=True):
            urls = get_urls_text(sel_df)
            st.text_area("URLs", value=urls, height=150, key="urls_area")

    # Inoreader write actions
    with st.expander("🔗 Actions Inoreader (nécessite connexion API)"):
        ca, cb, cc, cd = st.columns(4)
        with ca:
            if st.button("✓ Marquer lus", use_container_width=True):
                _api_action(sel_df, lambda c, ids: c.mark_as_read(ids), "marqués lus")
        with cb:
            if st.button("○ Marquer non lus", use_container_width=True):
                _api_action(sel_df, lambda c, ids: c.mark_as_unread(ids), "marqués non lus")
        with cc:
            if st.button("⭐ Ajouter favoris", use_container_width=True):
                _api_action(sel_df, lambda c, ids: c.add_star(ids), "ajoutés aux favoris")
        with cd:
            if st.button("✗ Retirer favoris", use_container_width=True):
                _api_action(sel_df, lambda c, ids: c.remove_star(ids), "retirés des favoris")

        tag_col1, tag_col2, tag_col3 = st.columns([3, 1, 1])
        with tag_col1:
            tag_name = st.text_input("Nom du tag Inoreader", placeholder="mon-tag", key="tag_input")
        with tag_col2:
            if st.button("🏷 Ajouter", use_container_width=True) and tag_name:
                _api_action(sel_df, lambda c, ids: c.add_tag(ids, tag_name), f"tagués « {tag_name} »")
        with tag_col3:
            if st.button("🏷 Retirer", use_container_width=True) and tag_name:
                _api_action(sel_df, lambda c, ids: c.remove_tag(ids, tag_name), f"tag « {tag_name} » retiré")


def _api_action(sel_df: pd.DataFrame, fn, label: str) -> None:
    client = get_client()
    if not client or sel_df.empty:
        return
    ids = sel_df["id"].tolist()
    with st.spinner(f"En cours ({len(ids)} articles)…"):
        try:
            fn(client, ids)
            st.success(f"✓ {len(ids)} articles {label}.")
        except Exception as exc:
            st.error(f"Erreur : {exc}")


# ── Dashboard page ─────────────────────────────────────────────────────────────

def render_dashboard_page() -> None:
    st.title("📊 Dashboard analytique")

    full_df = st.session_state.articles_df
    filt_df = st.session_state.filtered_df

    if full_df.empty:
        st.info("Chargez des articles pour afficher le dashboard.")
        return

    df = filt_df if not filt_df.empty else full_df
    total_sel = sum(len(v) for v in st.session_state.shortlists.values())

    # Top KPIs
    c1, c2, c3, c4, c5 = st.columns(5)
    c1.metric("Total chargés",   len(full_df))
    c2.metric("Après filtres",   len(df))
    c3.metric("Non lus",         int(df["is_read"].eq(False).sum()))
    c4.metric("Favoris",         int(df["is_starred"].eq(True).sum()))
    c5.metric("Sélectionnés",    total_sel)

    st.divider()

    col_l, col_r = st.columns(2)

    with col_l:
        st.subheader("Top 15 sources")
        top_src = df["source"].value_counts().head(15)
        st.bar_chart(top_src)

    with col_r:
        st.subheader("Distribution temporelle")
        dates = pd.to_datetime(df["published_at"], errors="coerce").dropna()
        if not dates.empty:
            date_counts = dates.dt.date.value_counts().sort_index()
            st.bar_chart(date_counts)
        else:
            st.info("Pas de données de date.")

    col_l2, col_r2 = st.columns(2)

    with col_l2:
        st.subheader("Top tags")
        tag_list: list[str] = []
        for cell in df["tags"].dropna():
            tag_list.extend(t.strip() for t in cell.split(",") if t.strip())
        if tag_list:
            st.bar_chart(pd.Series(tag_list).value_counts().head(20))
        else:
            st.info("Aucun tag trouvé.")

    with col_r2:
        st.subheader("Mots-clés fréquents (titres)")
        words = top_words(df["title"].dropna().tolist(), n=20)
        if words:
            wd = pd.DataFrame(words, columns=["mot", "occurrences"]).set_index("mot")
            st.bar_chart(wd["occurrences"])

    # Score distribution
    if df["score"].abs().sum() > 0:
        st.subheader("Distribution des scores")
        score_counts = df["score"].value_counts().sort_index()
        st.bar_chart(score_counts)

    st.divider()
    st.subheader("Statistiques par source")
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


# ── Scoring page ───────────────────────────────────────────────────────────────

def render_scoring_page() -> None:
    st.title("⚙️ Configuration du scoring")
    st.markdown(
        "Le scoring est calculé **localement** après chargement des articles. "
        "Un score positif indique un article pertinent selon vos critères."
    )

    sc = st.session_state.scoring_config

    with st.form("scoring_form"):
        c1, c2 = st.columns(2)

        with c1:
            title_kw = st.text_area(
                "Mots-clés titre — bonus (+)",
                value="\n".join(sc.title_keywords),
                placeholder="Un mot/expression par ligne\nex: intelligence artificielle",
                height=130,
            )
            body_kw = st.text_area(
                "Mots-clés corps — bonus (+)",
                value="\n".join(sc.body_keywords),
                placeholder="Un mot/expression par ligne",
                height=130,
            )
            neg_kw = st.text_area(
                "Mots-clés négatifs — malus (−)",
                value="\n".join(sc.negative_keywords),
                placeholder="ex: publicité\ncrypto",
                height=100,
            )

        with c2:
            prio_src = st.text_area(
                "Sources prioritaires — bonus (+)",
                value="\n".join(sc.priority_sources),
                placeholder="Un nom de source par ligne\n(correspondance partielle)",
                height=130,
            )
            title_bonus = st.number_input("Bonus / mot-clé titre",   value=sc.title_keyword_bonus,   min_value=0.0, step=0.5)
            body_bonus  = st.number_input("Bonus / mot-clé corps",   value=sc.body_keyword_bonus,    min_value=0.0, step=0.5)
            src_bonus   = st.number_input("Bonus source prioritaire",value=sc.source_bonus,           min_value=0.0, step=0.5)
            neg_malus   = st.number_input("Malus / mot-clé négatif", value=sc.negative_keyword_malus, max_value=0.0, step=0.5)

        submitted = st.form_submit_button("✅ Appliquer le scoring", type="primary", use_container_width=True)

    if submitted:
        new_sc = ScoringConfig(
            title_keywords    = [k.strip() for k in title_kw.splitlines() if k.strip()],
            body_keywords     = [k.strip() for k in body_kw.splitlines()  if k.strip()],
            negative_keywords = [k.strip() for k in neg_kw.splitlines()   if k.strip()],
            priority_sources  = [k.strip() for k in prio_src.splitlines() if k.strip()],
            title_keyword_bonus   = title_bonus,
            body_keyword_bonus    = body_bonus,
            source_bonus          = src_bonus,
            negative_keyword_malus= neg_malus,
        )
        st.session_state.scoring_config = new_sc
        if not st.session_state.articles_df.empty:
            st.session_state.articles_df = apply_scoring(st.session_state.articles_df, new_sc)
            st.session_state.filtered_df = apply_scoring(st.session_state.filtered_df, new_sc)
            st.session_state.table_key += 1
        st.success("Scoring recalculé sur tous les articles.")
        st.rerun()

    if not st.session_state.articles_df.empty:
        st.divider()
        st.subheader("Top 20 articles par score")
        top20 = (
            st.session_state.articles_df
            .nlargest(20, "score")[["title", "source", "published_at", "score"]]
        )
        st.dataframe(top20, use_container_width=True, hide_index=True)


# ── Saved filters page ─────────────────────────────────────────────────────────

def render_saved_filters_page() -> None:
    st.title("💾 Profils de filtre sauvegardés")

    profiles = list_filter_profiles()
    if not profiles:
        st.info("Aucun profil sauvegardé. Créez-en un depuis le panneau de filtres (sidebar).")
        return

    for name in profiles:
        with st.expander(f"📄 {name}"):
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
                    if st.button("▶ Appliquer", key=f"apply_{name}", use_container_width=True):
                        df = st.session_state.articles_df
                        if not df.empty:
                            result = apply_filters(df, fc)
                            st.session_state.filtered_df = result
                            st.session_state.page_index  = 0
                            st.session_state.table_key  += 1
                            st.success(f"{len(result)} articles après filtre.")
                            st.rerun()
                        else:
                            st.warning("Chargez d'abord des articles.")
                    if st.button("🗑 Supprimer", key=f"del_{name}", use_container_width=True):
                        delete_filter_profile(name)
                        st.rerun()
            except Exception as exc:
                st.error(f"Lecture impossible : {exc}")


# ── Main ───────────────────────────────────────────────────────────────────────

def main() -> None:
    page = render_sidebar()

    if page == "📋 Articles":
        render_articles_page()
    elif page == "📊 Dashboard":
        render_dashboard_page()
    elif page == "⚙️ Scoring":
        render_scoring_page()
    elif page == "💾 Filtres sauvegardés":
        render_saved_filters_page()


if __name__ == "__main__":
    main()
