import { describe, expect, it } from "vitest";
import type { Piece } from "./piece";
import {
  ajouterAuPanier,
  changerLigne,
  figerLignes,
  libelleEncaissement,
  LIGNES_MAX,
  PANIER_VIDE,
  piecesEnAlerte,
  refusAjout,
  retirerDuPanier,
  totalLigne,
  totalPanier,
  validerPanier,
  type SaisiePanier,
} from "./vente-piece";

/**
 * La vente de pièces au comptoir (S21).
 *
 * Chaque groupe de tests **nomme l'arbitrage qu'il protège**. Ce n'est pas de
 * la décoration : quand l'un d'eux tombera dans six mois, ce qui manquera à
 * celui qui le lit, ce n'est pas la ligne de code, c'est la raison.
 */

function piece(partie: Partial<Piece> & { id: string }): Piece {
  return {
    reference: `REF-${partie.id}`,
    designation: "Plaquette de frein avant",
    categorie: "Freinage",
    prixVente: 3500,
    seuilAlerte: 5,
    actif: true,
    ...partie,
  };
}

const carte = (...pieces: Piece[]) => new Map(pieces.map((p) => [p.id, p]));
const stocks = (...paires: [string, number][]) => new Map(paires);

describe("arbitrage 1 — le panier est multi-lignes, le client est facultatif", () => {
  it("accepte plusieurs pièces différentes", () => {
    const bougie = piece({ id: "b" });
    const plaquette = piece({ id: "p" });

    let panier = ajouterAuPanier(PANIER_VIDE, bougie, 10);
    panier = ajouterAuPanier(panier, plaquette, 10);

    expect(panier.lignes.map((ligne) => ligne.pieceId)).toEqual(["b", "p"]);
  });

  it("valide une vente sans client : au comptoir, on ne demande pas son nom", () => {
    const bougie = piece({ id: "b" });
    const panier = ajouterAuPanier(PANIER_VIDE, bougie, 10);

    expect(panier.clientId).toBe("");
    expect(validerPanier(panier, carte(bougie), stocks(["b", 10]))).toBeNull();
  });

  it("refuse d’ajouter deux fois la même pièce : c’est la quantité qui change", () => {
    const bougie = piece({ id: "b" });
    const panier = ajouterAuPanier(PANIER_VIDE, bougie, 10);

    expect(refusAjout(bougie, 10, panier.lignes)).toBe("deja_au_panier");
    expect(ajouterAuPanier(panier, bougie, 10).lignes).toHaveLength(1);
  });

  it(`n’accepte pas plus de ${LIGNES_MAX} lignes`, () => {
    let panier: SaisiePanier = PANIER_VIDE;
    const toutes: Piece[] = [];
    for (let n = 0; n < LIGNES_MAX + 3; n += 1) {
      const p = piece({ id: `p${n}` });
      toutes.push(p);
      panier = ajouterAuPanier(panier, p, 10);
    }
    expect(panier.lignes).toHaveLength(LIGNES_MAX);
    /* **Et le refus porte un nom.** Un ajout qui ne passe pas sans raison
       nommée laisse l'écran muet : le gérant clique, la pièce ne vient pas, et
       rien ne dit pourquoi. C'est le seul refus qui manquait à l'union. */
    expect(refusAjout(piece({ id: "de-trop" }), 10, panier.lignes)).toBe("panier_plein");
  });
});

describe("arbitrage 2 — le prix du catalogue est proposé, pas imposé", () => {
  it("pré-remplit la ligne avec le prix du catalogue", () => {
    const bougie = piece({ id: "b", prixVente: 3500 });
    const panier = ajouterAuPanier(PANIER_VIDE, bougie, 10);

    expect(panier.lignes[0].prixUnitaire).toBe("3500");
  });

  it("accepte un prix négocié différent du catalogue, et le fige tel quel", () => {
    const bougie = piece({ id: "b", prixVente: 3500 });
    let panier = ajouterAuPanier(PANIER_VIDE, bougie, 10);
    panier = changerLigne(panier, "b", { prixUnitaire: "3000", quantite: "2" });

    expect(validerPanier(panier, carte(bougie), stocks(["b", 10]))).toBeNull();
    const lignes = figerLignes(panier, carte(bougie));
    expect(lignes[0]).toMatchObject({ prixUnitaire: 3000, quantite: 2, total: 6000 });
  });

  it("refuse un prix nul : une vente à zéro franc est une erreur de frappe, pas un cadeau", () => {
    const bougie = piece({ id: "b" });
    let panier = ajouterAuPanier(PANIER_VIDE, bougie, 10);
    panier = changerLigne(panier, "b", { prixUnitaire: "0" });

    expect(validerPanier(panier, carte(bougie), stocks(["b", 10]))).toMatch(/supérieur à zéro/);
  });
});

