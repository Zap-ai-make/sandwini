import { describe, expect, it } from "vitest";
import {
  ECRANS_DE,
  ESPACES,
  accedeEspace,
  accueilDuRole,
  ecranCourant,
  destinationApresPerimetre,
  ecransVisibles,
  espaceDuChemin,
  espacesVisibles,
  groupesVisibles,
} from "./espaces";

describe("espacesVisibles — le gérant", () => {
  it("ne voit que l’espace du métier de sa boutique", () => {
    expect(espacesVisibles("gerant", ["motos"])).toEqual([
      "accueil",
      "motos",
      "cartes_grises",
      "caisse",
      "reglages",
    ]);
    expect(espacesVisibles("gerant", ["pieces"])).toEqual([
      "accueil",
      "pieces",
      "caisse",
      "reglages",
    ]);
  });

  it("voit les deux espaces si sa boutique tient les deux métiers", () => {
    expect(espacesVisibles("gerant", ["motos", "pieces"])).toEqual([
      "accueil",
      "motos",
      "cartes_grises",
      "pieces",
      "caisse",
      "reglages",
    ]);
  });

  it("n’a jamais accès à la supervision", () => {
    expect(espacesVisibles("gerant", ["motos", "pieces"])).not.toContain("supervision");
    expect(accedeEspace("gerant", ["motos", "pieces"], "supervision")).toBe(false);
  });
});

describe("espacesVisibles — le responsable", () => {
  it("ouvre sur la supervision plutôt que sur l’accueil du gérant", () => {
    const espaces = espacesVisibles("responsable", ["motos", "pieces"]);
    expect(espaces[0]).toBe("supervision");
    expect(espaces).not.toContain("accueil");
  });

  it("voit les deux espaces métier quand le périmètre est l’entreprise entière", () => {
    expect(espacesVisibles("responsable", ["motos", "pieces"])).toEqual([
      "supervision",
      "motos",
      "cartes_grises",
      "pieces",
      "caisse",
      "reglages",
    ]);
  });

  it("se restreint au métier de la boutique qu’il a choisie", () => {
    expect(espacesVisibles("responsable", ["pieces"])).toEqual([
      "supervision",
      "pieces",
      "caisse",
      "reglages",
    ]);
  });
});

describe("espacesVisibles — périmètre sans métier", () => {
  /* Pendant le chargement du périmètre, et tant qu’aucune boutique n’existe, on
     ne rend que les espaces dont la réponse est certaine : une entrée qui
     disparaît sous le doigt est pire qu’une barre qui s’allonge. */
  it("ne rend que ce qui ne dépend d’aucune boutique", () => {
    expect(espacesVisibles("gerant", [])).toEqual(["accueil", "caisse", "reglages"]);
    expect(espacesVisibles("responsable", [])).toEqual(["supervision", "caisse", "reglages"]);
  });
});

describe("accedeEspace", () => {
  it("refuse l’espace d’un métier que le périmètre ne porte pas", () => {
    expect(accedeEspace("gerant", ["motos"], "pieces")).toBe(false);
    expect(accedeEspace("responsable", ["motos"], "pieces")).toBe(false);
  });

  it("laisse passer la caisse et les réglages quel que soit le métier", () => {
    for (const role of ["responsable", "gerant"] as const) {
      expect(accedeEspace(role, [], "caisse")).toBe(true);
      expect(accedeEspace(role, [], "reglages")).toBe(true);
    }
  });
});

describe("accueilDuRole", () => {
  it("envoie le responsable à la supervision et le gérant à son accueil", () => {
    expect(accueilDuRole("responsable")).toBe("/supervision");
    expect(accueilDuRole("gerant")).toBe("/dashboard");
  });
});

