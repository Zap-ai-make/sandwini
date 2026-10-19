/**
 * Les pièces détachées — catalogue, stock et mouvements (S20).
 *
 * **Trois arbitrages du commanditaire sont inscrits dans ces types**, et aucun
 * n'est réversible sans migration.
 *
 * *Le prix d'achat n'est pas ici.* Il vit dans `pieces/{id}/prive/cout`, lisible
 * et écrivable du seul responsable — le même cloisonnement que les motos (D2),
 * resserré par S39 : le gérant ne le saisit plus du tout. Un champ posé sur le
 * document public serait lisible par quiconque lit la pièce, Firestore ne
 * sachant pas masquer un champ.
 *
 * *La quantité ne se stocke pas, elle se compte.* `prompt.md` §5.7 décrit un
 * `stockPieces.quantite` entretenu par déclencheur ; D61 l'écarte, et le
 * hors-ligne tranche presque seul — un agrégat entretenu ne bouge pas quand le
 * déclencheur ne tourne pas, donc l'écran affiche l'ancienne quantité au
 * comptoir précisément quand le réseau manque. Comptée depuis les mouvements,
 * elle bouge dès l'écriture locale. Il n'y a donc **aucune** collection
 * `stockPieces` dans ce produit.
 *
 * *La catégorie est un mot, pas une clé.* Le commanditaire veut pouvoir déclarer
 * « comme il veut, ce qu'il veut » : un texte libre que les valeurs déjà
 * employées viennent proposer, et aucun écran de paramétrage. C'est le principe
 * de S39 appliqué ici (D90).
 */

import { reduire } from "./referentiel";

/**
 * Les types de mouvement, avec le signe qu'ils portent.
 *
 * Le signe vit ici et nulle part ailleurs : c'est lui qui fait que la somme des
 * mouvements est une quantité. `prompt.md` §5.7 stocke la quantité déjà signée
 * dans le document ; on la stocke **positive** et on applique le signe du type,
 * parce qu'une quantité négative écrite à la main est une faute de frappe qui ne
 * se voit pas, là où un type inconnu se refuse.
 */
export const MOUVEMENTS = {
  entree: { signe: 1, libelle: "Entrée" },
  sortie_vente: { signe: -1, libelle: "Vente" },
  sortie_autre: { signe: -1, libelle: "Sortie" },
  transfert_entree: { signe: 1, libelle: "Transfert reçu" },
  transfert_sortie: { signe: -1, libelle: "Transfert envoyé" },
  ajustement_inventaire: { signe: 1, libelle: "Ajustement" },
} as const;

export type TypeMouvement = keyof typeof MOUVEMENTS;

export const TYPES_MOUVEMENT = Object.keys(MOUVEMENTS) as TypeMouvement[];

/**
 * Ce que S20 sait écrire. Les autres types existent dans le modèle parce que
 * les specs qui les produiront sont déjà nommées — S21 pour la vente, S17 pour
 * les transferts, S23 pour l'inventaire — et qu'un type ajouté après coup
 * demanderait de retoucher les règles.
 */
export const TYPES_SAISISSABLES: TypeMouvement[] = ["entree", "sortie_autre"];

/**
 * Un ajustement peut retirer du stock : c'est le seul type dont le signe ne se
 * déduit pas de son nom. On le porte donc sur le mouvement lui-même.
 */
export type Piece = {
  id: string;
  reference: string;
  designation: string;
  categorie: string;
  /**
   * La boutique à qui appartient cette référence.
   *
   * **Chaque gérant tient son propre catalogue**, sur décision du
   * commanditaire : « pour les pièces c'est complètement différent, le
   * responsable ne fera que superviser, rien d'autre — donc tout est fait par
   * le gérant ». Un catalogue partagé aurait voulu dire qu'un gérant déplace
   * les prix d'une autre boutique en corrigeant les siens, et que deux
   * boutiques ne peuvent pas vendre la même pièce à deux prix.
   *
   * Corollaire : l'unicité d'une référence se juge **dans sa boutique**. Deux
   * boutiques peuvent porter « NGK-7 » sans que ce soit un doublon.
   */
  boutiqueId: string;
  /** Nul tant que le gérant ne l'a pas posé : une pièce sans prix ne se vend pas (S21). */
  prixVente: number | null;
  /**
   * Ce que la pièce a coûté — et il est **visible du gérant**, à l'inverse du
   * prix d'achat d'une moto que D2 cloisonne. Même décision que ci-dessus :
   * celui qui vend la bougie fixe son coût, donc il voit sa marge.
   *
   * Nul quand on ne le sait pas encore : une caisse reçue dont la facture
   * suit. La marge est alors inconnue plutôt que fausse.
   */
  prixAchat: number | null;
  seuilAlerte: number;
  actif: boolean;
};

