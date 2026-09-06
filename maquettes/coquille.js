/* =============================================================================
   SDI — maquettes, phase 1

   Le peu de JavaScript autorisé : montrer une interaction, rien d'autre.
   Aucun framework, aucune requête réseau. Le fichier s'ouvre en double-clic.

   Trois choses seulement :
     1. le jeu d'icônes, injecté une fois par page (voir la note ci-dessous) ;
     2. le basculeur de thème, pour que le client voie le mode sombre ;
     3. les panneaux, onglets et la palette de commandes, pour que les écrans
        se manipulent au lieu de se regarder.

   Pourquoi les icônes viennent d'ici : `<use href="fichier.svg#id">` est
   bloqué en `file://`, et recopier trente symboles en tête de vingt-trois
   fichiers les rendrait illisibles. Les icônes sont décoratives et doublées
   d'un texte partout (DESIGN.md §8) : si ce script ne tourne pas, il ne manque
   qu'un pictogramme, jamais une information.
============================================================================= */

(function () {
  "use strict";

  /* --- 1. Les icônes -------------------------------------------------------
     Tracés au gabarit lucide : 24×24, trait 2, bouts et jointures ronds — la
     bibliothèque déjà installée dans le projet (`lucide-react`), pour que la
     phase 2 n'ait rien à redessiner. */
  var ICONES = {
    supervision: '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
    accueil: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    moto: '<circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/>',
    piece: '<path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
    caisse: '<rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01"/><path d="M18 12h.01"/>',
    reglages: '<path d="M10 5H3"/><path d="M12 19H3"/><path d="M14 3v4"/><path d="M16 17v4"/><path d="M21 12h-9"/><path d="M21 19h-5"/><path d="M21 5h-7"/><path d="M8 10v4"/><path d="M8 12H3"/>',
    stock: '<path d="M22 8.35V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.35A2 2 0 0 1 3.26 6.5l8-3.2a2 2 0 0 1 1.48 0l8 3.2A2 2 0 0 1 22 8.35Z"/><path d="M6 18h12"/><path d="M6 14h12"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    vente: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17.5v-11"/>',
    paiement: '<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/>',
    dossier: '<path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>',
    client: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    boutique: '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/>',
    etiquette: '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r="1.2" fill="currentColor" stroke="none"/>',
    camion: '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
    utilisateur: '<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>',
    prestataire: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M16 13H8"/><path d="M16 17H8"/>',
    chercher: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    bas: '<path d="m6 9 6 6 6-6"/>',
    droite: '<path d="m9 18 6-6-6-6"/>',
    fleche: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    coche: '<path d="M20 6 9 17l-5-5"/>',
    croix: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    horsligne: '<path d="m2 2 20 20"/><path d="M5.78 5.78A7 7 0 0 0 9 19h8.5a4.5 4.5 0 0 0 1.3-.19"/><path d="M21.53 16.5A4.5 4.5 0 0 0 17.5 10h-1.79A7 7 0 0 0 10 5.07"/>',
    envoi: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    alerte: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    cadenas: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    boite: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
    imprimer: '<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/><rect x="6" y="14" width="12" height="8" rx="1"/>',
    sortir: '<path d="m16 17 5-5-5-5"/><path d="M21 12H9"/><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>',
    horloge: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    calendrier: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
    telephone: '<path d="M13.83 16.57a1 1 0 0 0 1.21-.3l.36-.47A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.47.35a1 1 0 0 0-.29 1.23 14 14 0 0 0 6.39 6.39"/>',
    soleil: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
    lune: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    /* Le volet gauche est plein quand la navigation est ouverte, vidé quand
       elle est repliée : le pictogramme dit l'état, pas seulement l'action. */
    plier: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/>'
         + '<rect class="volet" x="4" y="4" width="4" height="16" rx="1.2"'
         + ' fill="currentColor" stroke="none"/>'
  };

  function poseIcones() {
    document.querySelectorAll("[data-icone]").forEach(function (hote) {
      var nom = hote.getAttribute("data-icone");
      /* `hasOwnProperty` et non `ICONES[nom]` : sans cela un nom comme
         « constructor » remonte la chaîne de prototypes et injecte n'importe
         quoi. Ici les noms sont écrits à la main, mais la règle ne coûte rien
         et ce fichier sera relu à la phase 2. */
      if (!Object.prototype.hasOwnProperty.call(ICONES, nom) || hote.firstElementChild) return;
      hote.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
        'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
        ICONES[nom] + "</svg>";
    });
  }

  /* --- 2. Le thème ---------------------------------------------------------
     Hypothèse de la phase 1 : l'application suit le réglage du système, comme
     aujourd'hui. Ce basculeur n'est pas une proposition de réglage
     utilisateur — il existe pour que le client puisse *voir* le mode sombre
     sans changer les préférences de son ordinateur. */
  var cle = "sdi-maquette-theme";
  function appliqueTheme(t) {
    if (t) document.documentElement.setAttribute("data-theme", t);
    else document.documentElement.removeAttribute("data-theme");
    document.querySelectorAll("[data-bascule-theme]").forEach(function (b) {
      var sombre = t === "sombre";
      b.setAttribute("aria-pressed", String(sombre));
      var texte = b.querySelector("[data-bascule-texte]");
      if (texte) texte.textContent = sombre ? "Thème sombre" : "Thème clair";
      var ic = b.querySelector("[data-icone]");
      if (ic) { ic.setAttribute("data-icone", sombre ? "lune" : "soleil"); ic.innerHTML = ""; }
    });
    poseIcones();
  }

  /* --- 3. Le repli de la navigation ----------------------------------------
     La colonne ne disparaît pas, elle se réduit à ses icônes : replier pour
     gagner de la place ne doit pas coûter un niveau de navigation. L'état est
     gardé d'un écran à l'autre, parce qu'un gérant qui replie une fois ne veut
     pas le refaire à chaque page. */
  var cleNav = "sdi-maquette-nav";

  function appliqueNav(repliee) {
    var r = document.documentElement;
    if (repliee) r.setAttribute("data-nav", "repliee");
    else r.removeAttribute("data-nav");

    document.querySelectorAll("[data-plier]").forEach(function (b) {
      b.setAttribute("aria-expanded", String(!repliee));
      b.title = (repliee ? "Déplier" : "Replier") + " la navigation (Ctrl B)";
      var texte = b.querySelector("[data-plier-texte]");
      if (texte) texte.textContent = repliee ? "Déplier la navigation" : "Replier la navigation";
    });
  }

  function basculeNav() {
    var repliee = document.documentElement.getAttribute("data-nav") !== "repliee";
    try { localStorage.setItem(cleNav, repliee ? "repliee" : "depliee"); } catch (err) { /* file:// */ }
    appliqueNav(repliee);
  }

  /* --- 4. Panneaux, onglets, palette --------------------------------------- */
  function ouvrePanneau(id, declencheur) {
    var p = document.getElementById(id);
    if (!p) return;
    p.hidden = false;
    p.setAttribute("data-ouvert-par", declencheur ? declencheur.id || "" : "");
    var premier = p.querySelector("button, a, input, select, [tabindex]");
    if (premier) premier.focus();
  }
  function fermePanneau(p) {
    if (!p || p.hidden) return;
    p.hidden = true;
    var id = p.getAttribute("data-ouvert-par");
    var rendu = id && document.getElementById(id);
    if (rendu) rendu.focus();
  }

  /* Un panneau et une palette gardent le clavier à l'intérieur : sans cela, la
     tabulation part derrière l'overlay et on ne retrouve plus la sortie. */
  function pieges(conteneur, evenement) {
    var cibles = conteneur.querySelectorAll(
      'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (!cibles.length) return;
    var premier = cibles[0], dernier = cibles[cibles.length - 1];
    if (evenement.shiftKey && document.activeElement === premier) {
      dernier.focus(); evenement.preventDefault();
    } else if (!evenement.shiftKey && document.activeElement === dernier) {
      premier.focus(); evenement.preventDefault();
    }
  }

  document.addEventListener("click", function (e) {
    var ouvre = e.target.closest("[data-ouvre]");
    if (ouvre) { e.preventDefault(); ouvrePanneau(ouvre.getAttribute("data-ouvre"), ouvre); return; }

    var ferme = e.target.closest("[data-ferme]");
    if (ferme) { e.preventDefault(); fermePanneau(ferme.closest("[data-panneau]")); return; }

    var bascule = e.target.closest("[data-bascule-theme]");
    if (bascule) {
      var actuel = document.documentElement.getAttribute("data-theme");
      var suivant = actuel === "sombre" ? "clair" : "sombre";
      try { localStorage.setItem(cle, suivant); } catch (err) { /* file:// sans stockage */ }
      appliqueTheme(suivant);
      return;
    }

    if (e.target.closest("[data-plier]")) { basculeNav(); return; }

    /* Le relais du dossier avance d'une étape. Ce n'est pas une démonstration :
       c'est le geste réel de l'écran — « Arrivé au magasin » fait bouger le
       papier d'une case, et l'animation raconte ce déplacement. */
    var avance = e.target.closest("[data-avancer]");
    if (avance) {
      e.preventDefault();
      var relais = document.querySelector(avance.getAttribute("data-avancer"));
      var etape = relais && relais.querySelector('[data-etape="attente"]');
      if (etape) {
        etape.setAttribute("data-etape", "fait");
        etape.setAttribute("data-avance", "");
        var quand = etape.querySelector(".relais-quand");
        if (quand) quand.textContent = avance.getAttribute("data-quand") || "à l’instant";
        var annonce = document.getElementById("annonce");
        var nom = etape.querySelector(".relais-nom");
        if (annonce && nom) annonce.textContent = "Carte grise : " + nom.textContent.toLowerCase() + ".";
        /* L'action accomplie cesse d'être l'action principale, et la suivante
           le devient : sur un écran d'action, un seul bouton doit appeler le
           regard, et ce n'est pas celui qu'on vient d'utiliser. */
        avance.setAttribute("aria-disabled", "true");
        avance.classList.remove("btn-principal");
        var suite = relais.parentElement.querySelector("[data-suite]");
        if (suite) {
          suite.removeAttribute("aria-disabled");
          suite.classList.add("btn-principal");
        }

        /* Le statut du dossier suit le papier. Le laisser sur « en retard »
           alors que le relais dit « revenu aujourd'hui » serait une
           contradiction que le gérant verrait tout de suite. */
        var statut = document.querySelector("[data-etat-dossier]");
        if (statut && nom) {
          statut.className = "pastille pastille-solde";
          statut.textContent = nom.textContent;
        }
      }
      return;
    }

    var onglet = e.target.closest("[data-onglet]");
    if (onglet) {
      e.preventDefault();
      var groupe = onglet.closest("[data-onglets]");
      groupe.querySelectorAll("[data-onglet]").forEach(function (o) {
        var actif = o === onglet;
        o.setAttribute("aria-selected", String(actif));
        var pan = document.getElementById(o.getAttribute("aria-controls"));
        if (pan) pan.hidden = !actif;
      });
      return;
    }
  });

  document.addEventListener("keydown", function (e) {
    var palette = document.getElementById("palette");

    if ((e.key === "k" && (e.ctrlKey || e.metaKey)) ||
        (e.key === "/" && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName))) {
      if (palette) { e.preventDefault(); ouvrePanneau("palette", document.activeElement); }
      return;
    }

    if (e.key === "b" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); basculeNav(); return; }

    if (e.key === "Escape") {
      document.querySelectorAll("[data-panneau]:not([hidden])").forEach(fermePanneau);
      return;
    }

    if (e.key === "Tab") {
      var ouvert = document.querySelector("[data-piege]:not([hidden])");
      if (ouvert) pieges(ouvert, e);
    }
  });

  /* --- Démarrage ------------------------------------------------------------ */
  /* Une maquette qui déclare son thème (les variantes B9) l'impose : elle
     existe pour montrer ce thème-là, quel que soit le réglage de l'ordinateur
     du client ou un basculement fait sur une autre page. */
  /* `demarrage` coupe les transitions le temps de poser l'état initial : sans
     cela, la navigation se replie sous les yeux au chargement de chaque page. */
  document.documentElement.classList.add("demarrage");

  var declare = document.documentElement.getAttribute("data-theme");
  var enregistre = null;
  try { enregistre = localStorage.getItem(cle); } catch (err) { /* file:// sans stockage */ }
  appliqueTheme(declare || enregistre);

  var nav = null;
  try { nav = localStorage.getItem(cleNav); } catch (err) { /* file:// sans stockage */ }
  appliqueNav(document.documentElement.getAttribute("data-nav") === "repliee" || nav === "repliee");

  poseIcones();

  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      document.documentElement.classList.remove("demarrage");
    });
  });
})();
