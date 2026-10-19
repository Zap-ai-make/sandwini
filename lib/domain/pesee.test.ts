import { describe, expect, it } from "vitest";
import type { Moto } from "./moto";
import { PESEE_VIDE, additionnerPesees, peserBoutiques, type SourcesPesee } from "./pesee";
import type { MouvementPiece, Piece } from "./piece";
import type { Vente } from "./vente";
import type { VentePiece } from "./vente-piece";

const MAINTENANT = new Date(2026, 8, 18);
const CE_MOIS = new Date(2026, 8, 5);
const LE_MOIS_DERNIER = new Date(2026, 7, 25);

const moto = (partie: Partial<Moto> = {}): Moto =>
  ({ id: "m1", boutiqueId: "SDO", statut: "en_stock", ...partie }) as Moto;

const vente = (partie: Partial<Vente> = {}): Vente =>
  ({ id: "v1", boutiqueId: "SDO", date: CE_MOIS, resteDu: 0, ...partie }) as Vente;

const ventePiece = (partie: Partial<VentePiece> = {}): VentePiece =>
  ({ id: "vp1", boutiqueId: "BCA", date: CE_MOIS, total: 0, lignes: [], ...partie }) as VentePiece;

/* Une ligne vendue : `prixAchatUnitaire` a `null` veut dire « cout inconnu »,
   et la marge de la vente le reste aussi. */
const ligneVendue = (prixUnitaire: number, prixAchatUnitaire: number | null, quantite = 1) => ({
  pieceId: "p1",
  reference: "REF",
  designation: "Piece",
  quantite,
  prixUnitaire,
  prixAchatUnitaire,
  total: quantite * prixUnitaire,
});

const piece = (partie: Partial<Piece> = {}): Piece =>
  ({ id: "p1", actif: true, seuilAlerte: 2, ...partie }) as Piece;

const mouvement = (partie: Partial<MouvementPiece> = {}): MouvementPiece =>
  ({
    id: "mv1",
    boutiqueId: "BCA",
    pieceId: "p1",
    type: "entree",
    quantite: 10,
    note: "",
    date: CE_MOIS,
    ...partie,
  }) as MouvementPiece;

/** Rien de lu : c'est l'état d'ouverture de l'écran. */
const RIEN: SourcesPesee = {
  ventes: null,
  stock: null,
  ventesPieces: null,
  catalogue: null,
  mouvements: null,
};

describe("peserBoutiques — les motos", () => {
  it("ne compte en stock que ce qui peut encore se vendre", () => {
    const pesee = peserBoutiques(
      {
        ...RIEN,
        stock: [
          moto({ id: "a" }),
          moto({ id: "b" }),
          moto({ id: "c", statut: "vendue" }),
          moto({ id: "d", statut: "reservee" }),
        ],
      },
      MAINTENANT,
    );
    expect(pesee.get("SDO")?.motos.enStock).toBe(2);
  });

  /* « Reste dû » est un encours, pas un flux : il porte sur toutes les ventes,
     alors que le comptage porte sur le mois. */
  it("compte les ventes du mois, mais somme le reste dû de toujours", () => {
    const pesee = peserBoutiques(
      {
        ...RIEN,
        ventes: [
          vente({ id: "a", date: CE_MOIS, resteDu: 100_000 }),
          vente({ id: "b", date: LE_MOIS_DERNIER, resteDu: 400_000 }),
          vente({ id: "c", date: null, resteDu: 0 }),
        ],
      },
      MAINTENANT,
    );
    expect(pesee.get("SDO")?.motos.ventesDuMois).toBe(1);
    expect(pesee.get("SDO")?.motos.resteDu).toBe(500_000);
  });

  it("sépare les boutiques", () => {
    const pesee = peserBoutiques(
      { ...RIEN, ventes: [vente({ boutiqueId: "SDO" }), vente({ id: "v2", boutiqueId: "ABC" })] },
      MAINTENANT,
    );
    expect(pesee.get("SDO")?.motos.ventesDuMois).toBe(1);
    expect(pesee.get("ABC")?.motos.ventesDuMois).toBe(1);
  });
});

