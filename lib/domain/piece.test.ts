import { describe, expect, it } from "vitest";
import {
  FILTRES_PIECES_VIDES,
  MOUVEMENT_VIDE,
  PIECE_VIDE,
  TYPES_MOUVEMENT,
  categoriesEmployees,
  comparerPieces,
  etatStock,
  filtrerPieces,
  normaliserReference,
  quantiteDe,
  referenceDejaPrise,
  stockParPiece,
  validerMouvement,
  validerPiece,
  type MouvementPiece,
  type Piece,
  type SaisieMouvement,
  type SaisiePiece,
  type TypeMouvement,
} from "./piece";

const piece = (partie: Partial<Piece> = {}): Piece => ({
  id: "p1",
  reference: "PLQ-0142",
  designation: "Plaquette de frein avant",
  categorie: "Freinage",
  prixVente: 3_500,
  seuilAlerte: 5,
  actif: true,
  ...partie,
});

const mouvement = (partie: Partial<MouvementPiece> = {}): MouvementPiece => ({
  id: "m1",
  boutiqueId: "PTG",
  pieceId: "p1",
  type: "entree",
  quantite: 10,
  note: "",
  date: new Date("2026-09-01T09:00:00Z"),
  ...partie,
});

const saisie = (partie: Partial<SaisiePiece> = {}): SaisiePiece => ({
  ...PIECE_VIDE,
  reference: "PLQ-0142",
  designation: "Plaquette de frein avant",
  ...partie,
});

const geste = (partie: Partial<SaisieMouvement> = {}): SaisieMouvement => ({
  ...MOUVEMENT_VIDE,
  pieceId: "p1",
  quantite: "10",
  ...partie,
});

describe("quantiteDe — le cœur du lot", () => {
  it("ne compte rien sans mouvement", () => {
    expect(quantiteDe([])).toBe(0);
  });

  it("additionne les entrées et retranche les sorties", () => {
    expect(
      quantiteDe([
        mouvement({ type: "entree", quantite: 40 }),
        mouvement({ type: "sortie_vente", quantite: 3 }),
        mouvement({ type: "sortie_autre", quantite: 2 }),
      ]),
    ).toBe(35);
  });

  it("compte les transferts dans le sens de leur nom", () => {
    expect(
      quantiteDe([
        mouvement({ type: "transfert_entree", quantite: 5 }),
        mouvement({ type: "transfert_sortie", quantite: 2 }),
      ]),
    ).toBe(3);
  });

  /* Le signe vient du type et jamais du document : une quantité négative écrite
     à la main est une faute de frappe qui ne se voit pas, là où un type inconnu
     se refuse (règles + domaine). */
  it("ignore un signe posé sur la quantité : le type seul décide", () => {
    expect(quantiteDe([mouvement({ type: "sortie_vente", quantite: 3 })])).toBe(-3);
  });

  it("rend un négatif tel quel — une entrée annulée après des sorties", () => {
    expect(
      quantiteDe([
        mouvement({ type: "entree", quantite: 2 }),
        mouvement({ type: "sortie_vente", quantite: 5 }),
      ]),
    ).toBe(-3);
  });

  it("chaque type porte un signe : aucun n’est oublié", () => {
    for (const type of TYPES_MOUVEMENT) {
      expect(Math.abs(quantiteDe([mouvement({ type: type as TypeMouvement, quantite: 1 })]))).toBe(1);
    }
  });
});

describe("stockParPiece", () => {
  it("range chaque pièce sous sa propre somme", () => {
    const quantites = stockParPiece([
      mouvement({ pieceId: "p1", type: "entree", quantite: 10 }),
      mouvement({ pieceId: "p2", type: "entree", quantite: 4 }),
      mouvement({ pieceId: "p1", type: "sortie_vente", quantite: 3 }),
    ]);
    expect(quantites.get("p1")).toBe(7);
    expect(quantites.get("p2")).toBe(4);
  });

  it("ne connaît pas une pièce sans mouvement", () => {
    expect(stockParPiece([]).get("p1")).toBeUndefined();
  });
});

