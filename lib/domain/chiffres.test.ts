import { describe, expect, it } from "vitest";
import {
  chiffresDuMois,
  cleMois,
  derniersMois,
  libelleMois,
  moisDe,
  moisPrecedent,
  partsParBoutique,
  partsParMode,
  type Mois,
} from "./chiffres";
import type { ModePaiement, Vente, Versement } from "./vente";

/**
 * Les chiffres du mois (S24).
 *
 * Chaque arbitrage du commanditaire y devient un test. C'est le but : une
 * décision de gestion se relit dans un test qui la nomme, pas dans un
 * commentaire qu'on croit sur parole.
 */

const SEPTEMBRE: Mois = { annee: 2026, mois: 8 };
const AOUT: Mois = { annee: 2026, mois: 7 };

let compteur = 0;

function vente(fait: Partial<Vente> & { date: Date; prixConvenu: number }): Vente {
  compteur += 1;
  return {
    id: `v${compteur}`,
    numero: `PTG-2609-${compteur}`,
    numeroInitial: `PTG-2609-${compteur}`,
    boutiqueId: "PTG",
    motoId: `m${compteur}`,
    clientId: "c1",
    modePaiement: "comptant",
    inclus: [],
    nonInclus: [],
    totalPaye: fait.prixConvenu,
    resteDu: 0,
    statutPaiement: "solde",
    dernierVersementAt: null,
    motoRemise: true,
    dateRemiseMoto: null,
    tokenSuivi: "",
    lienSuiviEnvoyeAt: null,
    statutDossier: "ouvert",
    dateClotureDossier: null,
    operateur: "",
    ...fait,
  } as Vente;
}

function versement(date: Date, montant: number, venteId = "v1"): Versement {
  return {
    id: `x${montant}${date.getTime()}`,
    venteId,
    numeroRecu: "",
    date,
    montant,
    moyenPaiement: "especes",
    reference: "",
    encaissementId: "",
    operateur: "",
  } as Versement;
}

const le = (jour: number, mois = 8, annee = 2026) => new Date(annee, mois, jour, 10, 0, 0);

describe("le découpage en mois", () => {
  it("prend le mois de l’appareil, pas celui d’un serveur", () => {
    expect(moisDe(le(5))).toEqual(SEPTEMBRE);
  });

  it("recule d’un mois en changeant d’année quand il faut", () => {
    expect(moisPrecedent({ annee: 2026, mois: 0 })).toEqual({ annee: 2025, mois: 11 });
  });

  it("donne douze mois, du plus récent au plus ancien", () => {
    const liste = derniersMois(le(5), 12);
    expect(liste).toHaveLength(12);
    expect(liste[0]).toEqual(SEPTEMBRE);
    expect(liste[11]).toEqual({ annee: 2025, mois: 9 });
  });

  it("écrit une clé stable et un libellé lisible", () => {
    expect(cleMois(SEPTEMBRE)).toBe("2026-09");
    expect(libelleMois(SEPTEMBRE)).toContain("septembre");
  });
});

describe("les quatre chiffres du mois", () => {
  it("compte les motos vendues du mois, et celles du mois d’avant", () => {
    const ventes = [
      vente({ date: le(3), prixConvenu: 800_000 }),
      vente({ date: le(20), prixConvenu: 700_000 }),
      vente({ date: le(12, 7), prixConvenu: 600_000 }),
    ];
    const chiffres = chiffresDuMois(SEPTEMBRE, ventes, [], new Map());
    expect(chiffres.motosVendues).toBe(2);
    expect(chiffres.motosVenduesAvant).toBe(1);
  });

  /* La décision 3 : l'encaissé est brut. Les avances versées aux prestataires
     sont une sortie, et un solde est le sujet de la caisse (S22). */
  it("somme les versements du mois, sans rien en retrancher", () => {
    const chiffres = chiffresDuMois(
      SEPTEMBRE,
      [],
      [versement(le(2), 150_000), versement(le(28), 300_000), versement(le(2, 7), 999_000)],
      new Map(),
    );
    expect(chiffres.encaisse).toBe(450_000);
  });

  /* « Motos vendues » suit la date de vente, « encaissé » la date du versement.
     Une vente d'août payée en septembre compte donc dans les deux mois, à deux
     cartes différentes. Ce n'est pas une incohérence : c'est ce que les deux
     chiffres mesurent. */
  it("compte une vente d’août encaissée en septembre dans les deux mois, à deux cartes", () => {
    const aout = vente({ date: le(20, 7), prixConvenu: 800_000 });
    const ventes = [aout];
    const paiements = [versement(le(4), 800_000, aout.id)];

    expect(chiffresDuMois(AOUT, ventes, paiements, new Map()).motosVendues).toBe(1);
    expect(chiffresDuMois(AOUT, ventes, paiements, new Map()).encaisse).toBe(0);
    expect(chiffresDuMois(SEPTEMBRE, ventes, paiements, new Map()).motosVendues).toBe(0);
    expect(chiffresDuMois(SEPTEMBRE, ventes, paiements, new Map()).encaisse).toBe(800_000);
  });
});

