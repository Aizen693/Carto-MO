#!/usr/bin/env python3
"""
Génère cas-demo.json — campagne de désinformation fictive « anti-Société Lumière ».

Modèle voulu : sur la carte, on ne voit d'abord que les pastilles pays. Au clic sur
un pays, on affiche SA chaîne locale de propagation en 4 PHASES claires (①→②→③→④),
chaque pays ayant exactement un incident par phase, relié au précédent (arcs courts
intra-pays, colorés par phase). 100 % fictif, aucun lien avec un dossier réel.

Usage : python3 generate_lumiere.py   (écrit cas-demo.json)
"""
import json, random

random.seed(42)  # jitter reproductible
OUT = "cas-lumiere.json"

# Nb d'incidents par phase et par pays : arbre qui s'élargit (effet d'amplification).
PER_PHASE = {"1": 1, "2": 2, "3": 3, "4": 3}

# ─── Pays + 4 villes chacun (une par phase) ──────────────────────────────────
# harm = niveau d'implication (choroplèthe / pastille). Chaque pays = chaîne ①→④.
PAYS_DEF = [
    {"id":"fr","name":"France","flag":"🇫🇷","iso":"FR","region":"Europe de l'Ouest","lat":46.6,"lon":2.4,
     "harm":5,"status":"cible_principale","status_label":"Cible principale","atteinte_type":"directe","proof":"Confirmé",
     "operations":"Marché clé et siège de Société Lumière. Cœur de l'amplification francophone.",
     "villes":[("Paris",48.86,2.35),("Lyon",45.76,4.84),("Marseille",43.30,5.37),("Toulouse",43.60,1.44)]},
    {"id":"ro","name":"Roumanie","flag":"🇷🇴","iso":"RO","region":"Europe de l'Est","lat":45.9,"lon":24.9,
     "harm":4,"status":"foyer_relais","status_label":"Foyer relais principal","atteinte_type":"indirecte","proof":"Confirmé",
     "operations":"Cluster de Bucarest : canaux Telegram coordonnés, premiers relais.",
     "villes":[("Bucarest",44.43,26.10),("Cluj-Napoca",46.77,23.59),("Timisoara",45.75,21.23),("Iasi",47.16,27.59)]},
    {"id":"ru","name":"Russie","flag":"🇷🇺","iso":"RU","region":"Europe de l'Est","lat":59.0,"lon":36.0,
     "harm":4,"status":"origine","status_label":"Origine présumée","atteinte_type":"indirecte","proof":"Modéré",
     "operations":"Forum russophone à l'origine du message initial ; hébergement des faux sites.",
     "villes":[("Saint-Petersbourg",59.93,30.34),("Moscou",55.75,37.62),("Voronej",51.67,39.18),("Kazan",55.80,49.10)]},
    {"id":"de","name":"Allemagne","flag":"🇩🇪","iso":"DE","region":"Europe de l'Ouest","lat":51.2,"lon":10.4,
     "harm":3,"status":"amplification","status_label":"Amplification","atteinte_type":"indirecte","proof":"Modéré",
     "operations":"Adaptation du narratif en allemand, pont vers l'espace francophone.",
     "villes":[("Berlin",52.52,13.40),("Munich",48.14,11.58),("Hambourg",53.55,9.99),("Cologne",50.94,6.96)]},
    {"id":"rs","name":"Serbie","flag":"🇷🇸","iso":"RS","region":"Europe du Sud-Est","lat":44.0,"lon":21.0,
     "harm":3,"status":"foyer_relais","status_label":"Relais secondaire","atteinte_type":"indirecte","proof":"Modéré",
     "operations":"Cluster de Belgrade, activé notamment pour le narratif « commande publique ».",
     "villes":[("Belgrade",44.79,20.45),("Novi Sad",45.25,19.83),("Nis",43.32,21.90),("Kragujevac",44.01,20.91)]},
    {"id":"hu","name":"Hongrie","flag":"🇭🇺","iso":"HU","region":"Europe centrale","lat":47.2,"lon":19.5,
     "harm":2,"status":"pont","status_label":"Pont linguistique","atteinte_type":"indirecte","proof":"Faible",
     "operations":"Cluster de Budapest : pont linguistique vers l'allemand.",
     "villes":[("Budapest",47.50,19.04),("Debrecen",47.53,21.63),("Szeged",46.25,20.15),("Miskolc",48.10,20.78)]},
]

