# CARTO-MO — Contexte pour Claude Design

Document de handoff pour refonte graphique/UX par Claude Design.
Projet : plateforme OSINT cartographique (Algor Int) — 3 zones : Sahel, Moyen-Orient, RDC.

---

## 1. VUE D'ENSEMBLE

**Algor Int / Carto-MO** : systeme de veille cartographique OSINT des conflits armes et attaques jihadistes. Interface technique pour analystes renseignement militaire (pas grand public).

### 3 zones
1. **Sahel** — Attaques jihadistes Mali/Burkina/Niger/Tchad/Mauritanie (Jan–Mar 2026)
2. **Moyen-Orient** — Chiites/sunnites, Syrie, Irak (2005–2026, 10 periodes de 2 ans)
3. **RDC** — Conflits armes 2023–2026

Chaque zone : carte Mapbox interactive + calques + rapport analytique + auth Supabase.

---

## 2. STRUCTURE FICHIERS

```
/index.html                    # Selection 3 zones
/shared/
  styles.css                   # Design system global
  engine.js                    # Moteur cartographique
  zone-auth.js                 # Auth par zone
  firebase-loader.js           # Chargement Supabase
/sahel/
  index.html                   # Carte + 7 calques
  rapport.html                 # Rapport analytique
  *.geojson                    # Donnees (periodes, calques)
/moyen-orient/
  index.html, rapport.html
  *.geojson                    # 10 periodes
/rdc/
  index.html, rapport.html
/admin/
  index.html + modules/        # Panneau admin (CRUD points, users, logs)
```

---

## 3. STACK

| Techno | Version | Role |
|--------|---------|------|
| Mapbox GL JS | v3.3.0 | Cartographie |
| MediaPipe Hands | v0.4 | Hand tracking gestes |
| Chart.js | v4.4.1 | Graphiques rapports |
| Supabase | v2.49.4 | Auth + BDD PostgreSQL |
| Mapbox Geocoder | v5.0.2 | Recherche lieux |
| SheetJS | v0.20.3 | Export Excel |

**Fonts** : Barlow Condensed (headings uppercase), Barlow (body), JetBrains Mono (UI technique)
**Hosting** : GitHub Pages (algoracces.fr)
**Format donnees** : GeoJSON statique + Supabase Firestore

---

## 4. DESIGN SYSTEM

### Palette (variables CSS globales)

```css
:root {
  /* Backgrounds — dark OSINT */
  --bg:    #111214;
  --bg1:   #161819;
  --bg2:   #1b1d1f;
  --bg3:   #212326;
  --bg4:   #2a2c30;

  /* Lignes */
  --ln:    rgba(255,255,255,0.07);
  --ln1:   rgba(255,255,255,0.12);
  --ln2:   rgba(255,255,255,0.20);

  /* Textes */
  --tx:    #c8cdd6;   /* courant */
  --tx1:   #727a87;   /* secondaire */
  --tx2:   #3e444e;   /* tertiaire */
  --txh:   #e8ecf2;   /* heading */

  /* Accent — or militaire */
  --ac:    #c49a3c;
  --ach:   #e0b452;   /* hover */
  --acd:   rgba(196,154,60,0.09);
  --acb:   rgba(196,154,60,0.20);

  /* Erreur */
  --err:   #a84040;
}
```

### Couleurs acteurs (Sahel)
- Jihadistes (rouges) : JNIM #e63946, GSIM #c1121f, AQMI #9d0208, ISWAP #6d023a
- Forces etatiques : FAMA #2e7d32, Barkhane #2d6a4f, MINUSMA #74c69d
- Milices (or) : GATIA #ccaa00, MSA #b5a300
- Mouvements politiques : MNLA #ab47bc, CMA #8e24aa

### Couleurs 7 calques Sahel
- ethnies #e07c5a, forces #e63946, population #ab47bc, mines #d4a017, infrastructures #66bb6a, evenements #ff5252, flux #ff9800

### Typographie

| Usage | Font | Taille | Weight | Spacing | Casse |
|-------|------|--------|--------|---------|-------|
| Headings | Barlow Condensed | 22–32px | 600 | +0.04em | UPPERCASE |
| Labels/Tags | Barlow Condensed | 7–8px | 600 | +0.14em | UPPERCASE |
| Body | Barlow | 9–13px | 300–400 | 0 | normal |
| UI | JetBrains Mono | 7–9px | 400–500 | +0.08em | UPPERCASE |
| Mono tech | JetBrains Mono | 8–10px | 400 | +0.05em | — |

