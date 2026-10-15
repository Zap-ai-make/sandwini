import { describe, expect, it } from "vitest";
import { normaliserNom } from "./client";
import { formaterMontant } from "./format";
import { estNumeroValide } from "./numerotation";
import {
  FILTRES_PAIEMENT,
  MONTANT_MAX,
  SAISIE_VENTE_VIDE,
  SAISIE_VERSEMENT_VIDE,
  agregatsPaiement,
  appliquerSaisieVente,
  bilanVentes,
  chercherVentes,
  comparerVentes,
  dettes,
  filtrerPaiements,
  inclusionsDeVente,
  estEngagement,
  estInactive,
  estRenumerotee,
  joursDepuis,
  lignePaiement,
  lireMontant,
  lireMontantEncaisse,
  motoRemiseA,
  numeroRecuVersement,
  paiementsDeLaPeriode,
  paiementsEchelonnes,
  peutRemettreMoto,
  resumerDossier,
  ventesDuClient,
  statutMotoApresVente,
  statutPaiementDe,
  suivrePaiements,
  totalDetenu,
  totalDu,
  tranchesEnCours,
  validerVente,
  validerVersement,
  versementMaximal,
  type FiltrePaiement,
  type SaisieVente,
  type SaisieVersement,
  type Vente,
  type VenteCherchable,
  type Versement,
  lireEmporte,
} from "./vente";

/**
 * Le calcul d'une vente.
 *
 * C'est le module où un bug coûte de l'argent réel : un reste dû faux se
 * réclame à un client ou s'oublie. Tout ce qui suit est du calcul pur, vérifié
 * sans émulateur et en millisecondes (`ARCHITECTURE.md` §4).
 */

const saisie = (partie: Partial<SaisieVente> = {}): SaisieVente => ({
  ...SAISIE_VENTE_VIDE,
  motoId: "moto-1",
  clientId: "client-1",
  prixConvenu: "1200000",
  montantEncaisse: "1200000",
  ...partie,
});

describe("lecture des montants", () => {
  it("accepte un entier, espaces compris — on tape « 1 200 000 »", () => {
    expect(lireMontant("1 200 000")).toBe(1_200_000);
    expect(lireMontant("1200000")).toBe(1_200_000);
  });

  it("refuse tout ce qui n’est pas un entier : le FCFA ne se divise pas", () => {
    expect(lireMontant("1200.50")).toBeNull();
    expect(lireMontant("1200,50")).toBeNull();
    expect(lireMontant("-1200")).toBeNull();
    expect(lireMontant("")).toBeNull();
    expect(lireMontant("douze")).toBeNull();
  });

  it("un montant encaissé vide vaut zéro, mais un montant illisible reste illisible", () => {
    expect(lireMontantEncaisse("")).toBe(0);
    expect(lireMontantEncaisse("   ")).toBe(0);
    expect(lireMontantEncaisse("50000")).toBe(50_000);
    expect(lireMontantEncaisse("cinquante")).toBeNull();
  });
});

describe("agrégats de paiement", () => {
  it("sans versement, tout est dû", () => {
    expect(agregatsPaiement(1_200_000, [])).toEqual({
      totalPaye: 0,
      resteDu: 1_200_000,
      statutPaiement: "impaye",
    });
  });

  it("un versement partiel laisse un reste et le dit", () => {
    expect(agregatsPaiement(1_200_000, [{ montant: 400_000 }])).toEqual({
      totalPaye: 400_000,
      resteDu: 800_000,
      statutPaiement: "partiel",
    });
  });

  it("plusieurs versements qui couvrent le prix soldent la vente", () => {
    expect(
      agregatsPaiement(1_200_000, [
        { montant: 400_000 },
        { montant: 500_000 },
        { montant: 300_000 },
      ]),
    ).toEqual({ totalPaye: 1_200_000, resteDu: 0, statutPaiement: "solde" });
  });

  it("un trop-perçu ne fabrique pas un reste négatif", () => {
    /* Un reste négatif se lirait « le magasin doit 50 000 au client ». Le refus
       a lieu en amont ; ici on garantit qu'aucun écran n'affichera l'absurde. */
    expect(agregatsPaiement(1_200_000, [{ montant: 1_250_000 }])).toEqual({
      totalPaye: 1_250_000,
      resteDu: 0,
      statutPaiement: "solde",
    });
  });

  it("les versements sont toujours resommés, jamais cumulés à un agrégat", () => {
    const versements = [{ montant: 100_000 }, { montant: 100_000 }];
    expect(agregatsPaiement(500_000, versements).totalPaye).toBe(200_000);
    expect(agregatsPaiement(500_000, versements).totalPaye).toBe(200_000);
  });

  it("le statut se déduit du couple total payé / reste dû", () => {
    expect(statutPaiementDe(0, 1000)).toBe("impaye");
    expect(statutPaiementDe(500, 500)).toBe("partiel");
    expect(statutPaiementDe(1000, 0)).toBe("solde");
  });

  it("le versement maximal est ce qui reste, jamais moins que zéro", () => {
    expect(versementMaximal(1_000_000, 250_000)).toBe(750_000);
    expect(versementMaximal(1_000_000, 1_000_000)).toBe(0);
    expect(versementMaximal(1_000_000, 1_200_000)).toBe(0);
  });
});