PHASES = [
    {"n":"1","nom":"① Amorçage · 14 fév.","couleur":"#6B3FA0",
     "desc":"Premier relais local de l'allégation : le message s'installe dans le pays.",
     "marqueur":"Apparition locale"},
    {"n":"2","nom":"② Montée · 15-20 fév.","couleur":"#2F9E8F",
     "desc":"Reprise et traduction, montée en audience.",
     "marqueur":"Montée en audience"},
    {"n":"3","nom":"③ Bascule · 21 fév-8 mars","couleur":"#E0652C",
     "desc":"Activation des narratifs secondaires (dirigeant, commande publique).",
     "marqueur":"Diversification"},
    {"n":"4","nom":"④ Pic · 15 mars-10 avr.","couleur":"#C8392B",
     "desc":"Pic d'amplification puis extinction.",
     "marqueur":"Pic puis fin"},
]
# Date indicative par phase (jour). On décale l'heure par pays pour un ordre propre.
PHASE_DATE = {"1":"2026-02-14","2":"2026-02-18","3":"2026-02-27","4":"2026-03-20"}
PHASE_LABEL = {"1":"Amorçage","2":"Montée","3":"Bascule","4":"Pic"}
PHASE_CONTENT = {
    "1":"Premier relais local de l'allégation sanitaire sur les produits.",
    "2":"Reprise et traduction du contenu, montée en audience.",
    "3":"Activation d'un second narratif (mise en cause du dirigeant / fausse commande publique).",
    "4":"Pic d'amplification, reprise par des comptes à forte audience, puis extinction.",
}
PLAT = {"1":"forum","2":"telegram","3":"x","4":"x"}

