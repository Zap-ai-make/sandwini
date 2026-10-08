import { describe, expect, it } from "vitest";
import {
  LONGUEUR_MOTIF_MAX,
  TRANSFERT_VIDE,
  destinationsPossibles,
  peutPartir,
  raisonDeNePasPartir,
  validerTransfert,
} from "./transfert";
import type { Boutique } from "./boutique";
import type { Moto, StatutMoto } from "./moto";

/**
 * Le déplacement d'une moto d'une boutique à une autre (S17).
 *
 * Trois règles pures, et elles portent tout ce que l'écran a le droit de
 * proposer. Le reste — qui a le droit d'écrire, et vers quelle boutique — est
 * tenu par `firestore.rules`, parce qu'une condition dans un composant est une
 * règle sans preuve (D103) et qu'un navigateur ne garde pas ses promesses.
 */

const moto = (statut: StatutMoto): Moto => ({ statut }) as Moto;

const boutique = (id: string, actif = true): Boutique =>
  ({ id, code: id, nom: `Boutique ${id}`, actif }) as Boutique;

describe("peutPartir", () => {
  it("laisse partir une moto en stock", () => {
    expect(peutPartir(moto("en_stock"))).toBe(true);
  });

  /**
   * Une moto réservée ou vendue est promise à quelqu'un.
   *
   * La déplacer ferait voyager la promesse avec elle, sans que le client qui
   * l'attend en sache rien — et le gérant qui la lui a promise ne la verrait
   * même plus dans son stock pour s'en expliquer.
   */
  it("retient une moto réservée, vendue ou déjà transférée", () => {
    expect(peutPartir(moto("reservee"))).toBe(false);
    expect(peutPartir(moto("vendue"))).toBe(false);
    expect(peutPartir(moto("transferee"))).toBe(false);
  });
});

describe("raisonDeNePasPartir", () => {
  it("ne donne aucune raison quand la moto peut partir", () => {
    expect(raisonDeNePasPartir(moto("en_stock"), [boutique("KDG")])).toBeNull();
  });

  /* L'écran ne désactive jamais un geste en silence (DESIGN.md §10) : il dit
     laquelle des deux raisons s'applique. */
  it("nomme le statut quand c’est lui qui bloque", () => {
    expect(raisonDeNePasPartir(moto("vendue"), [boutique("KDG")])).toMatch(/vendue/i);
    expect(raisonDeNePasPartir(moto("reservee"), [boutique("KDG")])).toMatch(/réservée/i);
  });

  it("dit qu’il n’y a nulle part où envoyer quand aucune destination n’est ouverte", () => {
    expect(raisonDeNePasPartir(moto("en_stock"), [])).toMatch(/aucune autre boutique/i);
  });

  /* Le statut passe avant : une moto vendue ne part pas, qu'il y ait ou non une
     destination. Dire « aucune boutique ouverte » enverrait corriger le mauvais
     problème. */
  it("donne le statut plutôt que l’absence de destination quand les deux manquent", () => {
    expect(raisonDeNePasPartir(moto("vendue"), [])).toMatch(/vendue/i);
  });
});

describe("destinationsPossibles", () => {
  const toutes = [boutique("PTG"), boutique("KDG"), boutique("OUA")];

  it("rend les autres boutiques, dans l’ordre reçu", () => {
    expect(destinationsPossibles(toutes, "PTG").map((b) => b.id)).toEqual(["KDG", "OUA"]);
  });

  /** On n'envoie pas une moto là où elle est déjà. */
  it("écarte la boutique d’origine", () => {
    expect(destinationsPossibles(toutes, "KDG").map((b) => b.id)).toEqual(["PTG", "OUA"]);
  });

  /**
   * Une boutique fermée n'est pas une destination.
   *
   * Les règles Firestore la refusent aussi — c'est la garde qui compte — mais
   * la proposer à l'écran pour la faire refuser ensuite serait promettre un
   * geste qui n'aboutit pas.
   */
  it("écarte les boutiques fermées", () => {
    const avecFermee = [boutique("PTG"), boutique("KDG", false), boutique("OUA")];
    expect(destinationsPossibles(avecFermee, "PTG").map((b) => b.id)).toEqual(["OUA"]);
  });

  it("rend une liste vide quand il n’y a que la boutique d’origine", () => {
    expect(destinationsPossibles([boutique("PTG")], "PTG")).toEqual([]);
  });

  /* Le responsable sur « Toutes les boutiques » n'a pas de boutique courante :
     l'origine vient toujours de la moto, jamais du sélecteur. Une origine vide
     ne doit donc pas faire disparaître la liste. */
  it("rend tout quand l’origine est vide", () => {
    expect(destinationsPossibles(toutes, "").map((b) => b.id)).toEqual(["PTG", "KDG", "OUA"]);
  });
});

describe("validerTransfert", () => {
  it("accepte une destination choisie", () => {
    expect(validerTransfert({ ...TRANSFERT_VIDE, versBoutiqueId: "KDG" }, "PTG")).toBeNull();
  });

  it("refuse une destination non choisie", () => {
    expect(validerTransfert(TRANSFERT_VIDE, "PTG")).toMatch(/boutique/i);
  });

  it("refuse la boutique d’origine comme destination", () => {
    expect(validerTransfert({ ...TRANSFERT_VIDE, versBoutiqueId: "PTG" }, "PTG")).toMatch(
      /déjà|même/i,
    );
  });

  /**
   * Le motif est facultatif, et c'est un choix.
   *
   * L'exiger ferait taper « transfert » dans la case à chaque fois, ce qui
   * n'apprend rien à personne et dégrade la trace en bruit.
   */
  it("accepte un motif vide", () => {
    expect(
      validerTransfert({ versBoutiqueId: "KDG", motif: "   " }, "PTG"),
    ).toBeNull();
  });

  it("refuse un motif trop long", () => {
    expect(
      validerTransfert({ versBoutiqueId: "KDG", motif: "x".repeat(LONGUEUR_MOTIF_MAX + 1) }, "PTG"),
    ).toMatch(new RegExp(String(LONGUEUR_MOTIF_MAX)));
  });

  it("accepte un motif à la limite", () => {
    expect(
      validerTransfert({ versBoutiqueId: "KDG", motif: "x".repeat(LONGUEUR_MOTIF_MAX) }, "PTG"),
    ).toBeNull();
  });
});
