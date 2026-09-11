import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import {
  comparerPieces,
  lireEntier,
  normaliserReference,
  type CoutPiece,
  type MouvementPiece,
  type Piece,
  type SaisieMouvement,
  type SaisiePiece,
  type TypeMouvement,
} from "@/lib/domain/piece";
import { suivreEcriture } from "@/lib/reseau/file-ecritures";
import { signalerSourceDonnees } from "@/lib/reseau/source-donnees";
import { traceCreation, traceModification, type Auteur } from "./referentiels";

/**
 * Les pièces détachées (S20).
 *
 * **Il n'y a pas de document de stock**, et c'est le choix structurant du lot :
 * la quantité est la somme des mouvements, comptée à la lecture (D61). Écrire
 * une quantité quelque part demanderait un déclencheur, et un déclencheur ne
 * tourne pas hors ligne — l'écran afficherait alors l'ancienne quantité au
 * comptoir précisément quand le réseau manque, c'est-à-dire dans la situation
 * que ce produit promet de servir.
 *
 * Ce que ça coûte est écrit d'avance dans la spec : au-delà de `SEUIL_MOUVEMENTS`
 * mouvements, il faudra un arrêté périodique — pas un agrégat entretenu.
 *
 * Le catalogue est **commun à l'entreprise**, le stock appartient à la boutique.
 * Une référence n'est pas à Pouytenga ou à Koudougou ; seuls ses mouvements le
 * sont.
 */

function lirePiece(instantane: QueryDocumentSnapshot<DocumentData>): Piece {
  const donnees = instantane.data();
  return {
    id: instantane.id,
    reference: donnees.reference ?? "",
    designation: donnees.designation ?? "",
    categorie: donnees.categorie ?? "",
    prixVente: typeof donnees.prixVente === "number" ? donnees.prixVente : null,
    seuilAlerte: typeof donnees.seuilAlerte === "number" ? donnees.seuilAlerte : 0,
    actif: donnees.actif !== false,
  };
}

function lireMouvement(instantane: QueryDocumentSnapshot<DocumentData>): MouvementPiece {
  const donnees = instantane.data();
  const date = donnees.date;
  return {
    id: instantane.id,
    boutiqueId: donnees.boutiqueId ?? "",
    pieceId: donnees.pieceId ?? "",
    type: (donnees.type as TypeMouvement) ?? "entree",
    quantite: typeof donnees.quantite === "number" ? donnees.quantite : 0,
    note: donnees.note ?? "",
    date: date instanceof Timestamp ? date.toDate() : null,
  };
}

/** Le catalogue entier, en direct. Commun à l'entreprise : aucun filtre. */
export function ecouterCatalogue(
  auChangement: (pieces: Piece[]) => void,
  enErreur: (cause: unknown) => void,
): () => void {
  return onSnapshot(
    collection(db(), "pieces"),
    { includeMetadataChanges: true },
    (instantane) => {
      signalerSourceDonnees(instantane.metadata.fromCache);
      auChangement(instantane.docs.map(lirePiece).sort(comparerPieces));
    },
    enErreur,
  );
}

/**
 * Les mouvements du périmètre courant, en direct.
 *
 * `boutiqueId` à `null` veut dire « toutes les boutiques » — le responsable
 * seul y a droit, les règles s'en assurent. Aucun tri n'est demandé au serveur :
 * combiner un filtre et un tri exigerait un index composite, et le tri en
 * mémoire marche aussi bien — hors ligne compris.
 *
 * **Tous les mouvements, pas seulement les récents.** La quantité est leur
 * somme : en omettre un la fausse. C'est exactement ce que `SEUIL_MOUVEMENTS`
 * borne, et la spec dit ce qu'on fera le jour où ce sera trop.
 */
export function ecouterMouvements(
  boutiqueId: string | null,
  auChangement: (mouvements: MouvementPiece[]) => void,
  enErreur: (cause: unknown) => void,
): () => void {
  const base = collection(db(), "mouvementsPieces");
  const requete = boutiqueId ? query(base, where("boutiqueId", "==", boutiqueId)) : query(base);

  return onSnapshot(
    requete,
    { includeMetadataChanges: true },
    (instantane) => {
      signalerSourceDonnees(instantane.metadata.fromCache);
      auChangement(
        instantane.docs
          .map(lireMouvement)
          .sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0)),
      );
    },
    enErreur,
  );
}

