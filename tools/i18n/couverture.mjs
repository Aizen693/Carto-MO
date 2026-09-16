// Contrôle de la version anglaise du site (shared/i18n.js + shared/i18n/en.json).
// Charge chaque page en anglais sur le serveur local (python3 -m http.server 8768 à la racine du dépôt),
// en visiteur puis en abonné simulé (stub-auth.js : aucun identifiant, aucun appel Supabase),
// et liste les textes français que le dictionnaire ne couvre pas encore → manquants-en.json.
// Pour corriger : ajouter la paire « texte français » : « English » directement dans en.json.
//   npm i playwright-core   puis   CHROME=/chemin/vers/chrome node tools/i18n/couverture.mjs
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync } from 'node:fs';
const S = new URL('.', import.meta.url).pathname;
const exe = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://localhost:8768';
const STUB = readFileSync(S + 'stub-auth.js', 'utf8');
let SNAP = '{}'; try { SNAP = readFileSync(S + 'snapshot-fr.json', 'utf8'); } catch (e) {} // instantané cyber facultatif, pour la page Veilles
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'] });
const cles = new Map();
async function passe(nom, abonne, pages) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('algor-lang', 'en'); } catch (e) {} });
  await ctx.route('**/__snapshot.json', (r) => r.fulfill({ contentType: 'application/json', body: SNAP }));
  if (abonne) await ctx.route(/\/shared\/site-auth\.js/, (r) => r.fulfill({ contentType: 'text/javascript', body: STUB }));
  for (const [chemin, actions] of pages) {
    const page = await ctx.newPage();
    try {
      await page.goto(BASE + chemin, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(4000);
      for (let y = 0; y < 10; y++) { await page.mouse.wheel(0, 900); await page.waitForTimeout(200); }
      await page.mouse.wheel(0, -20000); await page.waitForTimeout(500);
      for (const a of actions || []) { try { await a(page); await page.waitForTimeout(1400); } catch (e) {} }
      const liste = await page.evaluate(() => (window.AlgorI18n ? AlgorI18n.manquants().map((s) => [s, AlgorI18n.cle(s)]) : null));
      if (!liste) { console.log(nom, chemin, 'i18n absent'); continue; }
      for (const [s, c] of liste) { const k = /\d/.test(s) ? c : s; const e = cles.get(k) || { ex: s, pages: new Set() }; e.pages.add(chemin); cles.set(k, e); }
      console.log(nom, chemin, liste.length);
    } catch (e) { console.log(nom, chemin, 'ERREUR', e.message.slice(0, 90)); }
    await page.close();
  }
  await ctx.close();
}
const survolTheatres = async (p) => {
  await p.mouse.wheel(0, -20000); await p.waitForTimeout(1500);
  for (const id of ['MO-01', 'SAHEL-02', 'LACS-03', 'MDG-04', 'AFR-05', 'ASIE-06']) {
    const xy = await p.evaluate((i) => window.__algorGlobe && window.__algorGlobe.anchorAt(i), id);
    if (!xy) continue;
    await p.mouse.move(xy[0], xy[1], { steps: 4 }); await p.waitForTimeout(900);
  }
  await p.mouse.move(5, 5); await p.waitForTimeout(600);
};
const clic = (sel) => (p) => p.click(sel, { timeout: 3000 });
const texte = (t) => (p) => p.getByText(t, { exact: false }).first().click({ timeout: 3000 });
await passe('visiteur', false, [
  ['/', [survolTheatres]], ['/methodologie/', []], ['/theatres/', []], ['/a-propos/', []], ['/offres/', []], ['/contact/', []],
  ['/mentions-legales/', []], ['/confidentialite/', []], ['/debunkage/', []], ['/404.html', []], ['/demo/', []],
  ['/carte/', [texte('Créer un compte'), texte('Se connecter'), texte('Mot de passe oublié')]],
]);
await passe('abonné', true, [
  ['/', [survolTheatres, clic('.vcard'), (p) => p.keyboard.press('Escape')]],
  ['/veille/', [clic('.vcard'), (p) => p.keyboard.press('Escape'), clic('#tab-cyber'), clic('.vswitch [data-vue="liste"]'), clic('#pills [data-t="codes"]'), clic('.vswitch [data-vue="carte"]'), clic('.crow'), clic('#cside-back'), clic('.pills--s [data-o="acteurs"]'), clic('.crow')]],
  ['/veille-carte/', []], ['/carte/', []], ['/carte/sites-3d/', []], ['/archive/', []],
  ['/sahel/', []], ['/sahel/rapport.html', []], ['/moyen-orient/', []], ['/moyen-orient/rapport.html', []], ['/moyen-orient/zones-controle.html', []],
  ['/rdc/', []], ['/madagascar/', []], ['/afrique/', []], ['/asie-sud/', []], ['/debunkage/carte-demo.html', []],
]);
await browser.close();
// Écarte ce qui est déjà de l'anglais produit par le dictionnaire (valeurs et modèles)
const dico = JSON.parse(readFileSync(new URL('../../shared/i18n/en.json', import.meta.url), 'utf8'));
const modele = (x) => x.replace(/\{\d+\}/g, '{#}').replace(/\d+(?:[\u00a0\u202f ,.]\d+)*/g, '{#}');
const valeurs = new Set(Object.values(dico).map(modele));
const sortie = [...cles.entries()].filter(([k, e]) => !valeurs.has(modele(e.ex)) && !valeurs.has(modele(k))).map(([k, e]) => ({ k, ex: e.ex, pages: [...e.pages] }));
writeFileSync(S + 'manquants-en.json', JSON.stringify(sortie, null, 1));
console.log('textes sans traduction', sortie.length, '(noms propres identiques en anglais compris) → tools/i18n/manquants-en.json');
