import { describe, expect, it } from "vitest";
import {
  clotureDuJour,
  fondsOuverturePour,
  historiqueDesClotures,
  identifiantCloture,
  journeesAFermer,
  lireMontantCaisse,
  montantSigne,
  motifRequis,
  mouvementsDuJour,
  resumerJournee,
  validerCloture,
  SAISIE_CLOTURE_VIDE,
  SEUIL_MOTIF_DEFAUT,
  type Cloture,
  type Mouvement,
} from "./caisse";
import type { MoyenPaiement } from "./vente";

/**
 * Le domaine de la caisse.
 *
 * **Chaque arbitrage du commanditaire est figé par un test qui le nomme.** Ce
 * n'est pas de la décoration : les six réponses de `specs/S22-caisse.md` ne se
 * relisent nulle part dans le code exécuté, et un changement d'avis doit se
 * voir échouer ici avant d'aller mentir à l'écran.
 *
 * Aucun test n'a besoin d'une horloge : le jour est toujours donné.
 */

const LE_5 = "2026-09-05";
const LE_4 = "2026-09-04";
const LE_3 = "2026-09-03";

/**
 * Une heure d'un jour, dans le fuseau de la machine qui lit le test.
 *
 * Construite champ par champ et non depuis une chaîne ISO : `new Date("...Z")`
 * poserait un instant UTC, et le jour local en sortirait décalé sur toute
 * machine qui n'est pas à Greenwich — c'est-à-dire sur celle du comptoir.
 */
function a(heure: string, jour = LE_5): Date {
  const [h, m] = heure.split(":").map(Number);
  const [annee, mois, quantieme] = jour.split("-").map(Number);
  return new Date(annee, mois - 1, quantieme, h, m);
}

let compteur = 0;
function mouvement(
  options: Partial<Mouvement> & { montant: number; date: Date },
): Mouvement {
  compteur += 1;
  return {
    id: `m${compteur}`,
    boutiqueId: "PTG",
    sens: "entree",
    moyenPaiement: "especes" as MoyenPaiement,
    origine: "versement",
    origineRefId: "",
    libelle: "",
    categorieTranches: false,
    operateur: "Ousmane Sawadogo",
    ...options,
  };
}

function cloture(options: Partial<Cloture> & { jour: string }): Cloture {
  return {
    id: identifiantCloture("PTG", options.jour),
    boutiqueId: "PTG",
    fondsOuverture: 0,
    especesAttendues: 0,
    especesComptees: null,
    ecart: null,
    motif: "",
    cloturePar: "gerant",
    clotureLe: null,
    clotureParNom: "Ousmane Sawadogo",
    ...options,
  };
}

/* ------------------------------------------------------------------------- */

describe("un mouvement", () => {
  it("porte son signe dans son sens, jamais dans son montant", () => {
    const entree = mouvement({ montant: 100_000, date: a("09:20") });
    const sortie = mouvement({ montant: 15_000, date: a("13:15"), sens: "sortie" });

    expect(montantSigne(entree)).toBe(100_000);
    expect(montantSigne(sortie)).toBe(-15_000);
    /* Le montant stocké reste positif : un montant négatif en base aurait deux
       représentations pour la même chose, et l'une finirait par échapper. */
    expect(sortie.montant).toBe(15_000);
  });
});

describe("les mouvements d’une journée", () => {
  it("se lisent dans l’ordre où la journée s’est passée", () => {
    const journal = mouvementsDuJour(
      [
        mouvement({ montant: 150_000, date: a("15:12") }),
        mouvement({ montant: 100_000, date: a("09:20") }),
        mouvement({ montant: 585_000, date: a("10:05") }),
      ],
      LE_5,
    );

    expect(journal.map((m) => m.montant)).toEqual([100_000, 585_000, 150_000]);
  });

  it("écartent les autres journées, sur le jour local et non sur l’horodatage", () => {
    const journal = mouvementsDuJour(
      [
        mouvement({ montant: 1, date: a("23:50", LE_4) }),
        mouvement({ montant: 2, date: a("00:10") }),
      ],
      LE_5,
    );

    /* 23h50 la veille et 00h10 le jour même sont à vingt minutes l'un de
       l'autre, et dans deux journées de caisse différentes. C'est le jour local
       qui tranche — en UTC, la ligne de partage tomberait ailleurs. */
    expect(journal).toHaveLength(1);
    expect(journal[0].montant).toBe(2);
  });

  it("écartent un mouvement sans date plutôt que de l’attribuer au jour regardé", () => {
    const sansDate = { ...mouvement({ montant: 99, date: a("10:00") }), date: null };
    const journal = mouvementsDuJour([sansDate, mouvement({ montant: 1, date: a("10:00") })], LE_5);

    expect(journal.map((m) => m.montant)).toEqual([1]);
  });
});

