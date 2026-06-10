/**
 * synthese-rapport.js — Section "Synthese decisionnelle" en page 1 des rapport.html
 *
 * Usage dans rapport.html :
 *   <script type="module" src="../shared/synthese-rapport.js?v=20260518a"></script>
 *   <script>
 *     AlgorSynthese.init({
 *       containerId: 'synthese-host',  // div ou injecter la section
 *       zoneId: 'sahel',                // cle localStorage
 *       zoneLabel: 'Sahel — Mali, Burkina Faso, Niger, Mauritanie, Tchad',
 *       reportTitle: 'Analyse multicouche du theatre sahelien',
 *     });
 *   </script>
 *
 * Architecture :
 *   - L'utilisateur clique "Generer" -> POST edge function brief-securite (mode=synthese)
 *     -> Gemini 2.5 Flash + web search produit un paragraphe de 4-6 lignes
 *   - Le texte est rendu en contenteditable pour relecture/edition
 *   - Persiste dans localStorage (cle algor-synthese-{zoneId})
 *   - Bouton "Reinitialiser" supprime la version locale
 */

const SUPABASE_URL = 'https://lwgrjdpuagnvvzmdbyzb.supabase.co';

function getSupabase() {
  return window.algorAuth?.supabase || null;
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const STYLES = `
.algor-synthese { background: #161819; border: 1px solid rgba(196,154,60,0.30); border-top: 2px solid #c49a3c; padding: 22px 24px 20px; margin: 0 0 40px; }
.algor-synthese-eyebrow { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
.algor-synthese-label { font: 600 9px/1 'JetBrains Mono', monospace; letter-spacing: 0.18em; text-transform: uppercase; color: #c49a3c; }
.algor-synthese-actions { display: flex; gap: 8px; }
.algor-synthese-btn { background: transparent; border: 1px solid rgba(196,154,60,0.40); color: #c49a3c; font: 600 9px/1 'JetBrains Mono', monospace; letter-spacing: 0.14em; text-transform: uppercase; padding: 7px 14px; cursor: pointer; }
.algor-synthese-btn:hover { background: rgba(196,154,60,0.08); border-color: #c49a3c; }
.algor-synthese-btn[disabled] { opacity: 0.35; cursor: not-allowed; }
.algor-synthese-btn.secondary { border-color: rgba(255,255,255,0.15); color: #888; }
.algor-synthese-btn.secondary:hover { color: #c49a3c; border-color: #c49a3c; background: transparent; }
.algor-synthese-text { font: 400 14px/1.7 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; color: #e8e8e8; outline: none; min-height: 80px; padding: 6px 0; }
.algor-synthese-text:focus { color: #ffffff; }
.algor-synthese-text.placeholder { color: #555; font-style: italic; }
.algor-synthese-text strong, .algor-synthese-text b { color: #c49a3c; font-weight: 700; }
.algor-synthese-meta { font: 400 9px/1.4 'JetBrains Mono', monospace; letter-spacing: 0.08em; text-transform: uppercase; color: #666; margin-top: 12px; display: flex; gap: 14px; flex-wrap: wrap; }
.algor-synthese-loader { display: inline-flex; align-items: center; gap: 8px; color: #888; font: 400 11px/1 'JetBrains Mono', monospace; letter-spacing: 0.06em; }
.algor-synthese-dot { width: 5px; height: 5px; background: #c49a3c; display: inline-block; animation: algSynPulse 1.2s infinite; }
.algor-synthese-dot:nth-child(2) { animation-delay: 0.2s; }
.algor-synthese-dot:nth-child(3) { animation-delay: 0.4s; }
@keyframes algSynPulse { 0%, 80%, 100% { opacity: 0.2; } 40% { opacity: 1; } }
.algor-synthese-error { color: #ff7676; font: 400 11px/1.5 'JetBrains Mono', monospace; padding: 10px 12px; border: 1px solid rgba(255,118,118,0.25); background: rgba(255,118,118,0.05); margin-top: 8px; }
.algor-synthese-disclaimer { font: 400 9px/1.6 'JetBrains Mono', monospace; letter-spacing: 0.06em; color: #777; margin-top: 10px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.06); }
@media print {
  .algor-synthese { background: #fff; border-color: #b8860b; border-top-color: #b8860b; }
  .algor-synthese-label { color: #b8860b; }
  .algor-synthese-text { color: #111; }
  .algor-synthese-text strong { color: #b8860b; }
  .algor-synthese-actions { display: none; }
  .algor-synthese-meta { color: #777; }
  .algor-synthese-disclaimer { color: #777; border-top-color: #ddd; }
}
`;

let stylesInjected = false;
function injectStyles() {
  if (stylesInjected) return;
  const style = document.createElement('style');
  style.textContent = STYLES;
  document.head.appendChild(style);
  stylesInjected = true;
}

function lsKey(zoneId) { return `algor-synthese-${zoneId}`; }

function loadSaved(zoneId) {
  try {
    const raw = localStorage.getItem(lsKey(zoneId));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveLocal(zoneId, data) {
  try { localStorage.setItem(lsKey(zoneId), JSON.stringify(data)); } catch { /* quota */ }
}

function clearLocal(zoneId) {
  try { localStorage.removeItem(lsKey(zoneId)); } catch { /* noop */ }
}

function applyInline(text) {
  return esc(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

function renderPlaceholder(textEl) {
  textEl.classList.add('placeholder');
  textEl.contentEditable = 'false';
  textEl.innerHTML = "Aucune synthèse générée. Clique « Générer » : l'intelligence artificielle produira un paragraphe décisionnel basé sur les données récentes (web + sources tier-1).";
}

function renderText(textEl, text) {
  textEl.classList.remove('placeholder');
  textEl.contentEditable = 'true';
  textEl.innerHTML = applyInline(text);
}

function renderMeta(metaEl, data) {
  if (!data) { metaEl.textContent = ''; return; }
  const d = new Date(data.generatedAt);
  const dateStr = d.toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const parts = [`Généré par IA le ${dateStr}`];
  if (data.model) parts.push(data.model + ' + recherche web');
  if (data.edited) parts.push('Relu et édité manuellement');
  metaEl.textContent = parts.join(' · ');
}

async function generateSynthese({ zoneId, zoneLabel, reportTitle }) {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Auth indisponible');
  const { data: sess } = await supabase.auth.getSession();
  const token = sess?.session?.access_token;
  if (!token) throw new Error('Session expirée, recharge la page');

  const res = await fetch(`${SUPABASE_URL}/functions/v1/brief-securite`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: reportTitle || zoneLabel,
      mode: 'synthese',
      context: { _calque: 'synthese', scope: zoneLabel, zone_id: zoneId },
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(json.error || `Erreur HTTP ${res.status}`);
    e.hint = json.hint || json.detail || '';
    throw e;
  }
  return { text: json.brief || '', model: json.model || '', generatedAt: Date.now() };
}

function mount(opts) {
  injectStyles();
  const host = document.getElementById(opts.containerId);
  if (!host) { console.warn('[synthese-rapport] containerId introuvable :', opts.containerId); return; }

  host.innerHTML = `
    <section class="algor-synthese" data-zone="${esc(opts.zoneId)}">
      <div class="algor-synthese-eyebrow">
        <span class="algor-synthese-label">Synthese decisionnelle</span>
        <div class="algor-synthese-actions">
          <button class="algor-synthese-btn" data-action="generate" type="button">Generer</button>
          <button class="algor-synthese-btn secondary" data-action="reset" type="button" style="display:none">Reinitialiser</button>
        </div>
      </div>
      <div class="algor-synthese-text" data-role="text"></div>
      <div class="algor-synthese-meta" data-role="meta"></div>
      <div class="algor-synthese-disclaimer">Synthèse générée par intelligence artificielle (Google Gemini, recherche web associée), soumise à relecture humaine avant publication. Elle peut contenir des erreurs.</div>
      <div class="algor-synthese-error" data-role="error" style="display:none"></div>
    </section>
  `;

  const sec = host.querySelector('.algor-synthese');
  const textEl = sec.querySelector('[data-role=text]');
  const metaEl = sec.querySelector('[data-role=meta]');
  const errEl = sec.querySelector('[data-role=error]');
  const btnGen = sec.querySelector('[data-action=generate]');
  const btnReset = sec.querySelector('[data-action=reset]');

  function refreshFromSaved() {
    const saved = loadSaved(opts.zoneId);
    if (saved && saved.text) {
      renderText(textEl, saved.text);
      renderMeta(metaEl, saved);
      btnGen.textContent = 'Regenerer';
      btnReset.style.display = '';
    } else {
      renderPlaceholder(textEl);
      metaEl.textContent = '';
      btnGen.textContent = 'Generer';
      btnReset.style.display = 'none';
    }
  }

  function showError(msg, hint) {
    errEl.textContent = msg + (hint ? ' : ' + hint : '');
    errEl.style.display = '';
    setTimeout(() => { errEl.style.display = 'none'; }, 8000);
  }

  // Sauvegarde a la volee si l'utilisateur edite le texte
  textEl.addEventListener('input', () => {
    if (textEl.classList.contains('placeholder')) return;
    const saved = loadSaved(opts.zoneId) || {};
    saved.text = textEl.innerText.trim();
    saved.edited = true;
    saved.editedAt = Date.now();
    saveLocal(opts.zoneId, saved);
    renderMeta(metaEl, saved);
  });

  btnGen.addEventListener('click', async () => {
    errEl.style.display = 'none';
    btnGen.disabled = true;
    btnReset.disabled = true;
    textEl.classList.remove('placeholder');
    textEl.contentEditable = 'false';
    textEl.innerHTML = '<span class="algor-synthese-loader"><span class="algor-synthese-dot"></span><span class="algor-synthese-dot"></span><span class="algor-synthese-dot"></span> Generation · recherche web + analyse IA</span>';
    try {
      const result = await generateSynthese(opts);
      if (!result.text) throw new Error('Reponse IA vide');
      saveLocal(opts.zoneId, result);
      renderText(textEl, result.text);
      renderMeta(metaEl, result);
      btnGen.textContent = 'Regenerer';
      btnReset.style.display = '';
    } catch (e) {
      refreshFromSaved();
      showError(e.message || 'Echec generation', e.hint);
    } finally {
      btnGen.disabled = false;
      btnReset.disabled = false;
    }
  });

  btnReset.addEventListener('click', () => {
    if (!confirm('Supprimer la synthese decisionnelle actuelle ?')) return;
    clearLocal(opts.zoneId);
    refreshFromSaved();
  });

  refreshFromSaved();
}

window.AlgorSynthese = { init: mount };
