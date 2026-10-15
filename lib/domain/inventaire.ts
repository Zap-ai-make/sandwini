/**
 * L'inventaire du stock : ce qu'on détient, et depuis combien de temps (S55).
 *
 * **L'écran s'appelait « Inventaire » et ne contenait aucun inventaire.** Il
 * portait un bilan de ventes et des dettes de clients — de la comptabilité,
 * pas du stock. Le commanditaire ouvrait l'onglet en s'attendant à ses motos et
 * n'y trouvait que de l'argent. Ce module apporte ce qui manquait.
 *
 * **L'âge est la mesure qui compte, et c'est la seule que le métier retienne.**
 * Une moto ne se démode pas et ne se périme pas : elle coûte. Elle occupe la
 * place, l'argent qu'elle a coûté dort, et plus elle attend plus il faut rogner
 * sur son prix pour la faire partir. Les concessions deux-roues rangent donc
 * leur stock par tranches d'ancienneté et tiennent 60 à 90 jours pour normal,
 * au-delà de 90 pour un signal. Ce sont les bornes retenues ici.
 *
 * **Rien de ce module ne touche aux coûts, et c'est délibéré.** Le mur de D2
 * tient : un gérant lit son inventaire — combien de motos, depuis quand, les
 * plus vieilles — sans qu'un seul montant de `prive/cout` quitte sa
 * sous-collection. L'argent immobilisé se calcule ailleurs, pour le seul
 * responsable. Un inventaire utile ne demande pas de connaître les prix.
 */

import type { Moto } from "./moto";

export type CleTranche = "fraiche" | "recente" | "lente" | "dormante";

export type Tranche = {
  cle: CleTranche;
  libelle: string;
  /** Ce qu'il faut en comprendre, en une phrase. */
  sens: string;
  compte: number;
  /** Part du stock détenu, 0 à 100. Les quatre tranches totalisent cent. */
  pourcentage: number;
  /** Au-delà de quatre-vingt-dix jours : la moto coûte plus qu'elle ne promet. */
  alerte: boolean;
};

export type MotoAgee = { moto: Moto; age: number };

export type PartStock = {
  cle: string;
  libelle: string;
  compte: number;
  /** Part du stock total, 0 à 100. */
  pourcentage: number;
};

const MILLISECONDES_PAR_JOUR = 86_400_000;

/** Le seuil où le métier demande d'agir plutôt que d'attendre. */
export const JOURS_DORMANTE = 90;

const BORNES: readonly { cle: CleTranche; libelle: string; sens: string; jusqua: number | null }[] =
  [
    /* « 0 à 30 » et non « moins de 30 » : la borne est inclusive — le seau
       prend `age <= 30` —, et une moto entrée il y a exactement trente jours
       tombait dans une tranche dont le libellé la refusait. Les trois autres
       libellés annoncent déjà leurs bornes des deux côtés. */
    { cle: "fraiche", libelle: "0 à 30 jours", sens: "Vient d’entrer", jusqua: 30 },
    { cle: "recente", libelle: "31 à 60 jours", sens: "Au rythme normal", jusqua: 60 },
    { cle: "lente", libelle: "61 à 90 jours", sens: "À surveiller", jusqua: JOURS_DORMANTE },
    { cle: "dormante", libelle: "Plus de 90 jours", sens: "À traiter", jusqua: null },
  ];

/**
 * Ce qui est physiquement au magasin.
 *
 * **« Réservée » en fait partie.** La moto dort au magasin, le client a versé
 * des tranches et elle ne partira qu'au solde : elle occupe la place et elle
 * vieillit. L'écarter ferait disparaître du stock bien réel.
 *
 * **« Transférée » n'en fait pas partie.** La boutique qui l'a reçue la compte
 * déjà sous son propre `boutiqueId` ; la compter ici la ferait exister deux
 * fois dans l'agrégat du responsable.
 */
export function motosDetenues(motos: readonly Moto[]): Moto[] {
  return motos.filter((moto) => moto.statut === "en_stock" || moto.statut === "reservee");
}

