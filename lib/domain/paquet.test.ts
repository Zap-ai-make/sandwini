import { describe, expect, it } from "vitest";
import type { DocumentDossier, StatutDocument } from "./vente";
import type { DossierEnAttente } from "./dossier";
import type { DossierCarteGrise } from "./dossier-carte-grise";
import {
  CARTES_PAR_PAQUET_MAX,
  cartesAConfier,
  cartesConfiables,
  etatPaquet,
  historiqueDesDeparts,
  validerPaquet,
  type PaquetCartesGrises,
  type SaisiePaquet,
} from "./paquet";

const SAISIE: SaisiePaquet = {
  prestataireId: "p1",
  prestataireNom: "Ouédraogo Plaques",
  deposeLe: "2026-10-15",
  avance: "150000",
  disponibleLe: "",
  dossierIds: ["v1", "v2", "v3"],
};

describe("validerPaquet", () => {
  it("accepte un paquet complet", () => {
    expect(validerPaquet(SAISIE)).toBeNull();
  });

  /* **Point de vigilance 4.** Un paquet sans carte écrirait une sortie de
     caisse sans contrepartie : de l’argent parti pour rien. */
  it("refuse un paquet sans carte", () => {
    expect(validerPaquet({ ...SAISIE, dossierIds: [] })).toMatch(/au moins une carte/i);
  });

  /* **Point de vigilance 3.** L’écran coche des lignes ; rien n’empêche deux
     cases de désigner la même vente si la liste se recompose sous les doigts.
     Deux écritures sur le même document dans un lot Firestore sont refusées en
     bloc, sans dire laquelle — autant le dire ici, où le message est lisible. */
  it("refuse deux fois la même vente", () => {
    expect(validerPaquet({ ...SAISIE, dossierIds: ["v1", "v2", "v1"] })).toMatch(/deux fois/i);
  });

  it("refuse au-delà de la borne, et la borne est dans le message", () => {
    const trop = Array.from({ length: CARTES_PAR_PAQUET_MAX + 1 }, (_, rang) => `v${rang}`);
    const message = validerPaquet({ ...SAISIE, dossierIds: trop });
    expect(message).toContain(String(CARTES_PAR_PAQUET_MAX));
  });

  it("accepte exactement la borne", () => {
    const pile = Array.from({ length: CARTES_PAR_PAQUET_MAX }, (_, rang) => `v${rang}`);
    expect(validerPaquet({ ...SAISIE, dossierIds: pile })).toBeNull();
  });

  it("refuse un paquet sans prestataire", () => {
    expect(validerPaquet({ ...SAISIE, prestataireId: "" })).toMatch(/prestataire/i);
  });

  /* Même règle que le dépôt carte par carte : zéro n’est pas une avance, c’est
     un travail confié à crédit, et le crédit se modélise ailleurs. */
  it("refuse une avance nulle", () => {
    expect(validerPaquet({ ...SAISIE, avance: "0" })).toMatch(/crédit/i);
  });

  it("refuse une date annoncée antérieure au dépôt", () => {
    expect(validerPaquet({ ...SAISIE, disponibleLe: "2026-10-01" })).toMatch(/antérieure/i);
  });
});

const carte = (venteId: string, statut: StatutDocument): DocumentDossier =>
  ({ id: "carte_grise", venteId, type: "carte_grise", statut }) as DocumentDossier;

