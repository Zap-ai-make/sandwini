import { describe, expect, it } from "vitest";
import type { Moto } from "./moto";
import {
  ARRIVAGE_VIDE,
  LIGNE_VIDE,
  LIGNES_MAX,
  LONGUEUR_DESCRIPTION_MAX,
  SOUS_LOT_VIDE,
  ajusterNombreDeLignes,
  bilanArrivages,
  chercherMotoParChassis,
  completudeCmc,
  ecoulement,
  estEcoule,
  filtrerArrivages,
  ligneEngagee,
  preparerLot,
  validerArrivage,
  validerLigneLot,
  validerSousLot,
  type Arrivage,
  type LigneLot,
  type SaisieArrivage,
  type SousLot,
  lotsDuFournisseur,
} from "./arrivage";

/** Une moto de lot, réduite à ce que les agrégats lisent. */
const motoLot = (p: Partial<Moto> = {}): Moto =>
  ({
    arrivageId: "a1",
    statut: "en_stock",
    cmcRecu: false,
    numeroChassis: "LC6PCJ1A9K0000123",
    ...p,
  }) as unknown as Moto;

const arr = (id: string, p: Partial<Arrivage> = {}): Arrivage =>
  ({
    id,
    boutiqueId: "b1",
    nom: id,
    fournisseurId: "f1",
    date: null,
    description: "",
    dateCreation: null,
    annule: false,
    ...p,
  }) as unknown as Arrivage;

const arrivage = (p: Partial<SaisieArrivage> = {}): SaisieArrivage => ({
  ...ARRIVAGE_VIDE,
  nom: "Arrivage mars 2026",
  fournisseurId: "f1",
  ...p,
});

const ligne = (p: Partial<LigneLot> = {}): LigneLot => ({
  ...LIGNE_VIDE,
  numeroChassis: "LC6PCJ1A9K0000001",
  ...p,
});

const sousLot = (p: Partial<SousLot> = {}): SousLot => ({
  ...SOUS_LOT_VIDE,
  marqueId: "m1",
  modeleId: "mo1",
  lignes: [ligne()],
  ...p,
});

const enStock = (id: string, chassis: string): Moto =>
  ({ id, numeroChassis: chassis, statut: "en_stock", arrivageId: null }) as unknown as Moto;

describe("validerArrivage", () => {
  it("accepte une entête complète : nom et fournisseur", () => {
    expect(validerArrivage(arrivage())).toBeNull();
  });
  it("refuse un nom vide", () => {
    expect(validerArrivage(arrivage({ nom: " " }))).toMatch(/nom/i);
  });
  it("refuse un arrivage sans fournisseur", () => {
    expect(validerArrivage(arrivage({ fournisseurId: "" }))).toMatch(/fournisseur/i);
  });
  it("refuse une date qui n'est pas une vraie date", () => {
    expect(validerArrivage(arrivage({ date: "2026-13-40" }))).toMatch(/date/i);
  });
  it("refuse une description trop longue", () => {
    expect(validerArrivage(arrivage({ description: "x".repeat(LONGUEUR_DESCRIPTION_MAX + 1) }))).toMatch(
      /description/i,
    );
  });
});

describe("validerSousLot", () => {
  it("exige une marque : elle est commune au groupe", () => {
    expect(validerSousLot(sousLot({ marqueId: "" }))).toMatch(/marque/i);
  });
  /* Le modèle, lui, est facultatif — tranché par le commanditaire. Un lot se
     réceptionne au comptoir, caisses encore fermées : la marque se lit sur le
     carton, le modèle souvent pas. L'exiger obligeait à inventer une entrée de
     référentiel pour pouvoir enregistrer, c'est-à-dire à salir le catalogue
     pour contourner un champ. La marque reste exigée : c'est elle qui range le
     stock, et on la connaît toujours. */
  it("accepte un groupe sans modèle : il ne se lit pas toujours à la réception", () => {
    expect(validerSousLot(sousLot({ modeleId: "" }))).toBeNull();
  });
  it("accepte un groupe avec marque et modèle", () => {
    expect(validerSousLot(sousLot())).toBeNull();
  });
});