describe("le résumé d’une journée", () => {
  /* Les six mouvements de la maquette `c2-caisse.html`, à l'identique. C'est le
     seul jeu de données dont on connaisse le résultat attendu de source sûre :
     le commanditaire l'a validé en regardant l'écran. */
  const journeeDeLaMaquette = [
    mouvement({ montant: 100_000, date: a("09:20") }),
    mouvement({ montant: 585_000, date: a("10:05"), origine: "vente_moto" }),
    mouvement({ montant: 22_000, date: a("11:42"), origine: "vente_piece" }),
    mouvement({
      montant: 15_000,
      date: a("13:15"),
      sens: "sortie",
      origine: "depense",
      libelle: "Carburant groupe",
    }),
    mouvement({ montant: 150_000, date: a("14:48"), moyenPaiement: "orange_money", origine: "vente_moto" }),
    mouvement({ montant: 150_000, date: a("15:12"), moyenPaiement: "orange_money" }),
  ];

  it("retrouve les chiffres de la maquette, ligne pour ligne", () => {
    const resume = resumerJournee(50_000, journeeDeLaMaquette);

    expect(resume.fondsOuverture).toBe(50_000);
    expect(resume.especesEncaissees).toBe(707_000);
    expect(resume.sortiesEspeces).toBe(15_000);
    expect(resume.especesAttendues).toBe(742_000);
    expect(resume.nombreMouvements).toBe(6);
  });

  it("garde l’argent du téléphone hors du tiroir", () => {
    const resume = resumerJournee(50_000, journeeDeLaMaquette);

    /* 300 000 d'Orange Money sont entrés ce jour-là, et ils ne sont pas dans le
       tiroir. Les ajouter aux espèces attendues ferait chercher au gérant
       300 000 francs qui n'y seront jamais. */
    expect(resume.parMoyenMobile).toEqual([{ moyen: "orange_money", montant: 300_000 }]);
    expect(resume.especesAttendues).toBe(742_000);
  });

  it("ne liste pas à zéro un moyen qui n’a pas servi", () => {
    const resume = resumerJournee(0, [mouvement({ montant: 10_000, date: a("09:00") })]);

    /* Une ligne « Wave 0 » dans une boutique qui n'accepte pas Wave est du
       bruit — D63 vaut ici aussi. */
    expect(resume.parMoyenMobile).toEqual([]);
  });

  it("compte une sortie mobile en négatif, sans toucher aux espèces", () => {
    const resume = resumerJournee(50_000, [
      mouvement({ montant: 80_000, date: a("09:00"), moyenPaiement: "wave" }),
      mouvement({ montant: 30_000, date: a("11:00"), moyenPaiement: "wave", sens: "sortie" }),
    ]);

    expect(resume.parMoyenMobile).toEqual([{ moyen: "wave", montant: 50_000 }]);
    expect(resume.especesAttendues).toBe(50_000);
  });

  it("rend un fonds d’ouverture intact quand la journée n’a rien vu", () => {
    const resume = resumerJournee(50_000, []);

    expect(resume.especesAttendues).toBe(50_000);
    expect(resume.nombreMouvements).toBe(0);
  });
});

describe("l’identifiant d’une clôture", () => {
  it("rend deux clôtures du même jour structurellement impossibles", () => {
    expect(identifiantCloture("PTG", LE_5)).toBe("PTG_2026-09-05");
    /* Deux appareils qui clôturent la même journée hors ligne visent le même
       document : la collision est le comportement voulu, pas un accident. */
    expect(identifiantCloture("PTG", LE_5)).toBe(identifiantCloture("PTG", LE_5));
    expect(identifiantCloture("FMZ", LE_5)).not.toBe(identifiantCloture("PTG", LE_5));
  });
});