describe("ce que le mode de paiement décide", () => {
  it("comptant et crédit livrent la moto ; les tranches la retiennent", () => {
    expect(statutMotoApresVente("comptant")).toBe("vendue");
    expect(statutMotoApresVente("credit")).toBe("vendue");
    expect(statutMotoApresVente("tranches")).toBe("reservee");

    expect(motoRemiseA("comptant")).toBe(true);
    expect(motoRemiseA("credit")).toBe(true);
    expect(motoRemiseA("tranches")).toBe(false);
  });

  it("l’argent des tranches est un engagement tant que la moto dort au magasin", () => {
    expect(estEngagement("tranches", false)).toBe(true);
    expect(estEngagement("tranches", true)).toBe(false);
    /* Le crédit, lui, est une recette dès le premier franc : la moto est déjà
       partie. C'est toute la différence entre les deux modes. */
    expect(estEngagement("credit", true)).toBe(false);
    expect(estEngagement("comptant", true)).toBe(false);
  });
});

describe("validation d’une saisie de vente", () => {
  it("accepte une vente au comptant payée en entier", () => {
    expect(validerVente(saisie())).toBeNull();
  });

  it("exige la moto et le client", () => {
    expect(validerVente(saisie({ motoId: "" }))).toMatch(/moto/i);
    expect(validerVente(saisie({ clientId: "" }))).toMatch(/client/i);
  });

  it("exige un prix entier et strictement positif", () => {
    expect(validerVente(saisie({ prixConvenu: "" }))).toMatch(/obligatoire/);
    expect(validerVente(saisie({ prixConvenu: "0", montantEncaisse: "0" }))).toMatch(
      /supérieur à zéro/,
    );
    expect(validerVente(saisie({ prixConvenu: "1200.5" }))).toMatch(/entiers/);
    expect(validerVente(saisie({ prixConvenu: String(MONTANT_MAX + 1) }))).toMatch(/maximum/);
  });

  it("refuse un encaissement supérieur au prix convenu", () => {
    expect(validerVente(saisie({ montantEncaisse: "1300000" }))).toMatch(/dépasser le prix/);
  });

  it("une vente au comptant doit être payée en entier, sinon on nomme les autres modes", () => {
    const message = validerVente(saisie({ montantEncaisse: "600000" }));
    expect(message).toMatch(/comptant/i);
    expect(message).toMatch(/crédit ou tranches/);
  });

  it("crédit et tranches acceptent un acompte, ou rien du tout", () => {
    expect(validerVente(saisie({ modePaiement: "credit", montantEncaisse: "" }))).toBeNull();
    expect(validerVente(saisie({ modePaiement: "credit", montantEncaisse: "300000" }))).toBeNull();
    expect(validerVente(saisie({ modePaiement: "tranches", montantEncaisse: "" }))).toBeNull();
  });

  /* Deux booléens ne se valident pas : ce qui était une liste bornée à vingt
     lignes est maintenant coché ou non, et l'une comme l'autre est valable. */
  it("accepte les quatre combinaisons d’inclusions", () => {
    for (const carteGrise of [true, false]) {
      for (const casque of [true, false]) {
        expect(validerVente(saisie({ carteGrise, casque })), `${carteGrise}/${casque}`).toBeNull();
      }
    }
  });

  it("borne la référence du moyen de paiement", () => {
    expect(validerVente(saisie({ reference: "R".repeat(61) }))).toMatch(/référence/i);
  });
});

describe("inclusionsDeVente", () => {
  const venteAvecBooleens = (carteGrise: boolean, casque: boolean) =>
    ({ carteGrise, casque, inclus: [], nonInclus: [] }) as Pick<
      Vente,
      "carteGrise" | "casque" | "inclus" | "nonInclus"
    >;

  it("rend les deux inclusions nommées, cochées ou non", () => {
    expect(inclusionsDeVente(venteAvecBooleens(true, false))).toEqual([
      { libelle: "Carte grise", inclus: true },
      { libelle: "Casque", inclus: false },
    ]);
  });

  /* La rétro-compatibilité, et c'est le test qui la tient : une vente d'avant
     S44 n'a pas les booléens. On ne devine pas ce qu'elle contenait — on rend
     `null`, et l'appelant retombe sur les listes de texte qu'elle porte. */
  it("rend null pour une vente d’avant S44", () => {
    const ancienne = {
      carteGrise: null,
      casque: null,
      inclus: ["Casque", "Bidon d’huile"],
      nonInclus: ["Rétroviseur gauche"],
    } as Pick<Vente, "carteGrise" | "casque" | "inclus" | "nonInclus">;
    expect(inclusionsDeVente(ancienne)).toBeNull();
  });

  it("ne rend null que si les deux manquent, pas si l’une vaut false", () => {
    expect(inclusionsDeVente(venteAvecBooleens(false, false))).not.toBeNull();
  });
});