describe("ligneEngagee", () => {
  it("une ligne sans châssis ne compte pas", () => {
    expect(ligneEngagee(LIGNE_VIDE)).toBe(false);
    expect(ligneEngagee({ numeroChassis: "", couleur: "Rouge" })).toBe(false);
  });
  it("une ligne qui porte un châssis compte", () => {
    expect(ligneEngagee({ numeroChassis: "LC6P", couleur: "" })).toBe(true);
  });
});

describe("validerLigneLot", () => {
  it("exige un châssis recevable", () => {
    expect(validerLigneLot(ligne({ numeroChassis: "" }))).toMatch(/châssis/i);
    expect(validerLigneLot(ligne({ numeroChassis: "LC6/PCJ" }))).toMatch(/lettres et.*chiffres/i);
  });
  it("accepte une ligne avec châssis, la couleur étant facultative", () => {
    expect(validerLigneLot(ligne({ couleur: "" }))).toBeNull();
  });
});

describe("ajusterNombreDeLignes", () => {
  it("porte la liste à N lignes en gardant ce qui est déjà saisi", () => {
    const actuel = [ligne({ numeroChassis: "AAA" }), ligne({ numeroChassis: "BBB" })];
    const agrandi = ajusterNombreDeLignes(actuel, 4);
    expect(agrandi).toHaveLength(4);
    expect(agrandi[0].numeroChassis).toBe("AAA");
    expect(agrandi[1].numeroChassis).toBe("BBB");
    expect(agrandi[2]).toEqual(LIGNE_VIDE);
  });
  it("réduit la liste sans descendre sous une ligne", () => {
    const actuel = [ligne({ numeroChassis: "AAA" }), ligne({ numeroChassis: "BBB" }), ligne({ numeroChassis: "CCC" })];
    expect(ajusterNombreDeLignes(actuel, 1)).toHaveLength(1);
    expect(ajusterNombreDeLignes(actuel, 0)).toHaveLength(1);
  });
  it("plafonne au maximum de lignes", () => {
    expect(ajusterNombreDeLignes([LIGNE_VIDE], LIGNES_MAX + 50)).toHaveLength(LIGNES_MAX);
  });
});

describe("ecoulement", () => {
  it("compte les motos du lot, vendues et restantes", () => {
    const motos = [
      { arrivageId: "a1", statut: "vendue" },
      { arrivageId: "a1", statut: "en_stock" },
      { arrivageId: "a1", statut: "en_stock" },
      { arrivageId: "a2", statut: "vendue" },
    ] as unknown as Moto[];
    expect(ecoulement(motos, "a1")).toEqual({ total: 3, vendues: 1, restant: 2 });
  });
});