describe("la marge — décision 1 du commanditaire : entière au mois de la vente", () => {
  it("compte la marge d’une vente en tranches en entier, le mois où elle est faite", () => {
    const tranches = vente({
      date: le(5),
      prixConvenu: 830_000,
      modePaiement: "tranches",
      totalPaye: 150_000,
      resteDu: 680_000,
      motoRemise: false,
    });
    const chiffres = chiffresDuMois(
      SEPTEMBRE,
      [tranches],
      [versement(le(5), 150_000, tranches.id)],
      new Map([[tranches.id, 180_000]]),
    );
    /* Et non 18 % de 180 000 au prorata de l'encaissé : la marge est acquise
       quand la vente est faite. */
    expect(chiffres.marge).toBe(180_000);
  });

  it("signale que cette marge n’est pas encore entrée en caisse", () => {
    const tranches = vente({
      date: le(5),
      prixConvenu: 830_000,
      modePaiement: "tranches",
      motoRemise: false,
    });
    const chiffres = chiffresDuMois(SEPTEMBRE, [tranches], [], new Map([[tranches.id, 180_000]]));
    /* Sans ce drapeau, la décision 1 devient un mensonge tranquille : l'écran
       annoncerait de l'argent que le magasin n'a pas touché. */
    expect(chiffres.margePartiellementEncaissee).toBe(true);
  });

  it("ne le signale pas quand tout le mois est au comptant", () => {
    const comptant = vente({ date: le(5), prixConvenu: 700_000 });
    const chiffres = chiffresDuMois(SEPTEMBRE, [comptant], [], new Map([[comptant.id, 90_000]]));
    expect(chiffres.margePartiellementEncaissee).toBe(false);
  });

  /* Un gérant n'a pas ces documents : les règles les lui refusent (D2). Zéro
     dirait « aucune marge », ce qui est une affirmation ; `null` dit « je ne
     sais pas », ce qui est la vérité. */
  it("rend null, et non zéro, quand aucune marge n’est connue", () => {
    const chiffres = chiffresDuMois(
      SEPTEMBRE,
      [vente({ date: le(5), prixConvenu: 700_000 })],
      [],
      new Map(),
    );
    expect(chiffres.marge).toBeNull();
  });
});

describe("créances et dépôts — décision 2 : jamais additionnés", () => {
  const credit = vente({
    date: le(6),
    prixConvenu: 695_000,
    modePaiement: "credit",
    totalPaye: 200_000,
    resteDu: 495_000,
  });
  const tranches = vente({
    date: le(7),
    prixConvenu: 830_000,
    modePaiement: "tranches",
    totalPaye: 150_000,
    resteDu: 680_000,
    motoRemise: false,
  });

  it("range le crédit en créance : la moto est partie, l’argent manque", () => {
    const chiffres = chiffresDuMois(SEPTEMBRE, [credit, tranches], [], new Map());
    expect(chiffres.creances).toBe(495_000);
  });

  it("range la tranche en dépôt : la moto est au magasin, l’argent est là", () => {
    const chiffres = chiffresDuMois(SEPTEMBRE, [credit, tranches], [], new Map());
    expect(chiffres.depots).toBe(150_000);
  });

  it("cesse de compter en dépôt une tranche dont la moto est remise", () => {
    const remise = vente({
      date: le(8),
      prixConvenu: 600_000,
      modePaiement: "tranches",
      totalPaye: 600_000,
      resteDu: 0,
      motoRemise: true,
    });
    expect(chiffresDuMois(SEPTEMBRE, [remise], [], new Map()).depots).toBe(0);
  });
});

describe("le mois vide — décision 6", () => {
  it("se déclare vide quand rien n’a été vendu ni encaissé", () => {
    expect(chiffresDuMois(SEPTEMBRE, [], [], new Map()).vide).toBe(true);
  });

  it("cesse de l’être dès qu’un versement est tombé, même sans vente ce mois-là", () => {
    const chiffres = chiffresDuMois(SEPTEMBRE, [], [versement(le(9), 50_000)], new Map());
    expect(chiffres.vide).toBe(false);
  });
});

describe("les répartitions en barres", () => {
  const ventes = [
    vente({ date: le(2), prixConvenu: 900_000, boutiqueId: "OUA" }),
    vente({ date: le(3), prixConvenu: 800_000, boutiqueId: "OUA" }),
    vente({ date: le(4), prixConvenu: 700_000, boutiqueId: "PTG" }),
    vente({ date: le(4, 7), prixConvenu: 999_000, boutiqueId: "KDG" }),
  ];
  const nom = (id: string) => `Boutique ${id}`;

  it("groupe par boutique, du plus gros au plus petit, et ignore les autres mois", () => {
    const parts = partsParBoutique(SEPTEMBRE, ventes, nom);
    expect(parts.map((p) => p.cle)).toEqual(["OUA", "PTG"]);
    expect(parts[0].montant).toBe(1_700_000);
    expect(parts[0].compte).toBe(2);
  });

  /* Rapportées au total, trois boutiques équilibrées donnent trois barres à
     33 % qui n'occupent qu'un tiers de la place et ne se comparent plus. La
     question posée est « laquelle pèse le plus ». */
  it("rapporte les barres à la plus grande part, et non au total", () => {
    const parts = partsParBoutique(SEPTEMBRE, ventes, nom);
    expect(parts[0].pourcentage).toBe(100);
    expect(parts[1].pourcentage).toBe(41);
  });

  it("groupe par mode de paiement, sous le nom que le produit emploie partout", () => {
    const modes: ModePaiement[] = ["comptant", "credit", "tranches"];
    const varies = modes.map((mode, i) =>
      vente({ date: le(10 + i), prixConvenu: 100_000 * (i + 1), modePaiement: mode }),
    );
    const parts = partsParMode(SEPTEMBRE, varies);
    expect(parts.map((p) => p.libelle)).toEqual(["Tranches", "Crédit", "Comptant"]);
  });

  it("ne divise par rien quand le mois est vide", () => {
    expect(partsParBoutique(SEPTEMBRE, [], nom)).toEqual([]);
    expect(partsParMode(SEPTEMBRE, [])).toEqual([]);
  });
});
