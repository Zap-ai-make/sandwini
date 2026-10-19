import { describe, expect, it } from "vitest";

import {
  cheminVentePreparee,
  lireGeste,
  lireVentePreparee,
  OUTILS_QUI_AGISSENT,
  resumeGeste,
  type Geste,
} from "./gestes";
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
    const toutCe = { ecran: "caisse", nom: "Pouytenga", motoId: "m1" };
    for (const nom of OUTILS_QUI_AGISSENT) {
      expect(estRefus(lireGeste(nom, toutCe)), nom).toBe(false);
    }
  });
});

describe("une vente de moto pré-remplie", () => {
  function vente(args: Record<string, unknown>) {
    const lu = geste("preparer_vente_moto", args);
    if (lu.quoi !== "vente") throw new Error("attendu une vente");
    return lu;
  }

  it("retient la moto, le client et le prix", () => {
    expect(vente({ motoId: "m1", clientId: "c1", prixConvenu: 1_200_000 })).toEqual({
      quoi: "vente",
      motoId: "m1",
      clientId: "c1",
      prix: "1200000",
    });
  });

  it("se contente de la moto : une vente se saisit souvent dans cet ordre", () => {
    /* Un formulaire à moitié rempli vaut mieux qu'un formulaire vide, et le
       client peut ne pas exister encore — il se crée à l'écran. */
    expect(vente({ motoId: "m1" })).toMatchObject({ clientId: "", prix: "" });
  });

  it("refuse une vente sans moto plutôt que d'ouvrir un formulaire vide", () => {
    /* Ouvrir la saisie vide ferait croire qu'on a compris la demande. */
    expect(estRefus(lireGeste("preparer_vente_moto", { clientId: "c1" }))).toBe(true);
  });

  it("ignore un prix qui n'en est pas un", () => {
    /* Le modèle rend parfois « un million deux ». Mieux vaut un champ vide
       qu'un montant inventé dans la case qui engage l'argent. */
    for (const mauvais of ["environ 1200000", "1,5", "", null]) {
      expect(vente({ motoId: "m1", prixConvenu: mauvais }).prix).toBe("");
    }
    expect(vente({ motoId: "m1", prixConvenu: "1 200 000" }).prix).toBe("1200000");
  });

  it("dit tout de suite que rien n'est enregistré", () => {
    /* La phrase la plus dangereuse que l'assistant puisse écrire est « c'est
       fait » : ici le formulaire s'ouvre, et personne n'a validé. */
    expect(resumeGeste(vente({ motoId: "m1" }))).toContain("Rien n’est enregistré");
  });
});

describe("l’adresse qui porte la vente pré-remplie", () => {
  it("fait l’aller-retour sans rien perdre", () => {
    const chemin = cheminVentePreparee({
      quoi: "vente",
      motoId: "m1",
      clientId: "c1",
      prix: "1200000",
    });
    const relu = lireVentePreparee(new URLSearchParams(chemin.split("?")[1]));
    expect(relu).toEqual({ motoId: "m1", clientId: "c1", prixConvenu: "1200000" });
  });

  it("ouvre bien la modale, et pas seulement la page", () => {
    /* `?nouvelle=1` est ce qui déclenche la modale depuis S44 : l'oublier
       déposerait quelqu'un sur le registre des ventes sans formulaire. */
    expect(cheminVentePreparee({ quoi: "vente", motoId: "m1", clientId: "", prix: "" })).toContain(
      "nouvelle=1",
    );
  });

  it("ignore ce qui est illisible plutôt que de le reprendre", () => {
    /* Une adresse se bricole à la main : un prix de « abc » ne doit pas
       atterrir dans un champ de montant. */
    const parametres = new URLSearchParams({ nouvelle: "1", moto: "m1", prix: "abc" });
    expect(lireVentePreparee(parametres)).toEqual({ motoId: "m1" });
  });

  it("rend null quand il n’y a rien à pré-remplir", () => {
    /* La modale garde alors sa saisie vide habituelle : le bouton « Nouvelle
       vente » de l'écran ne passe aucun de ces paramètres. */
    expect(lireVentePreparee(new URLSearchParams({ nouvelle: "1" }))).toBe(null);
  });
});
