import { describe, expect, it } from "vitest";
import {
  ECRANS_DE,
  accedeEspace,
  accueilDuRole,
  ecranCourant,
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
  it("met les huit écrans de l’espace motos à portée, sous les groupes de sa maquette", () => {
    const ecrans = ecransVisibles("motos", "gerant");
    expect(ecrans).toHaveLength(8);
    expect(ecrans.map((e) => e.href)).toEqual(
      expect.arrayContaining([
        "/motos",
        "/motos/nouvelle",
        "/motos/ventes",
        "/motos/ventes/nouvelle",
        "/motos/paiements",
        "/motos/dossiers",
        "/motos/recus",
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
    expect(groupesVisibles("reglages", "responsable").map((g) => g.titre)).toEqual([
      "L’entreprise",
      "Le catalogue",
      "Cet appareil",
    ]);
  });

  /*
   * Un titre de groupe sans entrée sous lui est un rangement qui ment : le
   * gérant n'a droit à aucun écran d'administration, il ne doit pas lire
   * « L'entreprise » suivi de rien.
   */
  it("retire les groupes que les droits ont vidés", () => {
    expect(groupesVisibles("reglages", "gerant").map((g) => g.titre)).toEqual(["Cet appareil"]);
  });

  /*
   * L'accueil du gérant renvoie vers les dossiers et les paiements, qui vivent
   * dans l'espace motos (maquette `a3`, « Ce qui m'attend »). Sans le drapeau
   * `renvoi`, `espaceDuChemin` les attribuerait à l'accueil — qui les mentionne
   * le premier — et le gérant lisant sa file verrait la colonne de son accueil
   * au lieu de celle des motos.
   *
   * Le responsable, lui, n'a pas de renvoi : sa maquette `b2` garde la colonne
   * de supervision en affichant les ventes.
   */
  it("ne laisse pas un renvoi voler l’espace de l’écran qu’il mentionne", () => {
    const gerant = espacesVisibles("gerant", ["motos"]);
    expect(espaceDuChemin("/motos/dossiers", gerant)).toBe("motos");
    expect(ecranCourant("accueil", "gerant", "/motos/dossiers")).toBeNull();

    const responsable = espacesVisibles("responsable", ["motos"]);
    expect(espaceDuChemin("/motos/ventes", responsable)).toBe("supervision");
    expect(ecranCourant("supervision", "responsable", "/motos/ventes")).toBe("/motos/ventes");
  });

  it("cache au gérant les écrans d’administration qu’une garde lui refuserait", () => {
    const hrefs = ecransVisibles("reglages", "gerant").map((e) => e.href);
    expect(hrefs).toEqual(["/diagnostic"]);
    expect(ecransVisibles("reglages", "responsable").length).toBeGreaterThan(6);
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
    expect(ecranCourant("motos", "gerant", "/motos/ventes/nouvelle")).toBe(
      "/motos/ventes/nouvelle",
    );
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

  /*
   * « Synchronisation » n'est pas une administration : elle ne demande aucun
   * droit, elle décrit l'état de l'appareil — ce qui attend ici n'attend pas
   * ailleurs. S29 tranche autrement que S28 : au lieu de l'écarter du hub, on
   * l'y range sous son propre titre, « Cet appareil » (maquette A9). L'écarter
   * la laissait dans la colonne seule, et un écran qu'un hub ne mentionne pas
   * est un écran qu'on croit disparu.
   *
   * Ce qui reste vrai, et que ce test garde : elle n'exige aucune capacité, donc
   * elle ne se range pas avec ce qui en exige une.
   */
  it("rangent la synchronisation à part : une phrase, mais aucun droit exigé", () => {
    const diagnostic = ECRANS_DE.reglages.find(({ href }) => href === "/diagnostic");
    expect(diagnostic?.quoi).toBeTruthy();
    expect(diagnostic?.capacite).toBeUndefined();
  });
});