describe("etatStock", () => {
  it("nomme l’anomalie plutôt que d’afficher un négatif ordinaire", () => {
    expect(etatStock(-3, 5)).toBe("anomalie");
  });

  it("distingue épuisé, bas et en stock", () => {
    expect(etatStock(0, 5)).toBe("epuise");
    expect(etatStock(5, 5)).toBe("bas");
    expect(etatStock(6, 5)).toBe("en_stock");
  });

  /* Un seuil à zéro veut dire « ne m'alerte pas » : sans ce cas, toute pièce
     épuisée serait aussi « basse », et les deux filtres se recouvriraient. */
  it("un seuil à zéro n’invente pas d’alerte", () => {
    expect(etatStock(1, 0)).toBe("en_stock");
    expect(etatStock(0, 0)).toBe("epuise");
  });
});

describe("normaliserReference", () => {
  it("met en capitales et resserre les espaces", () => {
    expect(normaliserReference("  plq 0142  ")).toBe("PLQ 0142");
  });
});

describe("validerPiece", () => {
  it("accepte une saisie minimale", () => {
    expect(validerPiece(saisie())).toBeNull();
  });

  it("exige une référence et une désignation", () => {
    expect(validerPiece(saisie({ reference: "  " }))).toMatch(/référence/i);
    expect(validerPiece(saisie({ designation: " " }))).toMatch(/désignation/i);
  });

  /* Une référence peut arriver avant qu'on ait décidé de son prix : elle existe
     alors au catalogue et ne se vend pas. */
  it("accepte une pièce sans prix de vente", () => {
    expect(validerPiece(saisie({ prixVente: "" }))).toBeNull();
  });

  it("refuse un prix qui n’est pas un entier", () => {
    expect(validerPiece(saisie({ prixVente: "3 500,50" }))).toMatch(/prix de vente/i);
  });

  it("accepte un seuil vide comme un zéro", () => {
    expect(validerPiece(saisie({ seuilAlerte: "" }))).toBeNull();
  });
});

describe("referenceDejaPrise", () => {
  const catalogue = [piece(), piece({ id: "p2", reference: "CHN-0088" })];

  it("reconnaît la même référence à la casse et aux espaces près", () => {
    expect(referenceDejaPrise("  plq-0142 ", catalogue)?.id).toBe("p1");
  });

  it("ne se signale pas à elle-même quand on corrige", () => {
    expect(referenceDejaPrise("PLQ-0142", catalogue, "p1")).toBeUndefined();
  });

  it("laisse passer une référence neuve", () => {
    expect(referenceDejaPrise("FLT-0001", catalogue)).toBeUndefined();
  });
});

describe("categoriesEmployees", () => {
  it("propose ce qui a déjà servi, une seule fois, trié", () => {
    expect(
      categoriesEmployees([
        piece({ id: "a", categorie: "Freinage" }),
        piece({ id: "b", categorie: "freinage" }),
        piece({ id: "c", categorie: "Transmission" }),
        piece({ id: "d", categorie: "  " }),
      ]),
    ).toEqual(["Freinage", "Transmission"]);
  });
});

