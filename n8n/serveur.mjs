// === Service HTTP de veille (l'agent Telegram/Hermes appelle cette URL) ===
// Expose /corroborer : recoit un bulletin ou des points, renvoie la corroboration
// en texte pret pour Telegram (ou JSON). Zero Sonnet, moteur veille-core.mjs.
//
// Lancer:  node serveur.mjs      (lit ./.env)
// Reglages .env: PORT (defaut 8090), VEILLE_HOST (defaut 127.0.0.1),
//                VEILLE_TOKEN (recommande: un mot de passe simple pour l'URL).
//
// Appels:
//   GET  /health
//   GET  /corroborer?token=XXX&test=1                  -> 5 points de test
//   GET  /corroborer?token=XXX&texte=...&zone=sahel    -> extrait + corrobore un bulletin
//   POST /corroborer   body JSON {texte, zone} ou {points:[...]}  (+ ?token=XXX)
//   ajoute &format=json pour recevoir le JSON brut au lieu du texte.

import { createServer } from 'node:http';
import { corroborate, corroborateBatch, extractIncidents, CONFIG, POINTS_TEST } from './veille-core.mjs';

const PORT = Number(process.env.PORT || 8090);
const HOST = process.env.VEILLE_HOST || '127.0.0.1';
const TOKEN = process.env.VEILLE_TOKEN || '';

function formatText(rep) {
  const lignes = [`Corroboration OSINT : ${rep.nb_corrobores}/${rep.total} corrobores (${rep.taux_pct}%)`, ''];
  for (const r of rep.resultats) {
    const tete = (r.corrobore ? '✅' : '❌') + ` #${r.id} ${r.lieu || r.zone || ''} (${(r.confiance || 0).toFixed(2)})`;
    lignes.push(tete);
    if (r.corrobore) {
      if (r.texte_reformule) lignes.push('   ' + r.texte_reformule);
      for (const s of (r.sources || []).slice(0, 3)) lignes.push('   • ' + ((s.nom || s.source || 'source') + ' ' + (s.url || '')).trim());
    } else {
      lignes.push('   ' + (r.raison || 'non corrobore') + ' (reste HUMINT interne)');
    }
    lignes.push('');
  }
  return lignes.join('\n').trim();
}

function readBody(req) {
  return new Promise((resolve) => {
    let b = ''; req.on('data', (c) => { b += c; if (b.length > 1e6) req.destroy(); });
    req.on('end', () => resolve(b)); req.on('error', () => resolve(''));
  });
}

async function pointsFromRequest(query, body) {
  if (body && Array.isArray(body.points)) return body.points.map((p, i) => ({ id: p.id ?? i + 1, zone: p.zone || '', actor: p.actor || p.acteur || '', type: p.type || '', date: p.date || '', pays: p.pays || p.lieu || '', fait: p.fait || '' }));
  const texte = (body && body.texte) || query.get('texte') || '';
  if (texte.trim()) return extractIncidents(texte, (body && body.zone) || query.get('zone') || '');
  if (query.get('test')) return POINTS_TEST;
  return null;
}

const server = createServer(async (req, res) => {
  const send = (code, body, type = 'text/plain; charset=utf-8') => { res.writeHead(code, { 'Content-Type': type }); res.end(body); };
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/health') return send(200, 'ok');
    if (url.pathname !== '/corroborer') return send(404, 'not found');
    if (TOKEN && url.searchParams.get('token') !== TOKEN && req.headers['x-token'] !== TOKEN) return send(401, 'token invalide');

    const body = req.method === 'POST' ? (JSON.parse((await readBody(req)) || '{}') || {}) : null;
    const points = await pointsFromRequest(url.searchParams, body);
    if (!points || !points.length) return send(400, 'Rien a corroborer. Passe ?texte=... , un body {points:[...]}, ou ?test=1');

    const rep = await corroborateBatch(points);
    if (url.searchParams.get('format') === 'json') return send(200, JSON.stringify(rep, null, 2), 'application/json; charset=utf-8');
    return send(200, formatText(rep));
  } catch (e) { send(500, 'erreur: ' + ((e && e.message) || e)); }
});

server.listen(PORT, HOST, () => {
  console.log(`Service veille sur http://${HOST}:${PORT}`);
  console.log(`Cles chargees: Mistral=${CONFIG.mistralKey ? 'oui' : 'NON'} Brave=${CONFIG.braveKey ? 'oui' : 'NON'}  token=${TOKEN ? 'oui' : 'non (ouvert)'}`);
  console.log(`Test rapide: curl "http://${HOST}:${PORT}/corroborer?test=1${TOKEN ? '&token=' + TOKEN : ''}"`);
});
