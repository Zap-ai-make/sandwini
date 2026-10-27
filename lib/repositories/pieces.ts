import {
  collection,
  doc,
  onSnapshot,
  query,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import {
  comparerPieces,
  lireEntier,
  normaliserReference,
  type MouvementPiece,
  type Piece,
  type SaisieMouvement,
  type SaisiePiece,
  type TypeMouvement,
} from "@/lib/domain/piece";
import type { SaisieReception } from "@/lib/domain/reception";
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
 * **Le catalogue appartient à la boutique**, comme son stock. Ce n'était pas le
 * cas jusqu'ici — une référence était commune à l'entreprise — et le
 * commanditaire l'a renversé : « pour les pièces c'est complètement différent,
 * le responsable ne fera que superviser, rien d'autre ». Un catalogue partagé
 * aurait voulu dire qu'un gérant déplace les prix d'une autre boutique en
 * corrigeant les siens.
 */

function lirePiece(instantane: QueryDocumentSnapshot<DocumentData>): Piece {
  const donnees = instantane.data();
  return {
    id: instantane.id,
    reference: donnees.reference ?? "",
    designation: donnees.designation ?? "",
    categorie: donnees.categorie ?? "",
    boutiqueId: donnees.boutiqueId ?? "",
    prixVente: typeof donnees.prixVente === "number" ? donnees.prixVente : null,
    prixAchat: typeof donnees.prixAchat === "number" ? donnees.prixAchat : null,
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

/**
 * Le catalogue du périmètre courant, en direct.
 *
 * `boutiqueId` à `null` veut dire « toutes les boutiques », exactement comme
 * pour les mouvements : le responsable seul y a droit, et c'est ce qui lui
 * permet de superviser sans rien écrire. Un gérant, lui, n'a jamais ce
 * périmètre — le sien est sa boutique, et il ne voit que ses références.
 *
 * Aucun tri demandé au serveur : combiner un filtre et un tri exigerait un
 * index composite, et le tri en mémoire marche aussi bien, hors ligne compris.
 */
export function ecouterCatalogue(
  boutiqueId: string | null,
  auChangement: (pieces: Piece[]) => void,
  enErreur: (cause: unknown) => void,
): () => void {
  const base = collection(db(), "pieces");
  return onSnapshot(
    boutiqueId ? query(base, where("boutiqueId", "==", boutiqueId)) : query(base),
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
  boutiqueId: string,
  auteur: Auteur,
): { id: string; enregistre: Promise<void> } {
  const reference = doc(collection(db(), "pieces"));
  return {
    id: reference.id,
    /* La boutique s'écrit à la naissance et ne se réécrit jamais : une
       référence ne change pas de magasin. Un transfert de pièces, le jour où il
       existera, déplacera du stock et non le catalogue. */
    enregistre: suivreEcriture(
      setDoc(reference, { ...champsPiece(saisie), boutiqueId, ...traceCreation(auteur) }),
    ),
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
    /* `null` et non `0` quand le champ est vide : on ne sait pas ce que la
       pièce a coûté, et zéro affirmerait qu'elle n'a rien coûté. */
    prixAchat: saisie.prixAchat.trim() ? lireEntier(saisie.prixAchat) : null,
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
 * Enregistre un arrivage de plusieurs pièces en **un seul lot** (S66).
 *
 * Par ligne : un mouvement `entree` qui porte la quantité et la note de
 * l'arrivage. Et, si la ligne donne un prix d'achat **différent** de celui du
 * catalogue, une mise à jour de ce prix sur la pièce — le coût vit là
 * (`3c8b2fe`), pas sur le mouvement, dont les règles bornent les clés. Les
 * ventes passées gardent leur coût par recopie (`prixAchatUnitaire`) ; seule la
 * marge des ventes à venir suit le nouveau prix.
 *
 * Le lot est atomique : un arrivage entre en entier ou pas du tout, et hors
 * ligne il voyage dans la file comme une écriture unique. Chaque ligne reste
 * pourtant indépendante des autres — il n'y a pas d'invariant croisé comme
 * entre une vente et sa recette ; le lot sert ici l'atomicité du geste, pas une
 * cohérence que les règles ne pourraient pas tenir.
 */
export function enregistrerReception(
  saisie: SaisieReception,
  pieces: ReadonlyMap<string, Piece>,
  boutiqueId: string,
  auteur: Auteur,
): { enregistre: Promise<void> } {
  const lot = writeBatch(db());
  const maintenant = Timestamp.fromDate(new Date());
  const note = saisie.note.trim() || "Réception";

  for (const ligne of saisie.lignes) {
    lot.set(doc(collection(db(), "mouvementsPieces")), {
      boutiqueId,
      pieceId: ligne.pieceId,
      type: "entree",
      quantite: lireEntier(ligne.quantite) ?? 0,
      note,
      date: maintenant,
      ...traceCreation(auteur),
    });

    /* Le prix d'achat ne se réécrit que s'il a changé : réécrire la pièce à
       l'identique salirait son horodatage de modification pour rien. */
    const prix = ligne.prixAchat.trim() ? lireEntier(ligne.prixAchat) : null;
    const piece = pieces.get(ligne.pieceId);
    if (prix !== null && piece && prix !== piece.prixAchat) {
      lot.update(doc(db(), "pieces", ligne.pieceId), {
        prixAchat: prix,
        ...traceModification(auteur),
      });
    }
  }

  return { enregistre: suivreEcriture(lot.commit()) };
}

/* **Le sous-dossier privé d'une pièce a été retiré ici, et ce n'est pas un
   oubli.** `lireCoutPiece` et `poserCoutPiece` lisaient et posaient un
   `prixAchat` dans `pieces/{id}/prive/cout`, cloisonné comme celui d'une moto
   (D2). Elles n'ont jamais été appelées par aucun écran — écrites, jamais
   branchées — et le commanditaire a tranché l'inverse : pour les pièces, le
   gérant voit ce qu'il a payé. Le prix vit donc sur la pièce elle-même. */

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
