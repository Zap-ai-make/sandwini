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
 * **Plus aucune sortie de caisse, et c'est un renversement de S53** (arbitrage
 * du 21 octobre 2026). Le commanditaire, rapportant son client : « pas de
 * caisse pour carte grise, et elle est dissociée des autres caisses ; ici ce
 * sera uniquement pour mettre les montants des avances, pas d'entrée d'argent.
 * Pas de liaison de comptabilité. »
 *
 * **La conséquence, dite une fois.** L'argent remis à un prestataire cesse
 * d'apparaître dans le journal de caisse. Qui lit ce journal ne verra plus ces
 * sorties : il faut ouvrir l'historique des départs pour les retrouver. Le
 * journal cesse donc d'être le seul endroit où l'argent qui sort est écrit, et
 * c'est un fait à connaître avant de lire un écart.
 *
 * **Et une seule règle, pas deux.** Le dépôt cesse d'écrire en caisse partout,
 * pas seulement depuis l'espace des cartes grises. Deux comportements selon
 * l'écran d'où part le geste produiraient deux vérités sur le même billet.
 *
 * Les avances déjà écrites en caisse restent : on ne retouche pas un journal.
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
     promet une carte que personne ne fait partir.

     L'identifiant d'un dossier né d'une vente est celui de la vente : c'est ce
     qui laisse ce rapprochement fonctionner après le renommage de S59. */
  const parDossier = new Map(cartes.map((carte) => [carte.venteId, carte]));
  const manquante = saisie.dossierIds.find((dossierId) => !parDossier.has(dossierId));
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
    dossierIds: [...saisie.dossierIds],
    ...traceCreation(auteur),
  });

  /* La part de chacun, au franc près sur la première : une division entière
     laisserait un reste, et la somme des documents ne retomberait pas sur
     l'avance du paquet. Le reste va à la première carte, qui est aussi celle
     qu'on lit en premier. */
  const nombre = saisie.dossierIds.length;
  const part = Math.floor(montant / nombre);
  const reste = montant - part * nombre;

  saisie.dossierIds.forEach((dossierId, rang) => {
    const carte = parDossier.get(dossierId) as DocumentDossier;
    const cible = doc(db(), "ventesMotos", carte.venteId, "documents", "carte_grise");

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
      venteId: carte.venteId,
      type: "carte_grise",
      de: carte.statut,
      vers: "chez_prestataire",
      le: maintenant,
      ...traceCreation(auteur),
    });
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
    dossierIds: lireIdsDuPaquet(donnees),
  };
}

/**
 * Les identifiants d'un paquet, sous l'un ou l'autre nom.
 *
 * S59 a renommé `venteIds` en `dossierIds` : un dossier venu du dehors n'a pas
 * de vente. **Les listes déjà écrites restent valides sans migration**, parce
 * qu'un dossier né d'une vente porte l'identifiant de cette vente — les valeurs
 * sont les mêmes, seul le nom du champ change. On lit donc les deux, et on
 * n'écrit que le nouveau.
 */
function lireIdsDuPaquet(donnees: DocumentData): string[] {
  const brut = Array.isArray(donnees.dossierIds)
    ? donnees.dossierIds
    : Array.isArray(donnees.venteIds)
      ? donnees.venteIds
      : [];
  return brut.filter((valeur: unknown): valeur is string => typeof valeur === "string");
}
