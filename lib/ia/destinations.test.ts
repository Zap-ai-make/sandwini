import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { DESTINATIONS, trouverDestination } from "./destinations";

describe("le catalogue des destinations", () => {
  it("n’envoie que sur des écrans qui existent vraiment", () => {
    /* **Le test qui justifie à lui seul ce fichier.** Une route renommée
       laisserait l'assistant emmener quelqu'un sur une page d'erreur, et rien
       dans la compilation ne le signalerait : un chemin est une chaîne. On va
       donc regarder sur le disque, comme Next le fera.

       Les écrans vivent sous le groupe `(app)`, qui ne compte pas dans
       l'adresse — c'est tout l'objet des parenthèses. */
    for (const destination of DESTINATIONS) {
      const sansQuestion = destination.chemin.split("?")[0];
      const page = `app/(app)${sansQuestion}/page.tsx`;
      expect(existsSync(page), `${destination.cle} → ${page}`).toBe(true);
    }
  });

  it("donne des clés uniques, sinon la seconde serait inatteignable", () => {
    const cles = DESTINATIONS.map((destination) => destination.cle);
    expect(new Set(cles).size).toBe(cles.length);
  });

  it("exige une boutique partout où l’on saisit", () => {
    /* Une saisie a besoin d'une destination. Ouvrir la nouvelle vente depuis
       « toutes les boutiques » poserait un formulaire sans magasin, et l'erreur
       ne se verrait qu'au moment d'enregistrer. */
    for (const cle of ["nouvelle_vente", "faire_entrer_une_moto", "nouvelle_piece"]) {
      expect(trouverDestination(cle)?.exigeBoutique).toBe(true);
    }
    expect(trouverDestination("caisse")?.exigeBoutique).toBeUndefined();
  });

  it("refuse une destination inventée plutôt que d’en choisir une au hasard", () => {
    expect(trouverDestination("tableau_de_bord_des_marges")).toBe(null);
    expect(trouverDestination("")).toBe(null);
  });

  it("retrouve une clé quelle que soit la casse", () => {
    expect(trouverDestination("  Caisse ")?.chemin).toBe("/caisse");
  });
});
