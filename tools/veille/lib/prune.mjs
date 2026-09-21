/* Purge des sources mortes.
   Partie pure, testable : decide ce qui reste et ce qui saute a partir des
   resultats de sondage, sans toucher au disque ni au reseau. */

/* Un resultat de sondage :
     { kind: 'telegram'|'rss'|'tiktok', key, label, status: 'ok'|'empty'|'error', count, error } */

export function decide(results) {
  const removed = [];
  const kept = [];
  for (const r of results) {
    // 'ok'    : la source repond et renvoie des items -> on garde
    // 'empty' : elle repond mais ne renvoie rien d'exploitable -> inutile
    // 'error' : injoignable ou illisible -> inutile
    if (r.status === 'ok') kept.push(r);
    else removed.push(r);
  }
  return { kept, removed };
}

/* Applique la decision a la config d'une zone. Renvoie une nouvelle config,
   sans mutation de l'entree. */
export function applyPrune(conf, removed) {
  const deadTelegram = new Set(removed.filter(r => r.kind === 'telegram').map(r => r.key));
  const deadRss = new Set(removed.filter(r => r.kind === 'rss').map(r => r.key));
  const deadQueries = new Set(removed.filter(r => r.kind === 'tiktok').map(r => r.key));

  const next = { ...conf };
  if (Array.isArray(conf.telegram)) next.telegram = conf.telegram.filter(c => !deadTelegram.has(c));
  if (Array.isArray(conf.rss)) next.rss = conf.rss.filter(f => !deadRss.has(f.url));
  if (conf.tiktok?.queries) {
    next.tiktok = { ...conf.tiktok, queries: conf.tiktok.queries.filter(q => !deadQueries.has(q)) };
  }
  return next;
}

export function summarize(removed) {
  // r.label porte deja le type de source, on ne le repete pas.
  return removed.map(r => `${r.label} — ${r.status === 'error' ? r.error : 'aucun item exploitable'}`);
}
