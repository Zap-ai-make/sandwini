import { describe, expect, it } from "vitest";
import { normaliserNom } from "./client";
import { formaterDate, formaterMontant } from "./format";
import {
  chercherRecus,
  comparerRecus,
  composerRecus,
  filtrerParDates,
  identifiantRecu,
  jourLocal,
  lireIdentifiantRecu,
  numeroDefinitif,
  rangInscrit,
  situationAu,
  textePartage,
  trouverRecu,
} from "./recu";
import type { Vente, Versement } from "./vente";

/**
 * Le contenu d'un reçu.
 *
 * Ce que ces tests protègent tient en une phrase : **le papier doit dire la
 * vérité du jour où il a été remis**, y compris réimprimé six mois plus tard, y
 * compris quand le serveur a renuméroté la vente entre-temps. Aucun de ces deux
 * chiffres n'est stocké — ils se recalculent (D61), et c'est ici qu'on vérifie
 * que le recalcul retombe juste.
 */

const vente = (partie: Partial<Vente> = {}): Vente => ({
  id: "v1",
  numero: "PTG-2608-0042",
  numeroInitial: "PTG-2608-0042",
  boutiqueId: "PTG",
  motoId: "moto-1",
  clientId: "client-1",
  date: new Date("2026-08-01T10:00:00Z"),
  prixConvenu: 1_200_000,
  modePaiement: "credit",
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

const versement = (partie: Partial<Versement> = {}): Versement => ({
  id: "vers-1",
  venteId: "v1",
  numeroRecu: "PTG-2608-0042",
  date: new Date("2026-08-01T10:00:00Z"),
  montant: 400_000,
  moyenPaiement: "especes",
  reference: "",
  encaissementId: "enc-1",
  operateur: "Awa Sawadogo",
  ...partie,
});

/** L'acompte du jour de la vente, puis deux versements ultérieurs. */
const acompte = versement({ id: "a", numeroRecu: "PTG-2608-0042", montant: 400_000 });
const deuxieme = versement({
  id: "b",
  numeroRecu: "PTG-2608-0042/V2",
  date: new Date("2026-08-15T09:00:00Z"),
  montant: 300_000,
  moyenPaiement: "orange_money",
  reference: "OM-9912",
  operateur: "Salif Ouédraogo",
});
const troisieme = versement({
  id: "c",
  numeroRecu: "PTG-2608-0042/V3",
  date: new Date("2026-08-28T16:30:00Z"),
  montant: 200_000,
});

describe("identifiant d’un reçu dans l’URL", () => {
  it("désigne un reçu de vente par la vente seule", () => {
    expect(identifiantRecu("v1", null)).toBe("v1");
    expect(lireIdentifiantRecu("v1")).toEqual({ venteId: "v1", versementId: null });
  });

  it("désigne un reçu de versement par le couple vente / versement", () => {
    expect(identifiantRecu("v1", "vers-9")).toBe("v1~vers-9");
    expect(lireIdentifiantRecu("v1~vers-9")).toEqual({ venteId: "v1", versementId: "vers-9" });
  });

  it("refuse ce qui n’est pas un identifiant, plutôt que de deviner", () => {
    expect(lireIdentifiantRecu("")).toBeNull();
    expect(lireIdentifiantRecu("~vers-9")).toBeNull();
    expect(lireIdentifiantRecu("v1~vers-9~zzz")).toBeNull();
  });
});

describe("rang inscrit sur un numéro de reçu", () => {
  it("lit le rang d’un reçu de versement", () => {
    expect(rangInscrit("PTG-2608-0042/V2")).toBe(2);
    expect(rangInscrit("PTG-2608-0042-B/V12")).toBe(12);
  });

  it("rend null pour l’acompte, qui porte le numéro nu de la vente (D52)", () => {
    expect(rangInscrit("PTG-2608-0042")).toBeNull();
    expect(rangInscrit("PTG-2608-0042-B")).toBeNull();
  });
});

describe("numéro d’un reçu réimprimé", () => {
  it("porte le numéro de la vente pour un reçu de vente", () => {
    expect(numeroDefinitif(vente(), null)).toBe("PTG-2608-0042");
  });

  it("reconstruit le numéro d’un versement sur le numéro définitif de la vente (D44)", () => {
    /* La vente a été renumérotée par la réconciliation : le versement porte
       encore l’ancien numéro dans son champ, le reçu réimprimé porte le
       nouveau. */
    const renumerotee = vente({ numero: "PTG-2608-0042-B" });
    expect(numeroDefinitif(renumerotee, deuxieme)).toBe("PTG-2608-0042-B/V2");
  });
});

describe("situation au jour d’un reçu", () => {
  const versements = [acompte, deuxieme, troisieme];

  it("ne compte que les versements jusqu’à celui du reçu", () => {
    expect(situationAu(1_200_000, versements, 0)).toEqual({
      totalPaye: 400_000,
      resteDu: 800_000,
    });
    expect(situationAu(1_200_000, versements, 1)).toEqual({
      totalPaye: 700_000,
      resteDu: 500_000,
    });
    expect(situationAu(1_200_000, versements, 2)).toEqual({
      totalPaye: 900_000,
      resteDu: 300_000,
    });
  });

  it("rend un reste dû entier quand rien n’a été encaissé", () => {
    expect(situationAu(1_200_000, versements, -1)).toEqual({
      totalPaye: 0,
      resteDu: 1_200_000,
    });
  });

  it("ne descend jamais sous zéro", () => {
    expect(situationAu(500_000, [versement({ montant: 800_000 })], 0).resteDu).toBe(0);
  });
});

describe("les reçus d’une vente", () => {
  it("ne fait pas de l’acompte un reçu de plus : il est le reçu de vente (D52)", () => {
    const recus = composerRecus(vente(), [acompte, deuxieme, troisieme]);
    expect(recus.map((recu) => recu.numero)).toEqual([
      "PTG-2608-0042",
      "PTG-2608-0042/V2",
      "PTG-2608-0042/V3",
    ]);
    expect(recus.map((recu) => recu.type)).toEqual(["vente", "versement", "versement"]);
  });

  it("porte sur chaque reçu la situation de son jour, pas celle d’aujourd’hui", () => {
    const recus = composerRecus(vente(), [acompte, deuxieme, troisieme]);
    expect(recus.map((recu) => recu.resteDu)).toEqual([800_000, 500_000, 300_000]);
    expect(recus.map((recu) => recu.totalPaye)).toEqual([400_000, 700_000, 900_000]);
  });

  it("reprend le moyen de paiement, la référence et l’opérateur du versement", () => {
    const [, second] = composerRecus(vente(), [acompte, deuxieme]);
    expect(second.montantEncaisse).toBe(300_000);
    expect(second.moyenPaiement).toBe("orange_money");
    expect(second.reference).toBe("OM-9912");
    expect(second.operateur).toBe("Salif Ouédraogo");
    expect(second.date).toEqual(new Date("2026-08-15T09:00:00Z"));
  });

  it("établit un reçu de vente même sans acompte, avec un reste dû entier", () => {
    const [recu] = composerRecus(vente(), []);
    expect(recu.type).toBe("vente");
    expect(recu.montantEncaisse).toBe(0);
    expect(recu.moyenPaiement).toBeNull();
    expect(recu.totalPaye).toBe(0);
    expect(recu.resteDu).toBe(1_200_000);
  });

  it("compte le premier versement d’une vente sans acompte comme un reçu de versement", () => {
    /* Sans acompte, le premier encaissement ultérieur reçoit le rang 1 : son
       numéro porte donc `/V1`, et c’est bien un second papier. */
    const premier = versement({ id: "z", numeroRecu: "PTG-2608-0042/V1", montant: 500_000 });
    const recus = composerRecus(vente(), [premier]);
    expect(recus).toHaveLength(2);
    expect(recus[0]).toMatchObject({ type: "vente", totalPaye: 0, resteDu: 1_200_000 });
    expect(recus[1]).toMatchObject({
      type: "versement",
      numero: "PTG-2608-0042/V1",
      totalPaye: 500_000,
      resteDu: 700_000,
    });
  });

  it("signale l’écart de numéro d’une vente renumérotée, sur les deux types de reçu (D44)", () => {
    const renumerotee = vente({ numero: "PTG-2608-0042-B" });
    const recus = composerRecus(renumerotee, [acompte, deuxieme]);

    expect(recus[0].numero).toBe("PTG-2608-0042-B");
    expect(recus[0].numeroRemis).toBe("PTG-2608-0042");
    expect(recus[1].numero).toBe("PTG-2608-0042-B/V2");
    expect(recus[1].numeroRemis).toBe("PTG-2608-0042/V2");
  });

  it("ne signale aucun écart quand le numéro n’a pas bougé", () => {
    const recus = composerRecus(vente(), [acompte, deuxieme]);
    expect(recus.every((recu) => recu.numeroRemis === null)).toBe(true);
  });

  it("ignore l’agrégat porté par la vente, qui peut mentir (D56)", () => {
    /* Deux appareils hors ligne se sont écrasés sur `totalPaye` ; les
       sous-documents, eux, sont tous là. Le reçu suit les versements. */
    const menteuse = vente({ totalPaye: 400_000, resteDu: 800_000 });
    const recus = composerRecus(menteuse, [acompte, deuxieme, troisieme]);
    expect(recus[2].totalPaye).toBe(900_000);
  });
});

describe("retrouver un reçu depuis l’URL", () => {
  const versements = [acompte, deuxieme];

  it("trouve le reçu de vente par la clé de la vente", () => {
    expect(trouverRecu(vente(), versements, "v1")?.type).toBe("vente");
  });

  it("trouve le reçu d’un versement par la clé composée", () => {
    expect(trouverRecu(vente(), versements, "v1~b")?.numero).toBe("PTG-2608-0042/V2");
  });

  it("rend null pour une clé inconnue — le reçu introuvable est un état, pas une panne", () => {
    expect(trouverRecu(vente(), versements, "v1~inexistant")).toBeNull();
  });

  it("rend null pour l’acompte, qui n’a pas de reçu à lui", () => {
    expect(trouverRecu(vente(), versements, "v1~a")).toBeNull();
  });
});

describe("recherche et filtres de l’écran Reçus", () => {
  const recus = composerRecus(vente(), [acompte, deuxieme, troisieme]);
  const cherchables = recus.map((recu) => ({ recu, nomNormalise: normaliserNom("Zongo Adama") }));

  it("trouve par numéro, tirets et barre oblique en moins", () => {
    expect(chercherRecus(cherchables, "26080042", normaliserNom)).toHaveLength(3);
    expect(chercherRecus(cherchables, "0042/v2", normaliserNom)).toHaveLength(1);
  });

  it("trouve par nom de client, sans casse ni accents", () => {
    expect(chercherRecus(cherchables, "ZONGO", normaliserNom)).toHaveLength(3);
  });

  it("rend tout quand la recherche est vide, et rien quand elle ne correspond pas", () => {
    expect(chercherRecus(cherchables, "  ", normaliserNom)).toHaveLength(3);
    expect(chercherRecus(cherchables, "Kaboré", normaliserNom)).toHaveLength(0);
  });

  it("filtre sur des jours, bornes comprises", () => {
    const jour = jourLocal(deuxieme.date!);
    expect(filtrerParDates(cherchables, jour, jour)).toHaveLength(1);
    expect(filtrerParDates(cherchables, "", "")).toHaveLength(3);
  });

  it("garde le reçu du dernier jour de la plage, quelle que soit son heure", () => {
    /* Le piège : comparer des instants ferait sortir un reçu établi à 16 h 30
       d’une plage qui « se termine » ce jour-là à minuit. */
    const dernier = jourLocal(troisieme.date!);
    const filtres = filtrerParDates(cherchables, dernier, dernier);
    expect(filtres).toHaveLength(1);
    expect(filtres[0].recu.numero).toBe("PTG-2608-0042/V3");
  });

  it("classe du plus récent au plus ancien", () => {
    const tries = [...recus].sort(comparerRecus);
    expect(tries.map((recu) => recu.numero)).toEqual([
      "PTG-2608-0042/V3",
      "PTG-2608-0042/V2",
      "PTG-2608-0042",
    ]);
  });
});

describe("texte partagé au client", () => {
  it("tient dans un message : numéro, montant reçu, total payé, reste dû", () => {
    const [, second] = composerRecus(vente(), [acompte, deuxieme]);
    const texte = textePartage(second, "Sandwidi et frère", formaterMontant, formaterDate);

    expect(texte).toContain("Reçu de versement PTG-2608-0042/V2");
    expect(texte).toContain("Sandwidi et frère");
    expect(texte).toContain(`Reçu : ${formaterMontant(300_000)}`);
    expect(texte).toContain(`Total payé : ${formaterMontant(700_000)}`);
    expect(texte).toContain(`Reste dû : ${formaterMontant(500_000)}`);
  });

  it("tait la ligne du montant reçu quand rien n’a été encaissé", () => {
    const [recu] = composerRecus(vente(), []);
    const texte = textePartage(recu, "Sandwidi et frère", formaterMontant, formaterDate);
    expect(texte).not.toContain("Reçu : ");
    expect(texte).toContain(`Reste dû : ${formaterMontant(1_200_000)}`);
  });
});
