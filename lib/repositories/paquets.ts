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
import { validerPaquet, type PaquetCartesGrises, type SaisiePaquet } from "@/lib/domain/paquet";
import { lireMontant, type DocumentDossier } from "@/lib/domain/vente";
import { db } from "@/lib/firebase/client";
import { suivreEcriture } from "@/lib/reseau/file-ecritures";
import { traceCreation, traceModification, type Auteur } from "@/lib/repositories/referentiels";

/**
 * Confie plusieurs cartes grises en une fois (S53, arbitrages 2 et 6).
 *
 * **Tout part ensemble, ou rien ne part.** Un `writeBatch` unique porte le
 * paquet, les `N` documents passés à `chez_prestataire`, les `N` lignes
 * d'historique, et **une seule** sortie de caisse. Un dépôt à moitié écrit
 * laisserait des cartes dehors sans paquet pour les rassembler, ou un paquet
 * qui promet dix cartes dont trois seraient restées au magasin.
 *
 * **Une seule sortie de caisse, et c'est un critère de la spec.** Dix sorties
 * de 15 000 pour une avance de 150 000 rendraient le journal illisible et
 * feraient croire à dix décisions. L'avance est un geste, elle s'écrit une
 * fois, et son `origineRefId` est le paquet — qui porte le détail des cartes.
 *
 * **Pas de `posteId`, et le critère de la spec est quand même tenu.** « Elle se
 * range dans un poste de dépense (S55) » : S55 a prévu ce cas en repliant
 * `libelleDuPoste` sur l'origine quand aucun poste n'est posé, et
 * `avance_prestataire` est l'une de ces origines. L'avance apparaît donc dans
 * le bloc analytique sous son propre nom, sans qu'il faille créer une ligne de
 * référentiel que personne n'a demandée — et sans faire dépendre un dépôt de
 * l'existence d'un poste.
 *
 * Chaque document garde malgré tout son `prestataireId`, son `deposeLe` et son
 * `avance` : les règles évaluent chaque écriture du lot contre l'état d'avant le
 * lot, donc elles ne peuvent pas lire un paquet créé dans le même lot. C'est
 * `depotRenseigne` qui l'exige, mot pour mot, et les écrans de dossier existants
 * continuent de lire ces champs sans rien savoir du paquet.
 *
 * **L'avance est répartie, pas répétée.** Chaque document porte sa part — le
 * total divisé par le nombre de cartes — afin que la somme des avances des
 * documents reste égale à l'avance du paquet. Sans cela, dix documents à
 * 150 000 feraient lire 1 500 000 sortis de la caisse à qui ouvre les dossiers
 * un par un.
 */
