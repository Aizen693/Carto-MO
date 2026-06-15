/**
 * brief-ia.js — Modal "Brief IA Securite" sur les points cartographiques
 *
 * Expose window.openBriefIA(name, pays?, ville?) appelable depuis les popups.
 * Appelle l'edge function Supabase `brief-securite` qui interroge Gemini 2.0 Flash
 * avec recherche Google et renvoie un brief securite + sources.
 */

// On reutilise le client Supabase deja instancie par site-auth.js (window.algorAuth.supabase)
// pour eviter une double instance + un import esm.sh redondant.
const SUPABASE_URL = 'https://lwgrjdpuagnvvzmdbyzb.supabase.co';
function getSupabase() {
  return window.algorAuth?.supabase || null;
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

// Charte alignee sur les popups carto (shared/styles.css + tokens.css) :
// fond blanc, accent violet #6B3FA0, Plus Jakarta Sans, radius 16px.
// Fallbacks codes en dur au cas ou tokens.css ne serait pas charge.
const STYLES = `
#brief-ia-overlay { position: fixed; inset: 0; background: rgba(24,20,40,0.55); z-index: 9999; display: none; align-items: flex-start; justify-content: center; padding: 60px 20px 20px; overflow-y: auto; }
#brief-ia-overlay.open { display: flex; }
#brief-ia-modal { background: #fff; border: 1px solid var(--ln1, rgba(24,20,40,0.12)); border-radius: 16px; max-width: 880px; width: 100%; color: var(--tx, #3A3450); font-family: var(--bc, 'Plus Jakarta Sans', -apple-system, sans-serif); overflow: hidden; box-shadow: 0 14px 44px rgba(24,20,40,0.20); }
#brief-ia-header { display: flex; align-items: center; justify-content: space-between; padding: 14px 20px; border-bottom: 1px solid var(--ln, rgba(24,20,40,0.07)); background: linear-gradient(180deg, rgba(107,63,160,0.06), rgba(107,63,160,0)); }
#brief-ia-title-wrap { display: flex; flex-direction: column; gap: 4px; }
#brief-ia-eyebrow { font: 600 9px/1 var(--bc, 'Plus Jakarta Sans', sans-serif); letter-spacing: 0.18em; text-transform: uppercase; color: var(--ac, #6B3FA0); }
#brief-ia-title { font: 700 16px/1.2 var(--bc, 'Plus Jakarta Sans', sans-serif); color: var(--txh, #181428); letter-spacing: 0.02em; text-transform: uppercase; }
#brief-ia-actions { display: flex; gap: 8px; align-items: center; }
.bia-btn { background: transparent; border: 1px solid var(--ln1, rgba(24,20,40,0.12)); color: var(--tx1, #6E6982); font: 600 10px/1 var(--bc, 'Plus Jakarta Sans', sans-serif); padding: 7px 13px; letter-spacing: 0.1em; text-transform: uppercase; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; border-radius: 8px; transition: color .12s, border-color .12s, background .12s; }
.bia-btn:hover { color: var(--ac, #6B3FA0); border-color: var(--acb, rgba(107,63,160,0.22)); background: var(--acd, rgba(107,63,160,0.08)); }
.bia-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.bia-btn:disabled:hover { color: var(--tx1, #6E6982); border-color: var(--ln1, rgba(24,20,40,0.12)); background: transparent; }
.bia-btn svg { width: 11px; height: 11px; }
#brief-ia-body { padding: 18px 20px 22px; min-height: 120px; }
#brief-ia-loading { display: flex; align-items: center; gap: 10px; color: var(--tx1, #6E6982); font: 600 11px/1 var(--bc, 'Plus Jakarta Sans', sans-serif); letter-spacing: 0.04em; }
.bia-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--ac, #6B3FA0); display: inline-block; animation: biaPulse 1.2s infinite; }
.bia-dot:nth-child(2) { animation-delay: 0.2s; }
.bia-dot:nth-child(3) { animation-delay: 0.4s; }
@keyframes biaPulse { 0%, 80%, 100% { opacity: 0.2; } 40% { opacity: 1; } }
#brief-ia-content { font: 400 13px/1.65 var(--bc, 'Plus Jakarta Sans', sans-serif); color: var(--tx, #3A3450); }
#brief-ia-content strong, #brief-ia-content b { color: var(--ach, #5A2F8C); font-weight: 700; }
#brief-ia-content h2 { font: 700 10px/1 var(--bc, 'Plus Jakarta Sans', sans-serif); letter-spacing: 0.14em; text-transform: uppercase; color: var(--ac, #6B3FA0); margin: 22px 0 10px; padding-bottom: 6px; border-bottom: 1px solid var(--acb, rgba(107,63,160,0.22)); }
#brief-ia-content h2:first-child { margin-top: 0; }
#brief-ia-content p { margin: 0 0 12px; color: var(--tx, #3A3450); }
#brief-ia-content ul { margin: 0 0 12px; padding-left: 0; list-style: none; }
#brief-ia-content li { padding: 5px 0 5px 16px; position: relative; color: var(--tx, #3A3450); }
#brief-ia-content li::before { content: ''; position: absolute; left: 0; top: 12px; width: 6px; height: 6px; border-radius: 50%; background: var(--ac, #6B3FA0); }
#brief-ia-sources { margin-top: 20px; padding-top: 14px; border-top: 1px solid var(--ln, rgba(24,20,40,0.07)); }
#brief-ia-sources-label { font: 700 9px/1 var(--bc, 'Plus Jakarta Sans', sans-serif); letter-spacing: 0.14em; text-transform: uppercase; color: var(--tx1, #6E6982); margin-bottom: 10px; }
.bia-inline-link { color: var(--ac, #6B3FA0); font-weight: 600; text-decoration: underline; text-decoration-color: var(--acb, rgba(107,63,160,0.4)); text-underline-offset: 2px; word-break: break-word; }
.bia-inline-link:hover { color: var(--ach, #5A2F8C); text-decoration-color: var(--ac, #6B3FA0); }
.bia-source { display: block; color: var(--ac, #6B3FA0); font: 600 11px/1.4 var(--bc, 'Plus Jakarta Sans', sans-serif); text-decoration: none; padding: 8px 10px; border: 1px solid var(--acb, rgba(107,63,160,0.22)); border-radius: 8px; margin-bottom: 6px; word-break: break-word; transition: background .12s, border-color .12s; }
.bia-source:hover { background: var(--acd, rgba(107,63,160,0.08)); border-color: var(--ac, #6B3FA0); }
.bia-source-domain { display: block; color: var(--tx2, #A19DB0); font-size: 9px; font-weight: 400; letter-spacing: 0.04em; margin-top: 4px; }
#brief-ia-error { color: var(--err, #B83A4A); font: 500 12px/1.6 var(--bc, 'Plus Jakarta Sans', sans-serif); background: rgba(184,58,74,0.06); border: 1px solid rgba(184,58,74,0.25); border-radius: 8px; padding: 12px 14px; }
#brief-ia-error-hint { color: var(--tx1, #6E6982); font-size: 10px; font-weight: 400; margin-top: 8px; }
#brief-ia-disclaimer { margin-top: 20px; padding: 10px 12px; border: 1px solid var(--acb, rgba(107,63,160,0.22)); border-radius: 8px; background: var(--acd, rgba(107,63,160,0.04)); color: var(--tx1, #6E6982); font: 400 10px/1.6 var(--bc, 'Plus Jakarta Sans', sans-serif); letter-spacing: 0.02em; }
`;

let overlayEl = null;
let currentBrief = null; // { name, brief, sources, model, generatedAt } — pour l'export

function ensureOverlay() {
  if (overlayEl) return overlayEl;
  const style = document.createElement('style');
  style.textContent = STYLES;
  document.head.appendChild(style);

  overlayEl = document.createElement('div');
  overlayEl.id = 'brief-ia-overlay';
  overlayEl.innerHTML = `
    <div id="brief-ia-modal" role="dialog" aria-modal="true" aria-labelledby="brief-ia-title">
      <div id="brief-ia-header">
        <div id="brief-ia-title-wrap">
          <span id="brief-ia-eyebrow">Brief IA Securite</span>
          <span id="brief-ia-title"></span>
        </div>
        <div id="brief-ia-actions">
          <button id="brief-ia-export" class="bia-btn" type="button" disabled title="Exporter la note en HTML autonome">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
              <path d="M8 1v9m0 0l-3-3m3 3l3-3M2 12v2a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-2"/>
            </svg>
            Exporter
          </button>
          <button id="brief-ia-close" class="bia-btn" type="button">Fermer</button>
        </div>
      </div>
      <div id="brief-ia-body"></div>
    </div>
  `;
  document.body.appendChild(overlayEl);

  overlayEl.addEventListener('click', (e) => {
    if (e.target === overlayEl) closeBrief();
  });
  overlayEl.querySelector('#brief-ia-close').addEventListener('click', closeBrief);
  overlayEl.querySelector('#brief-ia-export').addEventListener('click', exportBrief);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlayEl.classList.contains('open')) closeBrief();
  });
  return overlayEl;
}