describe("bilanVentes", () => {
  const ligne = (prixConvenu: number, totalPaye: number) =>
    ({ prixConvenu, totalPaye, resteDu: prixConvenu - totalPaye }) as Pick<
      Vente,
      "prixConvenu" | "totalPaye" | "resteDu"
    >;

  it("somme ce que l’écran a déjà chargé, sans rien stocker", () => {
    expect(bilanVentes([ligne(1_200_000, 1_200_000), ligne(800_000, 300_000)])).toEqual({
      ventes: 2,
      chiffreAffaires: 2_000_000,
      encaisse: 1_500_000,
      resteAPercevoir: 500_000,
    });
  });

  it("rend quatre zéros sur un périmètre sans vente — c’est l’écran qui choisit de ne pas les afficher", () => {
    expect(bilanVentes([])).toEqual({
      ventes: 0,
      chiffreAffaires: 0,
      encaisse: 0,
      resteAPercevoir: 0,
    });
  });

  /* Le total encaissé et le reste à percevoir se recomposent toujours en le
     chiffre d'affaires : si un jour ils divergent, c'est l'agrégat de la vente
     qui a menti, et le test le dira ici plutôt qu'à l'écran. */
  it("garde l’identité encaissé + reste = chiffre d’affaires", () => {
    const bilan = bilanVentes([ligne(500_000, 0), ligne(750_000, 750_000), ligne(900_000, 10_000)]);
    expect(bilan.encaisse + bilan.resteAPercevoir).toBe(bilan.chiffreAffaires);
  });
});

describe("numéro corrigé par le serveur", () => {
  it("une vente est renumérotée quand ses deux numéros ont divergé", () => {
    expect(estRenumerotee({ numero: "PTG-2608-0042", numeroInitial: "PTG-2608-0042" })).toBe(false);
    expect(estRenumerotee({ numero: "PTG-2608-0042-B", numeroInitial: "PTG-2608-0042" })).toBe(
      true,
    );
  });

  it("un numéro initial absent ne fait pas croire à une renumérotation", () => {
    expect(estRenumerotee({ numero: "PTG-2608-0042", numeroInitial: "" })).toBe(false);
  });
});

describe("recherche d’une vente", () => {
  const vente = (partie: Partial<Vente>): Vente => ({
    id: "v1",
    numero: "PTG-2608-0042",
    numeroInitial: "PTG-2608-0042",
    boutiqueId: "PTG",
    motoId: "moto-1",
    clientId: "client-1",
    date: new Date("2026-08-20T10:00:00Z"),
    prixConvenu: 1_200_000,
    modePaiement: "comptant",
    carteGrise: true,
    casque: true,
    emporte: { quittance: false, cmc: false },
    carteGriseChemin: null,
    inclus: [],
    nonInclus: [],
    totalPaye: 1_200_000,
    resteDu: 0,
    statutPaiement: "solde",
    dernierVersementAt: null,
    motoRemise: true,
    dateRemiseMoto: null,
    tokenSuivi: "t",
    lienSuiviEnvoyeAt: null,
    statutDossier: "ouvert",
    dateClotureDossier: null,
    operateur: "Awa Sawadogo",
    ...partie,
  });

  const cherchables: VenteCherchable[] = [
    {
      vente: vente({ id: "v1", numero: "PTG-2608-0042" }),
      nomNormalise: "ouedraogo salif",
      telephones: ["22670123456", "70123456"],
      chassis: "LC6PCJ1A0000001",
    },
    {
      vente: vente({ id: "v2", numero: "PTG-2608-0043" }),
      nomNormalise: "kabore adama",
      telephones: ["22665998877"],
      chassis: "LC6PCJ1A0000002",
    },
  ];

  const trouver = (recherche: string) =>
    chercherVentes(cherchables, recherche, normaliserNom).map((ligne) => ligne.vente.id);

  it("sans recherche, tout est rendu", () => {
    expect(trouver("")).toEqual(["v1", "v2"]);
  });

  it("trouve sur le nom, sans casse ni accents", () => {
    expect(trouver("OUÉDRAOGO")).toEqual(["v1"]);
    expect(trouver("kabore")).toEqual(["v2"]);
  });

  it("trouve sur un fragment de téléphone — on se souvient de la fin", () => {
    expect(trouver("123456")).toEqual(["v1"]);
    expect(trouver("99 88 77")).toEqual(["v2"]);
  });

  it("trouve sur le numéro de la vente, tirets ou pas", () => {
    expect(trouver("PTG26080042")).toEqual(["v1"]);
    expect(trouver("ptg-2608-0043")).toEqual(["v2"]);
  });

  it("trouve sur le châssis, parce que c’est parfois tout ce qu’on a", () => {
    expect(trouver("0000002")).toEqual(["v2"]);
  });

  it("rend une liste vide quand rien ne correspond", () => {
    expect(trouver("Sanou")).toEqual([]);
  });

  it("classe de la plus récente à la plus ancienne", () => {
    const ancienne = vente({ id: "a", date: new Date("2026-08-01T10:00:00Z") });
    const recente = vente({ id: "r", date: new Date("2026-08-25T10:00:00Z") });
    expect([ancienne, recente].sort(comparerVentes).map((v) => v.id)).toEqual(["r", "a"]);
  });
});

