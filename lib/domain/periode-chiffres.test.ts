import { describe, expect, it } from "vitest";
import { chiffresDeLaPeriode } from "./periode-chiffres";
import { bornesPeriode } from "./periode";
import type { ModePaiement, Vente } from "./vente";

const vente = (p: Partial<Vente> = {}): Vente =>
  ({
    id: "v1",
    boutiqueId: "PTG",
    date: new Date(2026, 8, 15),
    prixConvenu: 1_000_000,
    modePaiement: "comptant" as ModePaiement,
    totalPaye: 1_000_000,
    resteDu: 0,
    motoRemise: false,
    ...p,
  }) as unknown as Vente;

const TOUT = null;

describe("chiffresDeLaPeriode", () => {
  it("ne compte rien sur une liste vide, et le dit", () => {
    const chiffres = chiffresDeLaPeriode(TOUT, []);
    expect(chiffres.motosVendues).toBe(0);
    expect(chiffres.montant).toBe(0);
    expect(chiffres.vide).toBe(true);
  });

  it("compte les motos vendues et leur montant", () => {
    const chiffres = chiffresDeLaPeriode(TOUT, [
      vente({ prixConvenu: 1_000_000 }),
      vente({ id: "v2", prixConvenu: 750_000 }),
    ]);
    expect(chiffres.motosVendues).toBe(2);
    expect(chiffres.montant).toBe(1_750_000);
    expect(chiffres.vide).toBe(false);
  });

  it("ne retient que les ventes de la période", () => {
    const bornes = bornesPeriode("ce-mois", new Date(2026, 8, 20));
    const chiffres = chiffresDeLaPeriode(bornes, [
      vente({ date: new Date(2026, 8, 3) }),
      vente({ id: "v2", date: new Date(2026, 7, 28) }),
      vente({ id: "v3", date: new Date(2026, 9, 2) }),
    ]);
    expect(chiffres.motosVendues).toBe(1);
  });

  /**
   * Une vente sans date compte toujours.
   *
   * Même lecture que `dansLaPeriode` : une vente enregistrée hors ligne n'a pas
   * encore l'horodatage du serveur. L'écarter la ferait disparaître du bilan au
   * moment précis où le gérant vérifie qu'elle est bien passée.
   */
  it("garde une vente sans date, qui vient d’être saisie hors ligne", () => {
    const bornes = bornesPeriode("ce-mois", new Date(2026, 8, 20));
    expect(chiffresDeLaPeriode(bornes, [vente({ date: null })]).motosVendues).toBe(1);
  });

  /**
   * **Les quatre montants ne s'additionnent jamais**, et c'est la confusion la
   * plus coûteuse du projet (`AGENTS.md`).
   *
   * « Crédit dehors » : la moto est partie, le client doit de l'argent — c'est
   * une créance. « Encaissé sur tranches » : la moto dort au magasin, qui
   * détient l'argent du client — c'est un dépôt. Les sommer produirait un
   * nombre qui ne désigne rien.
   */
  it("sépare le crédit dehors de l’argent détenu sur tranches", () => {
    const chiffres = chiffresDeLaPeriode(TOUT, [
      vente({ id: "c1", modePaiement: "credit", prixConvenu: 900_000, totalPaye: 300_000, resteDu: 600_000 }),
      vente({ id: "t1", modePaiement: "tranches", prixConvenu: 800_000, totalPaye: 500_000, resteDu: 300_000 }),
    ]);
    expect(chiffres.creditDehors).toBe(600_000);
    expect(chiffres.encaisseSurTranches).toBe(500_000);
    expect(chiffres.resteSurTranches).toBe(300_000);
    /* Le montant, lui, est le chiffre d'affaires : il porte sur ce qui a été
       convenu, pas sur ce qui est rentré. */
    expect(chiffres.montant).toBe(1_700_000);
  });

  it("ne met aucun comptant dans le crédit ni dans les tranches", () => {
    const chiffres = chiffresDeLaPeriode(TOUT, [vente({ modePaiement: "comptant" })]);
    expect(chiffres.creditDehors).toBe(0);
    expect(chiffres.encaisseSurTranches).toBe(0);
    expect(chiffres.resteSurTranches).toBe(0);
  });

  /**
   * Une tranche dont la moto est partie n'est plus de l'argent détenu.
   *
   * La remise n'a lieu qu'au dernier franc, le cas est donc rare — mais il
   * existe, et compter cette vente parmi les dépôts dirait que le magasin
   * détient encore une moto qu'il a rendue. Même décision que `chiffresDuMois`.
   */
  it("sort des tranches une vente dont la moto a été remise", () => {
    const chiffres = chiffresDeLaPeriode(TOUT, [
      vente({ modePaiement: "tranches", totalPaye: 800_000, resteDu: 0, motoRemise: true }),
    ]);
    expect(chiffres.encaisseSurTranches).toBe(0);
    expect(chiffres.resteSurTranches).toBe(0);
  });

  it("additionne plusieurs ventes de chaque nature", () => {
    const chiffres = chiffresDeLaPeriode(TOUT, [
      vente({ id: "c1", modePaiement: "credit", resteDu: 100_000 }),
      vente({ id: "c2", modePaiement: "credit", resteDu: 250_000 }),
      vente({ id: "t1", modePaiement: "tranches", totalPaye: 200_000, resteDu: 50_000 }),
      vente({ id: "t2", modePaiement: "tranches", totalPaye: 400_000, resteDu: 10_000 }),
    ]);
    expect(chiffres.creditDehors).toBe(350_000);
    expect(chiffres.encaisseSurTranches).toBe(600_000);
    expect(chiffres.resteSurTranches).toBe(60_000);
  });
});

