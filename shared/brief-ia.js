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
#brief-ia-close { background: transparent; border: 1px solid rgba(255,255,255,0.15); color: #b0b0b0; font: 500 10px/1 'JetBrains Mono', monospace; padding: 6px 12px; letter-spacing: 0.12em; text-transform: uppercase; cursor: pointer; }
#brief-ia-close:hover { color: #c49a3c; border-color: #c49a3c; }
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
        <button id="brief-ia-close" type="button">Fermer</button>
      </div>
      <div id="brief-ia-body"></div>
    </div>
  `;
  document.body.appendChild(overlayEl);

  overlayEl.addEventListener('click', (e) => {
    if (e.target === overlayEl) closeBrief();
  });
  overlayEl.querySelector('#brief-ia-close').addEventListener('click', closeBrief);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlayEl.classList.contains('open')) closeBrief();
  });
  return overlayEl;
}

function closeBrief() {
  if (overlayEl) overlayEl.classList.remove('open');
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
  } catch (e) {
    overlay.querySelector('#brief-ia-body').innerHTML = renderError(
      'Echec reseau.',
      String(e?.message || e)
    );
  }
};