/**
 * Le montant reçu suit le mode tant qu'on n'y a pas touché.
 *
 * Le premier cas est celui qui manquait : la modale s'ouvre **déjà** au
 * comptant, si bien que le prix arrive toujours après le mode. La règle vivait
 * au changement de mode, et ne s'appliquait donc jamais au chemin ordinaire.
 */
describe("la saisie de vente, quand le montant reçu n’a pas été tapé", () => {
  const vierge = (partie: Partial<typeof SAISIE_VENTE_VIDE>) =>
    appliquerSaisieVente(SAISIE_VENTE_VIDE, partie, false);

  it("au comptant, le prix qui arrive après le mode entraîne le montant", () => {
    expect(vierge({ prixConvenu: "1200000" }).montantEncaisse).toBe("1200000");
  });

  it("le montant suit le prix tant qu’on le retape, chiffre après chiffre", () => {
    let saisie = appliquerSaisieVente(SAISIE_VENTE_VIDE, { prixConvenu: "12" }, false);
    saisie = appliquerSaisieVente(saisie, { prixConvenu: "120" }, false);
    expect(saisie.montantEncaisse).toBe("120");
  });

  it("hors comptant, il reste vide : un crédit pré-payé en entier serait un contresens", () => {
    const comptant = vierge({ prixConvenu: "900000" });
    expect(comptant.montantEncaisse).toBe("900000");
    const credit = appliquerSaisieVente(comptant, { modePaiement: "credit" }, false);
    expect(credit.montantEncaisse).toBe("");
  });

  it("revenir au comptant repose le prix entier", () => {
    const credit = vierge({ prixConvenu: "500000", modePaiement: "credit" });
    expect(credit.montantEncaisse).toBe("");
    expect(appliquerSaisieVente(credit, { modePaiement: "comptant" }, false).montantEncaisse).toBe(
      "500000",
    );
  });

  it("un changement qui ne touche ni au prix ni au mode ne le dérange pas", () => {
    const avant = vierge({ prixConvenu: "700000" });
    const apres = appliquerSaisieVente(avant, { moyenPaiement: "orange_money" }, false);
    expect(apres.montantEncaisse).toBe("700000");
    expect(apres.moyenPaiement).toBe("orange_money");
  });
});

describe("la saisie de vente, une fois le montant tapé à la main", () => {
  /* Le champ appartient alors au gérant — y compris le zéro qu'il a mis
     exprès. C'est le principe du prix conseillé : un point de départ, jamais
     un verrou. */
  const tapee = { ...SAISIE_VENTE_VIDE, prixConvenu: "1200000", montantEncaisse: "600000" };

  it("changer le prix ne réécrit pas ce qu’on a tapé", () => {
    expect(appliquerSaisieVente(tapee, { prixConvenu: "1300000" }, true).montantEncaisse).toBe(
      "600000",
    );
  });

  it("changer de mode ne l’efface pas davantage", () => {
    expect(appliquerSaisieVente(tapee, { modePaiement: "tranches" }, true).montantEncaisse).toBe(
      "600000",
    );
  });

  it("vider le champ le laisse vide, même au comptant", () => {
    expect(appliquerSaisieVente(tapee, { montantEncaisse: "" }, true).montantEncaisse).toBe("");
  });

  it("le zéro délibéré survit : c’est une vente à crédit sans acompte", () => {
    const credit = { ...tapee, modePaiement: "credit" as const, montantEncaisse: "0" };
    expect(appliquerSaisieVente(credit, { prixConvenu: "800000" }, true).montantEncaisse).toBe("0");
  });
});

describe("résumé du dossier", () => {
  const document = (type: string, statut: string) =>
    ({ id: type, venteId: "v1", type, statut }) as never;

  it("dit combien de documents sont à chaque étape, dans l’ordre du circuit", () => {
    expect(
      resumerDossier([
        document("quittance", "remis_client"),
        document("cmc", "a_faire"),
        document("carte_grise", "chez_prestataire"),
      ]),
    ).toBe("1 à faire · 1 chez le prestataire · 1 remis au client");
  });

  /* Trois depuis S48 : la plaque a quitté le dossier, l'immatriculation étant
     déjà portée par la carte grise. La fonction, elle, compte ce qu'on lui
     donne — c'est l'appelant qui décide du circuit. */
  it("un dossier tout neuf a tous ses documents à faire", () => {
    expect(
      resumerDossier([
        document("quittance", "a_faire"),
        document("cmc", "a_faire"),
        document("carte_grise", "a_faire"),
      ]),
    ).toBe("3 à faire");
  });

  it("distingue « pas encore chargé » de « rien à faire »", () => {
    expect(resumerDossier([])).toBe("Dossier non chargé");
  });
});

