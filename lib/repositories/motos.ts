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
  writeBatch,
  type DocumentData,
  type DocumentSnapshot,
} from "firebase/firestore";
import { db, stockage } from "@/lib/firebase/client";
import {
  construireCout,
  lireEntier,
  lirePapiers,
  normaliserChassis,
  type CoutMoto,
  type EtatMoto,
  type Moto,
  type SaisieMoto,
  type StatutMoto,
  CHAMP_PAPIER,
  validerFichierPapier,
  type PapierMoto,
} from "@/lib/domain/moto";
import { suivreEcriture } from "@/lib/reseau/file-ecritures";
import { signalerSourceDonnees } from "@/lib/reseau/source-donnees";
import { traceCreation, traceModification, type Auteur } from "./referentiels";

/**
 * Le stock de motos.
 *
 * Jusqu'à deux documents par moto : la moto elle-même, que le gérant lit, et
 * son coût, que seul le responsable lit **et écrit** (`DECISIONS.md` D2, S39).
 *
 * Le gérant écrivait ce coût jusqu'à S39, sans jamais pouvoir le relire (D4).
 * Le commanditaire a tranché autrement : le gérant fait entrer la moto, la
 * supervision pose ce qu'elle a coûté. Une moto peut donc exister sans son
 * coût, et cette absence n'est pas un trou à boucher — c'est le signal que
 * l'écran `/supervision/couts` cherche.
 *
 * Ce qui n'a pas bougé : une moto qui arrive au comptoir se saisit sans
 * attendre personne, réseau compris.
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
    quittanceChemin: (donnees.quittanceChemin as string) ?? null,
    cmcChemin: (donnees.cmcChemin as string) ?? null,
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
 * Le lot reste un lot **quand il y a un coût à écrire** — c'est-à-dire quand
 * c'est le responsable qui saisit : un coût sans sa moto serait un orphelin
 * invisible, et les deux doivent arriver ensemble. Hors ligne, Firestore garde
 * le lot entier et le rejoue tel quel.
 *
 * Quand c'est un gérant, il n'y a qu'un document, et la moto entre sans coût.
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
  const cout = construireCout(saisie);
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

  /* **Le coût n'est écrit que s'il y en a un** (S39). Un gérant n'en saisit
     plus : sa moto part seule, et l'absence du document est ce que l'écran de
     supervision cherche pour savoir quoi lui réclamer. L'écrire à zéro dirait
     « acquise gratuitement » là où on ne sait pas encore (D82), et ferait
     disparaître la moto de la liste qui devait la signaler. */
  if (cout) lot.set(doc(reference, "prive", "cout"), { boutiqueId, ...cout, ...traceCout(auteur) });

  /* L'identifiant existe tout de suite, l'écriture se termine plus tard : hors
     ligne, la promesse ne se résout qu'au retour du réseau. L'appelant peut
     donc afficher la moto immédiatement — elle est déjà dans le cache — sans
     attendre un serveur qui n'est peut-être pas joignable. */
  return { id: reference.id, enregistre: suivreEcriture(lot.commit()) };
}

/**
 * La trace d'un coût : ce document ne porte pas de création, seulement une
 * dernière main. Il se pose une fois et se corrige ensuite, et les règles
 * n'acceptent que ces trois champs d'audit.
 */
function traceCout(auteur: Auteur) {
  return {
    updatedAt: serverTimestamp(),
    updatedBy: auteur.uid,
    updatedByName: auteur.nom,
  };
}

/**
 * Pose — ou corrige — le coût d'une moto déjà en stock (S39).
 *
 * Le geste du responsable, depuis la supervision. Il n'existait pas : le coût
 * s'écrivait une fois, dans le lot d'entrée en stock, par le gérant. Depuis que
 * le gérant ne le saisit plus, une moto peut rester sans coût indéfiniment — et
 * sans ce geste, sa marge serait muette pour toujours.
 *
 * `setDoc` sans fusion : le document entier est réécrit, donc corriger un prix
 * d'achat ne laisse pas derrière lui les frais de la version d'avant.
 */