export function confierPaquet(
  saisie: SaisiePaquet,
  cartes: readonly DocumentDossier[],
  boutiqueId: string,
  auteur: Auteur,
): Promise<string> {
  const probleme = validerPaquet(saisie);
  if (probleme) return Promise.reject(new Error(probleme));

  /* La sélection de l'écran et les documents passés doivent se recouvrir
     exactement : un identifiant sans document, et le lot écrirait un paquet qui
     promet une carte que personne ne fait partir. */
  const parVente = new Map(cartes.map((carte) => [carte.venteId, carte]));
  const manquante = saisie.venteIds.find((venteId) => !parVente.has(venteId));
  if (manquante) {
    return Promise.reject(
      new Error("La sélection a changé pendant la saisie. Rouvrez l’écran des dossiers."),
    );
  }

  const montant = lireMontant(saisie.avance) ?? 0;
  const depose = Timestamp.fromDate(lireJour(saisie.deposeLe) as Date);
  const disponible = saisie.disponibleLe ? lireJour(saisie.disponibleLe) : null;
  const maintenant = Timestamp.fromDate(new Date());

  const lot = writeBatch(db());
  const reference = doc(collection(db(), "lotsCartesGrises"));

  lot.set(reference, {
    boutiqueId,
    prestataireId: saisie.prestataireId,
    prestataireNom: saisie.prestataireNom,
    deposeLe: depose,
    disponibleLe: disponible ? Timestamp.fromDate(disponible) : null,
    avance: montant,
    venteIds: [...saisie.venteIds],
    ...traceCreation(auteur),
  });

  /* La part de chacun, au franc près sur la première : une division entière
     laisserait un reste, et la somme des documents ne retomberait pas sur
     l'avance du paquet. Le reste va à la première carte, qui est aussi celle
     qu'on lit en premier. */
  const nombre = saisie.venteIds.length;
  const part = Math.floor(montant / nombre);
  const reste = montant - part * nombre;

  saisie.venteIds.forEach((venteId, rang) => {
    const carte = parVente.get(venteId) as DocumentDossier;
    const cible = doc(db(), "ventesMotos", venteId, "documents", "carte_grise");

    lot.update(cible, {
      statut: "chez_prestataire",
      prestataireId: saisie.prestataireId,
      prestataireNom: saisie.prestataireNom,
      deposeLe: depose,
      avance: rang === 0 ? part + reste : part,
      disponibleLe: disponible ? Timestamp.fromDate(disponible) : null,
      ...traceModification(auteur),
    });

    /* L'identifiant porte l'horodatage du serveur, comme au dépôt unitaire :
       les entrées se lisent dans l'ordre sans tri ni index. */
    lot.set(doc(collection(cible, "historique")), {
      boutiqueId,
      venteId,
      type: "carte_grise",
      de: carte.statut,
      vers: "chez_prestataire",
      le: maintenant,
      ...traceCreation(auteur),
    });
  });

  lot.set(doc(collection(db(), "encaissements")), {
    boutiqueId,
    date: maintenant,
    sens: "sortie",
    montant,
    moyenPaiement: saisie.moyenPaiement,
    origine: "avance_prestataire",
    /* Le paquet, et non une vente : c'est lui qui porte le détail des cartes, et
       un journal de caisse qui renverrait vers une seule des dix ventes
       mentirait sur ce qui a été payé. */
    origineRefId: reference.id,
    libelle: `Avance ${saisie.prestataireNom} — ${nombre} cartes grises`,
    /* Une sortie de caisse n'est jamais un engagement de tranches : ce drapeau
       ne concerne que l'argent qui entre. */
    categorieTranches: false,
    ...traceCreation(auteur),
  });

  return suivreEcriture(lot.commit()).then(() => reference.id);
}

/**
 * Les paquets d'une boutique, du plus récent au plus ancien.
 *
 * Tri en mémoire et non par `orderBy` : la requête porte déjà un `where` sur la
 * boutique, et un tri serveur demanderait un index composite pour une liste qui
 * tient en quelques dizaines de lignes.
 */
export function ecouterPaquets(
  boutiqueId: string | null,
  auChangement: (paquets: PaquetCartesGrises[]) => void,
  enErreur: (cause: unknown) => void,
): () => void {
  const base = collection(db(), "lotsCartesGrises");
  const requete = boutiqueId ? query(base, where("boutiqueId", "==", boutiqueId)) : query(base);

  return onSnapshot(
    requete,
    { includeMetadataChanges: true },
    (instantane) =>
      auChangement(
        instantane.docs
          .map(lirePaquet)
          .sort((a, b) => (b.deposeLe?.getTime() ?? 0) - (a.deposeLe?.getTime() ?? 0)),
      ),
    enErreur,
  );
}

function lirePaquet(instantane: QueryDocumentSnapshot<DocumentData>): PaquetCartesGrises {
  const donnees = instantane.data();
  return {
    id: instantane.id,
    boutiqueId: typeof donnees.boutiqueId === "string" ? donnees.boutiqueId : "",
    prestataireId: typeof donnees.prestataireId === "string" ? donnees.prestataireId : "",
    prestataireNom: typeof donnees.prestataireNom === "string" ? donnees.prestataireNom : "",
    deposeLe: donnees.deposeLe?.toDate?.() ?? null,
    disponibleLe: donnees.disponibleLe?.toDate?.() ?? null,
    avance: typeof donnees.avance === "number" ? donnees.avance : 0,
    venteIds: Array.isArray(donnees.venteIds)
      ? donnees.venteIds.filter((valeur: unknown): valeur is string => typeof valeur === "string")
      : [],
  };
}