/* --- S9 — versements, dettes et tranches --------------------------------- */

const versement = (partie: Partial<Versement> = {}): Versement => ({
  id: "vers-1",
  venteId: "v1",
  numeroRecu: "PTG-2608-0042",
  date: new Date("2026-08-20T10:00:00Z"),
  montant: 200_000,
  moyenPaiement: "especes",
  reference: "",
  encaissementId: "enc-1",
  operateur: "Awa Sawadogo",
  ...partie,
});

const venteS9 = (partie: Partial<Vente> = {}): Vente => ({
  id: "v1",
  numero: "PTG-2608-0042",
  numeroInitial: "PTG-2608-0042",
  boutiqueId: "PTG",
  motoId: "moto-1",
  clientId: "client-1",
  date: new Date("2026-08-01T10:00:00Z"),
  prixConvenu: 1_200_000,
  modePaiement: "credit",
  carteGrise: true,
  casque: true,
  emporte: { quittance: false, cmc: false },
  carteGriseChemin: null,
  inclus: [],
  nonInclus: [],
  totalPaye: 0,
  resteDu: 1_200_000,
  statutPaiement: "impaye",
  dernierVersementAt: null,
  motoRemise: true,
  dateRemiseMoto: null,
  tokenSuivi: "t",
  lienSuiviEnvoyeAt: null,
  statutDossier: "ouvert",
  dateClotureDossier: null,
  operateur: "Awa Sawadogo",
  ...partie,
});

/** Le 31 août 2026 à midi : trente jours après la vente de référence. */
const MAINTENANT = new Date("2026-08-31T12:00:00Z");

describe("validation d’un versement", () => {
  const saisieVersement = (partie: Partial<SaisieVersement> = {}): SaisieVersement => ({
    ...SAISIE_VERSEMENT_VIDE,
    montant: "100000",
    ...partie,
  });

  it("accepte un versement inférieur au reste dû", () => {
    expect(validerVersement(saisieVersement(), 500_000)).toBeNull();
  });

  it("accepte un versement qui solde exactement", () => {
    expect(validerVersement(saisieVersement({ montant: "500000" }), 500_000)).toBeNull();
  });

  it("refuse un versement qui dépasse le reste dû, et dit le maximum", () => {
    /* Le montant est formaté, pas brut : c'est un chiffre qu'on lit à voix
       haute au client qui attend au comptoir. */
    const message = validerVersement(saisieVersement({ montant: "500001" }), 500_000);
    expect(message).toContain(formaterMontant(500_000));
  });

  it("refuse d’encaisser sur une vente déjà soldée", () => {
    expect(validerVersement(saisieVersement(), 0)).toContain("soldée");
  });

  it("refuse un montant vide, décimal ou nul", () => {
    for (const montant of ["", "0", "1500,50", "abc"]) {
      expect(validerVersement(saisieVersement({ montant }), 500_000)).not.toBeNull();
    }
  });

  it("refuse une référence trop longue", () => {
    const reference = "R".repeat(61);
    expect(validerVersement(saisieVersement({ reference }), 500_000)).toContain("référence");
  });
});

describe("numéro de reçu d’un versement", () => {
  it("dérive du numéro de la vente et de son rang", () => {
    expect(numeroRecuVersement("PTG-2608-0042", 2)).toBe("PTG-2608-0042/V2");
  });

  it("suit la vente jusque dans son suffixe de collision", () => {
    expect(numeroRecuVersement("PTG-2608-0042-B", 3)).toBe("PTG-2608-0042-B/V3");
  });

  it("ne se lit pas comme un numéro de pièce : il ne perturbe pas le compteur", () => {
    expect(estNumeroValide(numeroRecuVersement("PTG-2608-0042", 2))).toBe(false);
  });
});

describe("ancienneté", () => {
  it("compte les jours entiers écoulés", () => {
    expect(joursDepuis(new Date("2026-08-01T10:00:00Z"), MAINTENANT)).toBe(30);
  });

  it("rend zéro le jour même", () => {
    expect(joursDepuis(new Date("2026-08-31T08:00:00Z"), MAINTENANT)).toBe(0);
  });

  it("rend zéro plutôt qu’un négatif si l’horloge de l’appareil est en avance", () => {
    expect(joursDepuis(new Date("2026-09-10T10:00:00Z"), MAINTENANT)).toBe(0);
  });

  it("rend null quand la date manque", () => {
    expect(joursDepuis(null, MAINTENANT)).toBeNull();
  });
});