describe("preparerLot", () => {
  it("refuse d'écrire tant que le stock n'est pas lu (D95)", () => {
    const res = preparerLot(arrivage(), [sousLot()], null, false);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.erreur).toMatch(/stock|instant/i);
  });

  it("refuse un lot sans aucune moto renseignée", () => {
    const res = preparerLot(arrivage(), [sousLot({ lignes: [LIGNE_VIDE] })], [], false);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.erreur).toMatch(/au moins une moto/i);
  });

  it("refuse un groupe qui porte des motos mais pas de marque", () => {
    const res = preparerLot(arrivage(), [sousLot({ marqueId: "", lignes: [ligne()] })], [], false);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.erreur).toMatch(/marque/i);
  });

  it("refuse deux lignes au même châssis dans un groupe", () => {
    const res = preparerLot(
      arrivage(),
      [sousLot({ lignes: [ligne({ numeroChassis: "LC6P0001" }), ligne({ numeroChassis: "lc6p 0001" })] })],
      [],
      false,
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.erreur).toMatch(/deux fois|LC6P0001/i);
  });

  it("refuse le même châssis à travers deux groupes de marques différentes", () => {
    const res = preparerLot(
      arrivage(),
      [
        sousLot({ marqueId: "honda", modeleId: "cg125", lignes: [ligne({ numeroChassis: "LC6P0001" })] }),
        sousLot({ marqueId: "haojue", modeleId: "hj110", lignes: [ligne({ numeroChassis: "lc6p 0001" })] }),
      ],
      [],
      false,
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.erreur).toMatch(/deux fois|LC6P0001/i);
  });

  it("refuse un châssis déjà présent dans le stock", () => {
    const res = preparerLot(
      arrivage(),
      [sousLot({ lignes: [ligne({ numeroChassis: "LC6P0001" })] })],
      [enStock("x", "LC6P0001")],
      false,
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.erreur).toMatch(/déjà en stock/i);
  });

  it("valide le prix d'achat d'un groupe quand le rôle voit les coûts", () => {
    const res = preparerLot(arrivage(), [sousLot({ prixAchat: "pas un nombre" })], [], true);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.erreur).toMatch(/prix/i);
  });

  it("porte le prix du groupe sur ses motos quand le rôle voit les coûts", () => {
    const res = preparerLot(arrivage(), [sousLot({ prixAchat: "450000" })], [], true);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.motos[0].prixAchat).toBe("450000");
  });

  it("n'expose aucun prix quand le rôle ne voit pas les coûts", () => {
    const res = preparerLot(arrivage(), [sousLot({ prixAchat: "450000" })], [], false);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.motos[0].prixAchat).toBe("");
  });

  it("réunit les motos de plusieurs groupes, chacune portant sa marque et son modèle", () => {
    const res = preparerLot(
      arrivage(),
      [
        sousLot({ marqueId: "honda", modeleId: "cg125", lignes: [ligne({ numeroChassis: "AAA1", couleur: "Rouge" })] }),
        sousLot({ marqueId: "haojue", modeleId: "hj110", lignes: [ligne({ numeroChassis: "BBB2" })] }),
      ],
      [],
      false,
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.motos).toHaveLength(2);
      expect(res.motos[0]).toMatchObject({ marqueId: "honda", modeleId: "cg125", numeroChassis: "AAA1", couleur: "Rouge" });
      expect(res.motos[1]).toMatchObject({ marqueId: "haojue", modeleId: "hj110", numeroChassis: "BBB2" });
    }
  });

  it("ignore un groupe entièrement vide", () => {
    const res = preparerLot(
      arrivage(),
      [
        sousLot({ lignes: [ligne({ numeroChassis: "AAA" })] }),
        sousLot({ marqueId: "", modeleId: "", lignes: [LIGNE_VIDE] }),
      ],
      [],
      false,
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.motos).toHaveLength(1);
  });

  it("retient les lignes engagées et ignore les vides", () => {
    const res = preparerLot(
      arrivage(),
      [sousLot({ lignes: [ligne({ numeroChassis: "LC6P0001" }), LIGNE_VIDE, ligne({ numeroChassis: "LC6P0002" })] })],
      [],
      false,
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.motos).toHaveLength(2);
  });
});

describe("completudeCmc", () => {
  it("compte les CMC reçus et manquants du lot", () => {
    const motos = [
      motoLot({ arrivageId: "a1", cmcRecu: true }),
      motoLot({ arrivageId: "a1", cmcRecu: false }),
      motoLot({ arrivageId: "a2", cmcRecu: false }),
    ];
    expect(completudeCmc(motos, "a1")).toEqual({ total: 2, recus: 1, manquants: 1 });
  });

  it("un lot sans moto n'a rien à réclamer", () => {
    expect(completudeCmc([], "a1")).toEqual({ total: 0, recus: 0, manquants: 0 });
  });
});

describe("estEcoule", () => {
  it("un lot dont tout est vendu est écoulé", () => {
    const motos = [motoLot({ statut: "vendue" }), motoLot({ statut: "vendue" })];
    expect(estEcoule(motos, "a1")).toBe(true);
  });

  it("un lot où une moto reste en stock ne l'est pas", () => {
    const motos = [motoLot({ statut: "vendue" }), motoLot({ statut: "en_stock" })];
    expect(estEcoule(motos, "a1")).toBe(false);
  });

  it("un lot vide n'est pas écoulé", () => {
    expect(estEcoule([], "a1")).toBe(false);
  });
});

