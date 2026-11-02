import { describe, expect, it } from "vitest";
import {
  cleDepot,
  depotsDeCartesGrises,
  dossiersDuLot,
  LOT_A_DEPOSER,
  lotDuDossier,
  nombreADeposer,
} from "./depots-carte-grise";
import type { DossierCarteGrise } from "./dossier-carte-grise";

/**
 * Les dépôts de cartes grises, lus comme les arrivages (31 octobre 2026).
 *
 * Le commanditaire veut voir, paquet par paquet, combien de cartes un
 * prestataire a prises, combien sont revenues et combien restent dehors. Un
 * dépôt, c'est un prestataire et un jour : ce qu'on lui a confié ensemble.
 */
const dossier = (partie: Partial<DossierCarteGrise>): DossierCarteGrise =>
  ({
    id: "d",
    prestataireId: null,
    prestataireNom: "",
    deposeLe: null,
    immatriculation: "",
    revenuLe: null,
    remisLe: null,
    recu: false,
    statut: "a_faire",
    ...partie,
  }) as DossierCarteGrise;

const LE_15_SEPT = new Date(2026, 8, 15, 9, 30);
const LE_15_SEPT_SOIR = new Date(2026, 8, 15, 18, 0);
const LE_20_OCT = new Date(2026, 9, 20, 10, 0);

describe("cleDepot", () => {
  it("n’en donne pas à un dossier qui n’est jamais parti", () => {
    expect(cleDepot(dossier({}))).toBeNull();
  });

  it("réunit le même prestataire le même jour, à toute heure", () => {
    const matin = dossier({ prestataireId: "kab", prestataireNom: "Kaboré", deposeLe: LE_15_SEPT });
    const soir = dossier({ prestataireId: "kab", prestataireNom: "Kaboré", deposeLe: LE_15_SEPT_SOIR });
    expect(cleDepot(matin)).toBe(cleDepot(soir));
  });

  it("sépare deux jours, et deux prestataires", () => {
    const base = { prestataireId: "kab", prestataireNom: "Kaboré", deposeLe: LE_15_SEPT };
    expect(cleDepot(dossier(base))).not.toBe(cleDepot(dossier({ ...base, deposeLe: LE_20_OCT })));
    expect(cleDepot(dossier(base))).not.toBe(
      cleDepot(dossier({ ...base, prestataireId: "oue", prestataireNom: "Ouédraogo" })),
    );
  });

  it("reconnaît un nom tapé à la main malgré la casse et les espaces", () => {
    /* Il confie aussi à des gens qu'il n'a pas enregistrés : la case TRANSITE
       accepte un nom libre, et « kaboré » tapé un jour vaut « Kaboré ». */
    expect(cleDepot(dossier({ prestataireNom: " kaboré ", deposeLe: LE_15_SEPT }))).toBe(
      cleDepot(dossier({ prestataireNom: "Kaboré", deposeLe: LE_15_SEPT })),
    );
  });
});

describe("depotsDeCartesGrises", () => {
  it("compte, par dépôt, ce qui a été pris, ce qui est revenu et ce qui reste", () => {
    const kabore = { prestataireId: "kab", prestataireNom: "Kaboré", deposeLe: LE_15_SEPT };
    const [depot] = depotsDeCartesGrises([
      dossier({ id: "a", ...kabore }),
      dossier({ id: "b", ...kabore, revenuLe: new Date(2026, 9, 1) }),
      dossier({ id: "c", ...kabore, immatriculation: "11 KM 4521" }),
      dossier({ id: "d", ...kabore, revenuLe: new Date(2026, 9, 1), remisLe: new Date(2026, 9, 3) }),
    ]);
    expect(depot).toMatchObject({
      prestataireNom: "Kaboré",
      pris: 4,
      recus: 3,
      restent: 1,
    });
    expect(depot.deposeLe).toEqual(LE_15_SEPT);
  });

  it("laisse de côté les dossiers qui ne sont pas partis", () => {
    expect(depotsDeCartesGrises([dossier({ id: "a" })])).toEqual([]);
  });

  it("range du dépôt le plus récent au plus ancien, les dépôts sans date à la fin", () => {
    const depots = depotsDeCartesGrises([
      dossier({ id: "a", prestataireNom: "Kaboré", deposeLe: LE_15_SEPT }),
      dossier({ id: "b", prestataireNom: "Sans date" }),
      dossier({ id: "c", prestataireNom: "Ouédraogo", deposeLe: LE_20_OCT }),
    ]);
    expect(depots.map((depot) => depot.prestataireNom)).toEqual(["Ouédraogo", "Kaboré", "Sans date"]);
  });

  it("nomme le dépôt d’un dossier déposé sans prestataire noté", () => {
    const [depot] = depotsDeCartesGrises([dossier({ id: "a", deposeLe: LE_15_SEPT })]);
    expect(depot.prestataireNom).toBe("");
    expect(depot.pris).toBe(1);
  });

  it("donne à chaque dépôt la clé de ses dossiers, pour filtrer le classeur", () => {
    const dossiers = [dossier({ id: "a", prestataireNom: "Kaboré", deposeLe: LE_15_SEPT })];
    const [depot] = depotsDeCartesGrises(dossiers);
    expect(depot.cle).toBe(cleDepot(dossiers[0]));
  });
});