### Principes visuels
1. **Dark OSINT** — noir pour fatigue visuelle longue
2. **Zero emoji** — Unicode texte uniquement (☰ ⌕ ► ☒)
3. **UPPERCASE + letter-spacing** sur tous les labels UI
4. **Border-radius 0** partout — tout carre
5. **No shadows** — hierarchie par taille + couleur
6. **Accent or classique OSINT** — jamais neon
7. **Hover subtle** — background 1 cran plus clair, pas d'animation flashy

### Dimensions cles
- Header : 40–44px
- Sidebar : 240px
- Popup max : 290px
- Button padding : 5–8px H / 3–9px V

---

## 5. FONCTIONNALITES

### 7 Calques Sahel
1. **Ethnies** — populations ethnolinguistiques
2. **Forces** — armees, coalitions, MINUSMA
3. **Population** — deplacements, refugies, flux 15j
4. **Mines** — or, uranium, gisements
5. **Infrastructures** — ponts, routes, hubs
6. **Evenements** — attaques, embuscades (casualties)
7. **Flux** — armes, drogues, corridors

### Extrusions 3D
- Actives quand pitch > 20°
- Points → cylindres 3D (40–50px height)
- Shapes : star, hex, pentagon, diamond selon type (aeroport, port, base…)
- 7 couches Mapbox par shape : base, body, mid, cap, beacon, glow, labels
- Hauteurs dynamiques par type (aeroport 130k, base 100k, corridor 35k)

### Hand Tracking (MediaPipe)
- Bouton sidebar ✋ "Hand tracking"
- 3 gestes : pincer + glisser (pan), double-pincement (selection popup), main ouverte monter/descendre (zoom)
- Canvas overlay curseur cyan
- maxBounds Sahel quand actif

### Rapports (rapport.html)
- Hero + metrics 4 colonnes (Evenements / Acteurs / Tendance / Casualties)
- Section contexte (Chart.js timeline)
- Section analyse par acteur (table + chart)
- Section locked "Acces restreint" avec bouton dore

### Auth
- Supabase Auth email/password
- Classe `.zone-gated` (display:none avant auth)
- Check `profiles.role` apres login
- `localStorage['carto-zone-auth']`

### Outils sidebar
- Heatmap (densite attaques)
- Comparer (split 2 cartes sync)
- Recherche lieu (geocoder)
- Export PNG (toDataURL)
- Hand tracking
- Rapports (lien)

---

## 6. COMPOSANTS UI

### Header
```
┌────────────────────────────────────────────────────┐
│ ☰ MENU │ [Logo] Titre zone │ PERIODE │ #pts │ ⓘ  │
└────────────────────────────────────────────────────┘
```
40px, bg1, flex. Logo 28px opacity 0.7. H1 Barlow Condensed 16px 600 uppercase.

### Sidebar (240px)
```
╔════════════╗
║ LEGENDE    ║  collapsible
║ • JNIM     ║  dots colores cliquables
╟────────────╢
║ CALQUES    ║
║ Ethnies [●]║  7 toggles
╟────────────╢
║ OUTILS     ║
║ ◐ Heatmap  ║  sb-tool-row, hover --ach
║ ◧ Comparer ║
║ ✋ Hand T. ║
║ ◇ Rapports ║
╚════════════╝
```

### Popup points
```
┌──────────────────────────────┐
│ [▓] JNIM         MAR-01-15  │  header colored-bar + actor + badge
├──────────────────────────────┤
│ DATE      │ 15 mars 2026     │  key/val rows
│ PAYS      │ Mali             │
│ EVENEMENT │ Embuscade        │
│ DETAIL    │ 45 militaires... │
├──────────────────────────────┤
│ [A] Cotation  [src1] [src2]  │  cotation OTAN + liens
└──────────────────────────────┘
```
Border-left 3px --ac, popup-actor Barlow Condensed 12px 600 blanc, popup-key mono 8px accent uppercase.

### Period Controls (bas)
```
[2026-01][2026-02][2026-03]    period-buttons
[▶] [Jan] ◀─●─▶ [Mar] [TOUT]   play + slider
```
Slider thumb 11×11 border --ac. Period-btn flex 1, hover bg2, active --acd + border-bottom --ac.

### Compare Panel (top-right)
```
┌─────────────────────┐
│ COMPARER 2 PERIODES │
│ [J01-15] [J16-31]   │  cmp-btn grid 2 cols
│ [F01-14] [F15-28]   │
│ [Fermer]            │
└─────────────────────┘
```

---

## 7. PAIN POINTS UX/DESIGN (a ameliorer)

### 7.1 Inline styles excessifs
Boutons avec `style="..."` inline + `onmouseover/onmouseout`. Devrait etre en classes CSS avec `:hover`.

### 7.2 Couleurs acteurs en dur dans zone-config
Chaque zone redefinit ses `ACTOR_COLORS` manuellement. Centraliser dans `/shared/actor-palette.js`.