describe("le second niveau de navigation", () => {
  /* Huit depuis S54 : les reçus n'ont plus d'entrée à eux — ils s'ouvrent
     dans le panneau de l'écran des ventes, d'où ils sortent déjà. Neuf depuis
     S55 : l'Inventaire s'ouvre au gérant. Dix depuis le 26 octobre 2026 : le
     registre des CMC retirés, demandé par le commanditaire. */
  it("met les dix écrans de l’espace motos à portée, sous les groupes de sa maquette", () => {
    const ecrans = ecransVisibles("motos", "gerant");
    expect(ecrans).toHaveLength(10);
    expect(ecrans.map((e) => e.href)).toEqual(
      expect.arrayContaining([
        "/motos",
        "/motos/nouvelle",
        "/motos/arrivages",
        "/motos/ventes",
        "/motos/ventes?nouvelle=1",
        "/motos/paiements",
        "/motos/dossiers",
        "/motos/cmc",
        "/motos/inventaire",
      ]),
    );
    /* Les titres sont ceux de `maquettes/b1-rail-gerant.html`, et non les trois
       intentions globales que le dépôt imposait aux quatre espaces. « Le
       fichier » plutôt qu'« Administrer » : on ne gère pas un client, on le
       retrouve. */
    expect(groupesVisibles("motos", "gerant").map((g) => g.titre)).toEqual([
      "Vendre",
      "Suivre",
      "Le fichier",
    ]);
  });

  /*
   * Chaque espace nomme ses groupes, et deux espaces ne les nomment pas pareil.
   * Sans ce test, réintroduire un jeu de titres commun passerait inaperçu — le
   * rendu resterait plausible, et seule la confrontation aux maquettes le
   * démentirait.
   */
  it("laisse chaque espace nommer ses propres groupes", () => {
    expect(groupesVisibles("supervision", "responsable").map((g) => g.titre)).toEqual([
      "Le commerce",
    ]);
    expect(groupesVisibles("accueil", "gerant").map((g) => g.titre)).toEqual([
      "Ma journée",
      "Ce qui m’attend",
    ]);
    /* Un seul groupe depuis S54 : « Le catalogue » est descendu dans l'espace
       motos, et « Cet appareil » a disparu avec l'écran de synchronisation. */
    expect(groupesVisibles("reglages", "responsable").map((g) => g.titre)).toEqual([
      "L’entreprise",
    ]);
  });

  /*
   * Un titre de groupe sans entrée sous lui est un rangement qui ment : le
   * gérant n'a droit à aucun écran d'administration, il ne doit pas lire
   * « L'entreprise » suivi de rien.
   */
  it("retire les groupes que les droits ont vidés", () => {
    /* Tous les écrans des paramètres exigent un droit que le gérant n'a pas :
       sa colonne « Paramètres » n'a plus aucun groupe, plutôt qu'un titre nu. */
    expect(groupesVisibles("reglages", "gerant")).toEqual([]);
    expect(groupesVisibles("reglages", "responsable").map((g) => g.titre)).toEqual([
      "L’entreprise",
    ]);
  });

  /*
   * L'accueil du gérant renvoie vers les dossiers et les paiements, qui vivent
   * dans l'espace motos (maquette `a3`, « Ce qui m'attend »). Sans le drapeau
   * `renvoi`, `espaceDuChemin` les attribuerait à l'accueil — qui les mentionne
   * le premier — et le gérant lisant sa file verrait la colonne de son accueil
   * au lieu de celle des motos.
   *
   * **Le responsable suit désormais la même règle (S54).** Cette assertion
   * disait auparavant l'inverse — `/motos/ventes` appartenait à la supervision,
   * qui le déclarait en double. C'était le comportement dont le commanditaire
   * s'est plaint : « quand on est dans l'onglet moto et qu'on va dans vente,
   * ça s'ouvre en repartant dans l'onglet supervision. » Le test figeait le
   * défaut ; il fige maintenant la règle, qui ne connaît plus d'exception.
   */
  it("ne laisse pas un renvoi voler l’espace de l’écran qu’il mentionne", () => {
    const gerant = espacesVisibles("gerant", ["motos"]);
    expect(espaceDuChemin("/motos/dossiers", gerant)).toBe("motos");
    expect(ecranCourant("accueil", "gerant", "/motos/dossiers")).toBeNull();

    const responsable = espacesVisibles("responsable", ["motos"]);
    expect(espaceDuChemin("/motos/ventes", responsable)).toBe("motos");
    expect(ecranCourant("supervision", "responsable", "/motos/ventes")).toBeNull();
  });

  it("cache au gérant les écrans d’administration qu’une garde lui refuserait", () => {
    /* Plus rien du tout depuis S54 : les quatre écrans des paramètres
       demandent un droit que le gérant n'a pas, et « Synchronisation » — la
       seule entrée qui lui restait — a été retirée. Le groupe vide disparaît,
       donc l'espace aussi : c'est bien ce qu'on veut dire par « un titre sans
       entrée sous lui est un rangement qui ment ». */
    const hrefs = ecransVisibles("reglages", "gerant").map((e) => e.href);
    expect(hrefs).toEqual([]);
    /* Trois depuis le 26 octobre 2026 : la reprise des cartes grises a quitté
       le menu à la demande du commanditaire. Son écran existe toujours à son
       adresse — une reprise de données qu'on lance une fois n'a pas besoin
       d'une entrée permanente. */
    expect(ecransVisibles("reglages", "responsable").length).toBe(3);
  });

  it("désigne l’écran le plus précis, pas le préfixe le plus court", () => {
    const ouverts = espacesVisibles("gerant", ["motos"]);
    expect(espaceDuChemin("/motos/ventes/nouvelle", ouverts)).toBe("motos");
    expect(espaceDuChemin("/motos", ouverts)).toBe("motos");
  });

  /* `/clients` est un fichier commun (D16), et il n'a plus qu'un seul foyer :
     le groupe « Le fichier » de l'espace motos, où `maquettes/b1` le range —
     et non « Administrer » de trois espaces à la fois, comme le dépôt le
     faisait. Les deux rôles y trouvent donc la même colonne, ce qui est
     précisément ce qu'on veut d'un fichier commun : le même endroit pour tout
     le monde.

     Un périmètre sans métier motos n'a alors aucun espace qui le revendique.
     Ce n'est pas un trou : `NavigationPrincipale` retombe sur le premier
     espace ouvert, celui où la personne atterrit en se connectant. */
  it("ne déduit jamais un espace fermé à cette personne", () => {
    expect(espaceDuChemin("/clients", espacesVisibles("gerant", ["motos"]))).toBe("motos");
    expect(espaceDuChemin("/clients", espacesVisibles("responsable", ["motos"]))).toBe("motos");
    expect(espaceDuChemin("/clients", espacesVisibles("responsable", ["pieces"]))).toBeNull();
    expect(espaceDuChemin("/supervision", espacesVisibles("gerant", ["motos"]))).toBeNull();
  });
});

