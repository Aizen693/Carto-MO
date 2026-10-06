/* demo-donnees.js : démonstration publique sur l'interface payante (/carte/), 06/10/2026.
 *
 * La page /demo/ charge EXACTEMENT le moteur de la carte de renseignement
 * (shared/humint-engine.js) avec ses panneaux, jetons et chronologie. Ce module
 * se place devant lui et répond à ses deux lectures de données :
 *   /carte/countries.json      → un manifeste d'une seule zone, celle demandée ;
 *   /demo/donnees-fictives.geojson → des événements FICTIFS générés pour cette zone ;
 *   /carte/regions.geojson     → les secteurs de la zone (nord, sud-est…) à la place des régions réelles.
 * Aucune lecture du corpus HUMINT ni du bucket privé : la démo ne voit que ce qu'elle génère.
 * Zone, acteurs et détection terre/mer : repris de l'ancienne démo (fonction demo-actors).
 */
(function () {
  'use strict';
  var qs = new URLSearchParams(location.search);
  var rawQ = qs.get('q');
  var lon0 = parseFloat(qs.get('lon')), lat0 = parseFloat(qs.get('lat'));
  var label0 = qs.get('label');
  var TOKEN = 'pk.eyJ1IjoiYXo2OTMiLCJhIjoiY21uMGlhY2ZyMGx6bDJycjAxYWZjbWt5eiJ9.SQqOLLgLwWKnUGMztrSArg';

  function norm(s){ return (s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z\s]/g,' ').replace(/\s+/g,' ').trim(); }
  function seedFrom(str){ var h=1779033703; for(var i=0;i<str.length;i++){ h=Math.imul(h^str.charCodeAt(i),3432918353); h=(h<<13)|(h>>>19);} return h>>>0; }
  function rngMake(s){ return function(){ s|=0; s=(s+0x6D2B79F5)|0; var t=Math.imul(s^(s>>>15),1|s); t=(t+Math.imul(t^(t>>>7),61|t))^t; return ((t^(t>>>14))>>>0)/4294967296; }; }

  // ───────────────────── profils d'acteurs par zone ─────────────────────
  var A = function(name,color){ return {name:name,color:color}; };
  var P = function(actors,events){ return {actors:actors,events:events,theme:'generic'}; };
  var SAHEL = P([A("Groupes d'autodéfense (VDP)",'#c9a227'),A('JNIM','#e63946'),A('Milices locales','#d4a017'),A('FAMa / forces nationales','#2e7d32'),A('État islamique au Sahel','#9d0208'),A('Africa Corps (Wagner)','#6c757d')],['Attaque jihadiste','Engin explosif (IED)','Embuscade','Enlèvement','Raid sur village','Mouvement de troupes']);
  var NARCO_CO = P([A('Clan del Golfo','#e63946'),A('Dissidences FARC','#f48c06'),A('ELN','#c1121f'),A('Forces armées','#2e7d32'),A('Police nationale','#1d7ed8')],['Saisie de cocaïne','Affrontement narco','Extorsion','Assassinat ciblé','Laboratoire démantelé','Embuscade']);
  var NARCO_MX = P([A('Cartel de Sinaloa','#e63946'),A('CJNG','#f48c06'),A('Cartel du Golfe','#c1121f'),A('Garde nationale','#2e7d32'),A('Forces fédérales','#1d7ed8')],['Saisie de drogue','Affrontement entre cartels','Disparition','Exécution','Checkpoint','Embuscade']);
  var RDC_EST = P([A('M23','#e63946'),A('ADF','#9d0208'),A('FDLR','#c1121f'),A('FARDC (armée)','#2e7d32'),A('Wazalendo','#8e24aa'),A('MONUSCO','#1d7ed8')],['Affrontement M23','Attaque de village','Déplacement de population','Embuscade','Prise de localité','Pillage minier']);
  var NIGERIA = P([A('Boko Haram','#e63946'),A('ISWAP','#9d0208'),A('Bandits armés','#f48c06'),A('Forces armées','#2e7d32'),A("Milices d'autodéfense",'#8e24aa')],['Attaque','Enlèvement de masse','Raid','Engin explosif','Affrontement','Pillage']);
  var SOMALIE = P([A('Al-Shabaab','#e63946'),A('EI-Somalie','#9d0208'),A('Armée somalienne (SNA)','#2e7d32'),A('ATMIS','#1d7ed8'),A('Milices claniques','#8e24aa')],['Attentat','Engin explosif','Raid','Embuscade','Assassinat ciblé','Mouvement']);
  var SYRIE = P([A('Forces du régime','#c1121f'),A('HTS','#e63946'),A('FDS (kurdes)','#1d7ed8'),A('Daesh','#6c757d'),A('Milices pro-iraniennes','#9d0208'),A('Forces turques','#f48c06')],['Frappe aérienne','Affrontement',"Tir d'artillerie",'Attentat','Mouvement de troupes','Prise de position']);
  var IRAK = P([A('Daesh','#6c757d'),A('PMF / Hashd','#9d0208'),A('Forces irakiennes','#2e7d32'),A('Coalition','#1d7ed8'),A('Milices pro-iraniennes','#e63946')],['Embuscade','Engin explosif','Frappe','Raid antiterroriste','Tir de roquette','Mouvement']);
  var AFGHA = P([A('Taliban','#2e7d32'),A('EI-Khorasan (ISKP)','#e63946'),A('Front de résistance (NRF)','#1d7ed8'),A('Milices locales','#8e24aa')],['Attentat','Affrontement','Engin explosif','Exécution','Raid','Mouvement']);
  var UKRAINE = P([A('Forces ukrainiennes','#1d7ed8'),A('Forces russes','#e63946'),A('Groupe Wagner','#6c757d'),A('Frappes de drones','#f48c06')],['Frappe de missile','Attaque de drone','Combat','Bombardement','Avancée','Contre-offensive']);
  var YEMEN = P([A('Houthis','#e63946'),A('Forces gouvernementales','#2e7d32'),A('Conseil de transition du Sud','#8e24aa'),A('Coalition saoudienne','#1d7ed8'),A('AQPA','#9d0208')],['Frappe','Attaque de drone','Affrontement','Tir de missile','Mouvement','Embuscade']);
  var LIBAN = P([A('Hezbollah','#e63946'),A('Forces israéliennes (FDI)','#1d7ed8'),A('Armée libanaise','#2e7d32'),A('FINUL','#8e24aa')],['Frappe israélienne','Tir de roquette','Affrontement frontalier','Interception','Mouvement','Reconnaissance']);
  var ISR = P([A('Tsahal (FDI)','#1d7ed8'),A('Hamas','#e63946'),A('Jihad islamique','#9d0208'),A('Hezbollah','#c1121f')],['Frappe aérienne','Tir de roquette','Opération terrestre','Affrontement','Interception','Raid']);
  var SOUDAN = P([A('FSR (RSF)','#e63946'),A('Forces armées (SAF)','#2e7d32'),A('Mouvements armés','#8e24aa'),A('Milices','#9d0208')],['Affrontement FSR / armée','Bombardement','Pillage','Déplacement','Prise de ville','Embuscade']);
  var MYANMAR = P([A('Junte (Tatmadaw)','#c1121f'),A('Forces de défense (PDF)','#1d7ed8'),A('Armées ethniques','#e63946'),A('Résistance locale','#8e24aa')],['Frappe aérienne','Affrontement','Raid','Embuscade','Prise de base','Mouvement']);
  var LIBYE = P([A('GNU (Tripoli)','#1d7ed8'),A('ANL (Haftar)','#e63946'),A('Milices','#8e24aa'),A('Mercenaires','#6c757d'),A('Daesh','#9d0208')],['Affrontement de milices','Frappe','Mouvement','Prise de terminal','Embuscade','Tension']);
  var MOZA = P([A('Ansar al-Sunna','#e63946'),A('Forces armées (FADM)','#2e7d32'),A('Force régionale (SAMIM)','#1d7ed8'),A('Rwanda','#8e24aa')],['Attaque jihadiste','Raid','Embuscade','Déplacement','Prise de localité','Incendie']);
  var HAITI = P([A('Gangs (G9)','#e63946'),A('Gangs (G-Pèp)','#9d0208'),A('Police nationale (PNH)','#1d7ed8'),A('Mission MSS','#2e7d32')],['Affrontement de gangs','Enlèvement','Pillage','Barrage','Exécution','Mouvement']);
  var ETHIO = P([A('Forces fédérales (ENDF)','#2e7d32'),A('Fano (Amhara)','#e63946'),A('OLA (Oromo)','#f48c06'),A('Forces tigréennes','#1d7ed8')],['Affrontement','Raid','Embuscade','Massacre','Mouvement','Blocus']);
  var PAKI = P([A('TTP','#e63946'),A('EI-Khorasan','#9d0208'),A('Séparatistes baloutches (BLA)','#f48c06'),A('Forces armées','#2e7d32')],['Attentat','Embuscade','Engin explosif','Raid','Affrontement','Assassinat ciblé']);
  var IRAN = P([A('IRGC (Gardiens)','#c1121f'),A('Jaish al-Adl (baloutches)','#e63946'),A('PJAK (kurdes)','#f48c06'),A('Forces de sécurité','#2e7d32')],['Affrontement','Attentat','Frappe','Répression','Embuscade','Arrestation']);
  var TURKEY = P([A('PKK','#e63946'),A('Forces armées (TSK)','#2e7d32'),A('Daesh','#6c757d'),A('Police','#1d7ed8')],['Affrontement','Frappe','Attentat','Opération transfrontalière','Embuscade','Engin explosif']);
  var INDIA = P([A('Naxalites (maoïstes)','#e63946'),A('Insurgés du Nord-Est','#f48c06'),A('Forces de sécurité','#2e7d32'),A('Police','#1d7ed8')],['Embuscade','Engin explosif','Affrontement','Raid','Attentat','Opération']);
  var BRAZIL = P([A('Comando Vermelho','#e63946'),A('PCC','#9d0208'),A('Milices','#8e24aa'),A('Police militaire','#1d7ed8'),A('Forces armées','#2e7d32')],['Affrontement','Saisie de drogue','Exécution','Opération de police','Trafic','Fusillade']);
  var CAUCASE = P([A('Forces azerbaïdjanaises','#1d7ed8'),A('Forces arméniennes','#e63946'),A('Séparatistes','#8e24aa'),A('Casques bleus','#6c757d')],['Échange de tirs','Frappe','Affrontement','Violation de cessez-le-feu','Mouvement','Embuscade']);
  var GENERIC = P([A('Groupe armé non étatique','#e63946'),A('Insurrection locale','#f48c06'),A('Forces gouvernementales','#2e7d32'),A('Force internationale','#1d7ed8'),A('Milice / faction','#8e24aa'),A('Acteur paramilitaire','#6c757d')],['Affrontement armé','Attaque ciblée','Mouvement de troupes','Tension communautaire','Engin explosif','Prise de localité']);

  // Thème de conflit par profil → vocabulaire des calques adapté au secteur
  SAHEL.theme='jihad'; SOMALIE.theme='jihad'; NIGERIA.theme='jihad'; MOZA.theme='jihad'; AFGHA.theme='jihad'; PAKI.theme='jihad'; IRAK.theme='jihad'; LIBYE.theme='jihad';
  UKRAINE.theme='war'; SYRIE.theme='war'; ISR.theme='war'; LIBAN.theme='war'; YEMEN.theme='war'; CAUCASE.theme='war'; SOUDAN.theme='war'; ETHIO.theme='war';
  NARCO_CO.theme='narco'; NARCO_MX.theme='narco'; BRAZIL.theme='narco';
  HAITI.theme='gang';
  RDC_EST.theme='insurgency'; MYANMAR.theme='insurgency'; INDIA.theme='insurgency'; IRAN.theme='insurgency'; TURKEY.theme='insurgency';

  // Vocabulaire des calques par thème (libellés crédibles selon le type de conflit)
  var VOCAB = {
    war: { flux:['Couloir logistique','Ligne de ravitaillement',"Axe d'évacuation",'Voie de repli'],
           sites:['Centrale électrique','Nœud ferroviaire','Dépôt de munitions','Base aérienne','Pont stratégique'],
           infra:['Route stratégique','Voie ferrée','Pont détruit','Aérodrome','Poste de commandement'],
           pop:['Civils déplacés','Zone évacuée','Abri / refuge','Couloir humanitaire'] },
    jihad: { flux:["Contrebande d'armes",'Route de ravitaillement','Trafic transfrontalier','Migration'],
             sites:['Site aurifère','Marché de bétail',"Point d'eau stratégique","Cache d'armes",'Comptoir'],
             infra:['Piste','Poste-frontière','Axe coupé','Pont','Garnison'],
             pop:['Camp de déplacés','Village abandonné','Zone de retour','Site humanitaire'] },
    narco: { flux:['Narcotrafic',"Trafic d'armes",'Route de la cocaïne','Blanchiment'],
             sites:['Laboratoire clandestin','Piste clandestine','Plantation','Point de transbordement'],
             infra:['Route de contrebande','Port',"Piste d'atterrissage",'Pont','Check-point'],
             pop:['Quartier sous emprise','Zone de déplacement','Communauté menacée'] },
    gang: { flux:["Trafic d'armes",'Extorsion','Contrebande',"Route d'enlèvement"],
            sites:['Base de gang','Marché noir','Péage illégal','Entrepôt'],
            infra:['Axe bloqué','Barrage routier','Port','Pont'],
            pop:['Quartier sous contrôle','Déplacés urbains','Zone assiégée'] },
    insurgency: { flux:['Trafic minier','Contrebande','Route de ravitaillement',"Trafic d'armes"],
                  sites:['Mine de coltan','Site minier','Carrière','Comptoir minier'],
                  infra:['Piste','Axe coupé','Pont','Poste-frontière'],
                  pop:['Camp de déplacés','Village déplacé','Zone de retour'] },
    generic: { flux:["Trafic d'armes",'Contrebande','Route logistique','Migration'],
               sites:['Site stratégique','Ressource contestée','Dépôt','Comptoir'],
               infra:['Axe routier','Poste-frontière','Pont','Aérodrome'],
               pop:['Camp de déplacés','Zone de tension','Site de regroupement'] }
  };
  var FLUX_PALETTE = ['#c62828','#bf360c','#f9a825','#8e24aa','#1565c0','#00897b'];

  var PROFILES = {
    ML:SAHEL,BF:SAHEL,NE:SAHEL,TD:SAHEL,MR:SAHEL,BJ:SAHEL,TG:SAHEL,CI:SAHEL,GH:SAHEL,SN:SAHEL,
    CO:NARCO_CO,MX:NARCO_MX,VE:NARCO_CO,EC:NARCO_CO,BR:BRAZIL,
    CD:RDC_EST,NG:NIGERIA,SO:SOMALIE,ET:ETHIO,MZ:MOZA,SD:SOUDAN,LY:LIBYE,
    SY:SYRIE,IQ:IRAK,YE:YEMEN,LB:LIBAN,IL:ISR,PS:ISR,IR:IRAN,TR:TURKEY,
    AF:AFGHA,PK:PAKI,IN:INDIA,MM:MYANMAR,
    UA:UKRAINE,RU:UKRAINE,AM:CAUCASE,AZ:CAUCASE,GE:CAUCASE,HT:HAITI,
    DEFAULT:GENERIC
  };
  var OVERRIDES = { 'nord kivu':'CD','sud kivu':'CD','kivu':'CD','ituri':'CD','cabo delgado':'MZ',
    'tigre':'ET','amhara':'ET','donbass':'UA','donetsk':'UA','louhansk':'UA','haut karabakh':'CAUCASE','rakhine':'MM','baloutchistan':'PK' };
  var ALIASES = {
    'sahel':{center:[2,16],zoom:5.2,label:'Sahel',pk:'ML'},
    'moyen orient':{center:[44,31],zoom:4.6,label:'Moyen-Orient',pk:'SY'},
    'rdc':{center:[28,-2],zoom:5.4,label:'RDC',pk:'CD'},
    'grands lacs':{center:[29,-2],zoom:5.4,label:'Grands Lacs',pk:'CD'}
  };

  function profileFor(z){
    if (z.pk && PROFILES[z.pk]) return PROFILES[z.pk];
    var ov = OVERRIDES[norm(z.region||'')]; if (ov && PROFILES[ov]) return PROFILES[ov];
    if (z.countryCode && PROFILES[z.countryCode]) return PROFILES[z.countryCode];
    return PROFILES.DEFAULT;
  }

  // ── Profil PRÉCIS par IA (edge function) : acteurs + vocabulaire des calques propres au pays ──
  var FN_BASE = 'https://lwgrjdpuagnvvzmdbyzb.supabase.co/functions/v1';
  function fallbackProfile(z){ var pf = profileFor(z); return { actors:pf.actors, events:pf.events, theme:pf.theme, vocab:null, ai:false }; }
  function normalizeAI(j, z){
    var actors = (j.actors||[]).map(function(a){ return { name:a.name, color:a.color || '#6c757d' }; });
    return {
      actors: actors,
      events: (j.events && j.events.length) ? j.events : profileFor(z).events,
      theme: null,
      vocab: { flux:j.flux||[], sites:j.sites||[], pop:j.population||[], infra:j.infrastructure||[] },
      ai: true
    };
  }
  function resolveProfile(z){
    var key = 'demoai2:' + norm(z.label || rawQ || '');
    try { var c = localStorage.getItem(key); if (c){ var pc = JSON.parse(c); if (pc && pc.actors && pc.actors.length >= 3) return Promise.resolve(pc); } } catch(e){}
    var ctrl, to;
    try { ctrl = new AbortController(); to = setTimeout(function(){ try{ ctrl.abort(); }catch(e){} }, 13000); } catch(e){}
    return fetch(FN_BASE + '/demo-actors', {
      method:'POST', headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ label:z.label, region:z.region, countryCode:z.countryCode }),
      signal: ctrl ? ctrl.signal : undefined
    }).then(function(r){ if(to) clearTimeout(to); return r.ok ? r.json() : null; })
      .then(function(j){
        if (j && Array.isArray(j.actors) && j.actors.length >= 3){
          var prof = normalizeAI(j, z);
          try { localStorage.setItem(key, JSON.stringify(prof)); } catch(e){}
          return prof;
        }
        return fallbackProfile(z);
      })
      .catch(function(){ if(to) clearTimeout(to); return fallbackProfile(z); });
  }

  // ─────────────────────────── géocodage ───────────────────────────
  function geocode(q){
    var a = ALIASES[norm(q)];
    if (a) return Promise.resolve({ center:a.center, bbox:null, label:a.label, zoom:a.zoom, pk:a.pk, region:a.label, countryCode:null });
    var url = 'https://api.mapbox.com/search/geocode/v6/forward?q='+encodeURIComponent(q)+'&limit=1&language=fr&access_token='+TOKEN;
    return fetch(url).then(function(r){return r.json();}).then(function(r){
      var f = r && r.features && r.features[0];
      if (!f) return null;
      var ctx = f.properties.context || {};
      var cc = (ctx.country && ctx.country.country_code) ? ctx.country.country_code.toUpperCase() : null;
      var type = f.properties.feature_type;
      var zoomByType = { country:5.0, region:5.6, district:7, place:9.2, locality:10.8, address:12.5 };
      return { center:f.geometry.coordinates, bbox:f.properties.bbox||null, label:f.properties.name,
        countryCode:cc, region:(ctx.region&&ctx.region.name)||f.properties.name, zoom:zoomByType[type]||6, type:type };
    }).catch(function(){ return null; });
  }

  function spanFor(zone){
    var spanX, spanY;
    if (zone.bbox){ spanX = (zone.bbox[2]-zone.bbox[0])*0.42; spanY = (zone.bbox[3]-zone.bbox[1])*0.42; }
    else { var vp = 360/Math.pow(2, zone.zoom||6); spanX = vp*0.28; spanY = vp*0.18; }
    spanX = Math.min(Math.max(spanX, 0.04), 9);
    spanY = Math.min(Math.max(spanY, 0.03), 6);
    return [spanX, spanY];
  }


  // ─────── couverture premium : code pays -> theatre des 6 cartes ───────
  // Afrique Maritime exclue volontairement (routes/detroits, pas de pays terrestre fiable).
  var PREMIUM_ZONES = {
    // Moyen-Orient
    IQ:{name:'Moyen-Orient', url:'/moyen-orient/'}, SY:{name:'Moyen-Orient', url:'/moyen-orient/'},
    LB:{name:'Moyen-Orient', url:'/moyen-orient/'}, YE:{name:'Moyen-Orient', url:'/moyen-orient/'},
    // Sahel
    ML:{name:'Sahel', url:'/sahel/'}, BF:{name:'Sahel', url:'/sahel/'}, NE:{name:'Sahel', url:'/sahel/'},
    TD:{name:'Sahel', url:'/sahel/'}, MR:{name:'Sahel', url:'/sahel/'},
    // RDC, Grands Lacs
    CD:{name:'RDC, Grands Lacs', url:'/rdc/'}, RW:{name:'RDC, Grands Lacs', url:'/rdc/'},
    BI:{name:'RDC, Grands Lacs', url:'/rdc/'}, UG:{name:'RDC, Grands Lacs', url:'/rdc/'},
    // Madagascar
    MG:{name:'Madagascar', url:'/madagascar/'},
    // Asie du Sud
    IN:{name:'Asie du Sud', url:'/asie-sud/'}, PK:{name:'Asie du Sud', url:'/asie-sud/'},
    AF:{name:'Asie du Sud', url:'/asie-sud/'}
  };
  // Recherche directe d'un nom de theatre (alias) -> meme cible.
  var PREMIUM_BY_LABEL = {
    'sahel':{name:'Sahel', url:'/sahel/'}, 'moyen-orient':{name:'Moyen-Orient', url:'/moyen-orient/'},
    'moyen orient':{name:'Moyen-Orient', url:'/moyen-orient/'}, 'rdc':{name:'RDC, Grands Lacs', url:'/rdc/'},
    'grands lacs':{name:'RDC, Grands Lacs', url:'/rdc/'}, 'madagascar':{name:'Madagascar', url:'/madagascar/'},
    'asie du sud':{name:'Asie du Sud', url:'/asie-sud/'}
  };
  function premiumFor(zone){
    if (!zone) return null;
    var cc = (zone.countryCode || zone.pk || '').toUpperCase();
    if (cc && PREMIUM_ZONES[cc]) return PREMIUM_ZONES[cc];
    var lbl = norm(zone.label || '');
    if (PREMIUM_BY_LABEL[lbl]) return PREMIUM_BY_LABEL[lbl];
    return null;
  }

  function buildOnLandThen(zone, cb){
    var div = document.createElement('div');
    div.style.cssText = 'position:absolute;left:-9999px;top:0;width:900px;height:650px;';
    document.body.appendChild(div);
    var tmp, done=false;
    function cleanup(){ try { tmp && tmp.remove(); } catch(e){} try { div.remove(); } catch(e){} }
    function finish(){
      if (done) return; done=true;
      var onLand;
      try {
        onLand = function(coord){
          try {
            var pp = tmp.project(coord);
            var w = tmp.getCanvas().width, h = tmp.getCanvas().height;
            if (pp.x < 0 || pp.y < 0 || pp.x > w || pp.y > h) return true; // hors écran → indécidable, on garde
            var feats = tmp.queryRenderedFeatures([pp.x, pp.y]);
            return !feats.some(function(f){ return f.sourceLayer === 'water' || (f.layer && /water/i.test(f.layer.id)); });
          } catch(e){ return true; }
        };
      } catch(e){ onLand = function(){ return true; }; }
      cb(onLand, cleanup);
    }
    try {
      // zoom calculé pour que le canvas (900px) couvre TOUTE la zone de génération
      // (sinon les points hors-canvas seraient comptés « terre » par défaut → bug points en mer)
      var sp = spanFor(zone);
      var half = Math.max(sp[0], sp[1]) * 1.5;            // marge autour de l'étendue
      var zoomCover = Math.log(316.4 / half) / Math.LN2;  // 632.8°/2^z = largeur visible sur 900px
      var tmpZoom = Math.max(3.5, Math.min(zone.zoom || 6, zoomCover));
      tmp = new mapboxgl.Map({ container:div, style:'mapbox://styles/mapbox/light-v11',
        center:zone.center, zoom:tmpZoom, interactive:false, attributionControl:false, preserveDrawingBuffer:false });
      tmp.on('idle', finish);
    } catch(e){ finish(); return; }
    setTimeout(finish, 5000); // garde-fou si 'idle' tarde
  }

  /* ───────── Nom de zone : c'est le « pays » vu par le moteur ─────────
   * Le moteur coupe le champ Pays sur « - » (Pays - Localité) et retire virgules et
   * parenthèses : le nom de zone n'en contient donc aucun. Miroir de normalizePays(). */
  var TYPOS = { 'bukrina faso': 'Burkina Faso', 'burkina faso': 'Burkina Faso', 'rdc': 'RDC', 'israel': 'Israël', 'benin': 'Bénin' };
  function nomZone(s) {
    s = String(s || '').replace(/[-,/()]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!s) return 'Sahel';
    if (TYPOS[s.toLowerCase()]) return TYPOS[s.toLowerCase()];
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  var NOM = nomZone(rawQ || qs.get('pays') || label0 || 'Sahel');
  // Le moteur lit ?pays= à son démarrage : on le pose avant lui, sans recharger la page.
  if (qs.get('pays') !== NOM) {
    qs.set('pays', NOM);
    try { history.replaceState(null, '', location.pathname + '?' + qs.toString()); } catch (e) {}
  }
  window.ALGOR_DEMO = { zone: NOM };

  /* ───────── Génération fictive au format du moteur ───────── */
  var JOURS = 180;
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function iso(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function fr(d) { return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear(); }
  var MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

  // Secteur d'un foyer selon sa direction depuis le centre : des repères génériques,
  // jamais de vraie localité, pour qu'aucun incident fictif ne soit attribué à une ville réelle.
  function secteur(h, c, sp) {
    var dx = (h[0] - c[0]) / (sp[0] || 1), dy = (h[1] - c[1]) / (sp[1] || 1);
    if (Math.abs(dx) < 0.15 && Math.abs(dy) < 0.15) return 'Secteur centre';
    var a = Math.atan2(dy, dx) * 180 / Math.PI;
    var noms = ['est', 'nord-est', 'nord', 'nord-ouest', 'ouest', 'sud-ouest', 'sud', 'sud-est'];
    return 'Secteur ' + noms[((Math.round(a / 45) % 8) + 8) % 8];
  }

  function generer(zone, prof, onLand) {
    var rnd = rngMake(seedFrom(norm(NOM)));
    var cx = zone.center[0], cy = zone.center[1], sp = spanFor(zone);
    var hubs = [], nHubs = 6 + (rnd() * 3 | 0);
    if (onLand([cx, cy])) hubs.push([cx, cy]);
    while (hubs.length < nHubs) {
      var h = null;
      for (var t = 0; t < 24; t++) { var cand = [cx + (rnd() * 2 - 1) * sp[0] * 0.62, cy + (rnd() * 2 - 1) * sp[1] * 0.62]; if (onLand(cand)) { h = cand; break; } }
      hubs.push(h || [cx, cy]);
    }
    var csz = Math.min(sp[0], sp[1]) * 0.10;
    function near(h, s) { return [h[0] + (rnd() + rnd() + rnd() - 1.5) * s, h[1] + (rnd() + rnd() + rnd() - 1.5) * s]; }
    function land(h, s) { for (var t = 0; t < 16; t++) { var c = near(h, s); if (onLand(c)) return c; } return h; }
    var actors = prof.actors, events = prof.events;
    function pickActor() { var n = actors.length, total = n * (n + 1) / 2, r = rnd() * total; for (var i = 0; i < n; i++) { if ((r -= (n - i)) <= 0) return actors[i]; } return actors[0]; }

    var auj = new Date(); auj.setHours(0, 0, 0, 0);
    var feats = [];
    // Intensité qui varie d'une semaine à l'autre, comme sur un théâtre réel.
    for (var j = JOURS; j >= 0; j--) {
      var semaine = Math.floor(j / 7), vague = 0.55 + 0.45 * Math.sin(semaine * 0.9 + rnd() * 0.6);
      var n = (rnd() < vague ? 1 : 0) + (rnd() < vague * 0.35 ? 1 : 0);
      if (j <= 6 && n === 0 && rnd() < 0.7) n = 1; // une semaine récente jamais vide (panneau Nouveautés)
      for (var k = 0; k < n; k++) {
        var d = new Date(auj); d.setDate(d.getDate() - j);
        var hi = (rnd() * hubs.length) | 0, hub = hubs[hi], pt = land(hub, csz);
        var act = pickActor(), ev = events[(rnd() * events.length) | 0];
        var vict = Math.floor(Math.pow(rnd(), 2.2) * 40);
        var ajout = new Date(d); ajout.setDate(ajout.getDate() + 1 + (rnd() * 2 | 0));
        var sect = secteur(pt, zone.center, sp);
        feats.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: pt },
          // Même forme que les fiches réelles : champs date / pays / type, récit en description.
          properties: {
            name: act.name, date: fr(d), pays: NOM + ' - ' + sect, type: ev,
            description: 'Le ' + fr(d).slice(0, 5) + ', ' + sect.toLowerCase() + ' : ' + ev.charAt(0).toLowerCase() + ev.slice(1) +
              ' (' + act.name + '), ' + (vict > 0 ? vict + ' victimes' : 'bilan non précisé') + '. Donnée fictive de démonstration.',
            corrobore: rnd() < 0.55,
            added: iso(ajout > auj ? auj : ajout),
          },
        });
      }
    }
    return { type: 'FeatureCollection', features: feats };
  }

  // Régions de la démo = les secteurs, en polygones qui suivent EXACTEMENT la règle de secteur() :
  // un rectangle central puis huit quartiers de 45° (le moteur prend la première région qui contient le point).
  function regions(zone, gj) {
    var c = zone.center, sp = spanFor(zone), R = 1.8, feats = [];
    var vus = {};
    gj.features.forEach(function (f) { vus[f.properties.pays.split(' - ')[1]] = 1; });
    function poly(ring, nom) { ring.push(ring[0]); return { type: 'Feature', properties: { name: nom, pays: NOM }, geometry: { type: 'Polygon', coordinates: [ring] } }; }
    if (vus['Secteur centre']) feats.push(poly([[c[0] - .15 * sp[0], c[1] - .15 * sp[1]], [c[0] + .15 * sp[0], c[1] - .15 * sp[1]], [c[0] + .15 * sp[0], c[1] + .15 * sp[1]], [c[0] - .15 * sp[0], c[1] + .15 * sp[1]]], 'Secteur centre'));
    ['est', 'nord-est', 'nord', 'nord-ouest', 'ouest', 'sud-ouest', 'sud', 'sud-est'].forEach(function (nom, i) {
      if (!vus['Secteur ' + nom]) return;
      var ring = [[c[0], c[1]]];
      for (var t = -22.5; t <= 22.5; t += 4.5) { var a = (i * 45 + t) * Math.PI / 180; ring.push([c[0] + R * Math.cos(a) * sp[0], c[1] + R * Math.sin(a) * sp[1]]); }
      feats.push(poly(ring, 'Secteur ' + nom));
    });
    return { type: 'FeatureCollection', features: feats };
  }

  function manifeste(zone, gj) {
    var mois = {}, types = {}, acts = {};
    gj.features.forEach(function (f) {
      var p = f.properties, m = p.date.split('/');
      mois[m[2] + '-' + m[1]] = MOIS[+m[1] - 1] + ' ' + m[2];
      types[p.type] = 1; acts[p.name] = 1;
    });
    return {
      generated: new Date().toISOString(),
      countries: [{
        name: NOM, zone: 'demo', theatre: 'Démonstration', statut: 'actualise',
        file: '/demo/donnees-fictives.geojson', center: zone.center, zoom: zone.zoom || 6,
        count: gj.features.length, events: Object.keys(types), actors: Object.keys(acts),
        months: Object.keys(mois).sort().map(function (k) { return { key: k, label: mois[k] }; }),
      }],
    };
  }

  /* ───────── Préparation (zone, profil, terre/mer) puis réponse au moteur ───────── */
  var pret = new Promise(function (ok) {
    function demarrer() {
      var p = ALIASES[norm(NOM)] ? geocode(NOM) : (isFinite(lon0) && isFinite(lat0) && !rawQ)
        ? Promise.resolve({ center: [lon0, lat0], bbox: null, label: NOM, zoom: parseFloat(qs.get('z')) || 6, region: NOM, countryCode: null })
        : geocode(NOM);
      p.then(function (zone) {
        if (!zone) { introuvable(); ok({ manifest: { generated: '', countries: [] }, gj: null, regions: null }); return; }
        zone.label = NOM;
        cta(zone);
        // Théâtre déjà décrit à la main (Sahel, RDC, Moyen-Orient…) : ses acteurs rédigés, sans IA
        // (l'IA ressortait des acteurs périmés, ex. Barkhane). IA seulement pour les autres zones.
        var aiP = profileFor(zone) !== PROFILES.DEFAULT ? Promise.resolve(fallbackProfile(zone)) : resolveProfile(zone);
        buildOnLandThen(zone, function (onLand, cleanup) {
          aiP.then(function (prof) {
            var gj = generer(zone, prof, onLand);
            try { cleanup(); } catch (e) {}
            ok({ manifest: manifeste(zone, gj), gj: gj, regions: regions(zone, gj) });
          });
        });
      });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer); else demarrer();
  });

  var _fetch = window.fetch.bind(window);
  function json(o) { return new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } }); }
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var chemin = url.replace(location.origin, '').split('?')[0];
    if (chemin === '/carte/countries.json') return pret.then(function (r) { return json(r.manifest); });
    if (chemin === '/carte/regions.geojson') return pret.then(function (r) { return json(r.regions || { type: 'FeatureCollection', features: [] }); });
    if (chemin === '/demo/donnees-fictives.geojson') return pret.then(function (r) { return json(r.gj || { type: 'FeatureCollection', features: [] }); });
    return _fetch(input, init);
  };

  /* ───────── Habillage démo (hors moteur) ───────── */
  function cta(zone) {
    var a = document.getElementById('demo-cta');
    if (!a) return;
    var prem = premiumFor(zone);
    if (prem) { a.textContent = 'Voir ' + prem.name + ' en données réelles'; a.href = '/offres/'; }
    else { a.textContent = 'Demander une carte sur ' + NOM; a.href = '/contact/'; }
  }
  function introuvable() {
    var el = document.getElementById('demo-introuvable');
    if (!el) return;
    var chips = ['Sahel', 'RDC', 'Liban', 'Ukraine', 'Mexique', 'Somalie'].map(function (z) { return '<a href="?q=' + encodeURIComponent(z) + '">' + z + '</a>'; }).join('');
    el.innerHTML = '<b>Zone introuvable</b><p>« ' + String(NOM).replace(/[<>&"]/g, '') + ' » n\'a pas pu être localisée. Essayez :</p><div class="demo-chips">' + chips + '</div>';
    el.hidden = false;
    document.body.classList.add('demo-vide');
  }
  // Le jeton de statut du moteur annonce « Actualisé chaque semaine » : faux pour une démo.
  function statut() {
    document.querySelectorAll('.chip-statut').forEach(function (c) {
      var v = c.querySelector('.chip-val');
      if (v && v.textContent !== 'Démonstration · données fictives') { v.textContent = 'Démonstration · données fictives'; c.title = 'Événements générés pour illustrer l\'outil. Aucun ne correspond à un fait réel.'; c.classList.add('chip-statut-ref'); }
    });
  }
  // La synthèse Mistral interprète un corpus réel : en démo, elle renvoie vers les offres.
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.ana-ia-btn');
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    var out = b.parentNode.querySelector('.ana-ia-out');
    if (out) out.innerHTML = '<div class="ana-ia-txt"><p>Sur un théâtre suivi, Mistral rédige ici une synthèse à partir des événements réels de la période et des filtres choisis. Elle n\'est pas générée sur les données fictives de la démonstration.</p></div><div class="ana-ia-src"><a href="/offres/">Voir les offres</a></div>';
  }, true);
  document.addEventListener('DOMContentLoaded', function () {
    var bar = document.getElementById('chipbar');
    if (bar && 'MutationObserver' in window) new MutationObserver(statut).observe(bar, { childList: true, subtree: true });
    statut();
  });
})();
