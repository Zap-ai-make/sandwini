import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { Moto } from "@/lib/domain/moto";
import type { SaisieTransfert, Transfert } from "@/lib/domain/transfert";
import { suivreEcriture } from "@/lib/reseau/file-ecritures";
import { traceCreation, traceModification, type Auteur } from "./referentiels";

/**
 * Le déplacement d'une moto d'une boutique à une autre (S17).
 *
 * **Un lot d'écriture, et c'est lui qui garantit l'invariant.** La moto change
 * de boutique et sa trace s'écrit dans la même opération : les deux
 * atterrissent, ou aucune. Les règles Firestore ne voient pas les autres
 * documents d'un même lot — elles évaluent chaque écriture contre l'état
 * d'avant — donc rien ne leur permet d'exiger qu'un changement de boutique
 * s'accompagne de sa trace. C'est l'atomicité du lot qui le tient, et le fait
 * que seul ce code écrit ici.
 *
 * **Hors ligne, le lot part en file entier** (D66) : l'écran est juste tout de
 * suite, et le serveur rattrape quand il revient.
 */

/** La trace d'un déplacement, telle qu'elle est lue. */
function lireTransfert(instantane: QueryDocumentSnapshot<DocumentData>): Transfert {
  const donnees = instantane.data();
  return {
    id: instantane.id,
    motoId: donnees.motoId ?? "",
    numeroChassis: donnees.numeroChassis ?? "",
    deBoutiqueId: donnees.deBoutiqueId ?? "",
    versBoutiqueId: donnees.versBoutiqueId ?? "",
    motif: donnees.motif ?? "",
    /* `null` tant que l'horodatage serveur n'est pas résolu : un déplacement
       saisi hors ligne n'a pas encore de date, et en inventer une le ferait
       mentir (D82). */
    date: donnees.createdAt?.toDate?.() ?? null,
    auteur: donnees.createdByName ?? "",
  };
}

/**
 * Déplace la moto, et écrit la trace.
 *
 * **Le coût privé suit quand il est en main.** `motos/{id}/prive/cout` porte un
 * `boutiqueId` que les règles exigent égal à celui de la moto. Personne ne le
 * lit — ni l'application, ni la sécurité, puisque seul le responsable ouvre ce
 * document — mais le laisser diverger rendrait faux l'invariant que la règle
 * défend. Un gérant ne peut pas l'ouvrir, et n'y touche donc pas : la
 * divergence se répare alors à la prochaine saisie de coût, qui envoie toujours
 * la boutique courante de la moto.
 */
export function deplacerMoto(
  moto: Moto,
  saisie: SaisieTransfert,
  auteur: Auteur,
  /** Le responsable seul peut lire et donc corriger le coût privé. */
  voitLesCouts: boolean,
): { enregistre: Promise<void> } {
  const vers = saisie.versBoutiqueId.trim();

  const enregistre = (async () => {
    const lot = writeBatch(db());

    lot.update(doc(db(), "motos", moto.id), {
      boutiqueId: vers,
      ...traceModification(auteur),
    });

    lot.set(doc(collection(db(), "transfertsMotos")), {
      motoId: moto.id,
      /* Le châssis est recopié, comme `createdByName` ailleurs : la trace doit
         rester lisible quand son sujet ne l'est plus — et la boutique de départ
         perd justement le droit d'ouvrir la moto. */
      numeroChassis: moto.numeroChassis,
      deBoutiqueId: moto.boutiqueId,
      versBoutiqueId: vers,
      motif: saisie.motif.trim(),
      ...traceCreation(auteur),
    });

    if (voitLesCouts) {
      const reference = doc(db(), "motos", moto.id, "prive", "cout");
      /* Une moto peut n'avoir aucun coût : il n'est plus saisi à l'entrée en
         stock depuis S39. Et hors ligne sans cache, la lecture échoue — on
         laisse alors le coût tel quel plutôt que de faire échouer le
         déplacement pour un champ que personne ne lit. */
      const cout = await getDoc(reference).catch(() => null);
      if (cout?.exists()) lot.update(reference, { boutiqueId: vers });
    }

    await lot.commit();
  })();

  return { enregistre: suivreEcriture(enregistre) };
}

/**
 * Les motos parties de cette boutique, en direct.
 *
 * **Une seule égalité, donc aucun index composite à déclarer.** Le tri se fait
 * en mémoire : demander au serveur de trier en plus de filtrer exigerait un
 * index, et quelques dizaines de lignes se trient aussi bien ici — hors ligne
 * compris. Même raisonnement que `ecouterStock`.
 *
 * Un gérant **doit** poser cette contrainte : Firestore refuse une requête de
 * liste dès qu'un seul document du résultat échouerait à la règle — il ne filtre
 * pas, il refuse.
 */
export function ecouterDeparts(
  boutiqueId: string,
  auChangement: (transferts: Transfert[]) => void,
  enErreur: (cause: unknown) => void,
): () => void {
  const requete = query(
    collection(db(), "transfertsMotos"),
    where("deBoutiqueId", "==", boutiqueId),
  );

  return onSnapshot(
    requete,
    (instantane) => auChangement(instantane.docs.map(lireTransfert).sort(parDatePuisRecent)),
    enErreur,
  );
}

/**
 * Comment cette moto est arrivée dans la boutique où elle se trouve.
 *
 * Deux égalités, toujours aucun index composite. La contrainte sur
 * `versBoutiqueId` n'est pas qu'une optimisation : une moto passée par trois
 * boutiques porte des traces que le gérant actuel n'a pas le droit de lire, et
 * la requête entière serait refusée à cause d'elles.
 */
export function ecouterArriveeDeLaMoto(
  motoId: string,
  boutiqueId: string,
  auChangement: (arrivee: Transfert | null) => void,
  enErreur: (cause: unknown) => void,
): () => void {
  const requete = query(
    collection(db(), "transfertsMotos"),
    where("motoId", "==", motoId),
    where("versBoutiqueId", "==", boutiqueId),
  );

  return onSnapshot(
    requete,
    (instantane) => {
      const triees = instantane.docs.map(lireTransfert).sort(parDatePuisRecent);
      auChangement(triees[0] ?? null);
    },
    enErreur,
  );
}

/**
 * Le plus récent d'abord. Une trace sans date passe en tête : elle vient d'être
 * saisie hors ligne, et l'enfouir la ferait disparaître au moment précis où on
 * vérifie qu'elle est bien passée.
 */
function parDatePuisRecent(a: Transfert, b: Transfert): number {
  if (a.date === null) return -1;
  if (b.date === null) return 1;
  return b.date.getTime() - a.date.getTime();
}

/** Traduit les refus de Firestore en phrases qui disent quoi faire. */
export function messageErreurTransfert(cause: unknown): string {
  const code = (cause as { code?: string } | null | undefined)?.code ?? "";
  if (code.includes("permission-denied")) {
    return "Ce déplacement a été refusé. Seule la boutique qui détient la moto peut l’envoyer, et la boutique de destination doit être ouverte.";
  }
  if (code.includes("unauthenticated")) return "Votre session a expiré. Reconnectez-vous.";
  return "Le déplacement n’a pas abouti.";
}
