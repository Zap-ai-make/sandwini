import { describe, expect, it } from "vitest";
import { formaterMontant } from "./format";
import type { Piece } from "./piece";
import {
  ajouterAuPanier,
  changerLigne,
  comparerVentesPieces,
  figerLignes,
  libelleEncaissement,
  LIGNES_MAX,
  margeDesVentesPieces,
  margeLigne,
  margeVentePiece,
  nombreArticles,
  PANIER_VIDE,
  piecesEnAlerte,
  refusAjout,
  resumeDesignations,
  retirerDuPanier,
  textePartageVentePiece,
  totalLigne,
  totalPanier,
  validerPanier,
  venteCorrespond,
  type LigneVentePiece,
  type SaisiePanier,
  type VentePiece,
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
    boutiqueId: "terrain",
    prixAchat: 2000,
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

    expect(panier.nomClient).toBe("");
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

/**
 * **La marge d'une vente de pièces.**
 *
 * Le commanditaire voulait que la vente « gonfle le chiffre d'affaires ». La
 * recette y était déjà ; la marge manquait, et un chiffre d'affaires sans marge
 * ne dit pas si le commerce gagne de l'argent — il dit seulement qu'il bouge.
 *
 * Le prix d'achat est **recopié dans la ligne** au moment de la vente, comme la
 * désignation l'est déjà. La raison est comptable : si la même bougie est
 * rachetée plus cher le mois suivant, la marge des ventes passées ne doit pas
 * changer derrière le dos de celui qui les a faites.
 */
describe("la marge d'une vente de pièces", () => {
  it("recopie le prix d'achat dans la ligne, au lieu de le relire plus tard", () => {
    const panier = ajouterAuPanier(PANIER_VIDE, piece({ id: "p1", prixAchat: 1800 }), 10);
    const [ligne] = figerLignes(panier, carte(piece({ id: "p1", prixAchat: 1800 })));
    expect(ligne.prixAchatUnitaire).toBe(1800);
  });

  it("note un prix d'achat inconnu plutôt que zéro", () => {
    /* Zéro dirait « cette pièce n'a rien coûté », ce qui est une autre
       affirmation — et elle gonflerait la marge d'autant. */
    const piecesSansCout = carte(piece({ id: "p1", prixAchat: null }));
    const panier = ajouterAuPanier(PANIER_VIDE, piece({ id: "p1", prixAchat: null }), 10);
    const [ligne] = figerLignes(panier, piecesSansCout);
    expect(ligne.prixAchatUnitaire).toBeNull();
  });

  it("multiplie l'écart par la quantité", () => {
    expect(
      margeLigne({
        pieceId: "p1",
        reference: "REF-p1",
        designation: "Bougie",
        quantite: 3,
        prixUnitaire: 3500,
        prixAchatUnitaire: 2000,
        total: 10_500,
      }),
    ).toBe(4500);
  });

  it("rend une marge négative quand la pièce est vendue à perte", () => {
    /* On écoule parfois un stock dormant en dessous de son prix d'achat. Le
       chiffre doit le dire, pas l'arrondir à zéro. */
    expect(
      margeLigne({
        pieceId: "p1",
        reference: "REF-p1",
        designation: "Bougie",
        quantite: 2,
        prixUnitaire: 1500,
        prixAchatUnitaire: 2000,
        total: 3000,
      }),
    ).toBe(-1000);
  });

  it("ignore une ligne sans prix d'achat et compte les autres", () => {
    const vente = {
      lignes: [
        { pieceId: "a", reference: "A", designation: "A", quantite: 1, prixUnitaire: 3000, prixAchatUnitaire: 1000, total: 3000 },
        { pieceId: "b", reference: "B", designation: "B", quantite: 1, prixUnitaire: 5000, prixAchatUnitaire: null, total: 5000 },
      ],
    };
    expect(margeVentePiece(vente)).toBe(2000);
  });

  it("rend une marge inconnue quand aucune ligne ne porte son coût", () => {
    /* `null` et non `0` : le même partage qu'au mois des motos (`chiffres.ts`).
       Zéro annoncerait une marge nulle, ce qui est un fait ; ici on n'en sait
       rien, et l'écran doit pouvoir l'écrire autrement. */
    const vente = {
      lignes: [
        { pieceId: "b", reference: "B", designation: "B", quantite: 1, prixUnitaire: 5000, prixAchatUnitaire: null, total: 5000 },
      ],
    };
    expect(margeVentePiece(vente)).toBeNull();
  });

  it("additionne la marge de plusieurs ventes, et reste inconnue si aucune n'est connue", () => {
    const connue = {
      lignes: [
        { pieceId: "a", reference: "A", designation: "A", quantite: 2, prixUnitaire: 3000, prixAchatUnitaire: 1000, total: 6000 },
      ],
    };
    const inconnue = {
      lignes: [
        { pieceId: "b", reference: "B", designation: "B", quantite: 1, prixUnitaire: 5000, prixAchatUnitaire: null, total: 5000 },
      ],
    };
    expect(margeDesVentesPieces([connue, inconnue])).toBe(4000);
    expect(margeDesVentesPieces([inconnue])).toBeNull();
    expect(margeDesVentesPieces([])).toBeNull();
  });
});

/* --- S64 : l'historique des ventes de pièces et son reçu ------------------ */

const ligne = (partie: Partial<LigneVentePiece> = {}): LigneVentePiece => ({
  pieceId: "p1",
  reference: "PLQ-0142",
  designation: "Plaquette de frein avant",
  quantite: 1,
  prixUnitaire: 3500,
  prixAchatUnitaire: 2000,
  total: 3500,
  ...partie,
});

const vente = (partie: Partial<VentePiece> = {}): VentePiece => ({
  id: "v1",
  numero: "PTG-2610-0042",
  boutiqueId: "PTG",
  date: new Date("2026-10-20T10:00:00Z"),
  clientId: "",
  operateur: "Awa",
  lignes: [ligne()],
  total: 3500,
  moyenPaiement: "especes",
  ...partie,
});

describe("comparerVentesPieces — la plus récente en haut (S64)", () => {
  it("range par date décroissante", () => {
    const liste = [
      vente({ id: "a", date: new Date("2026-10-18") }),
      vente({ id: "b", date: new Date("2026-10-21") }),
      vente({ id: "c", date: new Date("2026-10-20") }),
    ].sort(comparerVentesPieces);
    expect(liste.map((v) => v.id)).toEqual(["b", "c", "a"]);
  });

  it("met une date absente en dernier, sans planter", () => {
    const liste = [
      vente({ id: "sansDate", date: null }),
      vente({ id: "avecDate", date: new Date("2026-10-20") }),
    ].sort(comparerVentesPieces);
    expect(liste.map((v) => v.id)).toEqual(["avecDate", "sansDate"]);
  });
});

describe("venteCorrespond — chercher une vente (S64)", () => {
  const v = vente({
    numero: "PTG-2610-0042",
    lignes: [ligne({ designation: "Plaquette de frein avant", reference: "PLQ-0142" })],
  });

  it("trouve par numéro, même partiel", () => {
    expect(venteCorrespond(v, "", "0042")).toBe(true);
    expect(venteCorrespond(v, "", "ptg-2610")).toBe(true);
  });

  it("trouve par nom de client, sans casse ni accents", () => {
    expect(venteCorrespond(v, "Aïcha Traoré", "aicha")).toBe(true);
  });

  it("trouve par désignation ou référence d'une pièce", () => {
    expect(venteCorrespond(v, "", "plaquette")).toBe(true);
    expect(venteCorrespond(v, "", "plq")).toBe(true);
  });

  it("une recherche vide laisse tout passer", () => {
    expect(venteCorrespond(v, "", "   ")).toBe(true);
  });

  it("ne trouve pas ce qui n'y est pas", () => {
    expect(venteCorrespond(v, "", "chaîne")).toBe(false);
  });
});

describe("resumeDesignations et nombreArticles (S64)", () => {
  it("nomme la seule pièce quand il n'y en a qu'une", () => {
    expect(resumeDesignations(vente())).toBe("Plaquette de frein avant");
  });

  it("résume « première + N autres » au-delà d'une ligne", () => {
    const v = vente({
      lignes: [
        ligne({ designation: "Plaquette de frein avant" }),
        ligne({ pieceId: "p2", designation: "Bougie NGK" }),
        ligne({ pieceId: "p3", designation: "Filtre à air" }),
      ],
    });
    expect(resumeDesignations(v)).toBe("Plaquette de frein avant +2 autres");
  });

  it("compte les articles, quantités comprises", () => {
    const v = vente({
      lignes: [ligne({ quantite: 3 }), ligne({ pieceId: "p2", quantite: 2 })],
    });
    expect(nombreArticles(v)).toBe(5);
  });
});

describe("textePartageVentePiece (S64)", () => {
  it("porte le numéro, le total et l'enseigne", () => {
    const texte = textePartageVentePiece(vente(), "", "ETS SANDWIDI ET FRÈRES");
    expect(texte).toContain("PTG-2610-0042");
    /* La valeur formatée porte le séparateur de milliers français (espace fine
       insécable), qu'une « 3 500 » écrite au clavier ne contient pas. */
    expect(texte).toContain(formaterMontant(3500));
    expect(texte).toContain("ETS SANDWIDI ET FRÈRES");
  });

  it("nomme le client quand il y en a un", () => {
    expect(textePartageVentePiece(vente(), "Aïcha Traoré", "ETS")).toContain("Aïcha Traoré");
  });
});
