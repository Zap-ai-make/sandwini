import { describe, expect, it } from "vitest";
import { repartirParMarque } from "./repartition";
import type { Moto } from "./moto";

/* Les noms viennent du catalogue dans le produit ; ici deux tables suffisent,
   pour que le test porte sur le comptage et non sur la lecture. Elles imitent
   `nommerEntree` : rien pour un identifiant vide, un tiret pour un introuvable
   (D105). */
const MARQUES: Record<string, string> = { ya: "Yamaha", ha: "Haojue", ap: "Apsonic" };
const MODELES: Record<string, string> = { cry: "Crypton", a7: "A7", kin: "King", zx: "ZX" };

const nomMarque = (id: string) => MARQUES[id] ?? (id ? "—" : "");
const nomModele = (id: string) => MODELES[id] ?? (id ? "—" : "");

const moto = (marqueId: string, modeleId: string, i: number): Moto => ({
  id: `m${i}`,
  boutiqueId: "PTG",
  quittanceChemin: null,
  cmcChemin: null,
  etat: "neuve",
  marqueId,
  modeleId,
  couleur: "",
  annee: null,
  numeroChassis: `LC6PCJ1A9K000012${i}`,
  numeroMoteur: "",
  prixVenteConseille: null,
  provenanceId: "p1",
  arrivageId: null,
  papiersFournis: [],
  photos: [],
  statut: "en_stock",
  dateEntree: null,
  cmcRecu: false,
});

describe("repartirParMarque", () => {
  it("ne rend rien pour un stock vide", () => {
    expect(repartirParMarque([], nomMarque, nomModele)).toEqual([]);
  });

  it("compte les motos d’une marque, et ses modèles en dessous", () => {
    const stock = [moto("ya", "cry", 1), moto("ya", "cry", 2), moto("ya", "a7", 3)];
    const [yamaha] = repartirParMarque(stock, nomMarque, nomModele);

    expect(yamaha.libelle).toBe("Yamaha");
    expect(yamaha.compte).toBe(3);
    expect(yamaha.modeles.map((m) => [m.libelle, m.compte])).toEqual([
      ["Crypton", 2],
      ["A7", 1],
    ]);
  });

  /**
   * L'ordre répond à « qu'est-ce que j'ai le plus ? », pas à l'alphabet.
   *
   * C'est la question qu'on pose devant un stock. Le tri par nom la laisserait
   * sans réponse : il faudrait lire les trois lignes et comparer les nombres
   * soi-même.
   */
  it("met les marques les plus nombreuses en tête", () => {
    const stock = [
      moto("ap", "kin", 1),
      moto("ya", "cry", 2),
      moto("ya", "cry", 3),
      moto("ya", "a7", 4),
      moto("ha", "a7", 5),
      moto("ha", "a7", 6),
    ];
    expect(repartirParMarque(stock, nomMarque, nomModele).map((m) => [m.libelle, m.compte])).toEqual(
      [
        ["Yamaha", 3],
        ["Haojue", 2],
        ["Apsonic", 1],
      ],
    );
  });

  it("départage deux marques à égalité par leur nom", () => {
    const stock = [moto("ya", "cry", 1), moto("ha", "a7", 2), moto("ap", "kin", 3)];
    expect(repartirParMarque(stock, nomMarque, nomModele).map((m) => m.libelle)).toEqual([
      "Apsonic",
      "Haojue",
      "Yamaha",
    ]);
  });

  /**
   * Une moto sans modèle se compte, et elle le dit.
   *
   * Depuis que le modèle est facultatif (D105), `modeleId` vaut légitimement la
   * chaîne vide, et `nomModele` rend alors « rien ». Une ligne sans libellé
   * serait illisible dans un tableau de répartition : on la nomme ici, et
   * **dans le domaine** plutôt qu'à l'écran, pour que ce soit la même phrase
   * partout. La faire disparaître serait pire — le total des modèles ne
   * tomberait plus sur celui de la marque, et personne ne saurait pourquoi.
   */
  it("nomme les motos sans modèle au lieu de les perdre", () => {
    const stock = [moto("ya", "cry", 1), moto("ya", "", 2), moto("ya", "", 3)];
    const [yamaha] = repartirParMarque(stock, nomMarque, nomModele);

    expect(yamaha.compte).toBe(3);
    expect(yamaha.modeles.map((m) => [m.libelle, m.compte])).toEqual([
      ["Modèle non précisé", 2],
      ["Crypton", 1],
    ]);
  });

  /**
   * Et la ligne « non précisé » passe derrière à nombre égal.
   *
   * Le modèle témoin s'appelle « ZX » exprès : il trie **après** « Modèle non
   * précisé » dans l'alphabet. Un simple tri par nom ferait donc passer
   * l'inconnu devant, et ce qu'on ne sait pas se lirait avant ce qu'on sait.
   * La règle est donc explicite, et ce témoin est ce qui l'atteste.
   */
  it("range le « non précisé » après les modèles connus à égalité", () => {
    const stock = [moto("ya", "zx", 1), moto("ya", "", 2)];
    const [yamaha] = repartirParMarque(stock, nomMarque, nomModele);

    expect(yamaha.modeles.map((m) => m.libelle)).toEqual(["ZX", "Modèle non précisé"]);
  });

  it("additionne les modèles jusqu’au total de leur marque", () => {
    const stock = [
      moto("ya", "cry", 1),
      moto("ya", "a7", 2),
      moto("ya", "", 3),
      moto("ha", "a7", 4),
    ];
    for (const marque of repartirParMarque(stock, nomMarque, nomModele)) {
      const somme = marque.modeles.reduce((total, m) => total + m.compte, 0);
      expect(somme, marque.libelle).toBe(marque.compte);
    }
  });
});