describe("ecranCourant", () => {
  /* Deux entrées allumées, c'est zéro repère : `/motos/dossiers` commence par
     `/motos`, et « Stock motos » se croyait courante en même temps que
     « Dossiers en attente ». Vu sur une capture, pas déduit. */
  it("n’allume qu’une entrée, la plus précise", () => {
    expect(ecranCourant("motos", "gerant", "/motos/dossiers")).toBe("/motos/dossiers");
    expect(ecranCourant("motos", "gerant", "/motos")).toBe("/motos");
  });

  /* Depuis S44, l'ancienne adresse de la vente n'est plus qu'une redirection, et
     « Nouvelle vente » un renvoi vers `/motos/ventes`. La colonne allume donc
     « Ventes » des deux côtés du renvoi : pendant la redirection, et une fois la
     modale ouverte. Deux chemins, un seul repère — c'est la règle de ce test. */
  it("allume « Ventes » quand la vente s’ouvre, quel que soit le chemin", () => {
    expect(ecranCourant("motos", "gerant", "/motos/ventes/nouvelle")).toBe("/motos/ventes");
    expect(ecranCourant("motos", "gerant", "/motos/ventes")).toBe("/motos/ventes");
  });

  it("n’allume rien quand le chemin ne fait partie d’aucun écran de l’espace", () => {
    expect(ecranCourant("motos", "gerant", "/parametres/boutiques")).toBeNull();
  });

  it("n’allume pas un écran que la personne ne peut pas ouvrir", () => {
    expect(ecranCourant("reglages", "gerant", "/parametres/utilisateurs")).toBeNull();
    expect(ecranCourant("reglages", "responsable", "/parametres/utilisateurs")).toBe(
      "/parametres/utilisateurs",
    );
  });
});

/**
 * Le hub des réglages lit `ECRANS_DE.reglages` et n'affiche que les entrées qui
 * portent une phrase (`app/(app)/parametres/page.tsx`). Sans ce test, un écran
 * d'administration ajouté à la colonne disparaîtrait silencieusement du hub —
 * une seule des deux listes s'ouvrirait dessus, et la panne serait invisible
 * jusqu'à ce que quelqu'un cherche l'écran là où il l'attend.
 */
describe("les écrans d’administration", () => {
  it("expliquent tous ce qu’on y fait", () => {
    const administration = ECRANS_DE.reglages.filter(({ capacite }) => capacite);
    expect(administration.length).toBeGreaterThan(0);
    for (const ecran of administration) {
      expect(ecran.quoi, ecran.href).toBeTruthy();
    }
  });

});

