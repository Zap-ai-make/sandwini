import { describe, expect, it } from "vitest";

import { lireGeste, OUTILS_QUI_AGISSENT, resumeGeste, type Geste } from "./gestes";
import { estRefus } from "./propositions";

function geste(nom: string, args: Record<string, unknown>): Geste {
  const lu = lireGeste(nom, args);
  if (estRefus(lu)) throw new Error(`refusé : ${lu.erreur}`);
  return lu;
}

describe("emmener quelqu’un sur un écran", () => {
  it("retient la destination demandée", () => {
    const lu = geste("aller_a", { ecran: "caisse" });
    expect(lu).toMatchObject({ quoi: "aller" });
    if (lu.quoi !== "aller") throw new Error("attendu un déplacement");
    expect(lu.destination.chemin).toBe("/caisse");
  });

  it("refuse un écran inventé au lieu d’en choisir un voisin", () => {
    /* Emmener quelqu'un sur un écran proche de celui qu'il voulait est pire
       que de ne pas bouger : il croit y être, et lit les mauvais chiffres. */
    const refus = lireGeste("aller_a", { ecran: "tableau_des_marges" });
    expect(estRefus(refus)).toBe(true);
    if (!estRefus(refus)) throw new Error("attendu un refus");
    expect(refus.erreur).toContain("tableau_des_marges");
  });

  it("refuse un écran absent plutôt que de rendre une destination vide", () => {
    expect(estRefus(lireGeste("aller_a", {}))).toBe(true);
  });
});

describe("changer de boutique", () => {
  it("transmet le nom tel qu’il a été prononcé", () => {
    /* Le rapprochement avec la vraie boutique appartient à l'écran : lui seul
       a la liste, et lui seul sait laquelle est ouverte. */
    expect(geste("choisir_la_boutique", { nom: "  Gare routière " })).toEqual({
      quoi: "boutique",
      nom: "Gare routière",
    });
  });

  it("refuse une boutique sans nom", () => {
    for (const vide of ["", "   ", 42, null]) {
      expect(estRefus(lireGeste("choisir_la_boutique", { nom: vide }))).toBe(true);
    }
  });
});

describe("refermer le panneau", () => {
  it("n’a besoin d’aucun argument", () => {
    expect(geste("fermer_l_assistant", {})).toEqual({ quoi: "fermer" });
  });
});

describe("les garde-fous du registre", () => {
  it("refuse un nom de geste que le modèle aurait inventé", () => {
    expect(estRefus(lireGeste("supprimer_la_vente", { id: "v1" }))).toBe(true);
  });

  it("annonce chaque geste en français, jamais par son chemin", () => {
    /* « J'ouvre /motos/ventes?nouvelle=1 » est une adresse, pas une phrase. */
    const phrase = resumeGeste(geste("aller_a", { ecran: "nouvelle_vente" }));
    expect(phrase).not.toContain("/");
    expect(phrase.toLowerCase()).toContain("vente");
  });

  it("déclare exactement les gestes qu’il sait lire", () => {
    /* Un nom présent dans l'ensemble mais absent de `lireGeste` remonterait à
       l'écran comme un geste `undefined`. */
    for (const nom of OUTILS_QUI_AGISSENT) {
      expect(estRefus(lireGeste(nom, { ecran: "caisse", nom: "Pouytenga" }))).toBe(false);
    }
  });
});
