// === Corroboration OSINT/HUMINT economique (remplace corroboration.workflow.js) ===
// Zero Sonnet. Brave recupere les sources, un pre-filtre JS elague, Mistral small
// juge puis verifie sur les extraits (jamais de page entiere injectee), Google
// seulement en secours si USE_GOOGLE_FALLBACK=true.
//
// Usage:
//   MISTRAL_API_KEY=... BRAVE_API_KEY=... node n8n/corroboration.mjs points.json [sortie.json]
//
// points.json = tableau d'objets { id, zone, actor, type, date, pays, fait }.
// Node 18+.

import { readFile, writeFile } from 'node:fs/promises';
import { findSources, mistralChat, parseJSON, CONFIG } from './veille-natif/providers.mjs';

const inPath = process.argv[2] || 'points.json';
const outPath = process.argv[3] || 'corroboration-out.json';

// --- Pre-filtre JS: elague avant tout appel LLM (date +/- 5j, chevauchement lieu/acteur) ---
function toDate(s) {
  if (!s) return null;
  let m = String(s).match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = String(s).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  return null;
}
function tokens(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/).filter((t) => t.length >= 4);
}
function prefilter(point, candidates) {
  const lieu = (point.pays || '').split('-').pop();
  const keys = new Set([...tokens(lieu), ...tokens(point.actor)]);
  const pd = toDate(point.date);
  const scored = candidates.map((c) => {
    const hay = (c.titre + ' ' + c.extrait).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    let score = 0;
    for (const k of keys) if (hay.includes(k)) score++;
    const cd = toDate(c.date);
    if (pd && cd && Math.abs(cd - pd) <= 6 * 864e5) score += 2;
    return { c, score };
  });
  const kept = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).map((s) => s.c);
  // Si le filtre vide tout, on laisse Mistral trancher sur les 5 premiers bruts.
  return (kept.length ? kept : candidates.slice(0, 5)).slice(0, 8);
}

const JUDGE_SYS = [
  'Tu es analyste OSINT. On te donne un incident HUMINT et des candidats publics.',
  'corrobore=true seulement si au moins un candidat rapporte le MEME evenement: meme lieu, date a plus ou moins 3 jours, acteur ou type coherent.',
  "Meme region ou meme conflit mais autre evenement = rejet. N'invente jamais d'URL: utilise uniquement les URL des candidats.",
  'texte_reformule: reecris le fait en version publiable OSINT, attribuee aux sources ("selon ..."), sans aucun detail que seule une source humaine pourrait connaitre.',
  'Reponds en JSON strict: {"corrobore":bool,"confiance":0..1,"sources":[{"nom":"","url":"","date":""}],"texte_reformule":"","raison":""}.',
].join(' ');

const VERIFY_SYS = [
  'Verification adversariale OSINT. Sois sceptique par defaut: ton role est de REFUTER les correspondances faibles.',
  "On te donne un incident HUMINT, et des sources retenues par un premier analyste avec leurs extraits.",
  'Sur la seule base des extraits fournis (ne suppose rien au-dela), garde une source uniquement si elle rapporte le MEME evenement:',
  'meme lieu, date a plus ou moins 3 jours, acteur ou type coherent. Meme region mais autre evenement = rejet.',
  'corrobore=true seulement si au moins une source resiste. sources_validees ne contient QUE les URL fournies confirmees.',
  'Reponds en JSON strict: {"corrobore":bool,"confiance":0..1,"sources_validees":[{"nom":"","url":"","date":""}],"raison":""}.',
].join(' ');

function queriesFor(p) {
  const base = [p.actor, (p.pays || '').split('-').pop().trim(), p.date].filter(Boolean).join(' ').trim();
  const alt = [(p.pays || '').split('-').pop().trim(), p.type].filter(Boolean).join(' ').trim();
  return [base || p.fait.slice(0, 60), alt].filter(Boolean);
}

async function corroborate(p) {
  const raw = await findSources(queriesFor(p));
  const cand = prefilter(p, raw);
  if (!cand.length) {
    return { id: p.id, zone: p.zone, corrobore: false, confiance: 0, sources: [], raison: 'aucune source' };
  }

  const j = parseJSON(await mistralChat({
    task: 'judge', system: JUDGE_SYS,
    user: JSON.stringify({ incident: { acteur: p.actor, type: p.type, date: p.date, lieu: p.pays, fait: p.fait }, candidats: cand }),
  }), null);

  const conf = j ? Number(j.confiance || 0) : 0;
  const srcJudge = (j && j.corrobore) ? (j.sources || []).filter((s) => s && /^https?:/i.test(s.url || '')) : [];
  if (!srcJudge.length || conf < CONFIG.seuil) {
    return { id: p.id, zone: p.zone, corrobore: false, confiance: conf, sources: [], texte_reformule: (j && j.texte_reformule) || '', raison: (j && j.raison) || 'sous le seuil' };
  }

  // Verif adversariale sur les extraits deja en main (pas de re-fetch = pas de tokens web).
  const retenus = cand.filter((c) => srcJudge.some((s) => s.url === c.url));
  const v = parseJSON(await mistralChat({
    task: 'verify', system: VERIFY_SYS,
    user: JSON.stringify({ incident: { acteur: p.actor, type: p.type, date: p.date, lieu: p.pays, fait: p.fait }, sources: retenus.length ? retenus : srcJudge }),
  }), null);

  const ok = !!(v && v.corrobore && (v.sources_validees || []).length);
  return {
    id: p.id, zone: p.zone, acteur: p.actor, type: p.type, date: p.date, lieu: p.pays,
    corrobore: ok, confiance: ok ? Number(v.confiance || conf) : conf,
    sources: ok ? v.sources_validees : [], texte_reformule: (j && j.texte_reformule) || '',
    raison: ok ? (v.raison || '') : ('refute a la verif: ' + ((v && v.raison) || 'aucune source resistante')),
  };
}

// --- Run ----------------------------------------------------------------------
const points = JSON.parse(await readFile(inPath, 'utf8'));
console.log('Corroboration de ' + points.length + ' points (Brave + Mistral small, Google fallback=' + CONFIG.useGoogleFallback + ').');

const resultats = [];
for (const p of points) {
  const r = await corroborate(p);
  resultats.push(r);
  console.log((r.corrobore ? 'OK ' : '.. ') + '#' + r.id + ' ' + (r.lieu || r.zone) + '  conf=' + (r.confiance || 0).toFixed(2));
}

const nb = resultats.filter((r) => r.corrobore).length;
const taux = points.length ? Math.round((nb / points.length) * 100) : 0;
const report = { total: points.length, nb_corrobores: nb, taux_pct: taux, resultats };
await writeFile(outPath, JSON.stringify(report, null, 2));
console.log('Termine: ' + nb + '/' + points.length + ' corrobores (' + taux + '%). -> ' + outPath);
