import { describe, expect, it } from "vitest";
import { cleDepot, depotsDeCartesGrises } from "./depots-carte-grise";
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
