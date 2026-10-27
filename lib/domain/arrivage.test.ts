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
  chercherArrivages,
  chercherMotoParChassis,
  completudePapiers,
  ecoulement,
  estEcoule,
  filtrerArrivages,
  ligneEngagee,
  lignesDuLot,
  preparerCorrectionLot,
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
    quittanceRecue: false,
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

describe("completudePapiers", () => {
  /* **S53 compte les deux.** `completudeCmc` ne comptait qu'un des deux papiers
     alors que la quittance a la même nature et se perd de la même façon — et un
     seul des deux compté était ce qui faisait croire que le produit « ne suit
     pas le vrai circuit ». */
  it("compte les quittances manquantes d’un lot comme il compte les CMC", () => {
    const motos = [
      motoLot({ arrivageId: "a1", cmcRecu: true, quittanceRecue: false }),
      motoLot({ arrivageId: "a1", cmcRecu: false, quittanceRecue: true }),
      motoLot({ arrivageId: "a2", cmcRecu: false, quittanceRecue: false }),
    ];
    expect(completudePapiers(motos, "a1")).toEqual({
      total: 2,
      cmcManquants: 1,
      quittancesManquantes: 1,
    });
  });

  it("un lot sans moto n'a rien à réclamer", () => {
    expect(completudePapiers([], "a1")).toEqual({
      total: 0,
      cmcManquants: 0,
      quittancesManquantes: 0,
    });
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
  it("totalise les lots actifs et leurs motos par statut et par papier manquant", () => {
    const arrivages = [arr("a1"), arr("a2"), arr("a3", { annule: true })];
    const motos = [
      motoLot({ arrivageId: "a1", statut: "en_stock", cmcRecu: false, quittanceRecue: true }),
      motoLot({ arrivageId: "a1", statut: "vendue", cmcRecu: true, quittanceRecue: false }),
      motoLot({ arrivageId: "a2", statut: "en_stock", cmcRecu: true, quittanceRecue: true }),
      // lot annulé : ignoré
      motoLot({ arrivageId: "a3", statut: "en_stock", cmcRecu: false, quittanceRecue: false }),
      // unitaire : ignoré
      motoLot({ arrivageId: null, statut: "en_stock", cmcRecu: false, quittanceRecue: false }),
    ];
    expect(bilanArrivages(arrivages, motos)).toEqual({
      arrivages: 2,
      motosRecues: 3,
      enStock: 2,
      vendues: 1,
      cmcManquants: 1,
      quittancesManquantes: 1,
    });
  });
});

describe("filtrerArrivages", () => {
  const arrivages = [
    arr("a1"),
    arr("a2"),
    arr("quittance"),
    arr("ecoule"),
    arr("annule", { annule: true }),
  ];
  const motos = [
    // CMC manquant
    motoLot({ arrivageId: "a1", statut: "en_stock", cmcRecu: false, quittanceRecue: true }),
    // les deux papiers en main, pas écoulé
    motoLot({ arrivageId: "a2", statut: "en_stock", cmcRecu: true, quittanceRecue: true }),
    /* **Le lot que S53 faisait apparaître dans ce filtre, et qui en sort le
       27 octobre 2026.** Son CMC est là, sa quittance non. Le commanditaire a
       retiré la quittance de l'arrivage : un lot complet en CMC ne doit plus
       se déclarer incomplet pour un papier que cet écran ne pointe plus. */
    motoLot({ arrivageId: "quittance", statut: "en_stock", cmcRecu: true, quittanceRecue: false }),
    motoLot({ arrivageId: "ecoule", statut: "vendue", cmcRecu: true, quittanceRecue: true }),
    motoLot({ arrivageId: "annule", statut: "en_stock", cmcRecu: false, quittanceRecue: false }),
  ];

  it("« tous » montre les lots actifs, jamais les annulés", () => {
    expect(filtrerArrivages(arrivages, motos, "tous").map((a) => a.id)).toEqual([
      "a1",
      "a2",
      "quittance",
      "ecoule",
    ]);
  });

  it("« cmc-incomplets » ne garde que les lots dont un CMC manque", () => {
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

/**
 * Corriger les motos d'un lot (26 octobre 2026, demande du commanditaire).
 *
 * « Modifier doit pouvoir modifier tous les éléments, pas uniquement nom,
 * fournisseur… même les motos, numéro… au cas où si le client se trompe à
 * l'enregistrement. » Rien ne permettait de reprendre l'identité d'une moto
 * déjà entrée : un châssis mal relevé sous la poussière restait faux pour
 * toujours, et c'est l'identité physique de l'engin.
 */
describe("corriger les motos d’un lot", () => {
  const duLot = (id: string, p: Partial<Moto> = {}): Moto =>
    ({
      id,
      arrivageId: "a1",
      statut: "en_stock",
      etat: "neuve",
      marqueId: "m1",
      modeleId: "mo1",
      couleur: "rouge",
      annee: null,
      numeroChassis: `LC6PCJ1A9K000000${id}`,
      numeroMoteur: "",
      ...p,
    }) as unknown as Moto;

  it("part de ce que les motos portent déjà", () => {
    const lignes = lignesDuLot([duLot("1"), duLot("2", { annee: 2024 })]);
    expect(lignes).toHaveLength(2);
    expect(lignes[0].motoId).toBe("1");
    expect(lignes[0].numeroChassis).toBe("LC6PCJ1A9K0000001");
    /* Une année inconnue est `null` en base et vide à l'écran : un champ date
       ne sait pas afficher « je ne sais pas » autrement. */
    expect(lignes[0].annee).toBe("");
    expect(lignes[1].annee).toBe("2024");
  });

  it("ne rend que les motos qui ont vraiment changé", () => {
    /* Réécrire les trente motos d'un lot pour une faute de frappe sur une
       seule gonflerait le lot d'écritures et salirait la trace des
       vingt-neuf autres, qui n'ont pas été touchées. */
    const avant = [duLot("1"), duLot("2")];
    const lignes = lignesDuLot(avant);
    lignes[1] = { ...lignes[1], couleur: "noir" };
    const resultat = preparerCorrectionLot(lignes, avant, []);
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    expect(resultat.corrigees).toHaveLength(1);
    expect(resultat.corrigees[0]).toMatchObject({ motoId: "2", couleur: "noir" });
  });

  it("ne rend rien quand rien n’a bougé", () => {
    const avant = [duLot("1")];
    const resultat = preparerCorrectionLot(lignesDuLot(avant), avant, []);
    expect(resultat.ok && resultat.corrigees).toEqual([]);
  });

  it("normalise le châssis corrigé, comme à la saisie", () => {
    const avant = [duLot("1")];
    const lignes = [{ ...lignesDuLot(avant)[0], numeroChassis: " lc6pcj1a9k0000999 " }];
    const resultat = preparerCorrectionLot(lignes, avant, []);
    expect(resultat.ok && resultat.corrigees[0].numeroChassis).toBe("LC6PCJ1A9K0000999");
  });

  /* Le rang voyage avec le refus : la grille allume la ligne fautive, elle ne
     laisse pas chercher laquelle des trente l'est (`DESIGN.md` §5). */
  it("refuse un châssis vide et dit quelle ligne", () => {
    const avant = [duLot("1"), duLot("2")];
    const lignes = lignesDuLot(avant);
    lignes[1] = { ...lignes[1], numeroChassis: "   " };
    const resultat = preparerCorrectionLot(lignes, avant, []);
    expect(resultat.ok).toBe(false);
    if (resultat.ok) return;
    expect(resultat.rang).toBe(1);
    expect(resultat.erreur).toMatch(/châssis/i);
  });

  it("refuse une ligne sans marque", () => {
    const avant = [duLot("1")];
    const lignes = [{ ...lignesDuLot(avant)[0], marqueId: "" }];
    const resultat = preparerCorrectionLot(lignes, avant, []);
    expect(resultat.ok).toBe(false);
    if (resultat.ok) return;
    expect(resultat.erreur).toMatch(/marque/i);
  });

  it("refuse deux motos du lot au même châssis", () => {
    const avant = [duLot("1"), duLot("2")];
    const lignes = lignesDuLot(avant);
    lignes[1] = { ...lignes[1], numeroChassis: lignes[0].numeroChassis };
    const resultat = preparerCorrectionLot(lignes, avant, []);
    expect(resultat.ok).toBe(false);
    if (resultat.ok) return;
    expect(resultat.rang).toBe(1);
    expect(resultat.erreur).toMatch(/deux fois/i);
  });

  it("refuse un châssis déjà porté par une autre moto du stock", () => {
    const avant = [duLot("1")];
    const lignes = [{ ...lignesDuLot(avant)[0], numeroChassis: "LC6PCJ1A9K0000777" }];
    const stock = [...avant, enStock("autre", "LC6PCJ1A9K0000777")];
    const resultat = preparerCorrectionLot(lignes, avant, stock);
    expect(resultat.ok).toBe(false);
    if (resultat.ok) return;
    expect(resultat.erreur).toMatch(/déjà en stock/i);
  });

  it("ne se refuse pas son propre châssis", () => {
    /* La moto corrigée est dans le stock : se comparer à elle-même ferait
       refuser toute correction d'une autre colonne. */
    const avant = [duLot("1")];
    const lignes = [{ ...lignesDuLot(avant)[0], couleur: "bleu" }];
    const resultat = preparerCorrectionLot(lignes, avant, avant);
    expect(resultat.ok).toBe(true);
  });

  /* Comme les six contrôles d'unicité de S40 (D95) : sans le stock, on ne
     décide pas — on dit d'attendre. */
  it("refuse de décider quand le stock n’est pas encore lu", () => {
    const avant = [duLot("1")];
    const lignes = [{ ...lignesDuLot(avant)[0], numeroChassis: "LC6PCJ1A9K0000888" }];
    const resultat = preparerCorrectionLot(lignes, avant, null);
    expect(resultat.ok).toBe(false);
    if (resultat.ok) return;
    expect(resultat.erreur).toMatch(/stock/i);
  });

  it("lit l’année saisie, et accepte qu’on la vide", () => {
    const avant = [duLot("1", { annee: 2024 }), duLot("2")];
    const lignes = lignesDuLot(avant);
    lignes[0] = { ...lignes[0], annee: "" };
    lignes[1] = { ...lignes[1], annee: "2025" };
    const resultat = preparerCorrectionLot(lignes, avant, []);
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    expect(resultat.corrigees).toHaveLength(2);
    expect(resultat.corrigees[0].annee).toBeNull();
    expect(resultat.corrigees[1].annee).toBe(2025);
  });

  it("refuse une année impossible", () => {
    const avant = [duLot("1")];
    const lignes = [{ ...lignesDuLot(avant)[0], annee: "1899" }];
    const resultat = preparerCorrectionLot(lignes, avant, []);
    expect(resultat.ok).toBe(false);
    if (resultat.ok) return;
    expect(resultat.erreur).toMatch(/année/i);
  });
});

describe("chercherArrivages", () => {
  const nomFournisseur = (id: string) => (id === "f1" ? "Bohary" : "Ouédraogo");
  const lots = [
    arr("a1", { nom: "Arrivage mars 2026", fournisseurId: "f1" }),
    arr("a2", { nom: "Arrivage avril 2026", fournisseurId: "f2" }),
  ];

  it("trouve un lot par son nom", () => {
    expect(chercherArrivages(lots, "avril", nomFournisseur).map((l) => l.id)).toEqual(["a2"]);
  });

  it("trouve un lot par le nom de son fournisseur", () => {
    /* C'est ainsi qu'on parle d'un lot au comptoir : « celui de Bohary ». */
    expect(chercherArrivages(lots, "bohary", nomFournisseur).map((l) => l.id)).toEqual(["a1"]);
  });

  it("ignore les accents et la casse", () => {
    /* « Ouédraogo » ne se tape pas accentué sur un clavier de comptoir. */
    expect(chercherArrivages(lots, "OUEDRAOGO", nomFournisseur).map((l) => l.id)).toEqual(["a2"]);
  });

  it("exige que chaque mot se retrouve", () => {
    expect(chercherArrivages(lots, "bohary mars", nomFournisseur)).toHaveLength(1);
    expect(chercherArrivages(lots, "bohary avril", nomFournisseur)).toHaveLength(0);
  });

  it("ne rend rien sur une recherche vide", () => {
    expect(chercherArrivages(lots, "   ", nomFournisseur)).toEqual([]);
  });
});