/**
 * La plaque jaune pilote l'interface.
 *
 * Le modèle savait déjà quels métiers porte le périmètre — c'est ce qui filtre
 * le rail depuis D62. Ce que ces tests ajoutent, c'est que **la colonne le
 * sache aussi**, et que choisir une boutique fasse descendre le responsable
 * dans son espace au lieu de le laisser au-dessus.
 */
describe("le périmètre pilote la navigation", () => {
  it("un responsable qui choisit une boutique prend le rail de son gérant", () => {
    expect(espacesVisibles("responsable", ["motos"], "boutique")).toEqual([
      "accueil",
      "motos",
      "cartes_grises",
      "caisse",
      "reglages",
    ]);
  });

  it("une boutique de pièces ne lui ouvre aucun espace motos", () => {
    expect(espacesVisibles("responsable", ["pieces"], "boutique")).toEqual([
      "accueil",
      "pieces",
      "caisse",
      "reglages",
    ]);
  });

  it("et il retrouve la supervision en revenant à toutes les boutiques", () => {
    expect(espacesVisibles("responsable", ["motos", "pieces"], "toutes")).toEqual([
      "supervision",
      "motos",
      "cartes_grises",
      "pieces",
      "caisse",
      "reglages",
    ]);
  });

  /* Le gérant n'a jamais eu la supervision : son rail ne doit pas bouger d'un
     cran, quel que soit ce qu'on passe en périmètre. */
  it("ne change rien pour le gérant", () => {
    expect(espacesVisibles("gerant", ["motos"], "boutique")).toEqual(
      espacesVisibles("gerant", ["motos"], "toutes"),
    );
  });
});

/**
 * S54 — la supervision ne porte plus le travail des boutiques.
 *
 * Le commanditaire : « dans la supervision, vente et paiement chacun des deux
 * doit être rattaché aux onglets moto et pièce, ça devrait pas être accessible
 * depuis supervision. »
 */
describe("la supervision ne porte que la vue d’ensemble", () => {
  it("n’offre plus les ventes, les paiements ni les dossiers", () => {
    const hrefs = ecransVisibles("supervision", "responsable").map((e) => e.href);
    expect(hrefs).toEqual(["/supervision"]);
  });

  /*
   * Le doublon n'était pas qu'un encombrement : il décidait mal.
   * `espaceDuChemin` départage par la longueur du chemin, et `/motos/ventes`
   * déclaré des deux côtés donnait deux longueurs égales — le premier espace
   * de la liste gagnait, donc la supervision. Ouvrir les ventes depuis
   * l'espace motos ramenait la colonne de la supervision, ce que le
   * commanditaire a vu avant nous.
   */
  it("laisse les ventes à l’espace motos, même pour un responsable qui surveille", () => {
    const ouverts = espacesVisibles("responsable", ["motos"], "toutes");
    expect(ouverts[0]).toBe("supervision");
    expect(espaceDuChemin("/motos/ventes", ouverts)).toBe("motos");
    expect(espaceDuChemin("/motos/paiements", ouverts)).toBe("motos");
    expect(espaceDuChemin("/motos/dossiers", ouverts)).toBe("motos");
  });
});

/**
 * S54 — ce qui exige une boutique ne s'affiche pas sans boutique.
 *
 * Le commanditaire : « quand on est dans l'espace toutes les boutiques,
 * supprime tout ce qui n'est pas faisable depuis cet espace, tout ce qu'il
 * faut forcément passer par une boutique. »
 */