describe("arbitrage 3 — une pièce sans prix de vente ne se vend pas", () => {
  it("refuse l’ajout, et nomme la raison pour que l’écran propose la réparation", () => {
    const aFixer = piece({ id: "x", prixVente: null });

    expect(refusAjout(aFixer, 10, [])).toBe("sans_prix");
    expect(ajouterAuPanier(PANIER_VIDE, aFixer, 10).lignes).toHaveLength(0);
  });

  it("refuse aussi une référence retirée du catalogue, avec une raison distincte", () => {
    const retiree = piece({ id: "r", actif: false });

    expect(refusAjout(retiree, 10, [])).toBe("inactive");
  });
});

describe("arbitrage 4 — le stock insuffisant refuse la vente, sans forçage", () => {
  it("refuse une quantité supérieure au stock, et dit combien il en reste", () => {
    const bougie = piece({ id: "b" });
    let panier = ajouterAuPanier(PANIER_VIDE, bougie, 3);
    panier = changerLigne(panier, "b", { quantite: "5" });

    expect(validerPanier(panier, carte(bougie), stocks(["b", 3]))).toMatch(/que 3 en stock/);
  });

  it("refuse l’ajout d’une pièce épuisée, et propose l’entrée manquante par sa raison", () => {
    const bougie = piece({ id: "b" });

    expect(refusAjout(bougie, 0, [])).toBe("epuise");
  });

  it("ne confond pas le stock négatif avec l’épuisé : ce n’est pas le même aveu (D82)", () => {
    /* « Il n'y en a plus » envoie commander ; « mon compte est faux » envoie
       corriger une saisie. Les ranger sous le même mot fait commander un carton
       peut-être déjà sur l'étagère. */
    const bougie = piece({ id: "b" });

    expect(refusAjout(bougie, -3, [])).toBe("stock_incoherent");

    let panier = ajouterAuPanier(PANIER_VIDE, bougie, 5);
    panier = changerLigne(panier, "b", { quantite: "1" });
    expect(validerPanier(panier, carte(bougie), stocks(["b", -3]))).toMatch(/négatif/);
  });

  it("accepte exactement le stock disponible : la borne est inclusive", () => {
    const bougie = piece({ id: "b" });
    let panier = ajouterAuPanier(PANIER_VIDE, bougie, 3);
    panier = changerLigne(panier, "b", { quantite: "3" });

    expect(validerPanier(panier, carte(bougie), stocks(["b", 3]))).toBeNull();
  });

  it("il n’existe aucun chemin de forçage : la validation ne prend pas d’option", () => {
    /* Ce test protège une **absence**, et c'est voulu. `prompt.md` §9 prévoyait
       un forçage journalisé par le responsable ; le commanditaire a tranché
       « pas de stock négatif ». Si un jour quelqu'un ajoute un paramètre
       `forcer` à `validerPanier`, c'est ici que la discussion se rouvrira. */
    expect(validerPanier.length).toBe(3);
  });
});

describe("D95 — un stock pas encore lu n’autorise aucune vente", () => {
  it("refuse quand la carte des stocks est nulle, au lieu de la traiter comme vide", () => {
    const bougie = piece({ id: "b" });
    const panier = ajouterAuPanier(PANIER_VIDE, bougie, 10);

    expect(validerPanier(panier, carte(bougie), null)).toMatch(/pas fini d’arriver/);
  });
});

describe("le total, et ce qu’il refuse de deviner", () => {
  it("ne compte pas une ligne dont la saisie n’est pas encore un nombre", () => {
    expect(totalLigne({ pieceId: "b", quantite: "", prixUnitaire: "3500" })).toBeNull();
    expect(totalLigne({ pieceId: "b", quantite: "2", prixUnitaire: "" })).toBeNull();
  });

  it("additionne les lignes complètes et ignore les autres", () => {
    const total = totalPanier([
      { pieceId: "a", quantite: "2", prixUnitaire: "3500" },
      { pieceId: "b", quantite: "", prixUnitaire: "1000" },
      { pieceId: "c", quantite: "1", prixUnitaire: "500" },
    ]);
    expect(total).toBe(7500);
  });

  it("retirer une ligne retire son total", () => {
    const bougie = piece({ id: "b" });
    const plaquette = piece({ id: "p", prixVente: 1000 });
    let panier = ajouterAuPanier(PANIER_VIDE, bougie, 10);
    panier = ajouterAuPanier(panier, plaquette, 10);
    expect(totalPanier(panier.lignes)).toBe(4500);

    panier = retirerDuPanier(panier, "b");
    expect(totalPanier(panier.lignes)).toBe(1000);
  });
});