### 7.3 Code shapes 3D redondant
6 fonctions `shapeCircle`, `shapeHex`, `shapePolygon`... → parametrer `createShape(type, radius)` unique.

### 7.4 Popups HTML en concatenation string
`makePopupHTML()` construit HTML par concat. Template literal ou composant reusable mieux.

### 7.5 Manque de transitions
Changement periode instantane, pas de fade/morph. Ajouter transitions smooth sur render couches + slider.

### 7.6 Accessibilite WCAG
- Contraste `--tx2 sur --bg3` = 3:1 (sous AA 4.5:1)
- Pas de tabindex sur inputs
- Boutons close popup trop petits (<16px)
- Pas de focus-visible styles

### 7.7 Pas de responsive
Sidebar 240px fixe, zero media queries. Mobile inexistant.

### 7.8 Nommage CSS incoherent
Mix BEM partiel + utility + IDs. `.sb-section-header` vs `#sidebar` vs `.legend-item`. Adopter BEM strict ou SMACSS.

### 7.9 Rapport.html CSS minifie inline
Tout le CSS sur 2–3 lignes (`:root{--bg:#111214;...}`). Impossible a maintenir. Lier `../shared/styles.css` + creer `rapport.css`.

### 7.10 Etats UI flous
Classes `.active` / `.selected` / `.filtered-out` sans doc. Guide etats UI a creer.

### 7.11 Hand tracking UI sommaire
Curseur = 1 point cyan. Badge texte uppercase. Guide overlay style basique. Pourrait etre beaucoup plus polished (animations, feedback visuel, onboarding interactif).

### 7.12 Pas de system components
Aucune Figma / Storybook / design tokens formalises. Tout CSS ad-hoc.

---

## 8. OPPORTUNITES POUR CLAUDE DESIGN

### Livrables recommandes
1. **Design system formalise** (Figma) — tokens couleurs/type/spacing/radius
2. **Component library** — Button, Popup, Badge, Section, Toggle, Slider, Card
3. **Accessibility audit** WCAG 2.1 AA — contraste, focus, clavier
4. **Responsive breakpoints** — mobile <768px, tablet 768–1024px, desktop >1024px
5. **Micro-interactions** — transitions entre periodes, fade-in couches, slider smooth
6. **Onboarding redesign** — tutoriels interactifs + hand tracking guide polished
7. **Rapports analytiques** — hierarchie visuelle, charts Chart.js styling, metric cards
8. **Refactor guideline** — inline styles → classes, duplication → composants

### A conserver absolument
- **Aesthetic militaire OSINT** (dark, or, mono) — c'est l'identite de la marque
- **Zero emoji / zero neon** — code visuel strict
- **Border-radius 0** — tout carre
- **UPPERCASE + letter-spacing** sur labels
- **Hierarchie par taille + couleur** (pas de shadows)
- **Langue francaise** exclusivement

### Public cible
Analystes OSINT / renseignement militaire. Interface technique assumee, PAS grand public. Densite info > simplicite.

---

## 9. FORMAT DONNEES GEOJSON

### Periodes (attaques)
```json
{
  "type": "Feature",
  "geometry": {"type": "Point", "coordinates": [-9.5, 15.0]},
  "properties": {
    "name": "JNIM",
    "_period": "Jan 01-15",
    "_color": "#e63946",
    "_desc": "Date: 15 janv 2026\nPays: Mali\nEvenement: Embuscade\nDetail: 45 militaires tues",
    "_casualties": 45
  }
}
```

### Calques Sahel
```json
{
  "properties": {
    "name": "Bamako",
    "type": "ville",
    "volume": 1500000,
    "evolution_15j": "+2.3%",
    "rank": "A",
    "sources": "Name|https://url.com | Name2|https://url2.com"
  }
}
```

---

## 10. CHECKLIST HANDOFF CLAUDE DESIGN

- [ ] Lire `/shared/styles.css` en entier
- [ ] Consulter `/index.html`, `/sahel/index.html`, `/moyen-orient/index.html`, `/rdc/index.html`
- [ ] Lire `/sahel/rapport.html` (styles inline massifs)
- [ ] Tester navigateurs chrome/firefox/safari
- [ ] Verifier @ 1280px (desktop) + <768px (mobile — a creer)
- [ ] Audit accessibilite (axe DevTools / WAVE)
- [ ] Tester mode 3D (incliner carte pitch>20°)
- [ ] Tester hand tracking (webcam)
- [ ] Verifier tous toggles sidebar / sections

---

**Document pret pour handoff Claude Design.**
Projet : Carto-MO / Algor Int
Contact : gapcimadomo@gmail.com