describe("bilanArrivages", () => {
  it("totalise les lots actifs et leurs motos par statut et par CMC", () => {
    const arrivages = [arr("a1"), arr("a2"), arr("a3", { annule: true })];
    const motos = [
      motoLot({ arrivageId: "a1", statut: "en_stock", cmcRecu: false }),
      motoLot({ arrivageId: "a1", statut: "vendue", cmcRecu: true }),
      motoLot({ arrivageId: "a2", statut: "en_stock", cmcRecu: true }),
      motoLot({ arrivageId: "a3", statut: "en_stock", cmcRecu: false }), // lot annulé : ignoré
      motoLot({ arrivageId: null, statut: "en_stock", cmcRecu: false }), // unitaire : ignoré
    ];
    expect(bilanArrivages(arrivages, motos)).toEqual({
      arrivages: 2,
      motosRecues: 3,
      enStock: 2,
      vendues: 1,
      cmcManquants: 1,
    });
  });
});

describe("filtrerArrivages", () => {
  const arrivages = [arr("a1"), arr("a2"), arr("ecoule"), arr("annule", { annule: true })];
  const motos = [
    motoLot({ arrivageId: "a1", statut: "en_stock", cmcRecu: false }), // CMC incomplet
    motoLot({ arrivageId: "a2", statut: "en_stock", cmcRecu: true }), // complet, pas écoulé
    motoLot({ arrivageId: "ecoule", statut: "vendue", cmcRecu: true }), // écoulé
    motoLot({ arrivageId: "annule", statut: "en_stock", cmcRecu: false }),
  ];

  it("« tous » montre les lots actifs, jamais les annulés", () => {
    expect(filtrerArrivages(arrivages, motos, "tous").map((a) => a.id)).toEqual(["a1", "a2", "ecoule"]);
  });

  it("« cmc-incomplets » ne garde que les lots à CMC manquant", () => {
    expect(filtrerArrivages(arrivages, motos, "cmc-incomplets").map((a) => a.id)).toEqual(["a1"]);
  });

  it("« ecoules » ne garde que les lots tout vendus", () => {
    expect(filtrerArrivages(arrivages, motos, "ecoules").map((a) => a.id)).toEqual(["ecoule"]);
  });
});

describe("chercherMotoParChassis", () => {
  const motos = [
    motoLot({ numeroChassis: "LC6PCJ1A9K0000123" }),
    motoLot({ numeroChassis: "RLCUG1270TY032010" }),
  ];

  it("trouve par le numéro complet", () => {
    expect(chercherMotoParChassis(motos, "lc6pcj1a9k0000123").map((m) => m.numeroChassis)).toEqual([
      "LC6PCJ1A9K0000123",
    ]);
  });

  it("trouve par les derniers caractères, casse et espaces ignorés", () => {
    expect(chercherMotoParChassis(motos, "32010").map((m) => m.numeroChassis)).toEqual([
      "RLCUG1270TY032010",
    ]);
    expect(chercherMotoParChassis(motos, " 00 00 123 ").map((m) => m.numeroChassis)).toEqual([
      "LC6PCJ1A9K0000123",
    ]);
  });

  it("ne cherche pas sur une requête trop courte", () => {
    expect(chercherMotoParChassis(motos, "0")).toEqual([]);
  });
});

/**
 * L'historique d'un fournisseur : tous les lots pris avec lui.
 *
 * Le besoin est venu du commanditaire en ces mots — « quand on clique sur un
 * fournisseur on atterrit sur l'historique, tous les lots pris avec lui, date,
 * moto ». Rien à écrire en base : la donnée est là depuis S42, elle n'avait
 * aucun écran pour la lire.
 *
 * Le périmètre n'est **pas** l'affaire de cette fonction : elle reçoit les
 * arrivages déjà lus, donc déjà bornés par les règles Firestore — la boutique
 * du gérant, toutes pour le responsable. C'est ce qui permet au même code de
 * servir les deux rôles sans savoir lequel regarde.
 */
