/**
 * Le paquet de cartes grises (S53, arbitrages 2, 6 et 9).
 *
 * Le commanditaire : « *la remise au prestataire se fait par paquet. On tend
 * dix cartes grises.* » Le produit ne savait confier qu'une carte à la fois —
 * dix dépôts, dix sorties de caisse, dix fois le même nom de prestataire tapé.
 *
 * **Un paquet groupe, il ne remplace pas.** Chaque document `carte_grise`
 * continue de porter son `prestataireId`, son `deposeLe` et son `avance` : les
 * règles Firestore évaluent chaque écriture d'un lot contre l'état d'**avant**
 * le lot (la leçon de S5, redite en S17), donc un document validé contre un
 * paquet créé dans le même lot serait refusé. `depotRenseigne` reste vrai mot
 * pour mot, et les écrans de dossier existants continuent de fonctionner.
 */

import { estEnRetard, joursEcoules, lireJour } from "./dossier";
import { lireMontant, MONTANT_MAX, type DocumentDossier, type MoyenPaiement } from "./vente";

/**
 * Le nombre de cartes qu'un paquet peut porter.
 *
 * **La borne vient du calcul, pas du confort.** Un lot Firestore accepte 500
 * écritures. Un paquet en fait `2N + 2` : le document du paquet, puis par carte
 * une mise à jour du document et une ligne d'historique, plus l'encaissement
 * unique de l'avance. `2N + 2 <= 500` donne `N <= 249`.
 *
 * C'est un **plafond**, pas une cible : le geste réel en tend dix. Mais une
 * borne choisie au hasard se révèle un jour fausse dans le mauvais sens, alors
 * que celle-ci est la limite au-delà de laquelle l'écriture échouerait en bloc,
 * sans message utile.
 */
export const CARTES_PAR_PAQUET_MAX = 249;

export type SaisiePaquet = {
  prestataireId: string;
  /** Recopié sur le paquet et sur chaque document : une ligne se lit sans
      rouvrir une fiche de prestataire. Même raison qu'au dépôt unitaire. */
  prestataireNom: string;
  /** Format de `<input type="date">` : `aaaa-mm-jj`. */
  deposeLe: string;
  avance: string;
  /** L'avance sort de la caisse : par quel moyen, il faut le dire. */
  moyenPaiement: MoyenPaiement;
  /** Facultatif. Même format. */
  disponibleLe: string;
  /** Les ventes dont la carte grise part. Une par carte. */
  venteIds: readonly string[];
};

/**
 * Le refus à montrer, ou `null` si le paquet peut partir.
 *
 * **Les mêmes règles que le dépôt unitaire, plus celles du nombre.** L'avance
 * strictement positive et la date annoncée postérieure au dépôt ne sont pas
 * redites par confort : ce sont les conditions que `depotRenseigne` impose côté
 * serveur à **chaque** document du lot, et les faire échouer là-bas donnerait un
 * refus illisible sur un geste déjà affiché comme fait.
 */
export function validerPaquet(saisie: SaisiePaquet): string | null {
  if (!saisie.prestataireId) {
    return "Choisissez le prestataire à qui vous confiez les cartes grises.";
  }

  if (saisie.venteIds.length === 0) {
    return "Choisissez au moins une carte grise à confier.";
  }

  /* Deux écritures sur le même document dans un lot Firestore font échouer le
     lot entier, sans dire laquelle. Le doublon se refuse donc ici, où le
     message est lisible. */
  if (new Set(saisie.venteIds).size !== saisie.venteIds.length) {
    return "La même vente figure deux fois dans la sélection.";
  }

  if (saisie.venteIds.length > CARTES_PAR_PAQUET_MAX) {
    return `Un paquet porte au plus ${CARTES_PAR_PAQUET_MAX} cartes grises. Faites-en deux.`;
  }

  const depose = lireJour(saisie.deposeLe);
  if (!depose) return "Indiquez la date du dépôt.";

  const montant = lireMontant(saisie.avance);
  if (montant === null) {
    return "L’avance doit être un montant en francs, sans virgule ni centimes.";
  }
  /* Zéro n'est pas une avance : c'est un travail confié à crédit, et le crédit
     se modélise ailleurs. Les confondre ferait apparaître des cartes déposées
     sans contrepartie en caisse, que rien ne viendrait solder. */
  if (montant <= 0) {
    return "Une avance est un premier versement : sans montant, le travail est confié à crédit.";
  }
  if (montant > MONTANT_MAX) return "L’avance dépasse le maximum admis.";

  if (saisie.disponibleLe) {
    const disponible = lireJour(saisie.disponibleLe);
    if (!disponible) return "La date de disponibilité annoncée n’est pas une date.";
    if (disponible < depose) return "La date annoncée est antérieure au dépôt.";
  }

  return null;
}

