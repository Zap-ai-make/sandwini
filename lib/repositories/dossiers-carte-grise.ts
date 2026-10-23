"use client";

import {
  collection,
  doc,
  onSnapshot,
  query,
  Timestamp,
  where,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";

import {
  champsDeLaLigne,
  champsDossierNeuf,
  validerLigne,
  type DossierCarteGrise,
  type SaisieLigne,
  type StatutCarteGrise,
} from "@/lib/domain/dossier-carte-grise";
import { db } from "@/lib/firebase/client";
import { suivreEcriture } from "@/lib/reseau/file-ecritures";
import { traceCreation, traceModification, type Auteur } from "@/lib/repositories/referentiels";
import { versDate } from "@/lib/repositories/ventes";

/**
 * Les dossiers de carte grise (S59).
 *
 * **Une collection à eux, et l'identifiant n'est pas tiré au sort.** Un dossier
 * né d'une vente porte l'identifiant de cette vente. C'est ce qui rend la
 * migration reprenable sans table de correspondance : la relancer retombe sur
 * le même document, et un `create` échoue au lieu d'écraser un dossier qu'on
 * aurait fait avancer entre-temps. Les dossiers venus du dehors, eux, n'ont
 * pas de vente d'où tirer une clé : la leur est tirée au sort.
 *
 * **Chaque passage écrit son journal, dans le même lot que le changement.** Le
 * statut dit où se trouve le papier aujourd'hui ; le journal dit quand il y est
 * arrivé, et par la main de qui. Un dossier avancé sans trace, c'est un papier
 * dont personne ne peut dire depuis quand il attend — exactement la question
 * qu'on pose au comptoir.
 *
 * **Ce dépôt n'écrit rien en caisse, et c'est voulu** (arbitrage du 21 octobre
 * 2026) : « pas de caisse pour carte grise […] ici ce sera uniquement pour
 * mettre les montants des avances ». L'avance vit sur le dossier et sur le
 * paquet, et l'espace en donne les totaux.
 */

const COLLECTION = "dossiersCarteGrise";

/* --- Lire ------------------------------------------------------------------ */

/**
 * Les dossiers d'une boutique, ou de toutes.
 *
 * `boutiqueId` à `null` demande l'entreprise entière : c'est ce que lit le
 * responsable, et c'est aussi ce que lit la personne des cartes grises, dont le
 * métier porte sur tous les magasins. Les règles tranchent ; cette fonction ne
 * fait que poser la question.
 *
 * **Aucun tri ici.** Les écrans n'ont pas le même ordre utile — les dossiers en
 * cours se lisent du plus ancien, l'historique du plus récent — et un tri
 * serveur demanderait un index composite pour une liste qu'on retrie de toute
 * façon en mémoire. Même choix que `ecouterDossiers`.
 */
export function ecouterDossiersCarteGrise(
  boutiqueId: string | null,
  auChangement: (dossiers: DossierCarteGrise[]) => void,
  enErreur: (cause: unknown) => void,
): () => void {
  const base = collection(db(), COLLECTION);
  const requete = boutiqueId ? query(base, where("boutiqueId", "==", boutiqueId)) : query(base);

  return onSnapshot(
    requete,
    { includeMetadataChanges: true },
    (instantane) => auChangement(instantane.docs.map(lireDossier)),
    enErreur,
  );
}

function lireDossier(instantane: QueryDocumentSnapshot<DocumentData>): DossierCarteGrise {
  const donnees = instantane.data();
  return {
    id: instantane.id,
    boutiqueId: typeof donnees.boutiqueId === "string" ? donnees.boutiqueId : "",
    venteId: typeof donnees.venteId === "string" ? donnees.venteId : null,
    /* Un dossier sans origine lisible vient d'une vente : c'est le cas de tout
       ce qui précède S59, et la migration les écrit ainsi. */
    origine: donnees.origine === "exterieur" ? "exterieur" : "vente",
    clientNom: typeof donnees.clientNom === "string" ? donnees.clientNom : "",
    motoLibelle: typeof donnees.motoLibelle === "string" ? donnees.motoLibelle : "",
    numeroChassis: typeof donnees.numeroChassis === "string" ? donnees.numeroChassis : "",
    /* Les deux colonnes revenues de son classeur. Tout ce qui précède leur
       arrivée n'en porte pas : non cochée et vide, ce qui est la vérité. */
    recu: donnees.recu === true,
    credit: typeof donnees.credit === "number" ? donnees.credit : null,
    statut: (donnees.statut as StatutCarteGrise) ?? "a_faire",
    prestataireId: typeof donnees.prestataireId === "string" ? donnees.prestataireId : null,
    prestataireNom: typeof donnees.prestataireNom === "string" ? donnees.prestataireNom : "",
    deposeLe: versDate(donnees.deposeLe),
    avance: typeof donnees.avance === "number" ? donnees.avance : null,
    disponibleLe: versDate(donnees.disponibleLe),
    immatriculation: typeof donnees.immatriculation === "string" ? donnees.immatriculation : "",
    revenuLe: versDate(donnees.revenuLe),
    remisLe: versDate(donnees.remisLe),
    remisANom: typeof donnees.remisANom === "string" ? donnees.remisANom : "",
    remisATelephone: typeof donnees.remisATelephone === "string" ? donnees.remisATelephone : "",
  };
}

/* --- Écrire une ligne ------------------------------------------------------ */

/**
 * Une ligne qu'on ouvre, comme on ajoute une ligne à son classeur.
 *
 * **Elle peut naître déjà rendue, et c'est le changement.** S59 faisait naître
 * tout dossier « à faire » et refusait les sauts ; or il transcrit des dossiers
 * vieux d'un an, donc il remplit les dix cases avant d'enregistrer. Le statut
 * se déduit des cases (`statutDeLaLigne`), et les règles vérifient qu'il
 * s'accorde avec elles.
 *
 * Elle appartient à la boutique des cartes grises, la seule qui en réponde.
 */
export function ouvrirLigne(
  saisie: SaisieLigne,
  boutiqueId: string,
  prestataireId: string | null,
  auteur: Auteur,
): Promise<string> {
  const probleme = validerLigne(saisie);
  if (probleme) return Promise.reject(new Error(probleme));

  const reference = doc(collection(db(), COLLECTION));
  const champs = champsDeLaLigne(saisie, { statut: "a_faire", revenuLe: null }, new Date());

  const lot = writeBatch(db());
  lot.set(reference, {
    /* **La liste des champs vient du domaine, et elle est entière.** Les règles
       posent `hasOnly` : un champ manquant ferait refuser toutes les
       modifications suivantes, et le dossier existerait, visible et figé. */
    ...champsDossierNeuf({
      boutiqueId,
      venteId: null,
      origine: "exterieur",
      clientNom: "",
      motoLibelle: "",
      numeroChassis: "",
      statut: "a_faire",
    }),
    ...horodater(champs),
    prestataireId,
    ...traceCreation(auteur),
  });

  return suivreEcriture(lot.commit()).then(() => reference.id);
}

/**
 * La même ligne, rouverte et corrigée.
 *
 * **Toutes les cases, y compris le dépôt.** C'est la demande, et elle coûte
 * quelque chose : la règle qui interdisait de retoucher un dossier parti chez
 * un prestataire protégeait la première avance d'un second dépôt. Plus rien ne
 * l'en protège.
 *
 * **Ce qui reste, et il faut être exact sur la limite.** Les règles imposent
 * `traceModification` à chaque écriture : `updatedBy` est l'identité vérifiée
 * de l'appelant et `updatedAt` l'heure du serveur, donc **l'état courant d'un
 * dossier est toujours attribuable**, journal ou pas. Ce que le journal ajoute
 * — l'enchaînement des valeurs précédentes — est écrit par cette fonction et
 * **non exigé par les règles** : il vaut ce que vaut l'application, pas ce que
 * garantit la base. L'exiger côté serveur demanderait une entrée de journal
 * pour chaque écriture, ce que la reprise des anciens dossiers ne peut pas
 * fournir sans dater d'aujourd'hui des gestes de l'an dernier.
 */
export function corrigerLigne(
  dossier: DossierCarteGrise,
  saisie: SaisieLigne,
  prestataireId: string | null,
  auteur: Auteur,
): Promise<void> {
  const probleme = validerLigne(saisie);
  if (probleme) return Promise.reject(new Error(probleme));

  const champs = champsDeLaLigne(saisie, dossier, new Date());
  const reference = doc(db(), COLLECTION, dossier.id);
  const lot = writeBatch(db());

  lot.update(reference, { ...horodater(champs), prestataireId, ...traceModification(auteur) });

  /* **Le journal s'écrit à chaque fois, même sans changement de statut.** Il ne
     dit plus seulement « le papier est passé là » mais « quelqu'un a touché
     cette ligne, à cette heure » — l'historique d'une correction, maintenant
     que toutes les cases s'ouvrent. Les règles ne l'exigent pas : c'est une
     trace tenue par l'application, pas une garantie de la base.

     L'identifiant est tiré au sort et l'heure vient de l'appareil : deux
     appareils hors ligne qui corrigent la même ligne produisent deux entrées
     distinctes plutôt qu'une qui écrase l'autre. */
  lot.set(doc(collection(reference, "historique")), {
    boutiqueId: dossier.boutiqueId,
    dossierId: dossier.id,
    de: dossier.statut,
    vers: champs.statut,
    le: Timestamp.fromDate(new Date()),
    ...traceCreation(auteur),
  });

  /* **La fonction ne s'attend pas** (D76). Hors ligne cette promesse ne se
     résout jamais, et un écran qui l'attendrait bloquerait le geste au comptoir
     là où le hors-ligne devait le rendre possible. L'appelant avance sur
     l'écriture locale et rattache un `catch` pour le refus tardif. */
  return suivreEcriture(lot.commit());
}

/**
 * Les dates du domaine en horodatages Firestore.
 *
 * Le domaine travaille sur des `Date` — il ne connaît pas Firestore, et c'est
 * ce qui le rend testable. La conversion est donc ici, au dernier moment.
 */
function horodater(champs: Record<string, unknown>): Record<string, unknown> {
  const sortie: Record<string, unknown> = {};
  for (const [cle, valeur] of Object.entries(champs)) {
    sortie[cle] = valeur instanceof Date ? Timestamp.fromDate(valeur) : valeur;
  }
  return sortie;
}


/**
 * Ce qu'on montre quand le serveur finit par refuser.
 *
 * Le message brut de Firestore cite des numéros de ligne d'un fichier de
 * règles, en anglais. Affiché tel quel, il n'apprend rien à quelqu'un qui tient
 * un comptoir. Même forme que `messageErreurDossier`, sans sa phrase sur la
 * vente : ici, la moitié des dossiers n'en ont pas.
 */
export function messageErreurDossierCarteGrise(cause: unknown): string {
  const code = (cause as { code?: string }).code ?? "";
  if (code.includes("permission-denied"))
    return "Ce dossier n’a pas pu être enregistré : cette action ne vous est pas permise.";
  if (code.includes("unauthenticated")) return "Votre session a expiré. Reconnectez-vous.";
  if (code.includes("not-found")) return "Ce dossier n’existe plus.";
  return "Le dossier n’a pas pu être mis à jour. Réessayez.";
}