def main():
    pubs, relations = [], []
    reseaux = []
    for ci, c in enumerate(PAYS_DEF):
        root = None                      # racine = amorçage (phase 1) du pays
        cluster_pubs, cluster_comptes = [], []
        seq = 0
        for ph in ["1","2","3","4"]:
            for k in range(PER_PHASE[ph]):
                ville, lat, lon = c["villes"][seq % len(c["villes"])]
                # léger éparpillement autour de la ville pour des nœuds distincts (intra-pays)
                jlat = round(lat + random.uniform(-0.45, 0.45), 4)
                jlon = round(lon + random.uniform(-0.55, 0.55), 4)
                pid = f"{c['id']}_{ph}_{k+1}"
                if root is None: root = pid
                compte = f"@relais_{c['id']}_{seq+1}"
                pubs.append({
                    "id":pid, "compte":compte, "compte_display":f"Relais {ville}",
                    "plateforme":PLAT[ph], "type":"incident", "parent_id":(None if pid==root else root),
                    "niveau_preuve":"Confirmé" if ph in ("1","2") else "Probable",
                    "date":f"{PHASE_DATE[ph]}T{(6+ci):02d}:{(10*k):02d}:00Z", "lang":"fr",
                    "pays":c["iso"], "ville":ville, "lat":jlat, "lon":jlon, "cc":c["id"],
                    "audience_estimee":2000*(int(ph)+k),
                    "content_excerpt":f"{PHASE_LABEL[ph]} — {c['name']} ({ville}). {PHASE_CONTENT[ph]}",
                })
                # 'cible' = arc de propagation. Tous rattachés à l'amorçage du pays : le
                # moteur arbore par phase (nearest phase précédente) → arbre qui s'élargit.
                relations.append({"from":root, "to":pid, "type":"cible", "label":"reprise", "phase":ph})
                cluster_pubs.append(pid); cluster_comptes.append(compte)
                seq += 1
        reseaux.append({
            "id":f"cluster-{c['id']}", "nom":f"Cluster {c['name']}",
            "comptes":cluster_comptes, "publications":cluster_pubs,
            "pays_estime":c["name"], "niveau_confiance":c["proof"],
            "couleur":"#8B5FBF", "notes":f"Chaîne locale {c['name']} : propagation en 4 phases (①→④)."
        })

    n_pub = len(pubs)
    out = {
        "campagne":{
            "id":"demo-lumiere-2026", "nom":"Campagne anti-Société Lumière",
            "client":"Société Lumière (fictif — cas démo anonymisé)", "illustratif":False,
            "secteur":"Cosmétique / Grande consommation",
            "date_debut":"2026-02-14", "date_fin":"2026-04-10",
            "publications_total":n_pub, "comptes_total":n_pub,
            "pays_implique":[c["iso"] for c in PAYS_DEF],
            "resume":("Vague de désinformation coordonnée alléguant la nocivité des produits de "
                      "Société Lumière. Dans chaque pays touché, la campagne se déroule en quatre "
                      "phases — amorçage, montée, bascule, pic — reconstruites par recoupement de "
                      "timestamps et de similarité textuelle. Données fictives, à titre d'illustration."),
            "narratifs":[
                "Allégations sanitaires fabriquées sur les produits (ingrédient toxique inventé)",
                "Mise en cause personnelle d'un dirigeant via faux documents",
                "Lien fabriqué avec une commande publique européenne controversée",
            ],
            "methodologie":("Reconstruction de la chaîne par recoupement timestamp + similarité "
                            "textuelle + traceback des reprises. Géolocalisation par signaux ouverts. "
                            "Inspiration : Viginum, DFRLab, EU DisinfoLab."),
            "niveau_confiance_attribution":"Élevé (clusters relais), Faible (origine exacte).",
        },
        "publications":pubs,
        "patient_zero":"ru_1_1",
        "reseaux":reseaux,
        "relations":relations,
        "phases":PHASES,
        "legende":[
            {"type":"incident","label":"Publication / incident","couleur":"#C94A4A"},
            {"type":"acteur","label":"Acteur / source hostile","couleur":"#8E2A2A"},
        ],
        "legende_arc":"Chaîne de diffusion : chaque flèche relie un message à celui qu'il reprend (couleur = phase).",
        "legende_relations":[{"label":"Reprise / chaîne de diffusion","couleur":"#8B5FBF"}],
        "hero_cells":[
            {"num":str(n_pub),"lbl":"Publications tracées"},
            {"num":str(len(PAYS_DEF)),"lbl":"Pays impliqués"},
            {"num":"4","lbl":"Phases par pays"},
        ],
        "stats":[
            {"lbl":"Publications","val":str(n_pub)},
            {"lbl":"Pays","val":str(len(PAYS_DEF))},
            {"lbl":"Phases","val":"4"},
            {"lbl":"Narratifs","val":"3"},
        ],
        "acteurs":[
            {"display":"Compte source (forum russophone)","orientation":"hostile","role":"Émission du message initial","preuve":"Confirmé"},
            {"display":"Clusters relais (RO/RS/HU)","orientation":"hostile","role":"Relais coordonnés par pays","preuve":"Confirmé"},
            {"display":"Faux médias copie","orientation":"hostile","role":"Articles fabriqués, template commun","preuve":"Confirmé"},
            {"display":"Amplificateurs francophones","orientation":"indéterminé","role":"Reprise et amplification","preuve":"Hypothèse non prouvée"},
        ],
        "victimes":[
            {"type":"marque","nom":"Société Lumière","subtitle":"Cible principale","icon":"building","narratifs":"Allégations sanitaires fabriquées","impact":"Atteinte réputationnelle directe"},
            {"type":"dirigeant","nom":"Direction du groupe","subtitle":"Mise en cause personnelle","icon":"user","narratifs":"Faux documents attribués au dirigeant","impact":"Décrédibilisation"},
            {"type":"employes","nom":"Salariés & marques","subtitle":"Dommage collatéral","icon":"users","narratifs":"Climat de défiance","impact":"Inquiétude interne"},
            {"type":"partenaires","nom":"Distributeurs","subtitle":"Effet d'entraînement","icon":"link","narratifs":"Doute chez les revendeurs","impact":"Questions en rayon"},
            {"type":"indirect","nom":"Secteur cosmétique","subtitle":"Atteinte indirecte","icon":"eye","narratifs":"Défiance généralisée","impact":"Climat sectoriel dégradé"},
        ],
        "pays":[{
            "id":c["id"],"name":c["name"],"flag":c["flag"],"region":c["region"],"iso":c["iso"],
            "subsidiary":"","actors":[],"disinfo":c["harm"],"sentiment":max(1,c["harm"]-1),
            "lever":c["harm"]>=4,"platforms":[],"langs":[],
            "operations":c["operations"],
            "narratives":["Allégations sanitaires","Mise en cause du dirigeant","Commande publique"],
            "incidents":[{"date":PHASE_DATE[ph][:10],"txt":f"{PHASE_LABEL[ph]} — {c['villes'][int(ph)-1][0]}"} for ph in ["1","2","3","4"]],
            "context":c["operations"],"sources":[],"lon":c["lon"],"lat":c["lat"],
            "cible_harm":c["harm"],"cible_status":c["status"],"cible_status_label":c["status_label"],
            "proof":c["proof"],"atteinte_type":c["atteinte_type"],
        } for c in PAYS_DEF],
        "vulnerabilites":[
            {"code":"V1","label":"Forte exposition de la marque en ligne","statut":"Confirmé"},
            {"code":"V2","label":"Réponse tardive aux premières allégations","statut":"Probable / structurel"},
            {"code":"V3","label":"Faux sites copie difficiles à distinguer","statut":"Confirmé"},
        ],
    }
    json.dump(out, open(OUT,"w"), ensure_ascii=False, indent=2)
    print(f"OK -> {OUT} | pays:{len(PAYS_DEF)} pubs:{n_pub} (4/pays, 4 phases) relations:{len(relations)}")

if __name__ == "__main__":
    main()