describe("la portée du périmètre filtre les gestes", () => {
  it("retire les gestes qui réclament une boutique sur « toutes les boutiques »", () => {
    const hrefs = ecransVisibles("motos", "responsable", "toutes").map((e) => e.href);
    expect(hrefs).not.toContain("/motos/nouvelle");
    expect(hrefs).not.toContain("/motos/ventes?nouvelle=1");
    /* Ce qui se consulte reste : on peut regarder le stock des trois
       boutiques sans en choisir une. */
    expect(hrefs).toContain("/motos");
    expect(hrefs).toContain("/motos/ventes");
  });

  it("les rend dès qu’une boutique est choisie", () => {
    const hrefs = ecransVisibles("motos", "responsable", "boutique").map((e) => e.href);
    expect(hrefs).toContain("/motos/nouvelle");
    expect(hrefs).toContain("/motos/ventes?nouvelle=1");
  });

  /* Le groupe « Vendre » n'a que ces deux entrées : vidé, il doit disparaître
     plutôt que laisser un titre suivi de rien. Même règle que pour les droits. */
  it("fait disparaître le groupe « Vendre », vidé par la portée", () => {
    expect(groupesVisibles("motos", "responsable", "toutes").map((g) => g.titre)).not.toContain(
      "Vendre",
    );
    expect(groupesVisibles("motos", "responsable", "boutique").map((g) => g.titre)).toContain(
      "Vendre",
    );
  });

  /* Le gérant est toujours dans sa boutique : ce filtre ne doit jamais lui
     retirer le geste principal de sa journée. */
  it("ne retire rien au gérant, qui a toujours une boutique", () => {
    const hrefs = ecransVisibles("motos", "gerant").map((e) => e.href);
    expect(hrefs).toContain("/motos/nouvelle");
    expect(hrefs).toContain("/motos/ventes?nouvelle=1");
  });
});

describe("les écrans réservés descendent dans l’espace motos", () => {
  it("le responsable y trouve le prix d’achat et les chiffres", () => {
    const hrefs = ecransVisibles("motos", "responsable").map((e) => e.href);
    expect(hrefs).toContain("/motos/inventaire");
  });

  /**
   * **L'Inventaire a changé de camp en S55, et ce témoin le fige.**
   *
   * Il affirmait l'inverse : le gérant ne devait pas voir l'Inventaire.
   * La demande du commanditaire l'a renversé — « l'inventaire doit se faire à
   * deux niveaux, pour chaque gérant et pour le superviseur qui agrège tout ».
   * Un gérant range les motos dans la cour ; lui cacher ce qu'il détient et
   * depuis quand privait d'information la seule personne en mesure d'agir
   * dessus le jour même.
   *
   * **Ce qui reste fermé le reste**, et c'est ce que vérifie la seconde
   * moitié : les référentiels du catalogue demandent toujours
   * `gerer_referentiels`, donc le groupe « Réservé au responsable » n'apparaît
   * pas chez le gérant. La garde d'affichage ne décide toujours de rien — les
   * règles Firestore restent seules juges (D27) et les coûts vivent en
   * sous-collection `prive/` (D2). Ce test dit seulement que la colonne ne
   * propose aucune porte qui claquerait au nez.
   */
  it("le gérant voit l’inventaire, mais pas les référentiels du responsable", () => {
    const hrefs = ecransVisibles("motos", "gerant").map((e) => e.href);
    expect(hrefs).toContain("/motos/inventaire");
    expect(hrefs).not.toContain("/parametres/catalogue");
    expect(hrefs).not.toContain("/parametres/referentiels");
    expect(groupesVisibles("motos", "gerant").map((g) => g.titre)).toEqual([
      "Vendre",
      "Suivre",
      "Le fichier",
    ]);
  });

  it("et la supervision ne les porte plus en double", () => {
    const hrefs = ecransVisibles("supervision", "responsable").map((e) => e.href);
    expect(hrefs).toEqual(["/supervision"]);
  });
});

/**
 * Où l'on atterrit quand la plaque change d'avis.
 *
 * Sans cette règle, choisir une boutique depuis la vue d'ensemble laissait un
 * état bancal : l'écran de supervision restait ouvert alors que son entrée
 * venait de quitter le rail. On ne peut pas revenir là où l'on est.
 */
