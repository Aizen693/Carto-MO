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

const STYLES = `
#brief-ia-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.78); z-index: 9999; display: none; align-items: flex-start; justify-content: center; padding: 60px 20px 20px; overflow-y: auto; }
#brief-ia-overlay.open { display: flex; }
#brief-ia-modal { background: #111214; border: 1px solid rgba(196,154,60,0.35); border-top: 2px solid #c49a3c; max-width: 880px; width: 100%; color: #e8e8e8; font-family: 'JetBrains Mono', monospace; }
#brief-ia-header { display: flex; align-items: center; justify-content: space-between; padding: 14px 20px; border-bottom: 1px solid rgba(255,255,255,0.06); }
#brief-ia-title-wrap { display: flex; flex-direction: column; gap: 4px; }
#brief-ia-eyebrow { font: 500 9px/1 'JetBrains Mono', monospace; letter-spacing: 0.18em; text-transform: uppercase; color: #c49a3c; }
#brief-ia-title { font: 700 16px/1.2 'JetBrains Mono', monospace; color: #ffffff; }
#brief-ia-actions { display: flex; gap: 8px; align-items: center; }
.bia-btn { background: transparent; border: 1px solid rgba(255,255,255,0.15); color: #b0b0b0; font: 500 10px/1 'JetBrains Mono', monospace; padding: 6px 12px; letter-spacing: 0.12em; text-transform: uppercase; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
.bia-btn:hover { color: #c49a3c; border-color: #c49a3c; }
.bia-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.bia-btn:disabled:hover { color: #b0b0b0; border-color: rgba(255,255,255,0.15); }
.bia-btn svg { width: 11px; height: 11px; }
#brief-ia-body { padding: 18px 20px 22px; min-height: 120px; }
#brief-ia-loading { display: flex; align-items: center; gap: 10px; color: #888; font: 400 11px/1 'JetBrains Mono', monospace; letter-spacing: 0.06em; }
.bia-dot { width: 6px; height: 6px; background: #c49a3c; display: inline-block; animation: biaPulse 1.2s infinite; }
.bia-dot:nth-child(2) { animation-delay: 0.2s; }
.bia-dot:nth-child(3) { animation-delay: 0.4s; }
@keyframes biaPulse { 0%, 80%, 100% { opacity: 0.2; } 40% { opacity: 1; } }
#brief-ia-content { font: 400 13px/1.65 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #e0e0e0; }
#brief-ia-content strong, #brief-ia-content b { color: #c49a3c; font-weight: 700; }
#brief-ia-content h2 { font: 600 9px/1 'JetBrains Mono', monospace; letter-spacing: 0.18em; text-transform: uppercase; color: #c49a3c; margin: 22px 0 10px; padding-bottom: 6px; border-bottom: 1px solid rgba(196,154,60,0.25); }
#brief-ia-content h2:first-child { margin-top: 0; }
#brief-ia-content p { margin: 0 0 12px; color: #e8e8e8; }
#brief-ia-content ul { margin: 0 0 12px; padding-left: 0; list-style: none; }
#brief-ia-content li { padding: 5px 0 5px 14px; position: relative; color: #d8d8d8; }
#brief-ia-content li::before { content: ''; position: absolute; left: 0; top: 13px; width: 6px; height: 1px; background: #c49a3c; }
#brief-ia-sources { margin-top: 20px; padding-top: 14px; border-top: 1px solid rgba(255,255,255,0.06); }
#brief-ia-sources-label { font: 600 9px/1 'JetBrains Mono', monospace; letter-spacing: 0.18em; text-transform: uppercase; color: #888; margin-bottom: 10px; }
.bia-source { display: block; color: #c49a3c; font: 400 11px/1.4 'JetBrains Mono', monospace; text-decoration: none; padding: 6px 10px; border: 1px solid rgba(196,154,60,0.25); margin-bottom: 6px; word-break: break-word; }
.bia-source:hover { background: rgba(196,154,60,0.08); border-color: #c49a3c; }
#brief-ia-error { color: #ff5252; font: 400 12px/1.6 'JetBrains Mono', monospace; background: rgba(255,82,82,0.06); border: 1px solid rgba(255,82,82,0.25); padding: 12px 14px; }
#brief-ia-error-hint { color: #888; font-size: 10px; margin-top: 8px; }
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
    (s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a></li>`
  ).join('');
  const sourcesBlock = sourcesItems
    ? `<section><h2>Sources</h2><ol class="sources">${sourcesItems}</ol></section>`
    : '';
  const titleEsc = esc(data.name || 'Brief securite');
  const modelEsc = esc(data.model || '');
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Brief securite — ${titleEsc}</title>
<meta name="generator" content="Algor Int — Brief IA Securite">
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #111214; color: #e8e8e8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; }
  body { padding: 60px 28px; max-width: 880px; margin: 0 auto; font-size: 14px; line-height: 1.65; }
  .hdr { border-top: 2px solid #c49a3c; border-bottom: 1px solid rgba(196,154,60,0.25); padding: 18px 0 22px; margin-bottom: 32px; }
  .hdr-row1 { display: flex; justify-content: space-between; align-items: center; font: 600 9px/1 'JetBrains Mono', monospace; letter-spacing: 0.18em; text-transform: uppercase; color: #c49a3c; }
  .hdr-brand { font-weight: 700; }
  .hdr-confid { color: #ff5252; }
  .hdr-title { margin: 14px 0 6px; font: 700 22px/1.2 'JetBrains Mono', monospace; color: #ffffff; }
  .hdr-meta { font: 400 11px/1.5 'JetBrains Mono', monospace; color: #888; letter-spacing: 0.04em; }
  h2 { font: 600 10px/1 'JetBrains Mono', monospace; letter-spacing: 0.18em; text-transform: uppercase; color: #c49a3c; margin: 30px 0 12px; padding-bottom: 7px; border-bottom: 1px solid rgba(196,154,60,0.25); }
  p { margin: 0 0 14px; }
  strong, b { color: #c49a3c; font-weight: 700; }
  ul, ol { margin: 0 0 14px; padding-left: 0; list-style: none; }
  li { padding: 6px 0 6px 16px; position: relative; color: #d8d8d8; }
  ul li::before { content: ''; position: absolute; left: 0; top: 15px; width: 7px; height: 1px; background: #c49a3c; }
  ol.sources { counter-reset: src; }
  ol.sources li { counter-increment: src; padding-left: 28px; font: 400 11px/1.5 'JetBrains Mono', monospace; word-break: break-word; }
  ol.sources li::before { content: counter(src, decimal-leading-zero); position: absolute; left: 0; top: 6px; color: #c49a3c; font-weight: 700; }
  ol.sources a { color: #c49a3c; text-decoration: none; border-bottom: 1px solid rgba(196,154,60,0.3); }
  .ftr { margin-top: 48px; padding-top: 18px; border-top: 1px solid rgba(255,255,255,0.07); font: 500 9px/1.4 'JetBrains Mono', monospace; letter-spacing: 0.12em; text-transform: uppercase; color: #666; display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  @media print {
    body { background: #fff; color: #111; padding: 20mm; max-width: none; }
    .hdr { border-top-color: #b8860b; }
    .hdr-title { color: #000; }
    h2 { color: #b8860b; }
    strong, b { color: #b8860b; }
    ul li::before, ol.sources li::before { background: #b8860b; color: #b8860b; }
    ol.sources a { color: #b8860b; }
    .ftr { color: #555; border-top-color: #ccc; }
  }
</style>
</head>
<body>
  <header class="hdr">
    <div class="hdr-row1">
      <span class="hdr-brand">Algor Int — Note d'analyse</span>
      <span class="hdr-confid">Confidentiel entreprise</span>
    </div>
    <h1 class="hdr-title">${titleEsc}</h1>
    <div class="hdr-meta">Genere le ${esc(dateStr)}${modelEsc ? ` · ${modelEsc} + recherche web` : ''}</div>
  </header>
  <main>
    ${briefHtml}
    ${sourcesBlock}
  </main>
  <footer class="ftr">
    <span>Algor Int · Intelligence economique et securitaire</span>
    <span>Note generee par IA — verifier les sources avant exploitation</span>
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
// les balises markdown explicitement.
function mdToHtml(raw) {
  const escaped = esc(raw || '');
  const lines = escaped.split(/\r?\n/);
  const out = [];
  let inList = false;
  let para = [];
  function flushPara() {
    if (para.length) {
      out.push('<p>' + para.join(' ').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') + '</p>');
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
      out.push('<h2>' + h2[1].replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') + '</h2>');
    } else if (li) {
      flushPara();
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push('<li>' + li[1].replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') + '</li>');
    } else {
      closeList();
      para.push(line);
    }
  }
  flushPara(); closeList();
  return out.join('');
}

function renderBrief(data) {
  const briefHtml = mdToHtml(data.brief || '');
  const sourcesHtml = (data.sources || []).length
    ? `<div id="brief-ia-sources">
         <div id="brief-ia-sources-label">Sources</div>
         ${data.sources.map(s => `<a class="bia-source" href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>`).join('')}
       </div>`
    : '';
  return `<div id="brief-ia-content">${briefHtml}</div>${sourcesHtml}`;
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