describe("la désignation est recopiée, jamais référencée", () => {
  it("fige la référence et la désignation au moment de la vente", () => {
    const bougie = piece({ id: "b", reference: "BGE-01", designation: "Bougie NGK" });
    const panier = ajouterAuPanier(PANIER_VIDE, bougie, 10);

    const lignes = figerLignes(panier, carte(bougie));
    expect(lignes[0]).toMatchObject({ reference: "BGE-01", designation: "Bougie NGK" });
  });

  it("un reçu relu six mois plus tard ne dépend plus du catalogue", () => {
    const bougie = piece({ id: "b", reference: "BGE-01", designation: "Bougie NGK" });
    const lignes = figerLignes(ajouterAuPanier(PANIER_VIDE, bougie, 10), carte(bougie));

    /* La référence est renommée après la vente : la ligne déjà figée n'en sait
       rien, et c'est exactement ce qu'on veut. */
    const renommee = carte(piece({ id: "b", reference: "BGE-02", designation: "Bougie Denso" }));
    expect(figerLignes(ajouterAuPanier(PANIER_VIDE, renommee.get("b")!, 10), renommee)[0]
      .reference).toBe("BGE-02");
    expect(lignes[0].reference).toBe("BGE-01");
  });
});

describe("S35 — le nom du client s’écrit dans le libellé, à l’encaissement", () => {
  it("porte le nom quand on le connaît", () => {
    expect(libelleEncaissement("PTG-2609-0042", "Ouédraogo Salif")).toBe(
      "Pièces PTG-2609-0042 · Ouédraogo Salif",
    );
  });

  it("se contente du numéro pour une vente au comptoir anonyme", () => {
    expect(libelleEncaissement("PTG-2609-0042", "")).toBe("Pièces PTG-2609-0042");
    expect(libelleEncaissement("PTG-2609-0042", "   ")).toBe("Pièces PTG-2609-0042");
  });
});

describe("la carte « pièces en alerte » de la supervision", () => {
  it("retient l’épuisé et le stock bas, ignore le reste", () => {
    const pieces = [
      piece({ id: "vide", reference: "A", seuilAlerte: 5 }),
      piece({ id: "bas", reference: "B", seuilAlerte: 5 }),
      piece({ id: "plein", reference: "C", seuilAlerte: 5 }),
    ];
    const alertes = piecesEnAlerte(pieces, stocks(["vide", 0], ["bas", 3], ["plein", 40]));

    expect(alertes.map((a) => a.piece.id)).toEqual(["vide", "bas"]);
  });

  it("place les épuisées devant : c’est la vente qu’on rate aujourd’hui", () => {
    const pieces = [
      piece({ id: "bas", reference: "A", seuilAlerte: 5 }),
      piece({ id: "vide", reference: "Z", seuilAlerte: 5 }),
    ];
    const alertes = piecesEnAlerte(pieces, stocks(["bas", 2], ["vide", 0]));

    expect(alertes.map((a) => a.piece.id)).toEqual(["vide", "bas"]);
    expect(alertes[0].etat).toBe("epuise");
  });

  it("range l’incohérence avant l’épuisé : un chiffre faux empêche de décider", () => {
    const pieces = [
      piece({ id: "vide", reference: "A", seuilAlerte: 5 }),
      piece({ id: "negatif", reference: "Z", seuilAlerte: 5 }),
    ];
    const alertes = piecesEnAlerte(pieces, stocks(["vide", 0], ["negatif", -2]));

    expect(alertes.map((a) => a.etat)).toEqual(["anomalie", "epuise"]);
  });

  it("ignore ce que la boutique n’a jamais tenu : sans mouvement, il n’y a pas de rupture", () => {
    /* Le catalogue est commun à l'entreprise, le stock ne l'est pas. Compter
       comme épuisée une référence que cette boutique n'a jamais reçue noierait
       les trois vraies ruptures sous deux cent cinquante fausses, et une carte
       de décision qui crie tous les jours cesse d'être lue. */
    const pieces = [
      piece({ id: "tenue", reference: "A", seuilAlerte: 5 }),
      piece({ id: "jamais-vue", reference: "B", seuilAlerte: 5 }),
    ];

    expect(piecesEnAlerte(pieces, stocks(["tenue", 0])).map((a) => a.piece.id)).toEqual(["tenue"]);
  });

  it("ignore les références retirées du catalogue : on ne les réapprovisionne pas", () => {
    const pieces = [piece({ id: "retiree", actif: false, seuilAlerte: 5 })];

    expect(piecesEnAlerte(pieces, stocks(["retiree", 0]))).toHaveLength(0);
  });

  it("un seuil à zéro veut dire « ne m’alerte pas », mais l’épuisé alerte quand même", () => {
    const pieces = [
      piece({ id: "sansSeuil", reference: "A", seuilAlerte: 0 }),
      piece({ id: "sansSeuilVide", reference: "B", seuilAlerte: 0 }),
    ];
    const alertes = piecesEnAlerte(pieces, stocks(["sansSeuil", 4], ["sansSeuilVide", 0]));

    expect(alertes.map((a) => a.piece.id)).toEqual(["sansSeuilVide"]);
  });
});
