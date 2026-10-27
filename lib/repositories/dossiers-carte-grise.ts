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
  champsRetourMagasin,
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
    clientTelephone:
      typeof donnees.clientTelephone === "string" ? donnees.clientTelephone : "",
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

/** Une ligne prête à partir, et le prestataire qu'on a reconnu dans `TRANSITE`. */
export type LigneAOuvrir = { saisie: SaisieLigne; prestataireId: string | null };

/** Le plafond d'un lot Firestore. Une ligne vaut une écriture, on garde la marge. */
const LIGNES_PAR_LOT_MAX = 400;

/**
 * Des lignes qu'on ouvre, comme on en ajoute à son classeur.
 *
 * **Plusieurs d'un coup, et c'est la demande** : « pouvoir ajouter plusieurs
 * dossiers avant que ça ne descende dans la liste ». Il transcrit un classeur,
 * pas un dossier isolé — ouvrir et fermer une modale par ligne lui ferait
 * répéter vingt fois le même aller-retour.
 *
 * **Tout part ensemble, ou rien.** Un `writeBatch` est atomique, hors ligne
 * compris : Firestore le garde entier dans sa file et le rejoue d'un bloc au
 * retour du réseau. C'est ce qui interdit la moitié d'une saisie, dont
 * personne ne saurait où elle s'est arrêtée.
 *
 * **Elles peuvent naître déjà rendues.** S59 faisait naître tout dossier « à
 * faire » et refusait les sauts ; or il recopie des dossiers vieux d'un an,
 * donc il remplit toute la ligne avant d'enregistrer. Le statut se déduit des
 * cases (`statutDeLaLigne`), et les règles vérifient qu'il s'accorde avec elles.
 *
 * Elles appartiennent à la boutique des cartes grises, la seule qui en réponde.
 */
export function ouvrirLignes(
  lignes: readonly LigneAOuvrir[],
  boutiqueId: string,
  auteur: Auteur,
): Promise<string[]> {
  if (lignes.length === 0) return Promise.resolve([]);
  if (lignes.length > LIGNES_PAR_LOT_MAX) {
    return Promise.reject(
      new Error(
        `Pas plus de ${LIGNES_PAR_LOT_MAX} lignes à la fois : au-delà, l’enregistrement ne peut plus être garanti d’un seul tenant.`,
      ),
    );
  }

  for (const [rang, ligne] of lignes.entries()) {
    const probleme = validerLigne(ligne.saisie);
    /* Le rang est nommé : sur douze lignes à l'écran, « il manque un châssis »
       sans dire laquelle oblige à les relire toutes. */
    if (probleme) return Promise.reject(new Error(`Ligne ${rang + 1} — ${probleme}`));
  }

  const maintenant = new Date();
  const lot = writeBatch(db());
  const references = lignes.map(({ saisie, prestataireId }) => {
    const reference = doc(collection(db(), COLLECTION));
    const champs = champsDeLaLigne(saisie, { statut: "a_faire", revenuLe: null }, maintenant);

    lot.set(reference, {
      /* **La liste des champs vient du domaine, et elle est entière.** Les
         règles posent `hasOnly` : un champ manquant ferait refuser toutes les
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

    return reference;
  });

  return suivreEcriture(lot.commit()).then(() => references.map((reference) => reference.id));
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
 * Marque d'un seul lot le retour de plusieurs dossiers partis chez un prestataire.
 *
 * **Le geste que le commanditaire faisait un par un** (27 octobre 2026) : « quand
 * un prestataire ramène cent dossiers, il faut valider un par un, ça prend du
 * temps ; je veux qu'on puisse valider en bloc, et décocher ceux qui ne sont
 * pas de retour ». L'écran coche d'office tout ce qui est parti, on décoche les
 * manquants, et ce qui reste rentre ensemble.
 *
 * **Un seul `writeBatch`, donc tout rentre ou rien.** Quatre-vingts dossiers
 * dont la moitié passe et l'autre non laisseraient le comptoir incapable de dire
 * lesquels sont déjà marqués. Hors ligne, Firestore garde le lot entier et le
 * rejoue d'un bloc. Le plafond est celui d'`ouvrirLignes`, pour la même raison :
 * chaque dossier coûte deux écritures — la ligne et son journal.
 *
 * **Chaque retour laisse sa trace**, dans le même lot, comme une correction : le
 * statut dira où est le papier, le journal dira quand il est rentré et par la
 * main de qui. Le journal reste tenu par l'application, non exigé par les règles
 * (voir `corrigerLigne`).
 */
export function marquerRetoursMagasin(
  dossiers: readonly DossierCarteGrise[],
  auteur: Auteur,
): Promise<void> {
  if (dossiers.length === 0) return Promise.resolve();
  if (dossiers.length > LIGNES_PAR_LOT_MAX) {
    return Promise.reject(
      new Error(
        `Pas plus de ${LIGNES_PAR_LOT_MAX} retours à la fois : au-delà, l’enregistrement ne peut plus être garanti d’un seul tenant.`,
      ),
    );
  }

  const maintenant = new Date();
  const lot = writeBatch(db());

  for (const dossier of dossiers) {
    const champs = champsRetourMagasin(dossier, maintenant);
    const reference = doc(db(), COLLECTION, dossier.id);

    lot.update(reference, { ...horodater(champs), ...traceModification(auteur) });

    lot.set(doc(collection(reference, "historique")), {
      boutiqueId: dossier.boutiqueId,
      dossierId: dossier.id,
      de: dossier.statut,
      vers: champs.statut,
      le: Timestamp.fromDate(new Date()),
      ...traceCreation(auteur),
    });
  }

  /* Comme `corrigerLigne`, la promesse ne s'attend pas (D76) : hors ligne elle
     ne se résout jamais, et l'écran avance sur l'écriture locale. */
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
