import { describe, expect, it } from "vitest";
import {
  accedeEspace,
  accueilDuRole,
  ecransVisibles,
  espaceDuChemin,
  espacesVisibles,
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
  it("met les huit écrans de l’espace motos à portée, groupés par intention", () => {
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
    expect(new Set(ecrans.map((e) => e.intention))).toEqual(
      new Set(["vendre", "suivre", "administrer"]),
    );
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

  /* `/clients` est un fichier commun (D16) : il vit dans plusieurs espaces à la
     fois. Sans la contrainte des espaces ouverts, un gérant y voyait la colonne
     de la supervision — et un lien que sa propre garde lui aurait refusé.

     Entre les espaces qui restent, on prend le premier de la liste, c'est-à-dire
     celui où la personne atterrit en se connectant : sa journée pour un gérant,
     la supervision pour un responsable. Ce n'est pas le seul choix défendable —
     garder l'espace d'où l'on vient en serait un autre — mais c'est le seul qui
     donne la même réponse quel que soit le chemin parcouru pour arriver là. */
  it("ne déduit jamais un espace fermé à cette personne", () => {
    expect(espaceDuChemin("/clients", espacesVisibles("gerant", ["motos"]))).toBe("accueil");
    expect(espaceDuChemin("/clients", espacesVisibles("responsable", ["motos"]))).toBe(
      "supervision",
    );
    expect(espaceDuChemin("/supervision", espacesVisibles("gerant", ["motos"]))).toBeNull();
  });
});