export type MouvementPiece = {
  id: string;
  boutiqueId: string;
  pieceId: string;
  type: TypeMouvement;
  /** Toujours positive. Le signe vient du type (voir `MOUVEMENTS`). */
  quantite: number;
  note: string;
  date: Date | null;
};

export const LONGUEUR_REFERENCE_MAX = 40;
export const LONGUEUR_DESIGNATION_MAX = 120;
export const LONGUEUR_CATEGORIE_MAX = 60;
export const LONGUEUR_NOTE_MAX = 120;
export const QUANTITE_MAX = 1_000_000;
export const MONTANT_MAX = 1_000_000_000;

/**
 * Le seuil au-delà duquel compter à la lecture cesse d'être tenable.
 *
 * **Écrit d'avance plutôt qu'improvisé le jour où ça rame**, comme S24 l'a fait
 * avec ses 20 000 ventes. Une boutique qui écoule quarante lignes par jour écrit
 * environ 12 000 mouvements par an ; le produit les charge tous pour afficher un
 * catalogue.
 *
 * Au-delà de ce nombre, la réponse n'est pas d'entretenir un agrégat — ce serait
 * reprendre le défaut que D61 écarte — mais de poser un **arrêté périodique** :
 * un document qui fige la quantité à une date, et seuls les mouvements
 * postérieurs se rejouent. Cet arrêté est le produit naturel de l'inventaire,
 * donc il n'existera pas avant S23. Le dire ici évite qu'on le découvre en
 * catastrophe.
 */
export const SEUIL_MOUVEMENTS = 20_000;

/** Forme canonique d'une référence : c'est elle qu'on tape et qu'on cherche. */
export function normaliserReference(brut: string): string {
  return brut.trim().replace(/\s+/g, " ").toUpperCase();
}

/** Le nombre saisi, ou `null` si le champ ne contient pas un entier utilisable. */
export function lireEntier(brut: string): number | null {
  const propre = brut.replace(/[\s ]/g, "");
  if (!/^\d+$/.test(propre)) return null;
  const valeur = Number(propre);
  return Number.isSafeInteger(valeur) ? valeur : null;
}

/* --- Le stock, compté et jamais stocké ------------------------------------ */

/**
 * La quantité d'une pièce, depuis ses mouvements.
 *
 * C'est **la** fonction de ce lot : tout le reste en découle. Elle ne prend pas
 * de date, ne lit pas d'horloge, et rend la même chose pour la même liste —
 * c'est ce qui la rend vérifiable.
 */
export function quantiteDe(mouvements: readonly MouvementPiece[]): number {
  return mouvements.reduce(
    (somme, mouvement) => somme + MOUVEMENTS[mouvement.type].signe * mouvement.quantite,
    0,
  );
}

/**
 * Les quantités de toutes les pièces d'une boutique, en un passage.
 *
 * Une carte plutôt qu'un appel par pièce : le catalogue en compte des
 * centaines, et refaire la somme pour chacune serait quadratique sur la liste
 * des mouvements.
 */
export function stockParPiece(mouvements: readonly MouvementPiece[]): Map<string, number> {
  const quantites = new Map<string, number>();
  for (const mouvement of mouvements) {
    const signe = MOUVEMENTS[mouvement.type].signe;
    quantites.set(mouvement.pieceId, (quantites.get(mouvement.pieceId) ?? 0) + signe * mouvement.quantite);
  }
  return quantites;
}

/**
 * L'état d'une pièce au regard de son stock.
 *
 * **`anomalie` n'est pas une quantité, c'est un aveu.** Le produit refuse de
 * sortir plus que le stock (S21), donc un négatif ne peut venir que d'une
 * entrée corrigée ou annulée après des sorties. L'afficher comme un nombre
 * ordinaire reviendrait à ranger « ma saisie est incohérente » avec « il n'y en
 * a plus » — la faute que D82 nomme.
 */
export type EtatStock = "anomalie" | "epuise" | "bas" | "en_stock";