/**
 * « L'argent dehors » — la seule addition permise entre les deux natures.
 *
 * Demandé par le commanditaire : « on doit également avoir le montant total de
 * l'argent dehors, moto crédit + partiel restant ». Ces tests existent surtout
 * pour figer ce que le total ne contient **pas** : le jour où quelqu'un y
 * ajoutera l'encaissé sur tranches, croyant compléter la somme, ils tomberont.
 */
describe("resteAPercevoir", () => {
  it("additionne le crédit dehors et le reste sur tranches", () => {
    const chiffres = chiffresDeLaPeriode(TOUT, [
      vente({ id: "c1", modePaiement: "credit", resteDu: 415_000 }),
      vente({ id: "t1", modePaiement: "tranches", totalPaye: 575_000, resteDu: 300_000 }),
    ]);
    expect(chiffres.resteAPercevoir).toBe(715_000);
  });

  /*
   * Le garde-fou de la règle cardinale. L'encaissé sur tranches est de
   * l'argent que le magasin DÉTIENT ; le reste à percevoir est de l'argent
   * qu'il ATTEND. Les mêlanger inventerait une grandeur qui ne désigne rien —
   * ici 575 000 de trop.
   */
  it("n’inclut jamais l’argent que le magasin détient déjà", () => {
    const chiffres = chiffresDeLaPeriode(TOUT, [
      vente({ id: "t1", modePaiement: "tranches", totalPaye: 575_000, resteDu: 300_000 }),
    ]);
    expect(chiffres.encaisseSurTranches).toBe(575_000);
    expect(chiffres.resteAPercevoir).toBe(300_000);
  });

  it("vaut zéro quand tout est soldé", () => {
    const chiffres = chiffresDeLaPeriode(TOUT, [
      vente({ id: "s1", modePaiement: "comptant", totalPaye: 900_000, resteDu: 0 }),
    ]);
    expect(chiffres.resteAPercevoir).toBe(0);
  });

  /*
   * Les deux cas que l'addition des deux cartes laissait tomber. Ils ont
   * décidé de la définition : le total somme TOUS les restes dus, comme
   * `bilanVentes`, et non `creditDehors + resteSurTranches`.
   *
   * Une moto remise sort des tranches détenues — elle ne doit pas pour autant
   * sortir de ce qu'on attend : le client doit toujours, et la moto n'est
   * plus là pour répondre de la dette.
   */
  it("garde ce qui est dû sur une vente en tranches dont la moto est partie", () => {
    const chiffres = chiffresDeLaPeriode(TOUT, [
      vente({ modePaiement: "tranches", totalPaye: 800_000, resteDu: 120_000, motoRemise: true }),
    ]);
    expect(chiffres.resteSurTranches).toBe(0);
    expect(chiffres.resteAPercevoir).toBe(120_000);
  });

  it("compte aussi un comptant qui n’a pas été soldé", () => {
    const chiffres = chiffresDeLaPeriode(TOUT, [
      vente({ modePaiement: "comptant", totalPaye: 500_000, resteDu: 400_000 }),
    ]);
    expect(chiffres.creditDehors).toBe(0);
    expect(chiffres.resteSurTranches).toBe(0);
    expect(chiffres.resteAPercevoir).toBe(400_000);
  });
});