describe("etatPaquet", () => {
  const AUJOURDHUI = new Date("2026-10-27T10:00:00");

  const paquet = (partie: Partial<PaquetCartesGrises> = {}): PaquetCartesGrises => ({
    id: "lot1",
    boutiqueId: "PTG",
    prestataireId: "p1",
    prestataireNom: "Ouédraogo Plaques",
    deposeLe: new Date("2026-10-15T12:00:00"),
    disponibleLe: null,
    avance: 150_000,
    dossierIds: ["v1", "v2", "v3"],
    ...partie,
  });

  it("compte ce qui est dehors et ce qui est revenu", () => {
    const etat = etatPaquet(
      paquet(),
      [
        carte("v1", "revenu_magasin"),
        carte("v2", "chez_prestataire"),
        carte("v3", "chez_prestataire"),
      ],
      AUJOURDHUI,
    );
    expect(etat).toMatchObject({ total: 3, dehors: 2, revenues: 1, solde: false });
  });

  /* **Arbitrage 9 : le retour est partiel par défaut.** « Il peut partir avec
     10 et ramener 5 si c’est ce qui est dispo. » Deux revenues ne soldent pas
     le paquet, et aucun geste n’a à le dire. */
  it("reste ouvert sur un retour partiel, sans qu’aucun geste ne le dise", () => {
    const etat = etatPaquet(
      paquet(),
      [
        carte("v1", "revenu_magasin"),
        carte("v2", "revenu_magasin"),
        carte("v3", "chez_prestataire"),
      ],
      AUJOURDHUI,
    );
    expect(etat.solde).toBe(false);
    expect(etat.dehors).toBe(1);
  });

  it("est soldé par calcul quand plus rien n’est dehors", () => {
    const etat = etatPaquet(
      paquet(),
      [
        carte("v1", "revenu_magasin"),
        carte("v2", "revenu_magasin"),
        carte("v3", "revenu_magasin"),
      ],
      AUJOURDHUI,
    );
    expect(etat.solde).toBe(true);
    expect(etat.dehors).toBe(0);
  });

  /* **Point de vigilance 2.** Une liste vide et « toutes revenues » rendent le
     même compte de cartes dehors : zéro. Sans distinction, un paquet dont les
     documents ne sont pas encore lus s’afficherait soldé. */
  it("n’est pas soldé tant que ses documents ne sont pas lus", () => {
    expect(etatPaquet(paquet(), [], AUJOURDHUI).solde).toBe(false);
    expect(etatPaquet(paquet(), [], AUJOURDHUI).lu).toBe(false);
  });

  /* **Point de vigilance 1.** Une vente renumérotée garde son identifiant :
     seul son numéro affiché gagne un `-B`. Le rapprochement se fait donc sur
     `venteId`, jamais sur le numéro. */
  it("ne retient que les cartes de ses propres ventes", () => {
    const etat = etatPaquet(
      paquet(),
      [carte("v1", "revenu_magasin"), carte("etrangere", "chez_prestataire")],
      AUJOURDHUI,
    );
    expect(etat.total).toBe(3);
    expect(etat.revenues).toBe(1);
    expect(etat.dehors).toBe(0);
  });

  it("compte les jours depuis le dépôt, de jour à jour", () => {
    expect(etatPaquet(paquet(), [], AUJOURDHUI).joursDehors).toBe(12);
  });

  /* Le retard est le seul signal qui vaut un rappel : un paquet annoncé pour
     une date dépassée et toujours dehors. */
  it("dit le retard quand la date annoncée est passée et qu’il reste des cartes", () => {
    const annonce = paquet({ disponibleLe: new Date("2026-10-20T12:00:00") });
    expect(etatPaquet(annonce, [carte("v1", "chez_prestataire")], AUJOURDHUI).enRetard).toBe(true);
  });

  it("ne dit pas le retard quand tout est revenu, même après la date", () => {
    const annonce = paquet({ dossierIds: ["v1"], disponibleLe: new Date("2026-10-20T12:00:00") });
    expect(etatPaquet(annonce, [carte("v1", "revenu_magasin")], AUJOURDHUI).enRetard).toBe(false);
  });
});

describe("cartesConfiables", () => {
  /* **Point de vigilance 5.** Une carte déjà chez un prestataire ne peut pas
     entrer dans un nouveau paquet : l’avance serait versée deux fois pour le
     même travail, et la base refuserait la transition en bloc — un refus muet
     sur un geste déjà affiché comme fait. */
  it("ne retient que les cartes grises encore à faire", () => {
    const confiables = cartesConfiables([
      carte("v1", "a_faire"),
      carte("v2", "chez_prestataire"),
      carte("v3", "revenu_magasin"),
      carte("v4", "non_applicable"),
      carte("v5", "a_faire"),
    ]);
    expect(confiables.map((confiable) => confiable.venteId)).toEqual(["v1", "v5"]);
  });

  it("écarte les papiers qui ne passent pas par un prestataire", () => {
    const quittance = { id: "quittance", venteId: "v9", type: "quittance", statut: "a_faire" };
    expect(cartesConfiables([quittance as DocumentDossier])).toEqual([]);
  });
});