describe("lotsDuFournisseur", () => {
  const lot = (id: string, fournisseurId: string, date: Date | null, p = {}) =>
    arr(id, { fournisseurId, date, ...p });

  it("ne rend rien quand le fournisseur n’a aucun lot", () => {
    expect(lotsDuFournisseur("f9", [lot("a1", "f1", null)], [])).toEqual([]);
  });

  it("ne retient que les lots de ce fournisseur", () => {
    const arrivages = [
      lot("a1", "f1", new Date(2026, 0, 10)),
      lot("a2", "f2", new Date(2026, 0, 11)),
      lot("a3", "f1", new Date(2026, 0, 12)),
    ];
    expect(lotsDuFournisseur("f1", arrivages, []).map((l) => l.arrivage.id)).toEqual(["a3", "a1"]);
  });

  it("met le lot le plus récent en tête", () => {
    const arrivages = [
      lot("vieux", "f1", new Date(2025, 5, 1)),
      lot("recent", "f1", new Date(2026, 5, 1)),
      lot("milieu", "f1", new Date(2026, 0, 1)),
    ];
    expect(lotsDuFournisseur("f1", arrivages, []).map((l) => l.arrivage.id)).toEqual([
      "recent",
      "milieu",
      "vieux",
    ]);
  });

  /**
   * Un lot sans date passe devant tous les autres.
   *
   * C'est la même lecture que `dansLaPeriode` dans `periode.ts` : un lot
   * enregistré hors ligne n'a pas encore l'horodatage du serveur, son champ
   * vaut `null` jusqu'à la synchronisation. Ce n'est donc pas un lot ancien, au
   * contraire — c'est le plus récent de tous, celui qu'on vient de saisir, et
   * le reléguer en bas de liste le ferait disparaître au moment précis où on
   * vérifie qu'il est bien passé.
   */
  it("met un lot sans date en tête : il vient d’être saisi, hors ligne", () => {
    const arrivages = [lot("date", "f1", new Date(2026, 5, 1)), lot("sans-date", "f1", null)];
    expect(lotsDuFournisseur("f1", arrivages, []).map((l) => l.arrivage.id)).toEqual([
      "sans-date",
      "date",
    ]);
  });

  it("accroche à chaque lot les motos qui en viennent", () => {
    const arrivages = [lot("a1", "f1", null), lot("a2", "f1", new Date(2026, 0, 1))];
    const motos = [
      motoLot({ arrivageId: "a1", numeroChassis: "AAA" }),
      motoLot({ arrivageId: "a1", numeroChassis: "BBB" }),
      motoLot({ arrivageId: "a2", numeroChassis: "CCC" }),
      /* Une saisie unitaire, sans lot : elle ne doit s'accrocher à rien. */
      motoLot({ arrivageId: null, numeroChassis: "DDD" }),
    ];
    const lots = lotsDuFournisseur("f1", arrivages, motos);
    expect(lots.map((l) => l.motos.map((m) => m.numeroChassis))).toEqual([["AAA", "BBB"], ["CCC"]]);
  });

  it("compte l’écoulement de chaque lot", () => {
    const arrivages = [lot("a1", "f1", null)];
    const motos = [
      motoLot({ arrivageId: "a1", statut: "vendue" }),
      motoLot({ arrivageId: "a1", statut: "en_stock" }),
      motoLot({ arrivageId: "a1", statut: "en_stock" }),
    ];
    expect(lotsDuFournisseur("f1", arrivages, motos)[0].ecoulement).toEqual({
      total: 3,
      vendues: 1,
      restant: 2,
    });
  });

  /**
   * Un lot annulé reste dans l'historique.
   *
   * L'annulation de S43 est **douce** : un lot fautif qui porte déjà des motos
   * ne s'efface pas, parce que ces motos existent et sont citées ailleurs. Le
   * masquer ici ferait mentir l'historique — on aurait bel et bien pris ce lot
   * chez ce fournisseur. L'écran le marque ; il ne le cache pas.
   */
  it("garde les lots annulés, qui font partie de l’histoire", () => {
    const arrivages = [lot("annule", "f1", new Date(2026, 0, 2), { annule: true })];
    const lots = lotsDuFournisseur("f1", arrivages, []);
    expect(lots).toHaveLength(1);
    expect(lots[0].arrivage.annule).toBe(true);
  });
});