export function poserCoutMoto(
  motoId: string,
  boutiqueId: string,
  cout: CoutMoto,
  auteur: Auteur,
): Promise<void> {
  return suivreEcriture(
    setDoc(doc(db(), "motos", motoId, "prive", "cout"), {
      boutiqueId,
      ...cout,
      ...traceCout(auteur),
    }),
  );
}

/**
 * Le coût d'une moto, lu une fois.
 *
 * **Une lecture, pas une écoute**, et **trois réponses, pas deux** : le coût
 * existe, il n'existe pas, ou on n'a pas pu savoir. `getDoc` lève `unavailable`
 * quand le document n'est pas en cache et que la connexion est encombrée — S24
 * l'a constaté au banc, juste après une vente, pendant que la file d'écritures
 * se vidait. Ranger cet échec avec « pas de coût » ferait apparaître dans la
 * liste « à renseigner » des motos qui ont peut-être déjà le leur, et le
 * responsable le saisirait deux fois. C'est D82, au mot près.
 */
export async function lireCoutMoto(motoId: string): Promise<CoutMoto | null> {
  const instantane = await getDoc(doc(db(), "motos", motoId, "prive", "cout"));
  if (!instantane.exists()) return null;
  const donnees = instantane.data();
  return {
    prixAchat: donnees.prixAchat ?? 0,
    fraisEntree: Array.isArray(donnees.fraisEntree) ? donnees.fraisEntree : [],
    coutTotal: donnees.coutTotal ?? 0,
  };
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

/**
 * Envoie le scan d'un papier et l'attache à la moto (S11, D66).
 *
 * **C'est la seule opération du produit qui exige du réseau**, et c'est assumé :
 * Firebase Storage n'a pas de file d'attente hors ligne, contrairement à
 * Firestore. Un envoi sans réseau échoue — l'écran l'annonce avant, plutôt que
 * de laisser croire à une file qui n'existe pas.
 *
 * Ce qui reste vrai hors ligne : la moto s'enregistre sans son scan, et le scan
 * s'ajoute plus tard. Une entrée en stock faite au comptoir sans réseau n'est
 * donc jamais perdue ni incomplète pour toujours (les deux conditions posées à
 * D66).
 *
 * On garde le **chemin**, pas l'URL de téléchargement : une URL se redemande à
 * chaque lecture et finit par expirer. Le chemin, lui, ne périme pas.
 */
export async function envoyerPapierMoto(
  motoId: string,
  papier: PapierMoto,
  fichier: File,
  auteur: Auteur,
): Promise<string> {
  const probleme = validerFichierPapier(fichier);
  if (probleme) throw new Error(probleme);

  const extension = fichier.type === "application/pdf" ? "pdf" : fichier.type.split("/")[1];
  const chemin = `motos/${motoId}/papiers/${papier}-${Date.now()}.${extension}`;

  const { ref, uploadBytes } = await import("firebase/storage");
  await uploadBytes(ref(stockage(), chemin), fichier, { contentType: fichier.type });

  /* L'attache suit l'envoi, jamais l'inverse : un chemin écrit vers un fichier
     qui n'est pas arrivé donnerait une pièce jointe morte, visible et
     inouvrable. */
  await suivreEcriture(
    updateDoc(doc(db(), "motos", motoId), {
      [CHAMP_PAPIER[papier]]: chemin,
      ...traceModification(auteur),
    }),
  );

  return chemin;
}

/** L'URL de lecture d'un papier. Demande du réseau : le cache ne la fabrique pas. */
export async function lireUrlPapier(chemin: string): Promise<string> {
  const { getDownloadURL, ref } = await import("firebase/storage");
  return getDownloadURL(ref(stockage(), chemin));
}