describe("ligne de paiement", () => {
  it("recalcule les totaux depuis les versements, pas depuis l’agrégat de la vente", () => {
    /* L’agrégat ment volontairement ici : c’est exactement le cas de deux
       appareils hors ligne qui se marchent dessus (D56). */
    const ligne = lignePaiement(
      venteS9({ totalPaye: 200_000, resteDu: 1_000_000 }),
      [versement({ montant: 200_000 }), versement({ id: "v2", montant: 300_000 })],
      MAINTENANT,
    );
    expect(ligne.totalPaye).toBe(500_000);
    expect(ligne.resteDu).toBe(700_000);
    expect(ligne.statutPaiement).toBe("partiel");
  });

  it("retient la date du versement le plus récent", () => {
    const ligne = lignePaiement(
      venteS9(),
      [
        versement({ id: "a", date: new Date("2026-08-10T10:00:00Z") }),
        versement({ id: "b", date: new Date("2026-08-25T10:00:00Z") }),
        versement({ id: "c", date: new Date("2026-08-18T10:00:00Z") }),
      ],
      MAINTENANT,
    );
    expect(ligne.dernierVersementAt).toEqual(new Date("2026-08-25T10:00:00Z"));
    expect(ligne.joursSansVersement).toBe(6);
  });

  it("compte l’inactivité depuis la vente quand rien n’a jamais été versé", () => {
    const ligne = lignePaiement(venteS9(), [], MAINTENANT);
    expect(ligne.joursSansVersement).toBe(30);
    expect(ligne.anciennete).toBe(30);
  });
});

describe("listes de suivi des paiements", () => {
  const ancienne = venteS9({ id: "ancienne", date: new Date("2026-07-01T10:00:00Z") });
  const recente = venteS9({ id: "recente", date: new Date("2026-08-20T10:00:00Z") });
  const soldee = venteS9({ id: "soldee", date: new Date("2026-07-15T10:00:00Z") });
  const enTranches = venteS9({
    id: "tranches",
    modePaiement: "tranches",
    motoRemise: false,
    date: new Date("2026-07-10T10:00:00Z"),
  });
  const remise = venteS9({ id: "remise", modePaiement: "tranches", motoRemise: true });
  const comptant = venteS9({ id: "comptant", modePaiement: "comptant" });

  const lignes = suivrePaiements(
    [ancienne, recente, soldee, enTranches, remise, comptant],
    [
      versement({ id: "p1", venteId: "recente", montant: 200_000 }),
      versement({ id: "p2", venteId: "soldee", montant: 1_200_000 }),
      versement({ id: "p3", venteId: "tranches", montant: 450_000 }),
      versement({ id: "p4", venteId: "remise", montant: 1_200_000 }),
      versement({ id: "p5", venteId: "comptant", montant: 1_200_000 }),
    ],
    MAINTENANT,
  );

  it("les dettes sont les crédits non soldés, de la plus ancienne à la plus récente", () => {
    expect(dettes(lignes).map((ligne) => ligne.vente.id)).toEqual(["ancienne", "recente"]);
  });

  it("une vente au comptant ou en tranches n’est jamais une dette", () => {
    const identifiants = dettes(lignes).map((ligne) => ligne.vente.id);
    expect(identifiants).not.toContain("comptant");
    expect(identifiants).not.toContain("tranches");
  });

  it("le total dû additionne les restes, pas les prix", () => {
    expect(totalDu(dettes(lignes))).toBe(1_200_000 + 1_000_000);
  });

  it("les tranches en cours sont celles dont la moto n’est pas partie", () => {
    expect(tranchesEnCours(lignes).map((ligne) => ligne.vente.id)).toEqual(["tranches"]);
  });

  it("le total détenu additionne ce qui a été encaissé pour le compte des clients", () => {
    expect(totalDetenu(tranchesEnCours(lignes))).toBe(450_000);
  });

  /**
   * L'écran des paiements montre désormais **tout le paiement échelonné**, et
   * non plus seulement ce qui attend.
   *
   * Tant qu'il ne contenait que les dettes et les tranches en cours, la
   * pastille « Soldées » n'aurait jamais rien rendu — c'est ce que disait la
   * docstring de `filtrerPaiements`. On a donc élargi la liste plutôt que
   * d'ajouter un filtre vide.
   */
  describe("la liste élargie du paiement échelonné", () => {
    it("retient les crédits et les tranches, soldés compris, de la plus ancienne à la plus récente", () => {
      expect(paiementsEchelonnes(lignes).map((ligne) => ligne.vente.id)).toEqual([
        "ancienne",
        "tranches",
        "soldee",
        "remise",
        "recente",
      ]);
    });

    it("laisse le comptant dehors : il est soldé à l’instant de la saisie et n’a jamais rien attendu", () => {
      expect(paiementsEchelonnes(lignes).map((ligne) => ligne.vente.id)).not.toContain("comptant");
    });

    /* Le point de bascule de ce changement : les deux totaux ne doivent
       compter que ce qui est encore engagé. Une tranche soldée dont la moto
       est partie n'est plus de l'argent détenu — l'additionner ferait croire
       que le magasin tient une somme qu'il a déjà rendue en moto. */
    it("le total détenu ignore une tranche soldée dont la moto est partie", () => {
      const vues = paiementsEchelonnes(lignes);
      expect(vues.map((ligne) => ligne.vente.id)).toContain("remise");
      expect(totalDetenu(tranchesEnCours(vues))).toBe(450_000);
    });

    it("le total dû ignore un crédit soldé", () => {
      const vues = paiementsEchelonnes(lignes);
      expect(vues.map((ligne) => ligne.vente.id)).toContain("soldee");
      expect(totalDu(dettes(vues))).toBe(1_200_000 + 1_000_000);
    });
  });

  describe("les pastilles de l’écran des paiements", () => {
    const vues = paiementsEchelonnes(lignes);
    const idsSous = (filtre: FiltrePaiement) =>
      filtrerPaiements(vues, filtre).map((ligne) => ligne.vente.id);

    it("« Tout » ne retire rien", () => {
      expect(idsSous("tout")).toEqual(vues.map((ligne) => ligne.vente.id));
    });

    it("« Crédit » garde le mode, quel que soit l’état de l’argent", () => {
      expect(idsSous("credit")).toEqual(["ancienne", "soldee", "recente"]);
    });

    it("« Partiellement payées » traverse les deux modes", () => {
      expect(idsSous("partiel")).toEqual(["tranches", "recente"]);
    });

    it("« Soldées » rend enfin quelque chose, dans les deux modes", () => {
      expect(idsSous("solde")).toEqual(["soldee", "remise"]);
    });

    /* « Tranches » et « Impayées » ont quitté la rangée : la première parce
       que la colonne « Mode » la dit déjà sur chaque ligne, la seconde parce
       que la colonne « État » la dit de même. Une vente impayée reste donc
       visible — sous « Tout » et sous « Crédit » —, elle n'a simplement plus
       de pastille à elle. */
    it("la rangée ne propose que les quatre pastilles retenues", () => {
      expect([...FILTRES_PAIEMENT]).toEqual(["tout", "credit", "partiel", "solde"]);
    });

    it("une vente impayée reste atteignable sans pastille dédiée", () => {
      expect(idsSous("tout")).toContain("ancienne");
      expect(idsSous("credit")).toContain("ancienne");
    });
  });
});