describe("peserBoutiques — les pièces", () => {
  it("compte les ventes du mois et leur recette, pas celles d’avant", () => {
    const pesee = peserBoutiques(
      {
        ...RIEN,
        ventesPieces: [
          ventePiece({ id: "a", total: 15_000 }),
          ventePiece({ id: "b", total: 20_000 }),
          ventePiece({ id: "c", total: 99_000, date: LE_MOIS_DERNIER }),
        ],
      },
      MAINTENANT,
    );
    expect(pesee.get("BCA")?.pieces.ventesDuMois).toBe(2);
    expect(pesee.get("BCA")?.pieces.recetteDuMois).toBe(35_000);
  });

  it("la marge du mois suit les lignes vendues, et ignore le mois dernier", () => {
    const pesee = peserBoutiques(
      {
        ...RIEN,
        ventesPieces: [
          ventePiece({ id: "a", total: 10_000, lignes: [ligneVendue(10_000, 6_000)] }),
          ventePiece({ id: "b", total: 4_000, lignes: [ligneVendue(2_000, 1_500, 2)] }),
          ventePiece({
            id: "c",
            total: 99_000,
            date: LE_MOIS_DERNIER,
            lignes: [ligneVendue(99_000, 1)],
          }),
        ],
      },
      MAINTENANT,
    );
    expect(pesee.get("BCA")?.pieces.margeDuMois).toBe(5_000);
  });

  it("rend une marge inconnue quand aucune piece vendue ne porte son cout", () => {
    /* Le cas d'une boutique qui n'a pas encore saisi ses prix d'achat : l'ecran
       doit pouvoir ecrire un tiret, et non un zero qui se lirait « rien
       gagne ». */
    const pesee = peserBoutiques(
      {
        ...RIEN,
        ventesPieces: [ventePiece({ total: 10_000, lignes: [ligneVendue(10_000, null)] })],
      },
      MAINTENANT,
    );
    expect(pesee.get("BCA")?.pieces.margeDuMois).toBeNull();
  });

  it("une vente de pièces ne touche jamais les chiffres motos", () => {
    const pesee = peserBoutiques(
      { ...RIEN, ventesPieces: [ventePiece({ total: 15_000 })] },
      MAINTENANT,
    );
    expect(pesee.get("BCA")?.motos).toEqual(PESEE_VIDE.motos);
  });

  it("compte une référence vendable, et signale celles qui ne le sont plus", () => {
    const pesee = peserBoutiques(
      {
        ...RIEN,
        catalogue: [
          piece({ id: "garnie", seuilAlerte: 2 }),
          piece({ id: "basse", seuilAlerte: 5 }),
          piece({ id: "epuisee", seuilAlerte: 2 }),
        ],
        mouvements: [
          mouvement({ id: "1", pieceId: "garnie", type: "entree", quantite: 10 }),
          mouvement({ id: "2", pieceId: "basse", type: "entree", quantite: 3 }),
          mouvement({ id: "3", pieceId: "epuisee", type: "entree", quantite: 4 }),
          mouvement({ id: "4", pieceId: "epuisee", type: "sortie_vente", quantite: 4 }),
        ],
      },
      MAINTENANT,
    );
    /* « garnie » et « basse » se vendent encore ; « epuisee » non. */
    expect(pesee.get("BCA")?.pieces.references).toBe(2);
    /* « basse » est sous son seuil de 5, « epuisee » est à zéro. */
    expect(pesee.get("BCA")?.pieces.aReapprovisionner).toBe(2);
  });

  /* Le cas que D82 nomme : un négatif est un aveu de saisie, pas un rayon
     garni. Il ne compte pas comme vendable et il demande une décision. */
  it("une quantité négative ne compte pas comme vendable et reste une alerte", () => {
    const pesee = peserBoutiques(
      {
        ...RIEN,
        catalogue: [piece({ id: "cassee" })],
        mouvements: [mouvement({ id: "1", pieceId: "cassee", type: "sortie_autre", quantite: 3 })],
      },
      MAINTENANT,
    );
    expect(pesee.get("BCA")?.pieces.references).toBe(0);
    expect(pesee.get("BCA")?.pieces.aReapprovisionner).toBe(1);
  });

  /* Le catalogue est commun aux boutiques, le stock ne l'est pas : sans le
     regroupement par boutique, une rupture ici serait masquée par du stock
     là-bas. */
  it("le stock d’une pièce est propre à sa boutique", () => {
    const pesee = peserBoutiques(
      {
        ...RIEN,
        catalogue: [piece({ id: "p1", seuilAlerte: 1 })],
        mouvements: [
          mouvement({ id: "1", boutiqueId: "BCA", type: "entree", quantite: 20 }),
          mouvement({ id: "2", boutiqueId: "ABC", type: "entree", quantite: 5 }),
          mouvement({ id: "3", boutiqueId: "ABC", type: "sortie_vente", quantite: 5 }),
        ],
      },
      MAINTENANT,
    );
    expect(pesee.get("BCA")?.pieces.references).toBe(1);
    expect(pesee.get("BCA")?.pieces.aReapprovisionner).toBe(0);
    expect(pesee.get("ABC")?.pieces.references).toBe(0);
    expect(pesee.get("ABC")?.pieces.aReapprovisionner).toBe(1);
  });

  it("une pièce retirée du catalogue ne compte plus, et ses mouvements non plus", () => {
    const pesee = peserBoutiques(
      {
        ...RIEN,
        catalogue: [piece({ id: "retiree", actif: false })],
        mouvements: [mouvement({ id: "1", pieceId: "retiree", type: "entree", quantite: 7 })],
      },
      MAINTENANT,
    );
    expect(pesee.get("BCA")).toBeUndefined();
  });

  it("ne compte aucun rayon tant que les deux lectures ne sont pas revenues", () => {
    const sansMouvements = peserBoutiques(
      { ...RIEN, catalogue: [piece()], mouvements: null },
      MAINTENANT,
    );
    expect(sansMouvements.size).toBe(0);

    const sansCatalogue = peserBoutiques(
      { ...RIEN, catalogue: null, mouvements: [mouvement()] },
      MAINTENANT,
    );
    expect(sansCatalogue.size).toBe(0);
  });
});