/**
 * Le lot qu'on ouvre (2 novembre 2026).
 *
 * « C'est fait en deux parties, ce n'est pas intuitif et ça pollue » : l'écran
 * ne montre plus que les dépôts, et un clic sur l'un d'eux ouvre le classeur
 * réduit à ses dossiers. Ceux qui ne sont partis chez personne forment un lot
 * à eux, « À déposer » — sans lui, une ligne qu'on vient de créer n'aurait
 * nulle part où apparaître.
 */
describe("lotDuDossier", () => {
  it("rend la clé du dépôt d’un dossier parti", () => {
    const parti = dossier({ prestataireNom: "Kaboré", deposeLe: LE_15_SEPT });
    expect(lotDuDossier(parti)).toBe(cleDepot(parti));
  });

  it("range un dossier jamais parti dans le lot « à déposer »", () => {
    expect(lotDuDossier(dossier({}))).toBe(LOT_A_DEPOSER);
  });

  it("ne confond jamais le lot « à déposer » avec un dépôt", () => {
    /* Un prestataire nommé comme la clé ne doit pas y tomber. */
    const piege = dossier({ prestataireNom: LOT_A_DEPOSER, deposeLe: LE_15_SEPT });
    expect(lotDuDossier(piege)).not.toBe(LOT_A_DEPOSER);
  });
});

describe("dossiersDuLot", () => {
  const kabore = dossier({ id: "k", prestataireNom: "Kaboré", deposeLe: LE_15_SEPT });
  const ouedraogo = dossier({ id: "o", prestataireNom: "Ouédraogo", deposeLe: LE_20_OCT });
  const neuf = dossier({ id: "n" });
  const tous = [kabore, ouedraogo, neuf];

  it("ne garde que les dossiers du dépôt ouvert", () => {
    expect(dossiersDuLot(tous, cleDepot(kabore)!).map((d) => d.id)).toEqual(["k"]);
  });

  it("ouvre le lot « à déposer » sur les dossiers qui ne sont partis chez personne", () => {
    expect(dossiersDuLot(tous, LOT_A_DEPOSER).map((d) => d.id)).toEqual(["n"]);
  });

  it("rend une liste vide pour un dépôt qui n’a plus de dossier", () => {
    expect(dossiersDuLot(tous, "personne|2026-01-01")).toEqual([]);
  });
});

describe("nombreADeposer", () => {
  it("compte les dossiers qui attendent encore d’être confiés", () => {
    expect(
      nombreADeposer([
        dossier({ id: "a" }),
        dossier({ id: "b" }),
        dossier({ id: "c", prestataireNom: "Kaboré", deposeLe: LE_15_SEPT }),
      ]),
    ).toBe(2);
  });

  it("ne compte pas un dossier clos sans être parti", () => {
    /* Remis au client sans passer par un prestataire, ou sans objet après une
       vente annulée : il n'attend plus de dépôt. */
    expect(
      nombreADeposer([
        dossier({ id: "a", statut: "remis" }),
        dossier({ id: "b", statut: "non_applicable" }),
      ]),
    ).toBe(0);
  });
});