describe("le motif d’écart — réponse 5 du commanditaire", () => {
  it("n’est pas demandé pour un écart sous le seuil", () => {
    expect(motifRequis(0)).toBe(false);
    expect(motifRequis(SEUIL_MOTIF_DEFAUT)).toBe(false);
    expect(motifRequis(-SEUIL_MOTIF_DEFAUT)).toBe(false);
  });

  it("est demandé au-delà du seuil, dans un sens comme dans l’autre", () => {
    /* Un excédent s'explique autant qu'un manque : de l'argent en trop dans un
       tiroir est un mouvement qu'on n'a pas saisi. */
    expect(motifRequis(SEUIL_MOTIF_DEFAUT + 1)).toBe(true);
    expect(motifRequis(-(SEUIL_MOTIF_DEFAUT + 1))).toBe(true);
  });

  it("n’est jamais demandé quand il n’y a pas d’écart connu", () => {
    /* Une journée fermée seule n'a pas d'écart : lui réclamer un motif serait
       demander d'expliquer un nombre que personne n'a mesuré. */
    expect(motifRequis(null)).toBe(false);
  });
});

describe("valider une clôture", () => {
  it("refuse de clôturer sans comptage — c’est ce qui sépare le geste de l’automatique", () => {
    expect(validerCloture(SAISIE_CLOTURE_VIDE, 742_000)).toMatch(/Comptez les espèces/);
  });

  it("accepte un tiroir compté à zéro, qui n’est pas un tiroir non compté", () => {
    expect(validerCloture({ especesComptees: "0", motif: "tout remis" }, 0)).toBeNull();
  });

  it("réclame un motif quand l’écart dépasse le seuil, et le laisse passer sinon", () => {
    const sansMotif = { especesComptees: "740000", motif: "" };
    expect(validerCloture(sansMotif, 742_000)).toMatch(/écart dépasse/);
    expect(validerCloture({ ...sansMotif, motif: "billet manquant" }, 742_000)).toBeNull();
    expect(validerCloture({ especesComptees: "741500", motif: "" }, 742_000)).toBeNull();
  });

  it("refuse un comptage négatif et un motif interminable", () => {
    expect(validerCloture({ especesComptees: "-100", motif: "" }, 0)).toMatch(/négatif/);
    expect(
      validerCloture({ especesComptees: "740000", motif: "x".repeat(301) }, 742_000),
    ).toMatch(/dépasse 300 caractères/);
  });
});

describe("lire un montant de caisse", () => {
  it("tolère les espaces du comptoir et refuse les décimales", () => {
    expect(lireMontantCaisse("742 000")).toBe(742_000);
    expect(lireMontantCaisse("742000")).toBe(742_000);
    /* Le FCFA ne se divise pas : une décimale ici est une faute de frappe, pas
       une précision. */
    expect(lireMontantCaisse("742,50")).toBeNull();
    expect(lireMontantCaisse("beaucoup")).toBeNull();
  });

  it("distingue le vide de zéro", () => {
    /* Un tiroir compté à zéro est une information ; un tiroir non compté n'en
       est pas une. Les confondre effacerait la seule chose que la réponse 4
       oblige à garder distincte. */
    expect(lireMontantCaisse("")).toBeNull();
    expect(lireMontantCaisse("   ")).toBeNull();
    expect(lireMontantCaisse("0")).toBe(0);
  });
});

