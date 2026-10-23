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

import { lireJour } from "@/lib/domain/dossier";
import {
  champsDossierNeuf,
  normaliserDossierExterieur,
  transitionAutorisee,
  validerDossierExterieur,
  validerRemise,
  validerRetour,
  type DossierCarteGrise,
  type SaisieDossierExterieur,
  type SaisieRemise,
  type SaisieRetour,
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

/* --- Ouvrir un dossier ----------------------------------------------------- */

/**
 * Un dossier qui n'est pas passé par une vente.
 *
 * **La raison d'être de la collection.** Le commanditaire : « souvent on peut
 * leur confier de gérer une carte grise de l'extérieur ». Sous l'ancien modèle,
 * un tel dossier n'avait nulle part où être écrit — il n'y avait pas de vente
 * sous laquelle le ranger.
 *
 * Il appartient à la boutique des cartes grises, la seule qui en réponde.
 */
export function ouvrirDossierExterieur(
  saisie: SaisieDossierExterieur,
  boutiqueId: string,
  auteur: Auteur,
): Promise<string> {
  const probleme = validerDossierExterieur(saisie);
  if (probleme) return Promise.reject(new Error(probleme));

  const propre = normaliserDossierExterieur(saisie);
  const reference = doc(collection(db(), COLLECTION));

  const lot = writeBatch(db());
  lot.set(reference, {
    ...champsDossierNeuf({
      boutiqueId,
      venteId: null,
      origine: "exterieur",
      clientNom: propre.clientNom,
      motoLibelle: propre.motoLibelle,
      numeroChassis: propre.numeroChassis,
      statut: "a_faire",
    }),
    ...traceCreation(auteur),
  });

  return suivreEcriture(lot.commit()).then(() => reference.id);
}

/* --- Faire avancer un dossier --------------------------------------------- */

/**
 * Le retour du prestataire, et le numéro de plaque avec lui.
 *
 * Le numéro n'est pas exigé : la carte est physiquement revenue, et refuser de
 * l'enregistrer parce que le numéro n'est pas sous la main ferait mentir
 * l'écran sur un fait accompli. Un second passage le complétera — c'est le cas
 * que `de == vers` autorise dans les règles.
 */
export function enregistrerRetour(
  dossier: DossierCarteGrise,
  saisie: SaisieRetour,
  auteur: Auteur,
): Promise<void> {
  const probleme = validerRetour(saisie);
  if (probleme) return Promise.reject(new Error(probleme));

  /* Un dossier déjà revenu ne repasse pas par la transition : on ne complète
     que le numéro, resté vide au retour. Le domaine refuse `revenu_magasin` ->
     `revenu_magasin` — à raison, ce n'est pas un passage — et les règles
     l'acceptent comme une simple correction (`de == vers`). */
  if (dossier.statut !== "revenu_magasin") {
    const refus = exigerTransition(dossier, "revenu_magasin");
    if (refus) return Promise.reject(refus);
  }

  const revenu = lireJour(saisie.revenuLe) as Date;
  return ecrire(dossier, "revenu_magasin", auteur, {
    immatriculation: saisie.immatriculation.trim(),
    revenuLe: Timestamp.fromDate(revenu),
  });
}

/**
 * La remise au comptoir.
 *
 * **Le nom et le téléphone de celui qui vient chercher**, parce que ce n'est
 * pas toujours l'acheteur — souvent un frère, un employé. C'est la colonne
 * `RECEPTION` du fichier du client, et la question qu'on lui posera plus tard.
 */
export function remettreDossier(
  dossier: DossierCarteGrise,
  saisie: SaisieRemise,
  auteur: Auteur,
): Promise<void> {
  const probleme = validerRemise(saisie);
  if (probleme) return Promise.reject(new Error(probleme));

  const refus = exigerTransition(dossier, "remis");
  if (refus) return Promise.reject(refus);

  const remis = lireJour(saisie.remisLe) as Date;
  return ecrire(dossier, "remis", auteur, {
    remisANom: saisie.nom.trim(),
    remisATelephone: saisie.telephone.trim(),
    remisLe: Timestamp.fromDate(remis),
  });
}

/**
 * Écarter un dossier qui n'a pas lieu d'être.
 *
 * On ne supprime pas : passer « sans objet » laisse la ligne lisible et dit
 * qui l'a écartée. Et seulement au début — une carte déjà partie est
 * physiquement dehors, et quelqu'un l'attend.
 */
export function ecarterDossier(dossier: DossierCarteGrise, auteur: Auteur): Promise<void> {
  const refus = exigerTransition(dossier, "non_applicable");
  if (refus) return Promise.reject(refus);
  return ecrire(dossier, "non_applicable", auteur, {});
}

/**
 * Revalide la transition côté navigateur, avant les règles.
 *
 * Entre l'affichage d'un bouton et le clic, un autre appareil a pu faire
 * avancer le même dossier. Les règles refuseraient de toute façon (D27), mais
 * elles refusent sans expliquer : autant s'arrêter ici, avec une phrase.
 */
function exigerTransition(
  dossier: DossierCarteGrise,
  vers: StatutCarteGrise,
): Error | null {
  if (transitionAutorisee(dossier.statut, vers)) return null;
  return new Error(
    "Ce dossier ne peut pas passer à cette étape. Il a peut-être avancé sur un autre appareil ; rouvrez la fiche.",
  );
}

/**
 * Le changement et sa trace, dans un seul lot.
 *
 * Un `writeBatch` reste atomique hors ligne : Firestore le garde entier dans sa
 * file et le rejoue d'un bloc au retour du réseau. C'est ce qui interdit le
 * dossier avancé dont le passage n'est noté nulle part.
 *
 * **La fonction ne s'attend pas.** Elle rend la promesse du lot sans
 * l'attendre : hors ligne, cette promesse ne se résout jamais, et un écran qui
 * l'attendait bloquerait le geste au comptoir là où le hors-ligne devait le
 * rendre possible. L'appelant avance sur l'écriture locale et rattache un
 * `catch` pour le refus tardif.
 */
function ecrire(
  dossier: DossierCarteGrise,
  vers: StatutCarteGrise,
  auteur: Auteur,
  changement: Record<string, unknown>,
): Promise<void> {
  const reference = doc(db(), COLLECTION, dossier.id);
  const lot = writeBatch(db());

  lot.update(reference, { statut: vers, ...changement, ...traceModification(auteur) });

  /* L'identifiant est tiré au sort et l'heure vient du serveur : deux appareils
     hors ligne qui avancent le même dossier produisent deux lignes distinctes
     plutôt qu'une qui écrase l'autre. */
  lot.set(doc(collection(reference, "historique")), {
    boutiqueId: dossier.boutiqueId,
    dossierId: dossier.id,
    de: dossier.statut,
    vers,
    le: Timestamp.fromDate(new Date()),
    ...traceCreation(auteur),
  });

  return suivreEcriture(lot.commit());
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
