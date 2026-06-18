// === n8n Code node : Parse VEILLE .docx -> features HUMINT ===
// A placer apres un noeud Compression (Decompress) qui a desossile .docx.
// Sortie : [{ json: { features, count, report, warnings } }] -> meme forme que Build HUMINT.
// Branche ensuite sur Get HUMINT -> Append HUMINT -> Put HUMINT.

const bins = $input.first().binary || {};
// Compression range les fichiers du zip sous file_0/file_1... avec le vrai nom dans fileName.
const key = Object.keys(bins).find(k =>
  k.toLowerCase().includes('document.xml') ||
  ((bins[k] && bins[k].fileName) || '').toLowerCase().includes('document.xml')
);
if (!key) {
  const dbg = Object.entries(bins).map(([k, v]) => `${k}:${(v && v.fileName) || ''}`).join(', ');
  throw new Error('word/document.xml introuvable. Binaires dispo = ' + dbg);
}

let xml;
try {
  const buff = await this.helpers.getBinaryDataBuffer(0, key);
  xml = buff.toString('utf8');
} catch (e) {
  xml = Buffer.from(bins[key].data, 'base64').toString('utf8');
}

const decode = s => s
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));

const RE_PAYS  = /^\s*#\s*\d+\s*[–\-—]\s*(.+?)\s*$/;
const RE_COORD = /(-?\d{1,3}[.,]\d+)(?:\s*[;,]\s*|\s+)(-?\d{1,3}[.,]\d+)/;
const RE_DATE  = /(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})/;

function paraText(p) {
  let t = ''; const re = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g; let m;
  while ((m = re.exec(p))) t += decode(m[1]);
  return t.trim();
}
function cellLines(tc) {
  const paras = tc.match(/<w:p[\s>][\s\S]*?<\/w:p>/g) || [];
  const out = [];
  for (const p of paras) {
    let buf = ''; const re = /<w:t[^>]*>([\s\S]*?)<\/w:t>|<w:br\s*\/?>/g; let m;
    while ((m = re.exec(p))) buf += (m[1] !== undefined ? decode(m[1]) : '\n');
    for (const ln of buf.split('\n')) { const s = ln.trim(); if (s) out.push(s); }
  }
  return out;
}
function titleCasePays(s) {
  s = (s || '').trim(); if (!s) return s;
  if (['RDC', 'RCA'].includes(s.toUpperCase())) return s.toUpperCase();
  const small = new Set(['de', 'du', 'des', 'la', 'le', 'et', "d'"]);
  return s.split(/\s+/).map(w => {
    const lw = w.toLowerCase();
    return small.has(lw) ? lw : lw.charAt(0).toUpperCase() + lw.slice(1);
  }).join(' ');
}
function toISO(s) {
  const m = RE_DATE.exec(s || ''); if (!m) return null;
  let d = +m[1], mo = +m[2], y = +m[3]; if (y < 100) y += 2000;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}
function splitActor(s) {
  s = (s || '').trim();
  const p = s.split(/\s+[–\-—]\s+/);
  if (p.length >= 2) return [p[0].trim(), p.slice(1).join(' - ').trim()];
  return [s, ''];
}
function parseCoord(line) {
  const m = RE_COORD.exec(line || ''); if (!m) return null;
  return [parseFloat(m[2].replace(',', '.')), parseFloat(m[1].replace(',', '.'))];
}

const today = new Date().toISOString().slice(0, 10);
const features = [], report = {}, warnings = [];
let pays = null;

const blockRe = /<w:tbl[\s>][\s\S]*?<\/w:tbl>|<w:p[\s>][\s\S]*?<\/w:p>/g;
let bm;
let last = []; // features de la derniere ligne de donnees (pour rattacher la description)
while ((bm = blockRe.exec(xml))) {
  const block = bm[0];

  // Titre de section pays "#N - PAYS" : petit tableau/paragraphe titre -> on saute ses lignes.
  const rawText = decode(block.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
  const mp = rawText.match(/#\s*\d+\s*[–\-—]\s*([^\d#]+)/);
  if (mp) { pays = titleCasePays(mp[1].trim()); last = []; continue; }

  if (!block.startsWith('<w:tbl')) continue;
  const rows = block.match(/<w:tr[\s>][\s\S]*?<\/w:tr>/g) || [];
  // Le tableau de donnees alterne : ligne a 4 cellules (donnee) puis ligne a 1 cellule (description).
  for (const row of rows) {
    const cells = row.match(/<w:tc[\s>][\s\S]*?<\/w:tc>/g) || [];

    if (cells.length >= 4) {
      const dateRaw = cellLines(cells[0]).join(' ');
      const villes = cellLines(cells[1]);
      const coordLines = cellLines(cells[2]);
      const acteurRaw = cellLines(cells[3]).join(' ');
      const iso = toISO(dateRaw);
      const [name, etype] = splitActor(acteurRaw);
      const coords = coordLines.map(parseCoord).filter(Boolean);
      last = [];
      if (!coords.length) {
        if (dateRaw || acteurRaw) warnings.push(`${pays}: ligne sans coords (date=${dateRaw}, acteur=${acteurRaw})`);
        continue;
      }
      if (!iso) warnings.push(`${pays}: date illisible "${dateRaw}"`);
      coords.forEach((coord, i) => {
        const ville = villes[i] || villes[villes.length - 1] || '';
        const paysVille = ville ? `${pays} - ${ville}` : (pays || '');
        const feat = {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: coord },
          properties: { name, type: etype, date: iso, pays: paysVille, description: '', sources: 'HUMINT', added: today },
        };
        features.push(feat);
        last.push(feat);
        report[pays] = (report[pays] || 0) + 1;
      });
    } else if (cells.length === 1) {
      // Ligne de description : rattachee a tous les points de la ligne data precedente.
      const desc = cellLines(cells[0]).join(' ').trim();
      if (desc && last.length) last.forEach((f) => { f.properties.description = desc; });
    }
  }
}

const reportTxt = `VEILLE Word : ${features.length} points\n` +
  Object.entries(report).sort((a, b) => b[1] - a[1]).map(([p, n]) => `• ${p || '?'} : ${n}`).join('\n') +
  (warnings.length ? `\n\n⚠ ${warnings.length} avertissements` : '');

return [{ json: { features, count: features.length, report: reportTxt, warnings } }];