function closeBrief() {
  if (overlayEl) overlayEl.classList.remove('open');
}

function setExportEnabled(enabled) {
  if (!overlayEl) return;
  const btn = overlayEl.querySelector('#brief-ia-export');
  if (btn) btn.disabled = !enabled;
}

function buildExportHtml(data) {
  const date = new Date(data.generatedAt || Date.now());
  const dateStr = date.toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
  const briefHtml = mdToHtml(data.brief || '');
  const sourcesItems = (data.sources || []).map(
    (s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}<span class="src-domain">${esc(domainOf(s.url))}</span></a></li>`
  ).join('');
  const sourcesBlock = sourcesItems
    ? `<section><h2>Sources (${(data.sources || []).length})</h2><ol class="sources">${sourcesItems}</ol></section>`
    : '';
  const titleEsc = esc(data.name || 'Brief securite');
  const modelEsc = esc(data.model || '');
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Brief securite · ${titleEsc}</title>
<meta name="generator" content="Algor Int · Brief IA Securite">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  /* Charte unifiee Algor Int : clair #F4F2F8 / violet #6B3FA0 / Plus Jakarta Sans */
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #F4F2F8; color: #3A3450; font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
  body { padding: 60px 28px; max-width: 880px; margin: 0 auto; font-size: 14px; line-height: 1.65; }
  .hdr { border-top: 2px solid #6B3FA0; border-bottom: 1px solid rgba(107,63,160,0.22); padding: 18px 0 22px; margin-bottom: 32px; }
  .hdr-row1 { display: flex; justify-content: space-between; align-items: center; font: 700 9px/1 'Plus Jakarta Sans', sans-serif; letter-spacing: 0.18em; text-transform: uppercase; color: #6B3FA0; }
  .hdr-brand { font-weight: 800; }
  .hdr-confid { color: #B83A4A; }
  .hdr-title { margin: 14px 0 6px; font: 800 22px/1.2 'Plus Jakarta Sans', sans-serif; color: #181428; letter-spacing: 0.01em; text-transform: uppercase; }
  .hdr-meta { font: 400 11px/1.5 'Plus Jakarta Sans', sans-serif; color: #6E6982; letter-spacing: 0.02em; }
  .hdr-ai { margin-top: 10px; padding: 8px 10px; border: 1px solid rgba(107,63,160,0.22); border-radius: 8px; background: rgba(107,63,160,0.05); font: 400 10px/1.6 'Plus Jakarta Sans', sans-serif; color: #6E6982; letter-spacing: 0.02em; }
  h2 { font: 700 10px/1 'Plus Jakarta Sans', sans-serif; letter-spacing: 0.14em; text-transform: uppercase; color: #6B3FA0; margin: 30px 0 12px; padding-bottom: 7px; border-bottom: 1px solid rgba(107,63,160,0.22); }
  p { margin: 0 0 14px; }
  strong, b { color: #5A2F8C; font-weight: 700; }
  ul, ol { margin: 0 0 14px; padding-left: 0; list-style: none; }
  li { padding: 6px 0 6px 16px; position: relative; color: #3A3450; }
  ul li::before { content: ''; position: absolute; left: 0; top: 13px; width: 6px; height: 6px; border-radius: 50%; background: #6B3FA0; }
  ol.sources { counter-reset: src; }
  ol.sources li { counter-increment: src; padding-left: 28px; font: 600 11px/1.5 'Plus Jakarta Sans', sans-serif; word-break: break-word; }
  ol.sources li::before { content: counter(src, decimal-leading-zero); position: absolute; left: 0; top: 6px; color: #6B3FA0; font-weight: 700; }
  ol.sources a { color: #6B3FA0; text-decoration: underline; text-decoration-color: rgba(107,63,160,0.4); text-underline-offset: 2px; display: block; }
  ol.sources a:hover { color: #5A2F8C; background: rgba(107,63,160,0.06); }
  ol.sources .src-domain { display: block; color: #A19DB0; font: 400 9px/1.4 'Plus Jakarta Sans', sans-serif; letter-spacing: 0.04em; margin-top: 3px; text-decoration: none; }
  .ftr { margin-top: 48px; padding-top: 18px; border-top: 1px solid rgba(24,20,40,0.07); font: 600 9px/1.4 'Plus Jakarta Sans', sans-serif; letter-spacing: 0.1em; text-transform: uppercase; color: #A19DB0; display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  @media print {
    body { background: #fff; padding: 20mm; max-width: none; }
  }
</style>
</head>
<body>
  <header class="hdr">
    <div class="hdr-row1">
      <span class="hdr-brand">Algor Int · Note d'analyse</span>
      <span class="hdr-confid">Confidentiel entreprise</span>
    </div>
    <h1 class="hdr-title">${titleEsc}</h1>
    <div class="hdr-meta">Genere le ${esc(dateStr)}${modelEsc ? ` · ${modelEsc} + recherche web` : ''}</div>
    <div class="hdr-ai">Document généré par intelligence artificielle (Google Gemini, recherche web associée), soumis à vérification humaine. Il peut contenir des erreurs : contrôler les sources avant toute exploitation.</div>
  </header>
  <main>
    ${briefHtml}
    ${sourcesBlock}
  </main>
  <footer class="ftr">
    <span>Algor Int · Intelligence economique et securitaire</span>
    <span>Note générée par IA (Google Gemini), vérifier les sources avant exploitation</span>
  </footer>
</body>
</html>`;
}

function exportBrief() {
  if (!currentBrief) return;
  const html = buildExportHtml(currentBrief);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const safeName = (currentBrief.name || 'brief')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9-]/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'brief';
  const dateSlug = new Date().toISOString().slice(0, 10);
  const a = document.createElement('a');
  a.href = url;
  a.download = `brief-${safeName}-${dateSlug}.html`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
}

