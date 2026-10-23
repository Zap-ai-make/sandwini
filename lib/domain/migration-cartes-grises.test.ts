import { describe, expect, it } from "vitest";

import {
  preparerMigration,
  vaguesDeMigration,
  type EntreesMigration,
} from "./migration-cartes-grises";
import type { DocumentDossier, StatutDocument } from "./vente";
import type { Vente } from "./vente";

/**
 * La migration des cartes grises, vue depuis le navigateur (S59).
 *
 * **Ce que ces tests tiennent.** Une migration ne se relance pas pour corriger
 * une erreur : elle a déjà écrit. Trois propriétés comptent donc plus que le
 * reste — elle n'écrit rien deux fois, elle laisse de côté ce qu'elle ne peut
 * pas écrire **sans le figer**, et elle rejoue les passages dans un ordre que
 * les règles acceptent.
 */

const carte = (
  venteId: string,
  statut: StatutDocument,
  partie: Partial<DocumentDossier> = {},
): DocumentDossier =>
  ({
    id: "carte_grise",
    venteId,
    boutiqueId: "PTG",
    type: "carte_grise",
    statut,
    prestataireId: null,
    prestataireNom: "",
    deposeLe: null,
    avance: null,
    disponibleLe: null,
    remisLe: null,
    ...partie,
  }) as DocumentDossier;

const vente = (id: string): Vente =>
  ({ id, boutiqueId: "PTG", motoId: `m-${id}`, clientId: `c-${id}` }) as unknown as Vente;

function entrees(
  documents: readonly DocumentDossier[],
  reste: Partial<EntreesMigration> = {},
): EntreesMigration {
  return {
    documents,
    ventes: documents.map((document) => vente(document.venteId)),
    motos: new Map(
      documents.map((document) => [
        `m-${document.venteId}`,
        { numeroChassis: "02SY052982", libelle: "Yamaha SR 115" },
      ]),
    ),
    noms: new Map(documents.map((document) => [`c-${document.venteId}`, "Sawadogo Harouna"])),
    retours: new Map(),
    dejaMigres: new Set(),
    ...reste,
  };
}

describe("ce que la migration laisse tranquille", () => {
  it("ne retouche pas un dossier déjà migré", () => {
    /* **La propriété qui compte le plus.** On relance une migration quand on
       n'est pas sûr qu'elle est passée ; si elle écrasait, elle effacerait le
       travail fait entre-temps. */
    const plan = preparerMigration(
      entrees([carte("v1", "a_faire"), carte("v2", "a_faire")], {
        dejaMigres: new Set(["v1"]),
      }),
    );
    expect(plan.dejaLa).toBe(1);
    expect(plan.aMigrer.map((dossier) => dossier.id)).toEqual(["v2"]);
  });

  it("écarte une moto sans châssis, et la nomme", () => {
    /* L'écrire serait pire que l'omettre : la création passerait, puis
       l'application refuserait TOUTE modification du dossier — elle exige un
       châssis non vide à chaque écriture. Visible et figé pour toujours. */
    const plan = preparerMigration(
      entrees([carte("v1", "a_faire")], {
        motos: new Map([["m-v1", { numeroChassis: "   ", libelle: "GEAR" }]]),
      }),
    );
    expect(plan.aMigrer).toEqual([]);
    expect(plan.sansChassis).toEqual(["v1"]);
  });

  it("écarte ce dont la vente ou la moto a disparu", () => {
    const plan = preparerMigration(entrees([carte("v1", "a_faire")], { motos: new Map() }));
    expect(plan.introuvables).toEqual(["v1"]);
  });

  it("ignore un document qui n’est pas une carte grise", () => {
    const plan = preparerMigration(
      entrees([carte("v1", "a_faire", { type: "quittance" } as Partial<DocumentDossier>)]),
    );
    expect(plan.aMigrer).toEqual([]);
  });
});

