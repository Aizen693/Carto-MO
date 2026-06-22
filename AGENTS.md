# AGENTS.md — Algora Access (Carto-MO)

Lis ce fichier en entier avant toute action. Ces regles priment sur tout.

## Methode de travail (OBLIGATOIRE, evite les pannes)

1. **Explore avant d'agir.** Avant toute modif, lis les fichiers concernes et
   dis en une phrase ce que tu vas changer et dans quels fichiers.
2. **Diffs minimaux.** Change le strict necessaire. Ne refactore pas du code qui
   marche. Sur les zones en production, vise +N -0.
3. **Une tache a la fois.** Ne fais que ce qui est demande, rien d'autre.

## Suppressions (la ou ca casse le plus)

- **Ne supprime JAMAIS un fichier ou un bloc de code sans demande explicite.**
- Si retirer une chose en impose une autre, **liste d'abord precisement ce que tu
  vas supprimer** et attends le feu vert.
- Quand tu retires un composant React, retire **a la fois son appel
  `<Composant />` ET sa definition de facon coherente**, et verifie qu'aucun
  autre endroit ne le reference. Un composant reference mais supprime = erreur
  React #130 = page blanche.
- Ne supprime jamais un fichier asset (.mp4, .png...) sans verifier qu'il n'est
  plus reference nulle part (grep le nom du fichier dans tout le repo).

## Page d'accueil React (point fragile numero 1)

- Sources = `shared/home/*.jsx`. Le site ne sert PAS le .jsx, il sert le **.js
  compile**. Donc apres CHAQUE edition d'un `.jsx` de ce dossier :
  1. lance `bash shared/home/build.sh` pour regenerer les `.js`,
  2. bumpe le `?v=` du script concerne dans `index.html` (ex: home.js?v=...).
- Sans ces deux etapes, ta modif n'apparaitra pas ou cassera la page.

## Cache-bust

- Des que tu modifies un `.js` ou `.css` importe en module ES, **bumpe le `?v=`**
  dans tous les HTML qui l'importent. Sinon les navigateurs gardent l'ancienne
  version (et une version cassee reste cassee en cache).

## Publication (ne casse pas le site en ligne)

- Branche deployee = `claude/upbeat-euclid`. Tout push dessus part en ligne via
  Cloudflare Pages en 1 a 2 min.
- **Ne pousse JAMAIS sur cette branche sans d'abord montrer le diff + la liste
  des fichiers touches et obtenir la validation de Gaspar.**
- Apres une modif de la page d'accueil, **confirme que la page s'affiche** (pas
  d'erreur React, contenu present) AVANT de pousser.
- Ne fais jamais `git add -A` ni `git add .` (risque de committer des secrets ou
  des donnees sensibles). Stage des fichiers precis.

## Design (charte UNIQUE, partout, rapports compris)

- Fond clair #F4F2F8, panels #FFFFFF, accent violet #6B3FA0 (hover #5A2F8C).
- Degrade marque: linear-gradient(130deg,#6B3FA0,#5650C6,#1E6FBE).
- Police: Plus Jakarta Sans. Tokens dans `shared/tokens.css` (importe par
  `shared/styles.css`).
- ATTENTION: l'ancien theme sombre #111214 / or #c49a3c est MORT. Ne jamais
  l'utiliser ni s'en inspirer.

## Produit

- Cartographie OSINT/HUMINT. 6 zones: sahel, moyen-orient, rdc, asie-sud,
  madagascar, afrique.
- Backend Supabase (projet lwgrjdpuagnvvzmdbyzb): table points, bucket prive
  zones, edge functions.
- IA du produit = Mistral (edge function brief-securite-mistral). Ne plus ajouter
  d'appel Gemini ni Claude.

## Style de reponse

- Francais, sobre, entre pairs. Pas de tiret de ponctuation.
- Quand tu as assez d'elements, agis et donne une recommandation, pas un
  catalogue d'options.