/**
 * Ce qu'on propose quand on part du prestataire (20 octobre 2026).
 *
 * L'écran des dossiers coche des lignes qu'il affiche déjà. Depuis la fiche
 * d'un prestataire, il n'y a pas de liste sous les yeux : il faut la
 * construire, et elle doit dire assez pour qu'on reconnaisse chaque dossier
 * sans ouvrir une vente — le numéro de pièce, le client, l'ancienneté.
 */
describe("cartesAConfier", () => {
  const dossier = (
    venteId: string,
    statut: StatutDocument | null,
    date: Date | null,
  ): DossierEnAttente =>
    ({
      venteId,
      numero: venteId.toUpperCase(),
      boutiqueId: "b1",
      clientId: `c-${venteId}`,
      date,
      documents: {
        quittance: null,
        cmc: null,
        carte_grise:
          statut === null
            ? null
            : ({ venteId, type: "carte_grise", statut } as unknown as DocumentDossier),
      },
      papiers: [],
      enCours: [],
      enRetard: false,
      detention: null,
    }) as unknown as DossierEnAttente;

  const nomDe = (clientId: string) => `Client ${clientId}`;

  it("ne propose que les cartes grises qui n’ont encore bougé nulle part", () => {
    /* Une carte déjà chez quelqu'un ferait refuser le lot entier — sans dire
       laquelle des dix a fauté, et après qu'une seconde avance a été versée
       pour le même travail. Elle ne doit donc pas pouvoir se cocher. */
    const liste = cartesAConfier(
      [
        dossier("v1", "a_faire", new Date(2026, 8, 1)),
        dossier("v2", "chez_prestataire", new Date(2026, 8, 2)),
        dossier("v3", "revenu_magasin", new Date(2026, 8, 3)),
        dossier("v4", "non_applicable", new Date(2026, 8, 4)),
      ],
      [],
      nomDe,
    );
    expect(liste.map((carte) => carte.dossierId)).toEqual(["v1"]);
  });

  it("ignore un dossier dont le document n’est pas encore parvenu", () => {
    /* `null` ne veut pas dire « à faire » : on ne sait pas encore. Le proposer
       ferait monter un lot qui mettrait à jour un document inexistant. */
    expect(cartesAConfier(
      [dossier("v1", null, new Date())],
      [],
      nomDe,
    )).toEqual([]);
  });

  it("met le plus ancien en tête, comme la file des dossiers", () => {
    /* C'est une file qu'on vide : ce qui traîne depuis le plus longtemps part
       en premier, et c'est aussi le client qui a le plus de raisons d'appeler. */
    const liste = cartesAConfier(
      [
        dossier("recent", "a_faire", new Date(2026, 9, 10)),
        dossier("ancien", "a_faire", new Date(2026, 5, 2)),
      ],
      [],
      nomDe,
    );
    expect(liste.map((carte) => carte.dossierId)).toEqual(["ancien", "recent"]);
  });

  it("porte de quoi reconnaître le dossier sans ouvrir la vente", () => {
    const [carte] = cartesAConfier(
      [dossier("v1", "a_faire", new Date(2026, 8, 1))],
      [],
      nomDe,
    );
    expect(carte.repere).toBe("V1");
    expect(carte.client).toBe("Client c-v1");
    expect(carte.document?.venteId).toBe("v1");
  });
});

/**
 * Les deux listes de l'écran des dossiers doivent dire la même chose.
 *
 * **Le défaut que ce test empêche, et il est silencieux.** La case à cocher
 * d'une ligne s'affiche selon `cartesConfiables`, qui lit les documents ; la
 * modale monte sa liste avec `cartesAConfier`, qui lit les dossiers. Si les
 * deux divergeaient, on cocherait une ligne, on ouvrirait la modale, et la
 * sélection s'y trouverait vide — sans un mot, parce que rien n'est en faute.
 */