/**
 * Crée une référence, et rend son identifiant tout de suite.
 *
 * Le même montage que les référentiels depuis S39 : hors ligne, la promesse ne
 * se résout jamais, et l'écran doit pouvoir enchaîner sur la pièce qu'il vient
 * de créer.
 */
export function creerPiece(
  saisie: SaisiePiece,
  auteur: Auteur,
): { id: string; enregistre: Promise<void> } {
  const reference = doc(collection(db(), "pieces"));
  return {
    id: reference.id,
    enregistre: suivreEcriture(setDoc(reference, { ...champsPiece(saisie), ...traceCreation(auteur) })),
  };
}

export function modifierPiece(id: string, saisie: SaisiePiece, auteur: Auteur): Promise<void> {
  return suivreEcriture(
    updateDoc(doc(db(), "pieces", id), { ...champsPiece(saisie), ...traceModification(auteur) }),
  );
}

/**
 * Retire une référence des listes sans l'effacer.
 *
 * On ne supprime jamais : des mouvements la citent, et la quantité d'hier se
 * relit. Désactivée, elle disparaît du catalogue et reste lisible partout où
 * elle a déjà servi — comme les référentiels (S4).
 */
export function changerActivationPiece(
  id: string,
  actif: boolean,
  auteur: Auteur,
): Promise<void> {
  return suivreEcriture(
    updateDoc(doc(db(), "pieces", id), { actif, ...traceModification(auteur) }),
  );
}

function champsPiece(saisie: SaisiePiece) {
  return {
    reference: normaliserReference(saisie.reference),
    designation: saisie.designation.trim(),
    categorie: saisie.categorie.trim(),
    prixVente: saisie.prixVente.trim() ? lireEntier(saisie.prixVente) : null,
    seuilAlerte: lireEntier(saisie.seuilAlerte.trim() || "0") ?? 0,
    actif: true,
  };
}

/**
 * Écrit un mouvement.
 *
 * **La date vient de l'appareil** (D38) : un lot saisi lundi sans réseau et
 * synchronisé mercredi est entré lundi. Seuls les horodatages d'audit, qui
 * disent quand la donnée a été écrite, viennent du serveur.
 *
 * La quantité part **positive** : le sens vient du type. Le domaine refuse
 * d'ailleurs de saisir à la main un type que S20 ne produit pas.
 */
export function enregistrerMouvement(
  saisie: SaisieMouvement,
  boutiqueId: string,
  auteur: Auteur,
): { id: string; enregistre: Promise<void> } {
  const reference = doc(collection(db(), "mouvementsPieces"));
  return {
    id: reference.id,
    enregistre: suivreEcriture(
      setDoc(reference, {
        boutiqueId,
        pieceId: saisie.pieceId,
        type: saisie.type,
        quantite: lireEntier(saisie.quantite) ?? 0,
        note: saisie.note.trim(),
        date: Timestamp.fromDate(new Date()),
        ...traceCreation(auteur),
      }),
    ),
  };
}

/**
 * Le prix d'achat d'une référence — réservé au responsable.
 *
 * Pour un gérant, cet appel échoue par les règles, et c'est voulu : la
 * protection ne doit pas dépendre du fait que l'interface ait pensé à ne pas
 * l'appeler.
 */
export async function lireCoutPiece(pieceId: string): Promise<CoutPiece | null> {
  const instantane = await getDoc(doc(db(), "pieces", pieceId, "prive", "cout"));
  if (!instantane.exists()) return null;
  return { prixAchat: instantane.data().prixAchat ?? 0 };
}

export function poserCoutPiece(pieceId: string, prixAchat: number, auteur: Auteur): Promise<void> {
  return suivreEcriture(
    setDoc(doc(db(), "pieces", pieceId, "prive", "cout"), {
      prixAchat,
      updatedAt: serverTimestamp(),
      updatedBy: auteur.uid,
      updatedByName: auteur.nom,
    }),
  );
}

/** Traduit les refus de Firestore en phrases qui disent quoi faire. */
export function messageErreurPiece(cause: unknown): string {
  const code = (cause as { code?: string }).code ?? "";
  if (code.includes("permission-denied")) {
    return "Cette action ne vous est pas permise ici : le catalogue est tenu par le responsable.";
  }
  if (code.includes("not-found")) return "Cette référence n’existe plus.";
  if (code.includes("unauthenticated")) return "Votre session a expiré. Reconnectez-vous.";
  return "L’enregistrement n’a pas abouti.";
}
