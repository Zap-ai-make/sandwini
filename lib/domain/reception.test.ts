import { describe, expect, it } from "vitest";
import type { Piece } from "./piece";
import {
  LIGNES_RECEPTION_MAX,
  RECEPTION_VIDE,
  ajouterAReception,
  changerLigneReception,
  dejaDansReception,
  retirerDeReception,
  totalUnitesRecues,
  validerReception,
  type SaisieReception,
} from "./reception";

function piece(partie: Partial<Piece> & { id: string }): Piece {
  return {
    reference: `REF-${partie.id}`,
    designation: "Plaquette de frein avant",
    categorie: "Freinage",
    boutiqueId: "PTG",
    prixAchat: 2000,
    prixVente: 3500,
    seuilAlerte: 5,
    actif: true,
    ...partie,
  };
}

const carte = (...pieces: Piece[]) => new Map(pieces.map((p) => [p.id, p]));

describe("ajouterAReception", () => {
  it("ajoute une ligne, quantité 1, prix d’achat pré-rempli du catalogue", () => {
    const saisie = ajouterAReception(RECEPTION_VIDE, piece({ id: "p1", prixAchat: 2000 }));
    expect(saisie.lignes).toEqual([{ pieceId: "p1", quantite: "1", prixAchat: "2000" }]);
  });

  it("laisse le prix vide quand le catalogue ne le connaît pas", () => {
    const saisie = ajouterAReception(RECEPTION_VIDE, piece({ id: "p1", prixAchat: null }));
    expect(saisie.lignes[0].prixAchat).toBe("");
  });

  it("n’ajoute pas deux fois la même pièce", () => {
    const une = ajouterAReception(RECEPTION_VIDE, piece({ id: "p1" }));
    const deux = ajouterAReception(une, piece({ id: "p1" }));
    expect(deux.lignes).toHaveLength(1);
    expect(dejaDansReception(deux, "p1")).toBe(true);
  });

  it("refuse d’ajouter au-delà du plafond", () => {
    let saisie: SaisieReception = RECEPTION_VIDE;
    for (let i = 0; i < LIGNES_RECEPTION_MAX; i++) {
      saisie = ajouterAReception(saisie, piece({ id: `p${i}` }));
    }
    const pleine = ajouterAReception(saisie, piece({ id: "trop" }));
    expect(pleine.lignes).toHaveLength(LIGNES_RECEPTION_MAX);
  });
});

describe("changerLigneReception et retirerDeReception", () => {
  it("change la quantité d’une ligne sans toucher aux autres", () => {
    const base = ajouterAReception(
      ajouterAReception(RECEPTION_VIDE, piece({ id: "p1" })),
      piece({ id: "p2" }),
    );
    const change = changerLigneReception(base, "p1", { quantite: "12" });
    expect(change.lignes.find((l) => l.pieceId === "p1")?.quantite).toBe("12");
    expect(change.lignes.find((l) => l.pieceId === "p2")?.quantite).toBe("1");
  });

  it("retire une ligne", () => {
    const base = ajouterAReception(RECEPTION_VIDE, piece({ id: "p1" }));
    expect(retirerDeReception(base, "p1").lignes).toHaveLength(0);
  });
});

describe("validerReception", () => {
  const p1 = piece({ id: "p1", reference: "PLQ-0142" });
  const pieces = carte(p1);

  it("refuse un arrivage vide", () => {
    expect(validerReception(RECEPTION_VIDE, pieces)).toMatch(/au moins une pièce/);
  });

  it("accepte une ligne saine", () => {
    const saisie = changerLigneReception(
      ajouterAReception(RECEPTION_VIDE, p1),
      "p1",
      { quantite: "10", prixAchat: "1800" },
    );
    expect(validerReception(saisie, pieces)).toBeNull();
  });

  it("refuse une quantité nulle ou non numérique, en nommant la pièce", () => {
    const zero = changerLigneReception(ajouterAReception(RECEPTION_VIDE, p1), "p1", { quantite: "0" });
    expect(validerReception(zero, pieces)).toContain("PLQ-0142");
    const lettres = changerLigneReception(ajouterAReception(RECEPTION_VIDE, p1), "p1", {
      quantite: "deux",
    });
    expect(validerReception(lettres, pieces)).toContain("PLQ-0142");
  });

  it("accepte un prix d’achat vide (la facture suit)", () => {
    const sansPrix = changerLigneReception(ajouterAReception(RECEPTION_VIDE, p1), "p1", {
      quantite: "5",
      prixAchat: "",
    });
    expect(validerReception(sansPrix, pieces)).toBeNull();
  });

  it("refuse un prix d’achat non numérique", () => {
    const mauvais = changerLigneReception(ajouterAReception(RECEPTION_VIDE, p1), "p1", {
      quantite: "5",
      prixAchat: "cher",
    });
    expect(validerReception(mauvais, pieces)).toContain("prix d’achat");
  });

  it("refuse une pièce absente du catalogue", () => {
    const fantome = ajouterAReception(RECEPTION_VIDE, piece({ id: "inconnue" }));
    expect(validerReception(fantome, pieces)).toMatch(/introuvable/);
  });
});

describe("totalUnitesRecues", () => {
  it("additionne les quantités des lignes", () => {
    const saisie = changerLigneReception(
      changerLigneReception(
        ajouterAReception(ajouterAReception(RECEPTION_VIDE, piece({ id: "p1" })), piece({ id: "p2" })),
        "p1",
        { quantite: "10" },
      ),
      "p2",
      { quantite: "5" },
    );
    expect(totalUnitesRecues(saisie)).toBe(15);
  });
});
