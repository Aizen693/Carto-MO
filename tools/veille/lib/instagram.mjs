/* Collecte Instagram via Instaloader (https://github.com/instaloader/instaloader).

   ATTENTION : contrairement a Telegram et RSS, cette voie N'EST PAS sans
   compte. Instagram refuse tout acces anonyme (401 des la premiere requete,
   teste le 21/09/2026). Il faut une session Instaloader creee une fois a la
   main avec un compte DEDIE a la veille :

     pip install instaloader
     instaloader --login <compte_veille>

   puis IG_SESSION_USER=<compte_veille> dans l'environnement. Sans session, la
   source est ignoree et le reste de la collecte continue.

   Le travail reseau est fait par tools/veille/instagram_fetch.py (Instaloader
   est en Python) ; ce module le lance et relit ses lignes JSON.
   Local ou VPS uniquement : la session est un identifiant, elle ne doit pas
   partir dans les secrets GitHub Actions. */

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(__dirname, '..', 'instagram_fetch.py');

export function sessionUser() { return process.env.IG_SESSION_USER || ''; }

/* Emplacements de session d'Instaloader selon l'OS. */
export function sessionPath(user = sessionUser()) {
  if (!user) return null;
  const candidates = [
    process.env.XDG_CONFIG_HOME && resolve(process.env.XDG_CONFIG_HOME, 'instaloader', `session-${user}`),
    resolve(homedir(), '.config', 'instaloader', `session-${user}`),
    resolve(homedir(), 'Library', 'Application Support', 'Instaloader', `session-${user}`)
  ].filter(Boolean);
  return candidates.find(p => existsSync(p)) || null;
}

export function hasSession() { return Boolean(sessionPath()); }

/* Relit la sortie du script : une ligne JSON par item, lignes invalides ignorees. */
export function parseOutput(stdout) {
  const out = [];
  for (const line of String(stdout || '').split('\n')) {
    const s = line.trim();
    if (!s.startsWith('{')) continue;
    try {
      const o = JSON.parse(s);
      if (o.source === 'instagram' || o.check) out.push(o);
    } catch { /* ligne tronquee : ignoree */ }
  }
  return out;
}

function run(args, { timeout = 300000 } = {}) {
  const python = process.env.IG_PYTHON || 'python3';
  return new Promise((ok, ko) => {
    execFile(python, [SCRIPT, '--user', sessionUser(), ...args], { timeout, maxBuffer: 16 * 1024 * 1024 },
      (err, stdout, stderr) => {
        for (const l of String(stderr || '').split('\n')) if (l.startsWith('[!]')) console.warn(`  ${l}`);
        // Code 1 = toutes les sources en echec, 2 = instaloader absent, 3 = session absente.
        if (err && !stdout) return ko(new Error(err.code === 3 ? 'session Instaloader absente' : err.code === 2 ? 'instaloader non installe' : `instagram_fetch.py code ${err.code ?? err.message}`));
        ok(parseOutput(stdout));
      });
  });
}

const list = a => (a || []).map(s => String(s).replace(/^[@#]/, '')).join(',');

export async function fetchInstagram(conf, { maxAge = 3, perSource = 12 } = {}) {
  const items = await run(['--profiles', list(conf.profiles), '--hashtags', list(conf.hashtags),
    '--max-age', String(maxAge), '--per-source', String(perSource)]);
  return items.filter(i => i.source === 'instagram' && (i.text || i.geotag));
}

export async function checkInstagram(conf) {
  return (await run(['--profiles', list(conf.profiles), '--hashtags', list(conf.hashtags), '--check',
    '--max-age', '30', '--per-source', '3'])).filter(o => o.check);
}