describe("la destination après un changement de périmètre", () => {
  it("quitte la supervision pour l’accueil de la boutique choisie", () => {
    expect(destinationApresPerimetre("/supervision", "responsable", "boutique")).toBe("/dashboard");
  });

  /* L'Inventaire a longtemps porté `/supervision/chiffres` tout en vivant dans
     l'espace motos, ce qui obligeait à l'excepter de cette règle. Depuis S55 il
     s'appelle `/motos/inventaire` et l'exception a disparu — mais le témoin
     reste : c'est en mode boutique que cet écran sert le plus, et l'en chasser
     fermerait celui qu'on vient d'ouvrir. */
  it("ne chasse pas l’inventaire, qui sert surtout en mode boutique", () => {
    expect(destinationApresPerimetre("/motos/inventaire", "responsable", "boutique")).toBeNull();
    expect(destinationApresPerimetre("/parametres/catalogue", "responsable", "boutique")).toBeNull();
  });

  it("ramène à la supervision quand on revient à toutes les boutiques", () => {
    expect(destinationApresPerimetre("/dashboard", "responsable", "toutes")).toBe("/supervision");
  });

  it("laisse tranquille un écran qui existe des deux côtés", () => {
    expect(destinationApresPerimetre("/motos/ventes", "responsable", "boutique")).toBeNull();
    expect(destinationApresPerimetre("/motos/ventes", "responsable", "toutes")).toBeNull();
  });

  /* Le gérant ne choisit pas son périmètre : la question ne se pose pas, et une
     redirection le renverrait d'un écran légitime. */
  it("ne déplace jamais un gérant", () => {
    expect(destinationApresPerimetre("/dashboard", "gerant", "boutique")).toBeNull();
    expect(destinationApresPerimetre("/supervision", "gerant", "toutes")).toBeNull();
  });
});

/**
 * L'espace des prestataires (20 octobre 2026, demande du client).
 *
 * Il vivait dans les paramètres, derrière `gerer_referentiels`. Le client n'en
 * voulait plus : « il ne veut pas que ça soit logé dans les paramètres ». Ce
 * n'est pas un rangement malheureux, c'est une erreur de nature — on ne règle
 * pas un prestataire une fois pour toutes, on lui confie des cartes grises
 * toutes les semaines, et c'est un geste de comptoir.
 *
 * **Il porte le métier motos**, sur le même axe que l'espace du même nom : une
 * boutique de pièces n'a pas de carte grise à confier, et lui montrer l'entrée
 * serait promettre un écran sans emploi.
 */
describe("l’espace des cartes grises", () => {
  it("suit les motos dans le rail, et seulement là où l’on en vend", () => {
    expect(espacesVisibles("gerant", ["motos"])).toContain("cartes_grises");
    expect(espacesVisibles("gerant", ["pieces"])).not.toContain("cartes_grises");
    expect(accedeEspace("gerant", ["pieces"], "cartes_grises")).toBe(false);
  });

  it("s’ouvre au gérant, qui est celui qui confie les cartes", () => {
    /* La page était fermée au gérant tant qu'elle vivait dans les paramètres.
       Or c'est lui qui tend le paquet au prestataire — il le fait déjà depuis
       l'écran des dossiers. Ce qui reste au responsable vit DANS l'écran :
       créer, renommer, retirer un prestataire. */
    expect(accedeEspace("gerant", ["motos"], "cartes_grises")).toBe(true);
    expect(groupesVisibles("cartes_grises", "gerant").length).toBeGreaterThan(0);
  });

  it("a quitté les paramètres, et n’y a pas laissé de double", () => {
    /* Deux entrées pour un écran, c'est deux endroits où le chercher et un
       `espaceDuChemin` qui doit départager. */
    expect(ECRANS_DE.reglages.map((e) => e.href)).not.toContain("/prestataires");
    expect(ECRANS_DE.reglages.map((e) => e.href)).not.toContain("/parametres/prestataires");
  });

  it("revendique son chemin plutôt que de le laisser aux paramètres", () => {
    const ouverts = espacesVisibles("gerant", ["motos"]);
    expect(espaceDuChemin("/prestataires", ouverts)).toBe("cartes_grises");
    expect(ecranCourant("cartes_grises", "gerant", "/prestataires")).toBe("/prestataires");
  });

  it("atterrit sur les dossiers, pas sur le répertoire des prestataires", () => {
    /* Celle qui ne fait que les cartes grises travaille sur des papiers. Ouvrir
       son espace sur une liste de noms lui aurait demandé un clic de plus à
       chaque fois pour atteindre la seule chose qu'elle vient faire (S59). */
    expect(ESPACES.cartes_grises.href).toBe("/cartes-grises");
  });

  it("porte les deux écrans de la spec, et rien d’autre", () => {
    const ouverts = espacesVisibles("gerant", ["cartes_grises"]);
    expect(ECRANS_DE.cartes_grises.map((ecran) => ecran.href)).toEqual([
      "/cartes-grises",
      "/prestataires",
    ]);
    expect(espaceDuChemin("/cartes-grises", ouverts)).toBe("cartes_grises");
    expect(ecranCourant("cartes_grises", "gerant", "/cartes-grises")).toBe("/cartes-grises");
  });
});