describe("le fonds d’ouverture — réponses 1 et 4 ensemble", () => {
  it("se reporte des espèces comptées de la veille", () => {
    const fonds = fondsOuverturePour(LE_5, [
      cloture({ jour: LE_4, especesComptees: 742_000, especesAttendues: 742_000, ecart: 0 }),
    ]);

    expect(fonds).toEqual({ montant: 742_000, source: "comptee" });
  });

  it("se reporte des espèces attendues quand la veille s’est fermée seule, et le dit", () => {
    const fonds = fondsOuverturePour(LE_5, [
      cloture({ jour: LE_4, especesAttendues: 742_000, cloturePar: "automatique" }),
    ]);

    /* Le cas que ni la réponse 1 ni la réponse 4 ne montrait seule : la chaîne
       des journées continue de se tenir, mais elle porte un maillon que
       personne n'a vérifié. `source` est ce qui permet à l'écran de le dire au
       lieu de le taire. */
    expect(fonds).toEqual({ montant: 742_000, source: "attendue" });
  });

  it("prend la plus récente des clôtures antérieures, pas la dernière écrite", () => {
    const fonds = fondsOuverturePour(LE_5, [
      cloture({ jour: LE_3, especesComptees: 111_000 }),
      cloture({ jour: LE_4, especesComptees: 222_000 }),
    ]);

    expect(fonds.montant).toBe(222_000);
  });

  it("ignore une clôture du jour regardé ou postérieure", () => {
    const fonds = fondsOuverturePour(LE_4, [
      cloture({ jour: LE_4, especesComptees: 999_000 }),
      cloture({ jour: LE_5, especesComptees: 888_000 }),
      cloture({ jour: LE_3, especesComptees: 111_000 }),
    ]);

    expect(fonds).toEqual({ montant: 111_000, source: "comptee" });
  });

  it("annonce une première journée plutôt qu’un report à zéro", () => {
    /* Zéro et « rien avant » sont deux choses : la première boutique ouverte
       n'a pas un tiroir vide, elle n'a pas de veille. */
    expect(fondsOuverturePour(LE_5, [])).toEqual({ montant: 0, source: "premiere" });
  });
});

describe("les journées à fermer — réponse 4 du commanditaire", () => {
  it("retient les journées passées qui ont vécu et que personne n’a fermées", () => {
    const journees = journeesAFermer(
      [
        mouvement({ montant: 1, date: a("10:00", LE_3) }),
        mouvement({ montant: 2, date: a("10:00", LE_4) }),
      ],
      [],
      LE_5,
    );

    /* Du plus ancien au plus récent : elles se ferment dans l'ordre, chacune
       donnant son fonds d'ouverture à la suivante. */
    expect(journees).toEqual([LE_3, LE_4]);
  });

  it("laisse la journée en cours tranquille", () => {
    const journees = journeesAFermer([mouvement({ montant: 1, date: a("10:00") })], [], LE_5);

    /* Aujourd'hui n'est pas oubliée, elle est en cours. La fermer d'office
       serait fermer le magasin à la place du gérant. */
    expect(journees).toEqual([]);
  });

  it("ne fabrique pas de journée pour un dimanche sans mouvement", () => {
    const journees = journeesAFermer([mouvement({ montant: 1, date: a("10:00", LE_3) })], [], LE_5);

    /* Le 4 n'a rien vu : lui inventer une clôture remplirait l'historique de
       lignes à zéro qui ne disent rien, et donnerait à croire qu'on a compté un
       jour où le rideau est resté baissé. */
    expect(journees).toEqual([LE_3]);
  });

  it("ne repropose pas une journée déjà close", () => {
    const journees = journeesAFermer(
      [
        mouvement({ montant: 1, date: a("10:00", LE_3) }),
        mouvement({ montant: 2, date: a("10:00", LE_4) }),
      ],
      [cloture({ jour: LE_3, especesComptees: 5_000 })],
      LE_5,
    );

    expect(journees).toEqual([LE_4]);
  });
});

describe("l’historique", () => {
  it("se lit du plus récent au plus ancien", () => {
    const liste = historiqueDesClotures([
      cloture({ jour: LE_3 }),
      cloture({ jour: LE_5 }),
      cloture({ jour: LE_4 }),
    ]);

    /* On cherche avant-hier plus souvent que le mois dernier. */
    expect(liste.map((c) => c.jour)).toEqual([LE_5, LE_4, LE_3]);
  });

  it("retrouve la clôture d’un jour, ou rien", () => {
    const clotures = [cloture({ jour: LE_4, especesComptees: 742_000 })];

    expect(clotureDuJour(clotures, LE_4)?.especesComptees).toBe(742_000);
    expect(clotureDuJour(clotures, LE_5)).toBeNull();
  });
});