function renderLoading() {
  return `<div id="brief-ia-loading"><span class="bia-dot"></span><span class="bia-dot"></span><span class="bia-dot"></span> Generation en cours · recherche Google + analyse IA</div>`;
}

function renderError(msg, hint) {
  return `<div id="brief-ia-error">${esc(msg)}${hint ? `<div id="brief-ia-error-hint">${esc(hint)}</div>` : ''}</div>`;
}

// Parseur markdown minimaliste : ##, **bold**, listes "- ", paragraphes.
// On echappe le HTML d'abord pour eviter toute injection, puis on reapplique
// les balises markdown explicitement + auto-linkification des URLs.
function autoLink(s) {
  // Linkify les URLs http(s):// — applique apres escape donc les & sont &amp;
  return s.replace(/(https?:\/\/[^\s<>"']+)/g, function (url) {
    var clean = url.replace(/[.,;:!?)\]]+$/, ''); // strip ponctuation finale
    var tail = url.slice(clean.length);
    var display = clean.replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (display.length > 50) display = display.substring(0, 47) + '...';
    return '<a href="' + clean + '" target="_blank" rel="noopener" class="bia-inline-link">' + display + '</a>' + tail;
  });
}
function applyInline(s) {
  return autoLink(s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>'));
}
function mdToHtml(raw) {
  const escaped = esc(raw || '');
  const lines = escaped.split(/\r?\n/);
  const out = [];
  let inList = false;
  let para = [];
  function flushPara() {
    if (para.length) {
      out.push('<p>' + applyInline(para.join(' ')) + '</p>');
      para = [];
    }
  }
  function closeList() {
    if (inList) { out.push('</ul>'); inList = false; }
  }
  for (const ln of lines) {
    const line = ln.trim();
    if (!line) { flushPara(); closeList(); continue; }
    const h2 = line.match(/^##\s+(.+)$/);
    const li = line.match(/^[-*]\s+(.+)$/);
    if (h2) {
      flushPara(); closeList();
      out.push('<h2>' + applyInline(h2[1]) + '</h2>');
    } else if (li) {
      flushPara();
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push('<li>' + applyInline(li[1]) + '</li>');
    } else {
      closeList();
      para.push(line);
    }
  }
  flushPara(); closeList();
  return out.join('');
}

function domainOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

function renderBrief(data) {
  const briefHtml = mdToHtml(data.brief || '');
  const sourcesHtml = (data.sources || []).length
    ? `<div id="brief-ia-sources">
         <div id="brief-ia-sources-label">Sources (${data.sources.length})</div>
         ${data.sources.map(s => `<a class="bia-source" href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}<span class="bia-source-domain">${esc(domainOf(s.url))}</span></a>`).join('')}
       </div>`
    : '';
  const disclaimer = `<div id="brief-ia-disclaimer">Contenu généré par intelligence artificielle (Google Gemini, recherche web associée). Il peut contenir des erreurs : vérifier les sources avant toute exploitation.</div>`;
  return `<div id="brief-ia-content">${briefHtml}</div>${sourcesHtml}${disclaimer}`;
}

function decodePayload(arg) {
  // Nouveau format : base64(JSON) ; ancien format : name string brut.
  try {
    const json = decodeURIComponent(escape(atob(arg)));
    const parsed = JSON.parse(json);
    if (parsed && typeof parsed === 'object' && parsed.name) return parsed;
  } catch (e) { /* fall through */ }
  return { name: String(arg || '') };
}

// Helper : construit le HTML du bouton "Brief IA Securite" injectable dans un popup.
// Encode le contexte du point en base64 pour eviter l'enfer d'escaping dans onclick.
window.buildBriefIAButton = function buildBriefIAButton(name, props, calqueId) {
  const ctx = { name: name || '', _calque: calqueId || '' };
  const p = props || {};
  for (const k in p) {
    if (!Object.prototype.hasOwnProperty.call(p, k)) continue;
    if (k.charAt(0) === '_') continue;
    const v = (p[k] == null ? '' : p[k]).toString().trim();
    if (v && v.length < 600) ctx[k] = v;
  }
  const payload = btoa(unescape(encodeURIComponent(JSON.stringify(ctx))));
  return '<div style="margin-top:14px;">'
    + '<button onclick="window.openBriefIA(\'' + payload + '\')" '
    + 'style="background:linear-gradient(130deg,#6B3FA0 0%,#5650C6 48%,#1E6FBE 100%);border:none;color:#fff;'
    + 'font:700 11px/1 \'Plus Jakarta Sans\',-apple-system,sans-serif;letter-spacing:0.08em;text-transform:uppercase;'
    + 'padding:12px 16px;cursor:pointer;width:100%;text-align:center;border-radius:10px;box-shadow:0 4px 14px rgba(107,63,160,0.28);">'
    + 'Brief IA Securite &nbsp;&rarr;</button></div>';
};

window.openBriefIA = async function openBriefIA(payloadOrName, _legacyPays, _legacyVille) {
  const ctx = (typeof payloadOrName === 'string' && (!_legacyPays && !_legacyVille))
    ? decodePayload(payloadOrName)
    : { name: payloadOrName, pays: _legacyPays || '', ville: _legacyVille || '' };

  const overlay = ensureOverlay();
  overlay.querySelector('#brief-ia-title').textContent = ctx.name || 'Point inconnu';
  overlay.querySelector('#brief-ia-body').innerHTML = renderLoading();
  overlay.classList.add('open');
  currentBrief = null;
  setExportEnabled(false);

  try {
    const supabase = getSupabase();
    if (!supabase) {
      overlay.querySelector('#brief-ia-body').innerHTML = renderError(
        'Client Supabase indisponible.',
        'Attends que la page finisse de charger puis reessaie.'
      );
      return;
    }
    const { data: sess } = await supabase.auth.getSession();
    const token = sess?.session?.access_token;
    if (!token) {
      overlay.querySelector('#brief-ia-body').innerHTML = renderError(
        'Session expiree.',
        'Recharge la page pour te reauthentifier.'
      );
      return;
    }

    const res = await fetch(`${SUPABASE_URL}/functions/v1/brief-securite`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: ctx.name,
        ville: ctx.ville || ctx.Ville || '',
        pays: ctx.pays || ctx.Pays || '',
        context: ctx,
      }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      overlay.querySelector('#brief-ia-body').innerHTML = renderError(
        json.error || `Erreur HTTP ${res.status}`,
        json.hint || json.detail || ''
      );
      return;
    }
    overlay.querySelector('#brief-ia-body').innerHTML = renderBrief(json);
    currentBrief = {
      name: ctx.name || 'Point',
      brief: json.brief || '',
      sources: json.sources || [],
      model: json.model || '',
      generatedAt: Date.now(),
    };
    setExportEnabled(true);
  } catch (e) {
    overlay.querySelector('#brief-ia-body').innerHTML = renderError(
      'Echec reseau.',
      String(e?.message || e)
    );
  }
};