describe("additionnerPesees", () => {
  it("somme les deux métiers sans les mélanger", () => {
    const a = {
      motos: { enStock: 4, ventesDuMois: 1, resteDu: 100_000 },
      pieces: {
        references: 10,
        ventesDuMois: 2,
        recetteDuMois: 5_000,
        margeDuMois: 2_000,
        aReapprovisionner: 1,
      },
    };
    const b = {
      motos: { enStock: 6, ventesDuMois: 2, resteDu: 615_000 },
      pieces: {
        references: 32,
        ventesDuMois: 15,
        recetteDuMois: 380_000,
        margeDuMois: 90_000,
        aReapprovisionner: 3,
      },
    };
    expect(additionnerPesees(a, b)).toEqual({
      motos: { enStock: 10, ventesDuMois: 3, resteDu: 715_000 },
      pieces: {
        references: 42,
        ventesDuMois: 17,
        recetteDuMois: 385_000,
        margeDuMois: 92_000,
        aReapprovisionner: 4,
      },
    });
  });

  /**
   * **Une marge inconnue n'est pas une marge nulle, et l'addition doit le
   * tenir.** Une boutique dont aucune piece ne porte son cout rend `null`.
   * L'additionner comme un zero annoncerait « cette boutique n'a rien gagne »,
   * ce qui est une affirmation ; et rendre `null` des qu'une seule boutique
   * l'ignore effacerait la marge connue des autres.
   */
  it("ignore une marge inconnue sans effacer celle des autres", () => {
    const connue = {
      motos: PESEE_VIDE.motos,
      pieces: { ...PESEE_VIDE.pieces, margeDuMois: 7_000 },
    };
    const inconnue = { motos: PESEE_VIDE.motos, pieces: { ...PESEE_VIDE.pieces } };

    expect(additionnerPesees(connue, inconnue).pieces.margeDuMois).toBe(7_000);
    expect(additionnerPesees(inconnue, connue).pieces.margeDuMois).toBe(7_000);
    expect(additionnerPesees(inconnue, inconnue).pieces.margeDuMois).toBeNull();
  });

  /* La carte « Toutes les boutiques » part de `PESEE_VIDE` comme graine du
     `reduce` : si l'addition la modifiait, la seconde ouverture de l'écran
     partirait d'un total faussé. */
  it("ne modifie aucune des deux pesées données", () => {
    const depart = { motos: { ...PESEE_VIDE.motos }, pieces: { ...PESEE_VIDE.pieces } };
    additionnerPesees(PESEE_VIDE, {
      motos: { enStock: 3, ventesDuMois: 3, resteDu: 3 },
      pieces: {
        references: 3,
        ventesDuMois: 3,
        recetteDuMois: 3,
        margeDuMois: 3,
        aReapprovisionner: 3,
      },
    });
    expect(PESEE_VIDE).toEqual(depart);
  });
});