describe("les deux portes d’un même dépôt", () => {
  it("proposent exactement les mêmes cartes", () => {
    const statuts: StatutDocument[] = [
      "a_faire",
      "chez_prestataire",
      "revenu_magasin",
      "remis_client",
      "non_applicable",
    ];

    const documents = statuts.map(
      (statut, rang) =>
        ({ venteId: `v${rang}`, type: "carte_grise", statut }) as unknown as DocumentDossier,
    );
    const dossiers = documents.map(
      (document) =>
        ({
          venteId: document.venteId,
          numero: document.venteId,
          clientId: "c1",
          date: new Date(2026, 0, 1),
          documents: { quittance: null, cmc: null, carte_grise: document },
        }) as unknown as DossierEnAttente,
    );

    expect(cartesAConfier(dossiers, [], () => "Client").map((carte) => carte.dossierId)).toEqual(
      cartesConfiables(documents).map((document) => document.venteId),
    );
  });
});

/**
 * L'historique des départs (20 octobre 2026, demande du client).
 *
 * « Historiques de tout ce qui est parti, chez qui, avance prise, date prise
 * et retour. » Le produit n'en montrait que la moitié vivante : les paquets
 * encore dehors, qui disparaissaient à la dernière carte revenue. Une fois le
 * travail fini, il ne restait aucune trace lisible de ce qu'on avait confié ni
 * de ce qu'on avait payé pour.
 */
