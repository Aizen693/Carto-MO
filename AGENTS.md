# AGENTS.md — Algora Access (Carto-MO)

## Regles
- Branche deployee = claude/upbeat-euclid. Toute modif du site doit finir sur cette branche pour passer en ligne.
- Ne jamais deployer ni merger sans validation de Gaspar. Proposer d'abord.
- Reponses en francais, ton sobre. Pas de tiret de ponctuation.

## Design (charte UNIQUE, partout, rapports compris)
- Fond clair #F4F2F8, panels #FFFFFF, accent violet #6B3FA0 (hover #5A2F8C).
- Degrade marque: linear-gradient(130deg,#6B3FA0,#5650C6,#1E6FBE).
- Police: Plus Jakarta Sans. Tokens dans shared/tokens.css (importe par shared/styles.css).
- ATTENTION: l'ancien theme sombre #111214 / or #c49a3c est MORT. Ne jamais l'utiliser ni s'en inspirer.

## Produit
- Cartographie OSINT/HUMINT. 6 zones: sahel, moyen-orient, rdc, asie-sud, madagascar, afrique.
- Backend Supabase (projet lwgrjdpuagnvvzmdbyzb): table points, bucket prive zones, edge functions.
- IA du produit = Mistral (edge function brief-securite-mistral). Ne plus ajouter d'appel Gemini ni Claude.

## Cache-bust
- Quand tu modifies un fichier .js ou .css importe en module ES, bumpe le ?v= dans les HTML qui l'importent.