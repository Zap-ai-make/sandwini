import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  Timestamp,
  where,
  writeBatch,
  type DocumentData,
  type DocumentSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import {
  coutTotal,
  lireEntier,
  lirePapiers,
  normaliserChassis,
  type CoutMoto,
  type EtatMoto,
  type Moto,
  type SaisieMoto,
  type StatutMoto,
} from "@/lib/domain/moto";
import { suivreEcriture } from "@/lib/reseau/file-ecritures";
import { signalerSourceDonnees } from "@/lib/reseau/source-donnees";
import { traceCreation, type Auteur } from "./referentiels";

/**
 * Le stock de motos.
 *
 * Deux documents par moto, écrits dans le même lot : la moto elle-même, que le
 * gérant lit, et son coût, que seul le responsable lit (`DECISIONS.md` D2). Le
 * gérant écrit donc quelque chose qu'il ne pourra jamais relire — c'est assumé
 * (D4), et c'est le seul montage compatible avec le hors-ligne : une moto qui
 * arrive au comptoir se saisit sans attendre personne.
 */

function lireMoto(instantane: DocumentSnapshot<DocumentData>): Moto {
  const donnees = instantane.data() ?? {};
  const dateEntree = donnees.dateEntree;
  return {
    id: instantane.id,
    boutiqueId: donnees.boutiqueId ?? "",
    etat: (donnees.etat as EtatMoto) ?? "neuve",
    marqueId: donnees.marqueId ?? "",
    modeleId: donnees.modeleId ?? "",
    couleur: donnees.couleur ?? "",
    annee: typeof donnees.annee === "number" ? donnees.annee : null,
    numeroChassis: donnees.numeroChassis ?? "",
    numeroMoteur: donnees.numeroMoteur ?? "",
    prixVenteConseille:
      typeof donnees.prixVenteConseille === "number" ? donnees.prixVenteConseille : null,
    provenanceId: donnees.provenanceId ?? "",
    papiersFournis: Array.isArray(donnees.papiersFournis) ? donnees.papiersFournis : [],
    photos: Array.isArray(donnees.photos) ? donnees.photos : [],
    statut: (donnees.statut as StatutMoto) ?? "en_stock",
    dateEntree: dateEntree instanceof Timestamp ? dateEntree.toDate() : null,
  };
}

/**
 * Le stock du périmètre courant, en direct.
 *
 * `boutiqueId` à `null` veut dire « toutes les boutiques » — le responsable
 * seul y a droit, les règles s'en assurent. Aucun tri n'est demandé au serveur :
 * combiner un filtre et un tri exigerait un index composite, et le tri en
 * mémoire marche aussi bien sur quelques dizaines de motos — hors ligne compris.
 */
export function ecouterStock(
  boutiqueId: string | null,
  auChangement: (motos: Moto[]) => void,
  enErreur: (cause: unknown) => void,
): () => void {
  const base = collection(db(), "motos");
  const requete = boutiqueId ? query(base, where("boutiqueId", "==", boutiqueId)) : query(base);

  return onSnapshot(
    requete,
    { includeMetadataChanges: true },
    (instantane) => {
      signalerSourceDonnees(instantane.metadata.fromCache);
      auChangement(
        instantane.docs
          .map(lireMoto)
          .sort((a, b) => (b.dateEntree?.getTime() ?? 0) - (a.dateEntree?.getTime() ?? 0)),
      );
    },
    enErreur,
  );
}

export function ecouterMoto(
  id: string,
  auChangement: (moto: Moto | null) => void,
  enErreur: (cause: unknown) => void,
): () => void {
  return onSnapshot(
    doc(db(), "motos", id),
    { includeMetadataChanges: true },
    (instantane) => {
      signalerSourceDonnees(instantane.metadata.fromCache);
      auChangement(instantane.exists() ? lireMoto(instantane) : null);
    },
    enErreur,
  );
}

/**
 * Le coût d'une moto — réservé au responsable.
 *
 * Pour un gérant, cet appel échoue par les règles, et c'est voulu : la
 * protection ne doit pas dépendre du fait que l'interface ait pensé à ne pas
 * l'appeler.
 */