describe("l’état réel est rejoué, pas écrit d’un coup", () => {
  it("fait naître à faire, même pour une carte déjà chez le prestataire", () => {
    /* Les règles n'autorisent la création qu'au début de la vie du dossier. Le
       script Admin les contournait ; le navigateur ne peut pas. */
    const [dossier] = preparerMigration(
      entrees([
        carte("v1", "chez_prestataire", {
          prestataireNom: "Bohary",
          deposeLe: new Date(2025, 7, 18),
          avance: 150_000,
        }),
      ]),
    ).aMigrer;

    expect(dossier.creation.statut).toBe("a_faire");
    expect(dossier.etapes.map((etape) => etape.statut)).toEqual(["chez_prestataire"]);
    expect(dossier.etapes[0].champs.prestataireNom).toBe("Bohary");
    expect(dossier.etapes[0].champs.avance).toBe(150_000);
  });

  it("traverse toutes les étapes jusqu’à la remise", () => {
    /* On ne saute pas le prestataire : c'est lui qui dit qui détient le papier,
       et la machine à états le refuse (D65). */
    const [dossier] = preparerMigration(
      entrees([carte("v1", "remis_client", { remisLe: new Date(2026, 7, 9) })], {
        retours: new Map([["v1", new Date(2026, 5, 10)]]),
      }),
    ).aMigrer;

    expect(dossier.etapes.map((etape) => etape.statut)).toEqual([
      "chez_prestataire",
      "revenu_magasin",
      "remis",
    ]);
    expect(dossier.etapes[1].champs.revenuLe).toEqual(new Date(2026, 5, 10));
    expect(dossier.etapes[2].champs.remisLe).toEqual(new Date(2026, 7, 9));
  });

  it("n’invente pas qui est venu chercher", () => {
    /* La question n'était pas posée avant S59. La ligne restera muette sur les
       dossiers déjà remis, et c'est la seule réponse honnête. */
    const [dossier] = preparerMigration(
      entrees([carte("v1", "remis_client", { remisLe: new Date(2026, 7, 9) })]),
    ).aMigrer;
    expect(dossier.creation.remisANom).toBe("");
    expect(dossier.etapes[2].champs.remisANom).toBeUndefined();
  });

  it("fait naître sans objet une carte que le client n’a pas voulue", () => {
    const [dossier] = preparerMigration(entrees([carte("v1", "non_applicable")])).aMigrer;
    expect(dossier.creation.statut).toBe("non_applicable");
    expect(dossier.etapes).toEqual([]);
  });

  it("recopie le propriétaire et la moto en clair", () => {
    const [dossier] = preparerMigration(entrees([carte("v1", "a_faire")])).aMigrer;
    expect(dossier.creation.clientNom).toBe("Sawadogo Harouna");
    expect(dossier.creation.motoLibelle).toBe("Yamaha SR 115");
    expect(dossier.creation.numeroChassis).toBe("02SY052982");
  });
});

describe("les vagues", () => {
  it("séparent les créations des passages", () => {
    /* **Les règles jugent chaque écriture d'un lot contre l'état d'AVANT le
       lot.** Un passage posé dans le même lot que la création serait jugé sur un
       document qui n'existe pas encore, et refusé. */
    const plan = preparerMigration(
      entrees([
        carte("v1", "a_faire"),
        carte("v2", "chez_prestataire"),
        carte("v3", "remis_client"),
      ]),
    );
    const vagues = vaguesDeMigration(plan);

    expect(vagues.map((vague) => vague.ecritures.length)).toEqual([3, 2, 1, 1]);
    expect(vagues[0].ecritures.map((e) => e.id)).toEqual(["v1", "v2", "v3"]);
    /* La première vague de passages ne concerne que ce qui est parti. */
    expect(vagues[1].ecritures.map((e) => e.id)).toEqual(["v2", "v3"]);
    /* Les deux dernières, le seul dossier allé jusqu'à la remise. */
    expect(vagues[3].ecritures.map((e) => e.id)).toEqual(["v3"]);
    expect(vagues[3].ecritures[0].champs.statut).toBe("remis");
  });

  it("annonce le nombre total d’écritures", () => {
    /* C'est ce que l'écran montre avant de laisser cliquer : une migration ne
       se défait pas, et savoir combien elle écrit est le minimum. */
    const plan = preparerMigration(
      entrees([carte("v1", "a_faire"), carte("v2", "remis_client")]),
    );
    expect(plan.ecritures).toBe(1 + 4);
  });

  it("ne rend qu’une vague quand il n’y a rien à rejouer", () => {
    const plan = preparerMigration(entrees([carte("v1", "a_faire")]));
    expect(vaguesDeMigration(plan)).toHaveLength(1);
  });
});