describe("historiqueDesDeparts", () => {
  const LE_1ER = new Date(2026, 8, 1);
  const LE_10 = new Date(2026, 8, 10);
  const LE_12 = new Date(2026, 8, 12);
  const AUJOURDHUI = new Date(2026, 8, 20);

  const carte = (venteId: string, statut: StatutDocument, extra: object = {}) =>
    ({
      venteId,
      type: "carte_grise",
      statut,
      prestataireNom: "",
      deposeLe: null,
      avance: null,
      disponibleLe: null,
      ...extra,
    }) as unknown as DocumentDossier;

  const paquet = (id: string, dossierIds: string[], extra: object = {}): PaquetCartesGrises => ({
    id,
    boutiqueId: "b1",
    prestataireId: "p1",
    prestataireNom: "Ouédraogo",
    deposeLe: LE_1ER,
    disponibleLe: null,
    avance: 150_000,
    dossierIds,
    ...extra,
  });

  const decrire = (venteId: string) => ({ numero: venteId.toUpperCase(), client: "Sana" });

  it("garde un paquet entièrement rendu, et dit quand il l’a été", () => {
    /* Tout l'objet de la demande : `PaquetsEnCours` fait disparaître le paquet
       à la dernière carte revenue, ce qui efface le travail au moment même où
       il se termine. */
    const departs = historiqueDesDeparts(
      [paquet("lot1", ["v1", "v2"])],
      [carte("v1", "revenu_magasin"), carte("v2", "revenu_magasin")],
      [],
      new Map([
        ["v1", LE_10],
        ["v2", LE_12],
      ]),
      decrire,
      AUJOURDHUI,
    );

    expect(departs).toHaveLength(1);
    expect(departs[0].dehors).toBe(0);
    /* La date du paquet est celle de la DERNIÈRE revenue : c'est le jour où le
       travail confié a été rendu en entier. */
    expect(departs[0].soldeLe).toEqual(LE_12);
    expect(departs[0].avance).toBe(150_000);
    expect(departs[0].prestataireNom).toBe("Ouédraogo");
    expect(departs[0].deposeLe).toEqual(LE_1ER);
  });

  it("ne solde pas un paquet dont une carte est encore dehors", () => {
    const departs = historiqueDesDeparts(
      [paquet("lot1", ["v1", "v2"])],
      [carte("v1", "revenu_magasin"), carte("v2", "chez_prestataire")],
      [],
      new Map([["v1", LE_10]]),
      decrire,
      AUJOURDHUI,
    );
    expect(departs[0].dehors).toBe(1);
    /* Une date de retour sur un paquet incomplet se recopierait dans une
       discussion avec le client, pour une carte qui n'est pas là. */
    expect(departs[0].soldeLe).toBeNull();
  });

  it("signale le retard de ce qui est encore dehors, jamais de ce qui est rentré", () => {
    const enRetard = historiqueDesDeparts(
      [paquet("lot1", ["v1"], { disponibleLe: new Date(2026, 8, 15) })],
      [carte("v1", "chez_prestataire")],
      [],
      new Map(),
      decrire,
      AUJOURDHUI,
    );
    expect(enRetard[0].enRetard).toBe(true);

    /* Le retard d'un paquet rendu n'intéresse personne : les cartes sont là, et
       la date annoncée est de l'histoire. */
    const rendu = historiqueDesDeparts(
      [paquet("lot1", ["v1"], { disponibleLe: new Date(2026, 8, 15) })],
      [carte("v1", "revenu_magasin")],
      [],
      new Map([["v1", LE_12]]),
      decrire,
      AUJOURDHUI,
    );
    expect(rendu[0].enRetard).toBe(false);
  });

  it("n’oublie pas une carte confiée seule, hors de tout paquet", () => {
    /* Le dépôt unitaire existe toujours : il part du relais d'un dossier et ne
       crée aucun paquet. Fonder l'historique sur les seuls paquets aurait
       effacé ces départs — et l'argent qu'ils ont sorti de la caisse. */
    const departs = historiqueDesDeparts(
      [],
      [
        carte("v9", "chez_prestataire", {
          prestataireNom: "Kaboré",
          deposeLe: LE_10,
          avance: 20_000,
        }),
      ],
      [],
      new Map(),
      decrire,
      AUJOURDHUI,
    );
    expect(departs).toHaveLength(1);
    expect(departs[0].prestataireNom).toBe("Kaboré");
    expect(departs[0].avance).toBe(20_000);
    expect(departs[0].cartes.map((c) => c.numero)).toEqual(["V9"]);
  });

  it("ne compte pas deux fois une carte qui appartient à un paquet", () => {
    /* Les documents d'un paquet portent EUX AUSSI le dépôt — les règles
       l'exigent (`depotRenseigne`). Sans exclusion, chaque carte d'un paquet
       de dix produirait une onzième ligne à elle seule, et l'avance du paquet
       paraîtrait versée deux fois. */
    const departs = historiqueDesDeparts(
      [paquet("lot1", ["v1"])],
      [
        carte("v1", "chez_prestataire", {
          prestataireNom: "Ouédraogo",
          deposeLe: LE_1ER,
          avance: 150_000,
        }),
      ],
      [],
      new Map(),
      decrire,
      AUJOURDHUI,
    );
    expect(departs).toHaveLength(1);
  });

  it("ignore une carte qui n’est jamais partie", () => {
    expect(
      historiqueDesDeparts([], [carte("v1", "a_faire")], [], new Map(), decrire, AUJOURDHUI),
    ).toEqual([]);
  });

  it("met le départ le plus récent en tête : c’est un historique, pas une file", () => {
    const departs = historiqueDesDeparts(
      [paquet("vieux", ["v1"], { deposeLe: LE_1ER }), paquet("neuf", ["v2"], { deposeLe: LE_12 })],
      [carte("v1", "chez_prestataire"), carte("v2", "chez_prestataire")],
      [],
      new Map(),
      decrire,
      AUJOURDHUI,
    );
    expect(departs.map((depart) => depart.cle)).toEqual(["neuf", "vieux"]);
  });
});

/**
 * Le dossier venu du dehors entre dans les mêmes paquets (S59).
 *
 * **Les deux sources sont disjointes, et c'est ce qui rend l'union sûre** : une
 * carte née d'une vente vient des documents, un dossier du dehors de la
 * nouvelle collection. Aucune ne figure dans les deux.
 */