export function ecouterCoutMoto(
  id: string,
  auChangement: (cout: CoutMoto | null) => void,
  enErreur: (cause: unknown) => void,
): () => void {
  return onSnapshot(
    doc(db(), "motos", id, "prive", "cout"),
    (instantane) => {
      const donnees = instantane.data();
      auChangement(
        donnees
          ? {
              prixAchat: donnees.prixAchat ?? 0,
              fraisEntree: Array.isArray(donnees.fraisEntree) ? donnees.fraisEntree : [],
              coutTotal: donnees.coutTotal ?? 0,
            }
          : null,
      );
    },
    enErreur,
  );
}

/**
 * Fait entrer une moto en stock.
 *
 * Les deux documents partent dans le même lot : une moto sans son coût serait
 * une moto dont on ne saura jamais la marge, et un coût sans sa moto un
 * orphelin invisible. Hors ligne, Firestore garde le lot entier et le rejoue
 * tel quel.
 *
 * La **date d'entrée vient de l'appareil**, pas du serveur (D38) : une moto
 * saisie lundi sans réseau et synchronisée mercredi est entrée lundi. Seuls les
 * horodatages d'audit, qui disent quand la donnée a été écrite, viennent du
 * serveur.
 */
export function entrerEnStock(
  saisie: SaisieMoto,
  boutiqueId: string,
  auteur: Auteur,
): { id: string; enregistre: Promise<void> } {
  const reference = doc(collection(db(), "motos"));
  const prixAchat = lireEntier(saisie.prixAchat) ?? 0;
  const frais = saisie.fraisEntree.map((ligne) => ({
    typeFraisId: ligne.typeFraisId,
    montant: lireEntier(ligne.montant) ?? 0,
    note: ligne.note.trim(),
  }));
  const annee = saisie.annee.trim() ? lireEntier(saisie.annee) : null;
  const conseille = saisie.prixVenteConseille.trim()
    ? lireEntier(saisie.prixVenteConseille)
    : null;

  const lot = writeBatch(db());

  lot.set(reference, {
    boutiqueId,
    etat: saisie.etat,
    marqueId: saisie.marqueId,
    modeleId: saisie.modeleId,
    couleur: saisie.couleur.trim(),
    annee,
    numeroChassis: normaliserChassis(saisie.numeroChassis),
    numeroMoteur: normaliserChassis(saisie.numeroMoteur),
    prixVenteConseille: conseille,
    provenanceId: saisie.provenanceId,
    papiersFournis: saisie.etat === "occasion" ? lirePapiers(saisie.papiersFournis) : [],
    /* Le champ existe dès maintenant et reste vide : l'envoi d'images demande
       une file d'attente hors ligne que Storage n'a pas (D14, S19). */
    photos: [],
    statut: "en_stock" satisfies StatutMoto,
    dateEntree: Timestamp.fromDate(new Date()),
    ...traceCreation(auteur),
  });

  lot.set(doc(reference, "prive", "cout"), {
    boutiqueId,
    prixAchat,
    fraisEntree: frais,
    coutTotal: coutTotal(prixAchat, frais),
    updatedAt: serverTimestamp(),
    updatedBy: auteur.uid,
    updatedByName: auteur.nom,
  });

  /* L'identifiant existe tout de suite, l'écriture se termine plus tard : hors
     ligne, la promesse ne se résout qu'au retour du réseau. L'appelant peut
     donc afficher la moto immédiatement — elle est déjà dans le cache — sans
     attendre un serveur qui n'est peut-être pas joignable. */
  return { id: reference.id, enregistre: suivreEcriture(lot.commit()) };
}

/** Traduit les refus de Firestore en phrases qui disent quoi faire. */
export function messageErreurMoto(cause: unknown): string {
  const code = (cause as { code?: string }).code ?? "";
  if (code.includes("permission-denied")) {
    return "Cette moto n’appartient pas à votre boutique, ou cette action ne vous est pas permise.";
  }
  if (code.includes("not-found")) return "Cette moto n’existe plus.";
  if (code.includes("unauthenticated")) return "Votre session a expiré. Reconnectez-vous.";
  return "L’enregistrement n’a pas abouti.";
}
