import { describe, expect, it } from "vitest";
import type { Boutique } from "./boutique";
import { bilanStock, repartirParBoutique, repartirParMarque } from "./repartition";
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
  quittanceRecue: false,
  plaque: null,
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

/**
 * Le stock par boutique (6 novembre 2026).
 *
 * Sur « Toutes les boutiques », la répartition par marque cède la place au
 * nombre de motos de chaque magasin : c'est la question que le responsable
 * pose en ouvrant le stock de l'entreprise — où sont les motos.
 */
describe("repartirParBoutique", () => {
  const boutique = (id: string, nom: string, partie: Partial<Boutique> = {}): Boutique => ({
    id,
    nom,
    code: id,
    metiers: ["motos"],
    adresse: "",
    telephone: "",
    actif: true,
    ...partie,
  });
  const dans = (boutiqueId: string, i: number): Moto => ({ ...moto("ya", "cry", i), boutiqueId });

  const BOUTIQUES = [
    boutique("POU", "Pouytenga"),
    boutique("OUA", "Ouagadougou"),
    boutique("FAT", "Fatas", { metiers: ["pieces"] }),
    boutique("KAY", "Kaya"),
  ];

  it("compte les motos de chaque boutique qui en vend, rangées par nom", () => {
    const motos = [dans("POU", 1), dans("POU", 2), dans("OUA", 3)];
    expect(repartirParBoutique(motos, BOUTIQUES)).toEqual([
      { boutiqueId: "KAY", nom: "Kaya", compte: 0 },
      { boutiqueId: "OUA", nom: "Ouagadougou", compte: 1 },
      { boutiqueId: "POU", nom: "Pouytenga", compte: 2 },
    ]);
  });

  it("montre une boutique à zéro : un magasin vide est une réponse", () => {
    expect(repartirParBoutique([], BOUTIQUES).map((b) => b.compte)).toEqual([0, 0, 0]);
  });

  it("laisse de côté une boutique sans motos qui n'en vend pas, ou fermée", () => {
    const fermee = boutique("ZIN", "Ziniaré", { actif: false });
    const ids = repartirParBoutique([], [...BOUTIQUES, fermee]).map((b) => b.boutiqueId);
    expect(ids).not.toContain("FAT");
    expect(ids).not.toContain("ZIN");
  });

  it("garde une boutique qui porte encore des motos, même fermée", () => {
    /* Une moto restée dans un magasin fermé doit se voir : la cacher, ce
       serait la perdre de vue. */
    const fermee = boutique("ZIN", "Ziniaré", { actif: false });
    const lignes = repartirParBoutique([dans("ZIN", 1)], [...BOUTIQUES, fermee]);
    expect(lignes.find((b) => b.boutiqueId === "ZIN")?.compte).toBe(1);
  });

  it("nomme par son identifiant une boutique que la liste ne connaît pas", () => {
    const lignes = repartirParBoutique([dans("XXX", 1)], BOUTIQUES);
    expect(lignes.find((b) => b.boutiqueId === "XXX")).toEqual({
      boutiqueId: "XXX",
      nom: "XXX",
      compte: 1,
    });
  });
});

/**
 * Les cartes de tête du stock (9 novembre 2026), sur le dessin de celles des
 * arrivages : « nombre de motos en stock, vendues, marques… ». Elles comptent
 * la liste qu'on leur donne — l'écran leur passe ce que ses filtres laissent.
 */
describe("bilanStock", () => {
  const avec = (partie: Partial<Moto>, i: number): Moto => ({ ...moto("ya", "cry", i), ...partie });

  it("compte les motos, celles en stock, les vendues, les marques et les CMC manquants", () => {
    expect(
      bilanStock([
        avec({ statut: "en_stock", cmcRecu: true }, 1),
        avec({ statut: "en_stock", cmcRecu: false }, 2),
        avec({ statut: "vendue", cmcRecu: false, marqueId: "ha" }, 3),
        avec({ statut: "reservee", cmcRecu: true, marqueId: "ap" }, 4),
      ]),
    ).toEqual({ motos: 4, enStock: 2, vendues: 1, marques: 3, cmcManquants: 2 });
  });

  it("rend des zéros pour une liste vide", () => {
    expect(bilanStock([])).toEqual({ motos: 0, enStock: 0, vendues: 0, marques: 0, cmcManquants: 0 });
  });

  it("compte autant de marques que la répartition en montre", () => {
    const motos = [avec({ marqueId: "ya" }, 1), avec({ marqueId: "ya" }, 2), avec({ marqueId: "ha" }, 3)];
    expect(bilanStock(motos).marques).toBe(repartirParMarque(motos, nomMarque, nomModele).length);
  });
});