export function etatStock(quantite: number, seuilAlerte: number): EtatStock {
  if (quantite < 0) return "anomalie";
  if (quantite === 0) return "epuise";
  return quantite <= seuilAlerte ? "bas" : "en_stock";
}

export const LIBELLE_ETAT_STOCK: Record<EtatStock, string> = {
  anomalie: "Il manque une entrée",
  epuise: "Épuisé",
  bas: "Stock bas",
  en_stock: "En stock",
};

/* --- Le catalogue --------------------------------------------------------- */

/**
 * Ce qu'un formulaire porte. **Pas de boutique ici** : elle vient du périmètre
 * courant au moment d'enregistrer, comme pour un mouvement de stock. Un gérant
 * ne choisit pas la boutique de sa pièce — il n'en a qu'une.
 */
export type SaisiePiece = {
  reference: string;
  designation: string;
  categorie: string;
  prixAchat: string;
  prixVente: string;
  seuilAlerte: string;
};

export const PIECE_VIDE: SaisiePiece = {
  reference: "",
  designation: "",
  categorie: "",
  prixAchat: "",
  prixVente: "",
  seuilAlerte: "0",
};

export function validerPiece(saisie: SaisiePiece): string | null {
  const reference = normaliserReference(saisie.reference);
  if (!reference) return "La référence est obligatoire : c’est par elle qu’on cherche une pièce.";
  if (reference.length > LONGUEUR_REFERENCE_MAX) {
    return `La référence dépasse ${LONGUEUR_REFERENCE_MAX} caractères.`;
  }

  const designation = saisie.designation.trim();
  if (!designation) return "La désignation est obligatoire : une référence seule ne dit rien.";
  if (designation.length > LONGUEUR_DESIGNATION_MAX) {
    return `La désignation dépasse ${LONGUEUR_DESIGNATION_MAX} caractères.`;
  }

  if (saisie.categorie.trim().length > LONGUEUR_CATEGORIE_MAX) {
    return `La catégorie dépasse ${LONGUEUR_CATEGORIE_MAX} caractères.`;
  }

  /* Le prix de vente reste facultatif, et c'est un arbitrage : une référence
     arrive parfois avant qu'on ait décidé de son prix. Elle existe alors au
     catalogue et ne se vend pas (S21 le refusera), ce qui est plus honnête que
     de forcer un chiffre au hasard pour pouvoir enregistrer. */
  if (saisie.prixVente.trim()) {
    const prix = lireEntier(saisie.prixVente);
    if (prix === null) return "Le prix de vente s’écrit en chiffres entiers.";
    if (prix > MONTANT_MAX) return "Le prix de vente dépasse le maximum admis.";
  }

  /* Le prix d'achat est facultatif pour la même raison, et il n'est **pas**
     comparé au prix de vente : on écoule parfois un stock dormant en dessous
     de ce qu'il a coûté. Refuser ce cas empêcherait d'enregistrer une vente
     réelle ; c'est la marge qui le dira, en négatif. */
  if (saisie.prixAchat.trim()) {
    const cout = lireEntier(saisie.prixAchat);
    if (cout === null) return "Le prix d’achat s’écrit en chiffres entiers.";
    if (cout > MONTANT_MAX) return "Le prix d’achat dépasse le maximum admis.";
  }

  const seuil = lireEntier(saisie.seuilAlerte.trim() || "0");
  if (seuil === null) return "Le seuil d’alerte s’écrit en chiffres entiers.";
  if (seuil > QUANTITE_MAX) return "Le seuil d’alerte dépasse le maximum admis.";

  return null;
}

/**
 * La pièce qui porte déjà cette référence, s'il y en a une.
 *
 * Comparée sous forme réduite — sans casse ni accents — comme les référentiels
 * depuis S39 : « plq-0142 » et « PLQ-0142 » sont la même pièce, et en créer
 * deux couperait le stock en deux.
 */
export function referenceDejaPrise(
  reference: string,
  pieces: readonly Piece[],
  sauf?: string,
): Piece | undefined {
  const cible = reduire(normaliserReference(reference));
  if (!cible) return undefined;
  return pieces.find((piece) => piece.id !== sauf && reduire(piece.reference) === cible);
}

/** Les catégories déjà employées, pour les proposer sans jamais les imposer. */
export function categoriesEmployees(pieces: readonly Piece[]): string[] {
  const vues = new Map<string, string>();
  for (const piece of pieces) {
    const propre = piece.categorie.trim();
    if (propre && !vues.has(reduire(propre))) vues.set(reduire(propre), propre);
  }
  return [...vues.values()].sort((a, b) => a.localeCompare(b, "fr"));
}