describe("tranches inactives", () => {
  const seuil = 30;
  const sansVersementDepuis = (date: string) =>
    lignePaiement(
      venteS9({ modePaiement: "tranches", motoRemise: false }),
      [versement({ date: new Date(date) })],
      MAINTENANT,
    );

  it("signale une tranche sans versement depuis le seuil", () => {
    expect(estInactive(sansVersementDepuis("2026-08-01T10:00:00Z"), seuil)).toBe(true);
  });

  it("laisse tranquille celle qui a versé la semaine dernière", () => {
    expect(estInactive(sansVersementDepuis("2026-08-25T10:00:00Z"), seuil)).toBe(false);
  });

  it("un seuil abaissé élargit la liste", () => {
    expect(estInactive(sansVersementDepuis("2026-08-25T10:00:00Z"), 5)).toBe(true);
  });
});

describe("remise de la moto en fin de tranches", () => {
  const tranches = venteS9({ modePaiement: "tranches", motoRemise: false });

  it("possible seulement quand plus rien n’est dû", () => {
    expect(peutRemettreMoto(tranches, 0)).toBe(true);
    expect(peutRemettreMoto(tranches, 1)).toBe(false);
  });

  it("ne s’applique pas à un crédit : la moto est déjà partie", () => {
    expect(peutRemettreMoto(venteS9({ modePaiement: "credit" }), 0)).toBe(false);
  });

  it("ne se refait pas une seconde fois", () => {
    expect(peutRemettreMoto(venteS9({ modePaiement: "tranches", motoRemise: true }), 0)).toBe(false);
  });
});

