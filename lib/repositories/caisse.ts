import {
  Timestamp,
  collection,
  doc,
  onSnapshot,
  query,
  setDoc,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { suivreEcriture } from "@/lib/reseau/file-ecritures";
import {
  identifiantCloture,
  lireMontantCaisse,
  type Cloture,
  type Mouvement,
  type OrigineMouvement,
  type SensMouvement,
} from "@/lib/domain/caisse";
import type { MoyenPaiement } from "@/lib/domain/vente";
import { traceCreation, type Auteur } from "@/lib/repositories/referentiels";

/**
 * La caisse, côté base (S22).
 *
 * **Ce module lit surtout.** Les mouvements sont écrits depuis S8 par les
 * ventes, les versements et les dépôts chez un prestataire ; S22 n'en ajoute
 * qu'un seul type — la sortie d'espèces (réponse 2 du commanditaire) — et un
 * document neuf, la clôture.
 *
 * **Les deux écritures ne passent pas par un lot.** Chacune est un document
 * unique, sans agrégat à mettre à jour en même temps : un `writeBatch` pour une
 * écriture n'achète rien et donne à croire qu'il y a une transaction à tenir.
 *
 * **Aucune n'attend l'accusé de réception du serveur** (D76). Le gérant clôture
 * rideau baissé, parfois sans réseau ; `suivreEcriture` compte l'écriture tant
 * qu'elle n'est pas confirmée, et c'est le bandeau qui dit ce qui reste à
 * envoyer — pas un bouton qui tourne.
 */

function lireMouvement(instantane: QueryDocumentSnapshot<DocumentData>): Mouvement {
  const donnees = instantane.data();
  return {
    id: instantane.id,
    boutiqueId: donnees.boutiqueId ?? "",
    date: donnees.date instanceof Timestamp ? donnees.date.toDate() : null,
    sens: (donnees.sens ?? "entree") as SensMouvement,
    montant: typeof donnees.montant === "number" ? donnees.montant : 0,
    moyenPaiement: (donnees.moyenPaiement ?? "especes") as MoyenPaiement,
    origine: (donnees.origine ?? "autre") as OrigineMouvement,
    origineRefId: donnees.origineRefId ?? "",
    libelle: donnees.libelle ?? "",
    categorieTranches: donnees.categorieTranches === true,
    /* Le nom de qui a saisi, recopié depuis la trace d'audit : le journal
       nomme une personne, et `createdBy` n'est qu'un identifiant de compte. */
    operateur: donnees.createdByName ?? "",
  };
}

function lireCloture(instantane: QueryDocumentSnapshot<DocumentData>): Cloture {
  const donnees = instantane.data();
  const comptees = typeof donnees.especesComptees === "number" ? donnees.especesComptees : null;
  return {
    id: instantane.id,
    boutiqueId: donnees.boutiqueId ?? "",
    jour: donnees.jour ?? "",
    fondsOuverture: typeof donnees.fondsOuverture === "number" ? donnees.fondsOuverture : 0,
    especesAttendues: typeof donnees.especesAttendues === "number" ? donnees.especesAttendues : 0,
    especesComptees: comptees,
    /* `null` et non zéro quand rien n'a été compté : c'est la réponse 4 du
       commanditaire, et la lecture doit la préserver aussi fidèlement que la
       règle qui l'écrit. Un `?? 0` ici annulerait tout le reste. */
    ecart: typeof donnees.ecart === "number" ? donnees.ecart : null,
    motif: donnees.motif ?? "",
    cloturePar: donnees.cloturePar === "automatique" ? "automatique" : "gerant",
    clotureLe: donnees.clotureLe instanceof Timestamp ? donnees.clotureLe.toDate() : null,
    clotureParNom: donnees.clotureParNom ?? "",
  };
}

/**
 * Tous les mouvements d'une boutique, en une écoute.
 *
 * Sans borne de date, et c'est délibéré : l'écran affiche une journée mais
 * l'historique en parcourt beaucoup, et le fonds d'ouverture d'aujourd'hui se
 * lit dans la clôture d'hier. Une écoute par jour ferait un flux par jour
 * consulté, et surtout elle ne servirait rien hors ligne — le cache Firestore
 * répond sur ce qu'il a déjà vu, pas sur une requête neuve.
 *
 * Le volume le permet : le même raisonnement qu'en S24, et les mêmes bornes
 * écrites dans la spec. Le jour où il cessera d'être vrai, c'est une requête
 * bornée au mois qu'il faudra, pas un agrégat.
 */
export function ecouterMouvements(
  boutiqueId: string,
  auChangement: (mouvements: Mouvement[]) => void,
  enErreur: (cause: unknown) => void,
): () => void {
  return onSnapshot(
    query(collection(db(), "encaissements"), where("boutiqueId", "==", boutiqueId)),
    (instantane) => auChangement(instantane.docs.map(lireMouvement)),
    enErreur,
  );
}

export function ecouterClotures(
  boutiqueId: string,
  auChangement: (clotures: Cloture[]) => void,
  enErreur: (cause: unknown) => void,
): () => void {
  return onSnapshot(
    query(collection(db(), "cloturesCaisse"), where("boutiqueId", "==", boutiqueId)),
    (instantane) => auChangement(instantane.docs.map(lireCloture)),
    enErreur,
  );
}

/**
 * Une sortie d'espèces — la réponse 2 du commanditaire.
 *
 * Le seul mouvement que quelqu'un saisit à la main. Tous les autres sont la
 * conséquence d'un geste métier : une vente, un versement, un dépôt chez un
 * prestataire. Celui-ci n'a pas de pièce derrière lui, d'où `origineRefId`
 * vide, et c'est le libellé qui porte la raison.
 *
 * Toujours en espèces : un virement Orange Money vers un fournisseur n'est pas
 * une sortie de tiroir, et le jour où il faudra le tracer, ce sera avec son
 * propre geste. Écrire ici un moyen mobile ferait baisser des espèces attendues
 * que personne n'a touchées.
 */
export function enregistrerSortieEspeces(
  boutiqueId: string,
  saisie: { montant: string; libelle: string },
  auteur: Auteur,
): Promise<void> {
  const montant = lireMontantCaisse(saisie.montant);
  if (montant === null || montant <= 0) {
    throw new Error("Le montant de la sortie doit être un nombre de francs supérieur à zéro.");
  }
  const libelle = saisie.libelle.trim();
  if (libelle.length === 0) {
    throw new Error("Dites en quelques mots à quoi cet argent a servi.");
  }

  return suivreEcriture(
    setDoc(doc(collection(db(), "encaissements")), {
      boutiqueId,
      date: Timestamp.fromDate(new Date()),
      sens: "sortie" as SensMouvement,
      montant,
      moyenPaiement: "especes" as MoyenPaiement,
      origine: "depense" as OrigineMouvement,
      origineRefId: "",
      libelle,
      /* Une sortie de caisse n'est jamais un engagement de tranches : ce
         drapeau ne concerne que l'argent qui entre (§6.2). Même raison qu'au
         dépôt chez un prestataire. */
      categorieTranches: false,
      ...traceCreation(auteur),
    }),
  );
}

export type ClotureAEcrire = {
  boutiqueId: string;
  jour: string;
  fondsOuverture: number;
  especesAttendues: number;
  /** `null` pour une fermeture automatique — et alors l'écart l'est aussi. */
  especesComptees: number | null;
  motif: string;
};

/**
 * Écrit une clôture, comptée ou automatique.
 *
 * **L'écart est calculé ici, jamais reçu.** L'appelant donne ce qu'il a compté ;
 * la soustraction se fait à un seul endroit, et la règle Firestore la refait de
 * son côté. Deux calculs indépendants du même nombre : c'est ce qui empêche un
 * navigateur modifié d'annoncer un tiroir juste avec un comptage qui ne l'est
 * pas.
 *
 * `setDoc` sur un identifiant composé, et non `addDoc` : deux appareils qui
 * clôturent la même journée hors ligne visent le même document, et le second
 * écrasera le premier à la synchronisation plutôt que de créer un doublon. Ce
 * n'est pas parfait — le comptage du second l'emporte sans que personne le
 * sache — mais c'est le moins mauvais des deux : deux clôtures du même jour
 * dans l'historique seraient une anomalie qu'aucun écran ne saurait présenter.
 */
export function enregistrerCloture(saisie: ClotureAEcrire, auteur: Auteur): Promise<void> {
  const automatique = saisie.especesComptees === null;
  const identifiant = identifiantCloture(saisie.boutiqueId, saisie.jour);

  return suivreEcriture(
    setDoc(doc(db(), "cloturesCaisse", identifiant), {
      boutiqueId: saisie.boutiqueId,
      jour: saisie.jour,
      fondsOuverture: saisie.fondsOuverture,
      especesAttendues: saisie.especesAttendues,
      especesComptees: saisie.especesComptees,
      ecart: automatique ? null : saisie.especesComptees! - saisie.especesAttendues,
      /* Une fermeture automatique ne porte pas de motif : personne n'était là
         pour en donner un, et en fabriquer un serait signer à la place du
         gérant. */
      motif: automatique ? "" : saisie.motif.trim(),
      cloturePar: automatique ? "automatique" : "gerant",
      clotureLe: Timestamp.fromDate(new Date()),
      clotureParNom: auteur.nom,
      ...traceCreation(auteur),
    }),
  );
}