/* --- Filtrer le catalogue -------------------------------------------------- */

export type FiltreStock = "tout" | "bas" | "epuise";

export type FiltresPieces = {
  recherche: string;
  stock: FiltreStock;
  categorie: string;
};

export const FILTRES_PIECES_VIDES: FiltresPieces = { recherche: "", stock: "tout", categorie: "" };

/**
 * Filtre le catalogue en mémoire.
 *
 * La recherche porte sur la **référence et la désignation** : au comptoir on
 * cherche tantôt le code lu sur l'emballage, tantôt le nom de la pièce qu'on a
 * dans la main. Elle accepte un fragment, et ignore casse et accents.
 *
 * Filtrer ici plutôt qu'en base donne une recherche instantanée qui marche sans
 * réseau, là où une requête indexée ne marcherait qu'en ligne.
 */
export function filtrerPieces(
  pieces: readonly Piece[],
  quantites: ReadonlyMap<string, number>,
  filtres: FiltresPieces,
): Piece[] {
  const recherche = reduire(filtres.recherche);
  const categorie = reduire(filtres.categorie);

  return pieces.filter((piece) => {
    if (!piece.actif) return false;

    if (categorie && reduire(piece.categorie) !== categorie) return false;

    if (filtres.stock !== "tout") {
      const etat = etatStock(quantites.get(piece.id) ?? 0, piece.seuilAlerte);
      /* « Épuisé » retient aussi les anomalies : un stock négatif n'est pas
         vendable, et le cacher derrière « tout » le rendrait introuvable au
         moment où il faut le corriger. */
      if (filtres.stock === "epuise" && etat !== "epuise" && etat !== "anomalie") return false;
      if (filtres.stock === "bas" && etat !== "bas") return false;
    }

    if (recherche) {
      const dans = `${reduire(piece.reference)} ${reduire(piece.designation)}`;
      if (!dans.includes(recherche)) return false;
    }

    return true;
  });
}

/** Tri d'affichage : par référence, comme on les range sur l'étagère. */
export function comparerPieces(a: Piece, b: Piece): number {
  return a.reference.localeCompare(b.reference, "fr", { numeric: true });
}

/* --- Les mouvements -------------------------------------------------------- */

export type SaisieMouvement = {
  pieceId: string;
  type: TypeMouvement;
  quantite: string;
  note: string;
};

export const MOUVEMENT_VIDE: SaisieMouvement = {
  pieceId: "",
  type: "entree",
  quantite: "",
  note: "",
};

/**
 * Valide un mouvement saisi à la main.
 *
 * `stockDisponible` sert au seul cas des sorties : **« pas de négatif » est une
 * règle du geste**, tenue là où le geste se fait, parce qu'une règle Firestore
 * ne sait pas additionner une collection et qu'une transaction ne fonctionne
 * pas hors ligne. C'est le même garde-fou que S21 posera sur la vente.
 */
export function validerMouvement(
  saisie: SaisieMouvement,
  stockDisponible: number | null = null,
): string | null {
  if (!saisie.pieceId) return "Choisissez une pièce.";
  if (!TYPES_SAISISSABLES.includes(saisie.type)) {
    return "Ce type de mouvement ne se saisit pas à la main.";
  }

  const quantite = lireEntier(saisie.quantite);
  if (quantite === null || quantite <= 0) {
    return "La quantité s’écrit en chiffres entiers, supérieure à zéro.";
  }
  if (quantite > QUANTITE_MAX) return "La quantité dépasse le maximum admis.";

  if (saisie.note.trim().length > LONGUEUR_NOTE_MAX) {
    return `La note dépasse ${LONGUEUR_NOTE_MAX} caractères.`;
  }

  if (
    MOUVEMENTS[saisie.type].signe < 0 &&
    stockDisponible !== null &&
    quantite > stockDisponible
  ) {
    return stockDisponible <= 0
      ? "Cette pièce n’est pas en stock ici. Faites d’abord entrer un lot."
      : `Il n’y a que ${stockDisponible} en stock ici.`;
  }

  return null;
}

/** La quantité signée à écrire, une fois la saisie validée. */
export function quantiteSaisie(saisie: SaisieMouvement): number {
  return lireEntier(saisie.quantite) ?? 0;
}