/** Un paquet tel qu'il est stocké. Aucun champ d'état : il se calcule. */
export type PaquetCartesGrises = {
  id: string;
  boutiqueId: string;
  prestataireId: string;
  prestataireNom: string;
  deposeLe: Date | null;
  disponibleLe: Date | null;
  avance: number;
  venteIds: readonly string[];
};

export type EtatPaquet = {
  total: number;
  dehors: number;
  revenues: number;
  /** Plus rien dehors, et les documents ont répondu. Jamais un champ stocké. */
  solde: boolean;
  /** Les documents du paquet sont-ils parvenus ? Faux : on ne sait pas encore. */
  lu: boolean;
  joursDehors: number | null;
  enRetard: boolean;
};


/**
 * Ce qu'un paquet montre, recompté à chaque lecture (D61).
 *
 * **Un paquet n'a pas d'état « rendu », et c'est délibéré.** Lui en donner un
 * rouvrirait la contradiction B sous un autre nom : le champ dirait « soldé »
 * pendant qu'une carte serait encore chez le prestataire, et il faudrait un
 * geste pour les raccorder. Ici, le solde **est** l'absence de carte dehors —
 * ce qui rend gratuit le retour partiel de l'arbitrage 9.
 *
 * Le rapprochement se fait sur `venteId`. Une vente renumérotée garde le sien —
 * seul son numéro affiché gagne un `-B` (D5) —, donc un paquet ne perd jamais
 * une carte parce que deux appareils se sont disputé un numéro.
 */
export function etatPaquet(
  paquet: PaquetCartesGrises,
  documents: readonly DocumentDossier[],
  aujourdhui: Date,
): EtatPaquet {
  const siennes = new Set(paquet.venteIds);
  const cartes = documents.filter(
    (document) => document.type === "carte_grise" && siennes.has(document.venteId),
  );

  const dehors = cartes.filter((carte) => carte.statut === "chez_prestataire").length;
  const revenues = cartes.filter((carte) => carte.statut === "revenu_magasin").length;

  /* **Une liste vide n'est pas un paquet soldé.** Les deux rendent zéro carte
     dehors ; sans ce drapeau, un paquet dont l'écoute n'a pas encore répondu
     s'afficherait rendu, sur un écran qu'on vient justement consulter pour
     savoir ce qui reste dehors (D95). */
  const lu = cartes.length > 0;

  return {
    total: paquet.venteIds.length,
    dehors,
    revenues,
    solde: lu && dehors === 0,
    lu,
    joursDehors: joursEcoules(paquet.deposeLe, aujourdhui),
    /* Le retard d'un paquet soldé n'intéresse personne : les cartes sont là, et
       la date annoncée est de l'histoire. */
    enRetard:
      lu &&
      dehors > 0 &&
      paquet.disponibleLe !== null &&
      estEnRetard(paquet.disponibleLe, aujourdhui),
  };
}

/**
 * Les cartes grises qu'un paquet peut emporter.
 *
 * **Une carte déjà dehors n'y entre pas**, et ce filtre n'est pas décoratif :
 * la transition `chez_prestataire -> chez_prestataire` n'existe pas, donc le lot
 * entier serait refusé par la base — sans dire laquelle des dix cartes a fauté,
 * et après que l'écran a montré le dépôt comme fait. Verser deux fois une avance
 * pour le même travail serait le vrai dégât.
 */
export function cartesConfiables(
  documents: readonly DocumentDossier[],
): readonly DocumentDossier[] {
  return documents.filter(
    (document) => document.type === "carte_grise" && document.statut === "a_faire",
  );
}