describe("paiementsDeLaPeriode", () => {
  /* Septembre 2026, bornes locales. On construit les dates du même bord que
     `bornesPeriode` : ce qui se compare doit se fabriquer pareil. */
  const septembre = { debut: new Date(2026, 8, 1), fin: new Date(2026, 9, 1) };

  const ventesDuLot = [
    venteS9({ id: "ancienne", date: new Date(2026, 2, 5) }),
    venteS9({ id: "recente", date: new Date(2026, 8, 5) }),
    venteS9({ id: "sans-acompte", date: new Date(2026, 8, 7) }),
  ];

  const lignesDuLot = (versementsDuLot: Versement[]) =>
    suivrePaiements(ventesDuLot, versementsDuLot, MAINTENANT);

  it("retient une vente ancienne qui a reçu de l’argent dans la période", () => {
    const lignes = lignesDuLot([
      versement({ id: "a", venteId: "ancienne", date: new Date(2026, 8, 12) }),
    ]);
    const retenues = paiementsDeLaPeriode(lignes, septembre);
    expect(retenues.map((ligne) => ligne.vente.id)).toEqual(["ancienne"]);
  });

  /* L'acompte encaissé au comptoir est un versement daté du jour de la vente
     (`enregistrerVente`) : une vente de septembre entre donc dans septembre
     sans qu'on ait à écrire une seconde règle pour elle. */
  it("retient une vente de la période par son acompte, sans règle ajoutée", () => {
    const lignes = lignesDuLot([
      versement({ id: "b", venteId: "recente", date: new Date(2026, 8, 5) }),
    ]);
    expect(paiementsDeLaPeriode(lignes, septembre).map((l) => l.vente.id)).toEqual(["recente"]);
  });

  it("écarte une vente dont le seul versement est hors période", () => {
    const lignes = lignesDuLot([
      versement({ id: "c", venteId: "ancienne", date: new Date(2026, 2, 5) }),
    ]);
    expect(paiementsDeLaPeriode(lignes, septembre)).toEqual([]);
  });

  /* Le trou assumé : sans acompte, aucun versement, donc aucune période ne la
     montre. « Tout » la garde, et c'est là que la dette se compte. */
  it("écarte un crédit sans le moindre versement, et « Tout » le garde", () => {
    const lignes = lignesDuLot([]);
    expect(paiementsDeLaPeriode(lignes, septembre)).toEqual([]);
    expect(paiementsDeLaPeriode(lignes, null)).toHaveLength(3);
  });

  it("ne retient une vente qu’une fois, quel que soit le nombre de versements", () => {
    const lignes = lignesDuLot([
      versement({ id: "d", venteId: "recente", date: new Date(2026, 8, 5) }),
      versement({ id: "e", venteId: "recente", date: new Date(2026, 8, 20) }),
    ]);
    expect(paiementsDeLaPeriode(lignes, septembre)).toHaveLength(1);
  });

  /* D66 : un versement enregistré hors ligne n'a pas encore l'horodatage du
     serveur. Le masquer ferait disparaître l'encaissement qu'on vient de
     saisir, au moment où l'on vérifie qu'il est passé. */
  it("retient un versement sans date, quelle que soit la période", () => {
    const lignes = lignesDuLot([versement({ id: "f", venteId: "recente", date: null })]);
    expect(paiementsDeLaPeriode(lignes, septembre).map((l) => l.vente.id)).toEqual(["recente"]);
  });

  it("les montants ne sont pas recoupés : un reste dû est un état, pas un flux", () => {
    const lignes = lignesDuLot([
      versement({ id: "g", venteId: "ancienne", montant: 200_000, date: new Date(2026, 2, 5) }),
      versement({ id: "h", venteId: "ancienne", montant: 300_000, date: new Date(2026, 8, 12) }),
    ]);
    const [retenue] = paiementsDeLaPeriode(lignes, septembre);
    /* 500 000 et non 300 000 : la ligne paraît parce qu'elle a bougé en
       septembre, elle vaut ce qu'elle vaut depuis toujours. */
    expect(retenue.totalPaye).toBe(500_000);
    expect(retenue.resteDu).toBe(700_000);
  });
});

describe("ventesDuClient", () => {
  const vente = (p: Partial<Vente>): Vente => venteS9(p);

  it("ne garde que les achats de ce client", () => {
    const liste = ventesDuClient(
      [vente({ id: "a", clientId: "c1" }), vente({ id: "b", clientId: "c2" })],
      "c1",
    );
    expect(liste.map((v) => v.id)).toEqual(["a"]);
  });

  it("montre le plus récent d’abord", () => {
    const liste = ventesDuClient(
      [
        vente({ id: "vieille", clientId: "c1", date: new Date(2026, 0, 1) }),
        vente({ id: "fraiche", clientId: "c1", date: new Date(2026, 9, 1) }),
      ],
      "c1",
    );
    expect(liste.map((v) => v.id)).toEqual(["fraiche", "vieille"]);
  });

  it("range une vente sans date en dernier plutôt que de la perdre", () => {
    /* Une date absente veut dire « saisi à l'instant, pas encore parvenu au
       serveur » (D82) — la vente existe, elle doit se voir. */
    const liste = ventesDuClient(
      [
        vente({ id: "sans", clientId: "c1", date: null }),
        vente({ id: "avec", clientId: "c1", date: new Date(2026, 0, 1) }),
      ],
      "c1",
    );
    expect(liste.map((v) => v.id)).toEqual(["avec", "sans"]);
  });

  it("ne rend rien sans identifiant de client", () => {
    /* Un client vide ne rassemble pas toutes les ventes qui n'en ont pas : ce
       serait montrer le fichier entier sur la fiche de personne. */
    expect(ventesDuClient([vente({ id: "a", clientId: "" })], "")).toEqual([]);
  });
});

describe("lireEmporte", () => {
  /* **Point de vigilance 2.** Aucune vente d’avant S53 ne porte le champ. Elles
     doivent se lire « rien d’emporté », jamais `undefined` — sinon l’écran du
     dossier affiche un vide là où il doit afficher « à faire ». */
  it("lit une vente d’avant S53 comme n’ayant rien fait emporter", () => {
    expect(lireEmporte(undefined)).toEqual({ quittance: false, cmc: false });
  });

  it("lit ce que la vente porte, et ignore une clé inconnue", () => {
    expect(lireEmporte({ quittance: true, cmc: false, carte_grise: true })).toEqual({
      quittance: true,
      cmc: false,
    });
  });
});