describe("confier un dossier venu du dehors", () => {
  const cg = (partie: Partial<DossierCarteGrise>): DossierCarteGrise =>
    ({
      id: "dx",
      boutiqueId: "CGP",
      venteId: null,
      origine: "exterieur",
      clientNom: "Sana Harouna",
      motoLibelle: "GEAR",
      numeroChassis: "4140RY029597",
      statut: "a_faire",
      prestataireId: null,
      prestataireNom: "",
      deposeLe: null,
      avance: null,
      disponibleLe: null,
      immatriculation: "",
      revenuLe: null,
      remisLe: null,
      remisANom: "",
      remisATelephone: "",
      ...partie,
    }) as DossierCarteGrise;

  const vendu = (venteId: string, statut: StatutDocument, date: Date): DossierEnAttente =>
    ({
      venteId,
      numero: venteId.toUpperCase(),
      clientId: `c-${venteId}`,
      date,
      documents: {
        quittance: null,
        cmc: null,
        carte_grise: { venteId, type: "carte_grise", statut } as unknown as DocumentDossier,
      },
    }) as unknown as DossierEnAttente;

  it("le propose, alors qu’il n’a aucune vente", () => {
    /* La raison d'être de la collection : sous l'ancien modèle, un tel dossier
       n'existait pas, donc il ne pouvait pas être confié. */
    const liste = cartesAConfier([], [cg({})], () => "ignoré");
    expect(liste.map((carte) => carte.dossierId)).toEqual(["dx"]);
    expect(liste[0].document).toBeNull();
    expect(liste[0].dossier).not.toBeNull();
  });

  it("le désigne par son châssis, faute de numéro de vente", () => {
    const [carte] = cartesAConfier([], [cg({})], () => "ignoré");
    expect(carte.repere).toBe("4140RY029597");
    expect(carte.client).toBe("Sana Harouna");
  });

  it("ne le propose plus une fois qu’il est parti", () => {
    /* Son état ne se lit que sur lui-même : il n'a pas de document pour le
       dire. Le proposer deux fois ferait verser deux avances pour le même
       travail. */
    expect(cartesAConfier([], [cg({ statut: "chez_prestataire" })], () => "x")).toEqual([]);
    expect(cartesAConfier([], [cg({ statut: "remis" })], () => "x")).toEqual([]);
  });

  it("attache la seconde face d’une carte née d’une vente", () => {
    /* **Sans elle, le dépôt n'écrirait que l'ancien document**, et l'écran des
       cartes grises annoncerait au magasin une carte déjà partie. */
    const [carte] = cartesAConfier(
      [vendu("v1", "a_faire", new Date(2026, 8, 1))],
      [cg({ id: "v1", venteId: "v1", origine: "vente" })],
      () => "Client",
    );
    expect(carte.document).not.toBeNull();
    expect(carte.dossier?.id).toBe("v1");
  });

  it("propose un dossier né d’une vente quand on ne lit pas les ventes", () => {
    /* **Le cas de la personne des cartes grises, et il manquait.** Le
       cloisonnement des magasins lui interdit de lire les ventes des autres
       boutiques (D2) : la liste des dossiers vendus est donc vide pour elle,
       et le tri se faisait sur l'origine — « extérieur » seulement. Un dossier
       né d'une vente puis repris dans la collection n'apparaissait nulle part,
       alors que c'est exactement ce qu'elle a à confier. */
    const liste = cartesAConfier(
      [],
      [cg({ id: "v1", venteId: "v1", origine: "vente", clientNom: "Kabore Lazarre" })],
      () => "ignoré",
    );
    expect(liste.map((carte) => carte.dossierId)).toEqual(["v1"]);
    expect(liste[0].client).toBe("Kabore Lazarre");
    expect(liste[0].document).toBeNull();
  });

  it("ne propose pas deux fois une carte montée par son document", () => {
    /* Les deux sources restent disjointes : le tri se fait sur ce qu'on a déjà
       vu, et non plus sur l'origine. */
    const liste = cartesAConfier(
      [vendu("v1", "a_faire", new Date(2026, 8, 1))],
      [cg({ id: "v1", venteId: "v1", origine: "vente" })],
      () => "Client",
    );
    expect(liste).toHaveLength(1);
  });

  it("laisse la carte sans dossier passer quand même", () => {
    /* Tout l'existant est dans ce cas tant que la migration n'a pas tourné :
       lui refuser le dépôt aurait arrêté le comptoir. */
    const [carte] = cartesAConfier([vendu("v9", "a_faire", new Date(2026, 8, 1))], [], () => "C");
    expect(carte.dossier).toBeNull();
    expect(carte.document).not.toBeNull();
  });

  it("met les sans-date derrière, pas devant", () => {
    /* Un dossier du dehors vient d'être ouvert : il n'a pas d'ancienneté à
       faire valoir, et le mettre en tête repousserait ceux qui attendent
       depuis des mois. */
    const liste = cartesAConfier(
      [vendu("v1", "a_faire", new Date(2026, 8, 1))],
      [cg({})],
      () => "Client",
    );
    expect(liste.map((carte) => carte.dossierId)).toEqual(["v1", "dx"]);
  });
});