/**
 * Depuis combien de jours cette moto est là.
 *
 * Une date absente se lit « entrée à l'instant » et non « sans âge » : c'est ce
 * que veut dire une écriture pas encore parvenue au serveur (D82). Et une
 * horloge d'appareil en avance ne produit pas d'âge négatif, qui tomberait hors
 * de toutes les tranches et ferait disparaître la moto du compte.
 */
export function ageEnJours(dateEntree: Date | null, maintenant: Date): number {
  if (dateEntree === null) return 0;
  const ecoule = maintenant.getTime() - dateEntree.getTime();
  return ecoule <= 0 ? 0 : Math.floor(ecoule / MILLISECONDES_PAR_JOUR);
}

/**
 * Le stock détenu, rangé par ancienneté.
 *
 * **Les quatre tranches sont toujours rendues, même vides.** D63 refuse les
 * cartes à zéro parce qu'un zéro isolé ne dit rien ; ici le zéro est lu sur une
 * échelle complète, et « aucune moto au-delà de 90 jours » est le meilleur
 * résultat possible. Taire la ligne ferait disparaître celle qu'on espère vide.
 *
 * **Le dénominateur est le total, pas la plus grande part.** `chiffres.ts`
 * rapporte ses barres à la plus grande part pour comparer des boutiques entre
 * elles ; ici les tranches découpent un seul tout, et seule la part du stock
 * veut dire quelque chose.
 */
export function repartirParAge(motos: readonly Moto[], maintenant: Date): Tranche[] {
  const detenues = motosDetenues(motos);
  const comptes = new Map<CleTranche, number>(BORNES.map((borne) => [borne.cle, 0]));

  for (const moto of detenues) {
    const age = ageEnJours(moto.dateEntree, maintenant);
    const borne = BORNES.find((candidate) => candidate.jusqua === null || age <= candidate.jusqua);
    /* `BORNES` finit par une borne ouverte : `borne` ne peut pas être absent.
       Le `?? dormante` existe pour le vérificateur de types, pas pour un cas. */
    const cle = borne?.cle ?? "dormante";
    comptes.set(cle, (comptes.get(cle) ?? 0) + 1);
  }

  const total = detenues.length;
  return BORNES.map((borne) => {
    const compte = comptes.get(borne.cle) ?? 0;
    return {
      cle: borne.cle,
      libelle: borne.libelle,
      sens: borne.sens,
      compte,
      pourcentage: total === 0 ? 0 : (compte / total) * 100,
      alerte: borne.cle === "dormante",
    };
  });
}

/**
 * Les motos qui attendent depuis le plus longtemps, nommées.
 *
 * Un chiffre global ne se traite pas ; une moto précise, si. C'est la seule
 * partie de l'inventaire sur laquelle on peut agir le jour même — baisser un
 * prix, la déplacer vers une boutique qui vend ce modèle, la mettre en avant.
 */
export function plusAnciennes(
  motos: readonly Moto[],
  maintenant: Date,
  combien: number,
): MotoAgee[] {
  return motosDetenues(motos)
    .map((moto) => ({ moto, age: ageEnJours(moto.dateEntree, maintenant) }))
    .sort((a, b) => b.age - a.age)
    .slice(0, combien);
}

/**
 * Où est le stock, boutique par boutique — le niveau du responsable.
 *
 * Un gérant n'en a pas l'usage : son périmètre ne porte qu'une boutique, et la
 * répartition n'aurait qu'une ligne. L'écran ne la montre donc qu'au-dessus
 * d'une seule part.
 */
export function stockParBoutique(
  motos: readonly Moto[],
  nomDeLaBoutique: (id: string) => string,
): PartStock[] {
  const detenues = motosDetenues(motos);
  const parBoutique = new Map<string, number>();
  for (const moto of detenues) {
    parBoutique.set(moto.boutiqueId, (parBoutique.get(moto.boutiqueId) ?? 0) + 1);
  }

  const total = detenues.length;
  return [...parBoutique.entries()]
    .map(([cle, compte]) => ({
      cle,
      libelle: nomDeLaBoutique(cle),
      compte,
      pourcentage: total === 0 ? 0 : (compte / total) * 100,
    }))
    .sort((a, b) => b.compte - a.compte || a.libelle.localeCompare(b.libelle, "fr"));
}
