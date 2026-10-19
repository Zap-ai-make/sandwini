import { describe, expect, it } from "vitest";

import { estRefus, lireProposition, resume, type Proposition } from "./propositions";

function proposer(nom: string, args: Record<string, unknown>): Proposition {
  const lue = lireProposition(nom, args);
  if (estRefus(lue)) throw new Error(`refusé : ${lue.erreur}`);
  return lue;
}

describe("une dépense préparée par l’assistant", () => {
  it("retient le montant, le poste et le détail", () => {
    expect(
      proposer("preparer_depense", {
        montant: 15_000,
        poste: "Carburant",
        libelle: "Carburant du groupe",
      }),
    ).toEqual({
      quoi: "depense",
      montant: 15_000,
      poste: "Carburant",
      libelle: "Carburant du groupe",
    });
  });

  it("accepte un montant écrit comme un humain l’écrit", () => {
    /* Le modèle rend tantôt 15000, tantôt « 15 000 », tantôt « 15.000 ». Les
       trois désignent le même billet ; refuser les deux derniers ferait échouer
       une proposition juste pour une question de forme. */
    for (const brut of ["15000", "15 000", "15.000", 15_000]) {
      expect(proposer("preparer_depense", { montant: brut, poste: "Carburant" }).quoi).toBe(
        "depense",
      );
    }
  });

  it("refuse un montant nul, négatif ou décimal", () => {
    for (const mauvais of [0, -5, "1500,50", "beaucoup"]) {
      expect(estRefus(lireProposition("preparer_depense", { montant: mauvais, poste: "X" }))).toBe(
        true,
      );
    }
  });

  it("exige le poste, et le dit au modèle au lieu de deviner", () => {
    /* Sans poste, « combien de carburant ce mois-ci » reste sans réponse — S55.
       Le refus remonte au modèle, qui doit redemander : une carte à moitié
       remplie ferait moins remarquer le trou. */
    const refus = lireProposition("preparer_depense", { montant: 2_000, poste: "  " });
    expect(estRefus(refus)).toBe(true);
    if (!estRefus(refus)) throw new Error("attendu un refus");
    expect(refus.erreur).toMatch(/poste/i);
  });

  it("accepte un détail vide : le poste porte déjà la raison", () => {
    expect(proposer("preparer_depense", { montant: 50_000, poste: "Loyer" })).toMatchObject({
      libelle: "",
    });
  });
});

describe("un mouvement de stock préparé par l’assistant", () => {
  it("retient la pièce, le sens et la quantité", () => {
    expect(
      proposer("preparer_mouvement_piece", {
        pieceId: "p1",
        reference: "NGK-7",
        sens: "entree",
        quantite: "40",
        note: "Caisse reçue",
      }),
    ).toEqual({
      quoi: "mouvement_piece",
      pieceId: "p1",
      reference: "NGK-7",
      sens: "entree",
      quantite: 40,
      note: "Caisse reçue",
    });
  });

  it("n’accepte que les deux sens qu’un humain saisit", () => {
    /* **Et surtout pas `sortie_vente`.** Une sortie de vente naît d'une vente,
       jamais d'une phrase : la proposer ici ferait descendre le stock sans
       aucune recette en face, et le trou ne se verrait qu'à l'inventaire. */
    for (const sens of ["sortie_vente", "transfert_entree", "", "autre"]) {
      expect(
        estRefus(lireProposition("preparer_mouvement_piece", { pieceId: "p1", quantite: 2, sens })),
      ).toBe(true);
    }
    expect(
      proposer("preparer_mouvement_piece", { pieceId: "p1", quantite: 2, sens: "sortie_autre" })
        .quoi,
    ).toBe("mouvement_piece");
  });

  it("refuse une pièce non identifiée", () => {
    const refus = lireProposition("preparer_mouvement_piece", {
      pieceId: "",
      quantite: 2,
      sens: "entree",
    });
    expect(estRefus(refus)).toBe(true);
  });

  it("refuse une quantité nulle ou fractionnaire", () => {
    for (const mauvaise of [0, -3, "2,5", "deux"]) {
      expect(
        estRefus(
          lireProposition("preparer_mouvement_piece", {
            pieceId: "p1",
            sens: "entree",
            quantite: mauvaise,
          }),
        ),
      ).toBe(true);
    }
  });
});

describe("le résumé que l’utilisateur relit avant de valider", () => {
  it("dit le montant et le poste d’une dépense", () => {
    const phrase = resume({
      quoi: "depense",
      montant: 15_000,
      poste: "Carburant",
      libelle: "Groupe",
    });
    expect(phrase).toContain("15000");
    expect(phrase).toContain("Carburant");
    expect(phrase).toContain("Groupe");
  });

  it("distingue une entrée d’une sortie", () => {
    const base = { quoi: "mouvement_piece", pieceId: "p1", reference: "NGK-7", quantite: 40, note: "" } as const;
    expect(resume({ ...base, sens: "entree" })).toMatch(/^Entrée/);
    expect(resume({ ...base, sens: "sortie_autre" })).toMatch(/^Sortie/);
  });
});

describe("un geste que l’assistant inventerait", () => {
  it("est refusé par son nom", () => {
    /* Le modèle peut appeler un outil qui n'existe pas. Mieux vaut un refus
       nommé qu'un `undefined` qui traverse jusqu'à l'écran. */
    expect(estRefus(lireProposition("preparer_vente_moto", { prix: 1_200_000 }))).toBe(true);
  });
});
