/* Filtrage et typage des items collectes.
   Le lexique couvre francais, anglais et arabe translittere/arabe.
   Les types produits sont EXACTEMENT ceux attendus par le calque Veille
   (voir colorExpr dans <zone>/index.html) :
   Attaque, Embuscades, Incursion, Siege, Incident frontalier,
   Crise diplomatique, Economique, Geopolitique. */

export const TYPES = ['Attaque', 'Embuscades', 'Incursion', 'Siege', 'Incident frontalier', 'Crise diplomatique', 'Economique', 'Geopolitique'];

/* Ordre significatif : la premiere regle qui matche gagne, du plus
   specifique au plus generique. */
const RULES = [
  { type: 'Embuscades', words: ['embuscade', 'ambush', 'guet-apens', 'convoi attaque', 'convoy ambushed', 'كمين'] },
  { type: 'Siege', words: ['siege', 'assiege', 'encercle', 'blocus', 'besieged', 'encircled', 'blockade', 'حصار'] },
  { type: 'Incursion', words: ['incursion', 'infiltration', 'raid', 'razzia', 'incursion armee', 'توغل'] },
  { type: 'Incident frontalier', words: ['frontiere', 'frontalier', 'border incident', 'cross-border', 'poste frontiere', 'حدودي'] },
  { type: 'Crise diplomatique', words: ['ambassadeur rappele', 'rupture des relations', 'expulsion diplomatique', 'crise diplomatique', 'severs ties', 'recalled its ambassador', 'sanctions contre'] },
  { type: 'Economique', words: ['mine d or', 'orpaillage', 'penurie', 'carburant', 'blocus economique', 'oil field', 'pipeline', 'convoi humanitaire', 'marche attaque'] },
  { type: 'Geopolitique', words: ['accord militaire', 'retrait des troupes', 'base militaire', 'cooperation militaire', 'wagner', 'africa corps', 'coup d etat', 'putsch', 'junte', 'troop withdrawal'] },
  { type: 'Attaque', words: [
    'attaque', 'attentat', 'assaut', 'offensive', 'ied', 'engin explosif', 'mine artisanale', 'kamikaze',
    'drone', 'frappe', 'bombardement', 'obus', 'roquette', 'missile', 'tirs', 'fusillade', 'enlevement',
    'kidnapping', 'massacre', 'tues', 'morts', 'victimes', 'affrontements', 'combats',
    'attack', 'strike', 'shelling', 'airstrike', 'gunmen', 'killed', 'clashes', 'explosion', 'blast', 'suicide bomber',
    'هجوم', 'انفجار', 'اشتباكات', 'قتلى', 'غارة'
  ] }
];

/* Acteurs suivis : leur presence releve la confiance et alimente le popup. */
const ACTORS = [
  'jnim', 'gsim', 'etat islamique', 'islamic state', 'eigs', 'iswap', 'isgs', 'iswa', 'daech', 'daesh', 'isis',
  'al-qaida', 'al qaeda', 'aqmi', 'aqim', 'boko haram', 'ansarul islam', 'katiba macina',
  'adf', 'm23', 'codeco', 'zaire', 'maï-maï', 'mai-mai', 'fardc', 'monusco', 'wazalendo',
  'fama', 'fds', 'vdp', 'barkhane', 'minusma', 'wagner', 'africa corps',
  'hezbollah', 'houthis', 'houthi', 'hachd', 'pmf', 'sdf', 'fds syriennes', 'hts', 'tsahal', 'idf', 'centcom'
];

/* Rejet des contenus non operationnels (sport, meteo, pub, divertissement). */
const NOISE = ['football', 'coupe d afrique', 'can 2', 'match nul', 'championnat', 'horoscope', 'meteo du jour', 'concert', 'telenovela', 'promotion', 'abonnez-vous', 'publicite'];

export function normalize(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’'`]/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hits(haystack, words) {
  const found = [];
  for (const w of words) {
    const n = normalize(w);
    if (!n) continue;
    // Frontiere de mot cote latin ; pour l'arabe on teste l'inclusion brute.
    const re = /[؀-ۿ]/.test(w) ? null : new RegExp(`(^|\\s)${n.replace(/\s+/g, '\\s+')}(\\s|$)`);
    if (re ? re.test(haystack) : String(haystack).includes(w)) found.push(w);
  }
  return found;
}

/* Renvoie null si l'item ne releve pas de la veille conflit. */
export function classify(item) {
  const raw = `${item.text || ''}`;
  const norm = normalize(raw);
  if (norm.length < 20) return null;

  const attaqueRule = RULES.find(r => r.type === 'Attaque');
  if (hits(norm, NOISE).length > 0 && hits(norm, attaqueRule.words).length === 0) return null;

  let type = null;
  let keywords = [];
  for (const rule of RULES) {
    const h = hits(norm, rule.words);
    if (h.length > 0) { type = rule.type; keywords = h; break; }
  }
  if (!type) return null;

  const actors = hits(norm, ACTORS);
  const toll = extractToll(raw);

  // Confiance : lexique seul = faible, + acteur identifie = moyenne,
  // + bilan chiffre = elevee. Reste une collecte automatique non verifiee.
  let confidence = 'faible';
  if (actors.length > 0) confidence = 'moyenne';
  if (actors.length > 0 && toll) confidence = 'elevee';

  return { type, keywords: keywords.slice(0, 6), actors: actors.slice(0, 4), toll, confidence };
}

/* Bilan humain annonce : "12 morts", "at least 4 killed", "3 soldats tues". */
export function extractToll(text) {
  // On deplie les accents : le texte source ecrit "tues" comme "tues" ou "tues".
  const t = String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const patterns = [
    /(\d{1,4})\s+(?:personnes?\s+)?(?:civils?\s+|soldats?\s+|militaires?\s+)?(?:tues?|morts?|decedes?)/i,
    /(?:au moins|pres de|plus de)\s+(\d{1,4})\s+(?:tues?|morts?|victimes?)/i,
    /(\d{1,4})\s+(?:people\s+)?(?:killed|dead|deaths?)/i,
    /(?:at least|more than)\s+(\d{1,4})\s+(?:killed|dead)/i,
    /(\d{1,4})\s+blesses?/i
  ];
  for (const re of patterns) {
    const m = re.exec(t);
    if (m) return `${m[1]} (annonce, non verifie)`;
  }
  return null;
}