describe("l’historique lit la face qui existe", () => {
  const AUJOURDHUI_CG = new Date(2026, 9, 20);
  const dehors = (partie: Partial<DossierCarteGrise> = {}): DossierCarteGrise =>
    ({
      id: "dx",
      boutiqueId: "CGP",
      venteId: null,
      origine: "exterieur",
      clientNom: "Sana Harouna",
      motoLibelle: "GEAR",
      numeroChassis: "4140RY029597",
      statut: "chez_prestataire",
      prestataireId: "p1",
      prestataireNom: "Bohary",
      deposeLe: new Date(2026, 7, 18),
      avance: 50_000,
      disponibleLe: null,
      immatriculation: "",
      revenuLe: null,
      remisLe: null,
      remisANom: "",
      remisATelephone: "",
      ...partie,
    }) as DossierCarteGrise;

  const paquetDx = (): PaquetCartesGrises =>
    ({
      id: "lotx",
      boutiqueId: "CGP",
      prestataireId: "p1",
      prestataireNom: "Bohary",
      deposeLe: new Date(2026, 7, 18),
      disponibleLe: null,
      avance: 50_000,
      dossierIds: ["dx"],
    }) as PaquetCartesGrises;

  it("compte dehors un dossier du dehors, au lieu de le croire revenu", () => {
    /* **Le défaut que ce test empêche, et il était silencieux.** Un dossier du
       dehors n'a pas de document : l'ancienne version ne trouvait rien, en
       déduisait « pas chez le prestataire », et soldait le départ. */
    const [depart] = historiqueDesDeparts(
      [paquetDx()],
      [],
      [dehors()],
      new Map(),
      (id) => ({ numero: id, client: "" }),
      AUJOURDHUI_CG,
    );
    expect(depart.dehors).toBe(1);
    expect(depart.soldeLe).toBeNull();
    expect(depart.cartes[0].client).toBe("Sana Harouna");
    expect(depart.cartes[0].numero).toBe("4140RY029597");
  });

  it("lit sa date de retour sur le dossier, pas dans le journal", () => {
    /* `revenuLe` est écrit sur le dossier depuis S59 : un dossier du dehors n'a
       pas de journal de document où la chercher. */
    const [depart] = historiqueDesDeparts(
      [paquetDx()],
      [],
      [dehors({ statut: "revenu_magasin", revenuLe: new Date(2026, 8, 12) })],
      new Map(),
      (id) => ({ numero: id, client: "" }),
      AUJOURDHUI_CG,
    );
    expect(depart.dehors).toBe(0);
    expect(depart.soldeLe).toEqual(new Date(2026, 8, 12));
  });

  it("n’oublie pas un dossier du dehors confié sans paquet", () => {
    const departs = historiqueDesDeparts(
      [],
      [],
      [dehors()],
      new Map(),
      (id) => ({ numero: id, client: "" }),
      AUJOURDHUI_CG,
    );
    expect(departs.map((depart) => depart.cle)).toEqual(["carte:dx"]);
    expect(departs[0].avance).toBe(50_000);
  });
});

describe("la borne d’un paquet", () => {
  it("vaut 124, parce qu’une carte demande maintenant quatre écritures", () => {
    /* `4N + 1 <= 500` : le paquet, puis par carte l'ancien document et son
       historique, le nouveau dossier et son journal. Elle était de 249 quand
       une carte n'en demandait que deux. */
    expect(CARTES_PAR_PAQUET_MAX).toBe(124);
    expect(4 * CARTES_PAR_PAQUET_MAX + 1).toBeLessThanOrEqual(500);
  });
});
