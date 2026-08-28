import {
  collection,
  collectionGroup,
  doc,
  onSnapshot,
  query,
  Timestamp,
  where,
  writeBatch,
  type DocumentData,
  type DocumentSnapshot,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { lireLignes } from "@/lib/domain/saisie";
import { engendrerToken } from "@/lib/domain/token";
import {
  TYPES_DOCUMENT,
  agregatsPaiement,
  estEngagement,
  lireMontant,
  lireMontantEncaisse,
  motoRemiseA,
  statutMotoApresVente,
  type DocumentDossier,
  type MargeVente,
  type ModePaiement,
  type MoyenPaiement,
  type SaisieVente,
  type StatutDocument,
  type StatutPaiement,
  type TypeDocument,
  type Vente,
  type Versement,
} from "@/lib/domain/vente";
import { reserverNumero, type Numeroteur } from "@/lib/numerotation/compteur";
import { suivreEcriture } from "@/lib/reseau/file-ecritures";
import { signalerSourceDonnees } from "@/lib/reseau/source-donnees";
import { traceCreation, traceModification, type Auteur } from "./referentiels";

/**
 * Les ventes de motos.
 *
 * **Tout part dans un seul lot, ou rien ne part.** Une vente enregistrée sans
 * son dossier serait pire qu'une vente refusée : le client repart avec sa moto
 * et le magasin ne sait plus quels papiers lui doit. Firestore garantit
 * l'atomicité d'un `writeBatch` y compris hors ligne — il le garde entier dans
 * sa file et le rejoue tel quel au retour du réseau.
 *
 * Sept documents au maximum voyagent ensemble : la vente, ses quatre documents
 * de dossier, le versement du jour et son encaissement, plus la mise à jour du
 * statut de la moto.
 *
 * **Ce que ce lot n'écrit pas : le coût de la moto.** `coutMotoSnapshot` doit
 * être figé à la vente, mais il vit dans `motos/{id}/prive/cout` que le gérant
 * ne peut pas lire (D2) — donc qu'il ne peut pas recopier. Un déclencheur
 * serveur s'en charge (`DECISIONS.md` D51) ; les règles interdisent à tout
 * navigateur d'écrire cette sous-collection, si bien que la marge n'est pas
 * seulement cachée, elle est infalsifiable.
 */

function versDate(valeur: unknown): Date | null {
  return valeur instanceof Timestamp ? valeur.toDate() : null;
}

function lireVente(instantane: DocumentSnapshot<DocumentData>): Vente {
  const donnees = instantane.data() ?? {};
  return {
    id: instantane.id,
    numero: donnees.numero ?? "",
    numeroInitial: donnees.numeroInitial ?? "",
    boutiqueId: donnees.boutiqueId ?? "",
    motoId: donnees.motoId ?? "",
    clientId: donnees.clientId ?? "",
    date: versDate(donnees.date),
    prixConvenu: typeof donnees.prixConvenu === "number" ? donnees.prixConvenu : 0,
    modePaiement: (donnees.modePaiement as ModePaiement) ?? "comptant",
    inclus: Array.isArray(donnees.inclus) ? donnees.inclus : [],
    nonInclus: Array.isArray(donnees.nonInclus) ? donnees.nonInclus : [],
    totalPaye: typeof donnees.totalPaye === "number" ? donnees.totalPaye : 0,
    resteDu: typeof donnees.resteDu === "number" ? donnees.resteDu : 0,
    statutPaiement: (donnees.statutPaiement as StatutPaiement) ?? "impaye",
    dernierVersementAt: versDate(donnees.dernierVersementAt),
    motoRemise: donnees.motoRemise === true,
    dateRemiseMoto: versDate(donnees.dateRemiseMoto),
    tokenSuivi: donnees.tokenSuivi ?? "",
    lienSuiviEnvoyeAt: versDate(donnees.lienSuiviEnvoyeAt),
    statutDossier: donnees.statutDossier === "clos" ? "clos" : "ouvert",
    dateClotureDossier: versDate(donnees.dateClotureDossier),
  };
}

/**
 * Les ventes du périmètre courant, en direct.
 *
 * `boutiqueId` à `null` veut dire « toutes les boutiques » — le responsable
 * seul y a droit. Comme pour le stock (S5), aucun tri n'est demandé au serveur :
 * un tri combiné à un filtre exigerait un index composite, et trier en mémoire
 * marche aussi bien — hors ligne compris, ce qui n'est pas le cas d'une requête.
 */
export function ecouterVentes(
  boutiqueId: string | null,
  auChangement: (ventes: Vente[]) => void,
  enErreur: (cause: unknown) => void,
): () => void {
  const base = collection(db(), "ventesMotos");
  const requete = boutiqueId ? query(base, where("boutiqueId", "==", boutiqueId)) : query(base);

  return onSnapshot(
    requete,
    { includeMetadataChanges: true },
    (instantane) => {
      signalerSourceDonnees(instantane.metadata.fromCache);
      auChangement(instantane.docs.map(lireVente));
    },
    enErreur,
  );
}

/**
 * Les documents de dossier de tout le périmètre, en une seule écoute.
 *
 * Une requête de groupe de collections plutôt qu'une écoute par vente : la
 * liste des ventes affiche l'état des quatre documents de chaque ligne (§6.4),
 * et ouvrir un flux par vente ferait cinquante flux pour un écran. Le
 * `boutiqueId` est répété sur chaque document précisément pour rendre ce filtre
 * possible — une sous-collection ne connaît pas son grand-parent.
 *
 * Cette requête a besoin d'un index de portée « groupe de collections », déclaré
 * dans `firestore.indexes.json`. L'émulateur crée ses index tout seul et ne
 * l'aurait jamais signalé : c'est en production que l'oubli se serait vu.
 */
export function ecouterDossiers(
  boutiqueId: string | null,
  auChangement: (documents: DocumentDossier[]) => void,
  enErreur: (cause: unknown) => void,
): () => void {
  const base = collectionGroup(db(), "documents");
  const requete = boutiqueId ? query(base, where("boutiqueId", "==", boutiqueId)) : query(base);

  return onSnapshot(
    requete,
    { includeMetadataChanges: true },
    (instantane) => auChangement(instantane.docs.map(lireDocumentDossier)),
    enErreur,
  );
}

function lireDocumentDossier(instantane: QueryDocumentSnapshot<DocumentData>): DocumentDossier {
  const donnees = instantane.data();
  return {
    id: instantane.id,
    /* Le parent d'une sous-collection : `ventesMotos/{venteId}/documents/{type}`.
       On remonte de deux crans plutôt que de dénormaliser un champ de plus. */
    venteId: instantane.ref.parent.parent?.id ?? "",
    type: (donnees.type as TypeDocument) ?? "quittance",
    statut: (donnees.statut as StatutDocument) ?? "a_faire",
  };
}

/**
 * Les quatre documents d'un dossier précis.
 *
 * Une écoute de chemin direct plutôt que le groupe de collections : sur une
 * fiche, on connaît la vente, et cette requête-là ne demande aucun index.
 */
export function ecouterDocumentsDeVente(
  venteId: string,
  auChangement: (documents: DocumentDossier[]) => void,
  enErreur: (cause: unknown) => void,
): () => void {
  return onSnapshot(
    collection(db(), "ventesMotos", venteId, "documents"),
    { includeMetadataChanges: true },
    (instantane) => {
      const documents = instantane.docs.map(lireDocumentDossier);
      auChangement(
        /* Dans l'ordre où le magasin les traite, pas dans l'ordre
           alphabétique des identifiants. */
        TYPES_DOCUMENT.map((type) => documents.find((document) => document.type === type)).filter(
          (document): document is DocumentDossier => document !== undefined,
        ),
      );
    },
    enErreur,
  );
}

export function ecouterVente(
  id: string,
  auChangement: (vente: Vente | null) => void,
  enErreur: (cause: unknown) => void,
): () => void {
  return onSnapshot(
    doc(db(), "ventesMotos", id),
    { includeMetadataChanges: true },
    (instantane) => {
      signalerSourceDonnees(instantane.metadata.fromCache);
      auChangement(instantane.exists() ? lireVente(instantane) : null);
    },
    enErreur,
  );
}

export function ecouterVersements(
  venteId: string,
  auChangement: (versements: Versement[]) => void,
  enErreur: (cause: unknown) => void,
): () => void {
  return onSnapshot(
    collection(db(), "ventesMotos", venteId, "versements"),
    { includeMetadataChanges: true },
    (instantane) => {
      auChangement(
        instantane.docs
          .map((document): Versement => {
            const donnees = document.data();
            return {
              id: document.id,
              numeroRecu: donnees.numeroRecu ?? "",
              date: versDate(donnees.date),
              montant: typeof donnees.montant === "number" ? donnees.montant : 0,
              moyenPaiement: (donnees.moyenPaiement as MoyenPaiement) ?? "especes",
              reference: donnees.reference ?? "",
              encaissementId: donnees.encaissementId ?? "",
            };
          })
          .sort((a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0)),
      );
    },
    enErreur,
  );
}

/**
 * La marge d'une vente — réservée au responsable.
 *
 * Pour un gérant, cet appel échoue par les règles, et c'est voulu : la
 * protection ne doit pas dépendre du fait que l'interface ait pensé à ne pas
 * l'appeler (même montage qu'`ecouterCoutMoto` en S5).
 *
 * Elle peut être absente un moment : elle est écrite par un déclencheur, donc
 * seulement une fois la vente parvenue au serveur. Une vente saisie hors ligne
 * n'a pas encore de marge, et l'écran le dit plutôt que d'afficher zéro.
 */
export function ecouterMargeVente(
  id: string,
  auChangement: (marge: MargeVente | null) => void,
  enErreur: (cause: unknown) => void,
): () => void {
  return onSnapshot(
    doc(db(), "ventesMotos", id, "prive", "marge"),
    (instantane) => {
      const donnees = instantane.data();
      auChangement(
        donnees
          ? {
              coutMotoSnapshot: donnees.coutMotoSnapshot ?? 0,
              marge: donnees.marge ?? 0,
            }
          : null,
      );
    },
    enErreur,
  );
}

export type ContexteVente = {
  /** La boutique où la vente a lieu, et dont le compteur de numéros est tiré. */
  boutique: Numeroteur;
  /** Les numéros déjà connus de cet appareil, lus dans le cache Firestore (S7). */
  numerosConnus: readonly string[];
};

/**
 * Enregistre une vente, son dossier et son premier versement — en un seul lot.
 *
 * Le numéro est **réservé ici**, au moment de valider, et pas avant : un numéro
 * montré puis abandonné laisserait un trou dans la série. `numero` et
 * `numeroInitial` sont égaux à la création ; seul le premier peut être corrigé
 * par le serveur en cas de collision, et c'est le second qui sert de clé de
 * rapprochement (D44).
 *
 * Les dates métier viennent de l'appareil (D38) : une vente conclue lundi sans
 * réseau et synchronisée mercredi a bien eu lieu lundi. Seuls les horodatages
 * d'audit, qui disent quand la donnée a été écrite, viennent du serveur.
 */
export function enregistrerVente(
  saisie: SaisieVente,
  contexte: ContexteVente,
  auteur: Auteur,
): { id: string; numero: string; enregistre: Promise<void> } {
  const boutiqueId = contexte.boutique.boutiqueId;
  const reference = doc(collection(db(), "ventesMotos"));
  const numero = reserverNumero(contexte.boutique, contexte.numerosConnus);

  const prixConvenu = lireMontant(saisie.prixConvenu) ?? 0;
  const montantEncaisse = lireMontantEncaisse(saisie.montantEncaisse) ?? 0;
  const versements = montantEncaisse > 0 ? [{ montant: montantEncaisse }] : [];
  const { totalPaye, resteDu, statutPaiement } = agregatsPaiement(prixConvenu, versements);

  const maintenant = Timestamp.fromDate(new Date());
  const motoRemise = motoRemiseA(saisie.modePaiement);
  const lot = writeBatch(db());

  lot.set(reference, {
    numero,
    numeroInitial: numero,
    boutiqueId,
    motoId: saisie.motoId,
    clientId: saisie.clientId,
    date: maintenant,
    prixConvenu,
    modePaiement: saisie.modePaiement,
    inclus: lireLignes(saisie.inclus),
    nonInclus: lireLignes(saisie.nonInclus),
    totalPaye,
    resteDu,
    statutPaiement,
    dernierVersementAt: versements.length > 0 ? maintenant : null,
    motoRemise,
    dateRemiseMoto: motoRemise ? maintenant : null,
    tokenSuivi: engendrerToken(),
    lienSuiviEnvoyeAt: null,
    statutDossier: "ouvert",
    dateClotureDossier: null,
    ...traceCreation(auteur),
  });

  /* Le type du document est son identifiant : `documents/carte_grise`. C'est ce
     qui rend l'écriture idempotente et interdit structurellement d'avoir deux
     cartes grises dans un dossier — une contrainte que des règles ne sauraient
     pas exprimer. */
  for (const type of TYPES_DOCUMENT) {
    lot.set(doc(reference, "documents", type), {
      /* Répété ici pour la même raison qu'en S5 sur le coût : dans un lot, les
         règles évaluent chaque document contre l'état d'AVANT, donc la vente
         parente n'existe pas encore quand son dossier est validé. Ce champ est
         aussi ce qui rend possible la lecture d'ensemble des dossiers. */
      boutiqueId,
      venteId: reference.id,
      type,
      statut: "a_faire" satisfies StatutDocument,
      ...traceCreation(auteur),
    });
  }

  if (montantEncaisse > 0) {
    const versement = doc(collection(reference, "versements"));
    const encaissement = doc(collection(db(), "encaissements"));

    lot.set(versement, {
      boutiqueId,
      venteId: reference.id,
      /* Le versement du jour de la vente porte le numéro de la vente : c'est le
         même reçu, celui qu'on tend au client en même temps que les clés. S9,
         qui numérote les versements suivants, n'est pas engagé par ce choix. */
      numeroRecu: numero,
      date: maintenant,
      montant: montantEncaisse,
      moyenPaiement: saisie.moyenPaiement,
      reference: saisie.reference.trim(),
      encaissementId: encaissement.id,
      ...traceCreation(auteur),
    });

    lot.set(encaissement, {
      boutiqueId,
      date: maintenant,
      sens: "entree",
      montant: montantEncaisse,
      moyenPaiement: saisie.moyenPaiement,
      origine: "vente_moto",
      origineRefId: reference.id,
      libelle: `Vente ${numero}`,
      /* L'argent d'une vente en tranches est un engagement, pas une recette :
         la moto dort au magasin et cet argent peut revenir au client (§6.2).
         Le marquer maintenant évite d'avoir à le retrouver quand la caisse
         s'ouvrira (S22). */
      categorieTranches: estEngagement(saisie.modePaiement, motoRemise),
      ...traceCreation(auteur),
    });
  }

  /* La moto change de statut dans le même lot : une vente dont la moto reste
     « en stock » se revendrait à quelqu'un d'autre. `update` et non `set` —
     on ne réécrit pas une moto qu'on n'a pas relue en entier. */
  lot.update(doc(db(), "motos", saisie.motoId), {
    statut: statutMotoApresVente(saisie.modePaiement),
    ...traceModification(auteur),
  });

  /* Le numéro et l'identifiant existent tout de suite ; l'écriture se termine
     plus tard. Hors ligne, la promesse ne se résout qu'au retour du réseau —
     mais le gérant peut déjà annoncer le numéro et remettre les clés. */
  return { id: reference.id, numero, enregistre: suivreEcriture(lot.commit()) };
}

/** Traduit les refus de Firestore en phrases qui disent quoi faire. */
export function messageErreurVente(cause: unknown): string {
  const code = (cause as { code?: string }).code ?? "";
  if (code.includes("permission-denied")) {
    return "Cette vente a été refusée : la moto n’appartient pas à votre boutique, ou cette action ne vous est pas permise.";
  }
  if (code.includes("not-found")) return "Cette moto n’existe plus dans le stock.";
  if (code.includes("unauthenticated")) return "Votre session a expiré. Reconnectez-vous.";
  return "L’enregistrement de la vente n’a pas abouti.";
}
