import { describe, expect, it } from "vitest";
import { ageEnJours, motosDetenues, plusAnciennes, repartirParAge, stockParBoutique } from "./inventaire";
import type { Moto, StatutMoto } from "./moto";

const LE_JOUR = new Date(2026, 9, 13);

const jours = (combien: number) => new Date(LE_JOUR.getTime() - combien * 86_400_000);

const moto = (p: Partial<Moto> = {}): Moto => ({
  id: "m1",
  boutiqueId: "KDG",
  quittanceChemin: null,
  cmcChemin: null,
  etat: "neuve",
  marqueId: "ya",
  modeleId: "cry",
  couleur: "Rouge",
  annee: 2026,
  numeroChassis: "LC6PCJ1A9K0000123",
  numeroMoteur: "MOT-9",
  prixVenteConseille: null,
  provenanceId: "p1",
  arrivageId: null,
  papiersFournis: [],
  photos: [],
  statut: "en_stock",
  dateEntree: jours(0),
  cmcRecu: false,
  quittanceRecue: false,
  plaque: null,
  ...p,
});

const avec = (statut: StatutMoto, age: number, reste: Partial<Moto> = {}) =>
  moto({ id: `${statut}-${age}`, statut, dateEntree: jours(age), ...reste });

describe("motosDetenues", () => {
  /**
   * **Détenu n'est pas « en stock ».** Une moto réservée dort au magasin : le
   * client a versé des tranches et elle ne partira qu'au solde. Elle occupe la
   * place, elle vieillit, et l'argent qu'elle représente est toujours immobilisé
   * — l'écarter de l'inventaire ferait disparaître du stock bien réel.
   *
   * Une moto transférée, elle, est comptée par la boutique qui l'a reçue : la
   * compter ici la ferait exister deux fois dans l'agrégat du responsable.
   */
  it("garde ce qui est physiquement là, écarte ce qui est parti", () => {
    const detenues = motosDetenues([
      avec("en_stock", 1),
      avec("reservee", 2),
      avec("vendue", 3),
      avec("transferee", 4),
    ]);
    expect(detenues.map((m) => m.statut)).toEqual(["en_stock", "reservee"]);
  });
});

describe("ageEnJours", () => {
  it("compte les jours écoulés", () => {
    expect(ageEnJours(jours(0), LE_JOUR)).toBe(0);
    expect(ageEnJours(jours(45), LE_JOUR)).toBe(45);
  });

  /* Une date absente veut dire « saisie à l'instant, pas encore parvenue au
     serveur » (D82), pas « sans âge ». Zéro est la lecture exacte. */
  it("lit une date absente comme une arrivée à l’instant", () => {
    expect(ageEnJours(null, LE_JOUR)).toBe(0);
  });

  /* Une horloge d'appareil en avance ne doit pas produire un âge négatif, qui
     tomberait hors de toutes les tranches et ferait disparaître la moto. */
  it("ne rend jamais d’âge négatif", () => {
    expect(ageEnJours(new Date(LE_JOUR.getTime() + 86_400_000), LE_JOUR)).toBe(0);
  });
});

describe("repartirParAge", () => {
  it("range chaque moto dans sa tranche", () => {
    const tranches = repartirParAge(
      [avec("en_stock", 0), avec("en_stock", 30), avec("en_stock", 31), avec("en_stock", 61), avec("en_stock", 200)],
      LE_JOUR,
    );
    expect(tranches.map((t) => t.compte)).toEqual([2, 1, 1, 1]);
  });

  /**
   * **Les quatre tranches restent, même vides, et c'est l'inverse de D63.**
   *
   * D63 refuse les cartes à zéro parce qu'un zéro isolé ne dit rien. Ici le
   * zéro est lu sur une échelle complète : « aucune moto au-delà de 90 jours »
   * est le meilleur résultat possible, et le taire ferait disparaître la seule
   * ligne qu'on espère vide.
   */
  it("garde les tranches vides, parce qu’un zéro y est une bonne nouvelle", () => {
    const tranches = repartirParAge([avec("en_stock", 5)], LE_JOUR);
    expect(tranches).toHaveLength(4);
    expect(tranches.map((t) => t.compte)).toEqual([1, 0, 0, 0]);
  });

  /* Les tranches découpent un tout : leur dénominateur est le total, pas la
     plus grande part comme dans `chiffres.ts`. Rapportées à la plus grande,
     elles ne totaliseraient pas 100 et la lecture « part du stock » serait
     fausse. */
  it("rapporte les parts au total, et elles font cent", () => {
    const tranches = repartirParAge([avec("en_stock", 1), avec("en_stock", 2), avec("en_stock", 100)], LE_JOUR);
    expect(tranches[0].pourcentage).toBeCloseTo(66.67, 1);
    expect(tranches[3].pourcentage).toBeCloseTo(33.33, 1);
    expect(tranches.reduce((somme, t) => somme + t.pourcentage, 0)).toBeCloseTo(100, 5);
  });

  it("ne signale que la tranche au-delà de quatre-vingt-dix jours", () => {
    const tranches = repartirParAge([avec("en_stock", 1)], LE_JOUR);
    expect(tranches.map((t) => t.alerte)).toEqual([false, false, false, true]);
  });

  it("ne compte que ce qui est détenu", () => {
    const tranches = repartirParAge([avec("en_stock", 1), avec("vendue", 200)], LE_JOUR);
    expect(tranches.map((t) => t.compte)).toEqual([1, 0, 0, 0]);
  });

  it("rend des parts nulles plutôt qu’une division par zéro", () => {
    const tranches = repartirParAge([], LE_JOUR);
    expect(tranches.map((t) => t.pourcentage)).toEqual([0, 0, 0, 0]);
  });
});

describe("plusAnciennes", () => {
  /* Un chiffre global ne se traite pas ; une moto nommée, si. C'est la seule
     partie de l'inventaire sur laquelle on peut agir le jour même. */
  it("nomme les plus vieilles d’abord", () => {
    const vieilles = plusAnciennes(
      [avec("en_stock", 10), avec("en_stock", 200), avec("en_stock", 95)],
      LE_JOUR,
      2,
    );
    expect(vieilles.map((v) => v.age)).toEqual([200, 95]);
  });

  it("écarte ce qui n’est plus détenu", () => {
    expect(plusAnciennes([avec("vendue", 300)], LE_JOUR, 5)).toEqual([]);
  });

  it("n’en rend jamais plus qu’on en demande", () => {
    const stock = [avec("en_stock", 1), avec("en_stock", 2), avec("en_stock", 3)];
    expect(plusAnciennes(stock, LE_JOUR, 2)).toHaveLength(2);
  });
});

describe("stockParBoutique", () => {
  /* Le niveau du responsable : son agrégat n'a de sens que découpé par
     boutique, sinon il ne sait pas où est son argent. */
  it("compte les motos détenues par boutique, la plus fournie en tête", () => {
    const parts = stockParBoutique(
      [
        avec("en_stock", 1, { boutiqueId: "KDG" }),
        avec("en_stock", 2, { boutiqueId: "PTG" }),
        avec("en_stock", 3, { boutiqueId: "PTG" }),
        avec("vendue", 4, { boutiqueId: "PTG" }),
      ],
      (id) => ({ KDG: "Koudougou", PTG: "Patte d’oie" })[id] ?? id,
    );
    expect(parts.map((p) => [p.libelle, p.compte])).toEqual([
      ["Patte d’oie", 2],
      ["Koudougou", 1],
    ]);
  });
});