describe("filtrerPieces", () => {
  const catalogue = [
    piece({ id: "p1", reference: "PLQ-0142", designation: "Plaquette avant", seuilAlerte: 5 }),
    piece({ id: "p2", reference: "CHN-0088", designation: "Chaîne 428H", seuilAlerte: 2 }),
    piece({ id: "p3", reference: "FLT-0003", designation: "Filtre à air", seuilAlerte: 1 }),
    piece({ id: "p4", reference: "OLD-0001", designation: "Pièce retirée", actif: false }),
  ];
  const quantites = new Map([
    ["p1", 42],
    ["p2", 1],
    ["p3", 0],
  ]);

  it("ne montre jamais une pièce désactivée", () => {
    expect(filtrerPieces(catalogue, quantites, FILTRES_PIECES_VIDES).map((p) => p.id)).toEqual([
      "p1",
      "p2",
      "p3",
    ]);
  });

  it("cherche dans la référence comme dans la désignation", () => {
    const par = (recherche: string) =>
      filtrerPieces(catalogue, quantites, { ...FILTRES_PIECES_VIDES, recherche }).map((p) => p.id);
    expect(par("chn")).toEqual(["p2"]);
    expect(par("chaine")).toEqual(["p2"]);
    expect(par("filtre a air")).toEqual(["p3"]);
  });

  it("filtre sur l’état du stock", () => {
    const par = (stock: "bas" | "epuise") =>
      filtrerPieces(catalogue, quantites, { ...FILTRES_PIECES_VIDES, stock }).map((p) => p.id);
    expect(par("bas")).toEqual(["p2"]);
    expect(par("epuise")).toEqual(["p3"]);
  });

  /* Un stock négatif n'est pas vendable : le ranger sous « épuisé » le rend
     trouvable au moment où il faut le corriger. */
  it("range une anomalie avec les épuisées", () => {
    const avecAnomalie = new Map(quantites).set("p1", -3);
    expect(
      filtrerPieces(catalogue, avecAnomalie, { ...FILTRES_PIECES_VIDES, stock: "epuise" }).map(
        (p) => p.id,
      ),
    ).toEqual(["p1", "p3"]);
  });

  it("filtre par catégorie sans se soucier de la casse", () => {
    const parCategorie = [
      piece({ id: "a", categorie: "Freinage" }),
      piece({ id: "b", categorie: "Transmission" }),
    ];
    expect(
      filtrerPieces(parCategorie, new Map(), { ...FILTRES_PIECES_VIDES, categorie: "freinage" }).map(
        (p) => p.id,
      ),
    ).toEqual(["a"]);
  });
});

describe("comparerPieces", () => {
  it("range par référence, les nombres dans l’ordre des nombres", () => {
    const liste = [
      piece({ id: "a", reference: "PLQ-0010" }),
      piece({ id: "b", reference: "PLQ-0002" }),
      piece({ id: "c", reference: "CHN-0001" }),
    ].sort(comparerPieces);
    expect(liste.map((p) => p.reference)).toEqual(["CHN-0001", "PLQ-0002", "PLQ-0010"]);
  });
});

describe("validerMouvement", () => {
  it("accepte une entrée ordinaire", () => {
    expect(validerMouvement(geste())).toBeNull();
  });

  it("exige une pièce et une quantité utile", () => {
    expect(validerMouvement(geste({ pieceId: "" }))).toMatch(/pièce/i);
    expect(validerMouvement(geste({ quantite: "0" }))).toMatch(/quantité/i);
    expect(validerMouvement(geste({ quantite: "2,5" }))).toMatch(/quantité/i);
  });

  it("refuse un type que la main ne saisit pas", () => {
    expect(validerMouvement(geste({ type: "sortie_vente" }))).toMatch(/ne se saisit pas/i);
  });

  /* « Pas de négatif » est une règle du geste : elle se tient ici, parce
     qu'une règle Firestore ne sait pas additionner une collection et qu'une
     transaction ne marche pas hors ligne. */
  it("refuse de sortir plus que le stock, et dit combien il en reste", () => {
    expect(validerMouvement(geste({ type: "sortie_autre", quantite: "10" }), 4)).toMatch(/que 4/);
  });

  it("sur une pièce absente, propose l’entrée plutôt que de dire non", () => {
    expect(validerMouvement(geste({ type: "sortie_autre", quantite: "1" }), 0)).toMatch(
      /faites d’abord entrer un lot/i,
    );
  });

  it("laisse passer une sortie couverte par le stock", () => {
    expect(validerMouvement(geste({ type: "sortie_autre", quantite: "4" }), 4)).toBeNull();
  });

  it("ne contrôle pas le stock d’une entrée", () => {
    expect(validerMouvement(geste({ type: "entree", quantite: "99" }), 0)).toBeNull();
  });
});
