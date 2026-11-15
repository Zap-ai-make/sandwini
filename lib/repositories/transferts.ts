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
import { COUTS_PAR_ECRITURE, enTranches } from "@/lib/domain/ecritures";
import {
  MOTOS_PAR_DEPLACEMENT_MAX,
  type SaisieTransfert,
  type Transfert,
} from "@/lib/domain/transfert";
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
 * Déplace plusieurs motos d'un coup, et écrit une trace par moto.
 *
 * **Tout part ensemble, ou rien.** Un `writeBatch` reste atomique hors ligne :
 * Firestore le garde entier dans sa file et le rejoue d'un bloc au retour du
 * réseau. La moitié d'un envoi ferait disparaître des motos d'un stock sans
 * qu'elles apparaissent dans l'autre, et personne ne saurait où l'envoi s'est
 * arrêté.
 *
 * **Une trace par moto, et non une par envoi.** C'est la moto qu'on cherche
 * plus tard — « d'où vient celle-là ? » — et un document unique obligerait à
 * fouiller une liste d'identifiants pour répondre. Le coût est le même, la
 * question est mieux servie.
 *
 * **Les coûts privés sont lus avant le lot, pas pendant.** Chacun demande un
 * aller-retour ; les lancer ensemble évite de les enchaîner un par un. Hors
 * ligne la lecture échoue, et on laisse alors le coût tel quel plutôt que de
 * faire échouer le déplacement (voir `deplacerMoto`).
 *
 * **Et ils partent derrière l'envoi, par tranches** (15 novembre 2026). Chaque
 * coût fait consulter sa moto par les règles, et un lot d'écriture n'en tolère
 * que 20 : joints à l'envoi, ils faisaient tomber les motos avec eux dès la
 * 21ᵉ. L'envoi reste d'un seul tenant — aucune moto ne change de boutique sans
 * sa trace —, et le coût rejoint sa moto dans la foulée. Il compte davantage
 * depuis que le gérant lit les coûts de sa boutique : c'est son `boutiqueId`
 * qui ouvre la lecture à la boutique d'arrivée.
 */
export function deplacerMotos(
  motos: readonly Moto[],
  saisie: SaisieTransfert,
  auteur: Auteur,
  voitLesCouts: boolean,
): { enregistre: Promise<void> } {
  const vers = saisie.versBoutiqueId.trim();

  const enregistre = (async () => {
    if (motos.length === 0) return;
    if (motos.length > MOTOS_PAR_DEPLACEMENT_MAX) {
      throw new Error(
        `Pas plus de ${MOTOS_PAR_DEPLACEMENT_MAX} motos à la fois : au-delà, l’envoi ne peut plus être garanti d’un seul tenant.`,
      );
    }

    const coutsAEcrire = voitLesCouts
      ? await Promise.all(
          motos.map(async (moto) => {
            const reference = doc(db(), "motos", moto.id, "prive", "cout");
            const cout = await getDoc(reference).catch(() => null);
            return cout?.exists() ? reference : null;
          }),
        )
      : [];

    const lot = writeBatch(db());

    for (const moto of motos) {
      lot.update(doc(db(), "motos", moto.id), {
        boutiqueId: vers,
        ...traceModification(auteur),
      });

      lot.set(doc(collection(db(), "transfertsMotos")), {
        motoId: moto.id,
        /* Le châssis est recopié : la trace doit rester lisible quand son sujet
           ne l'est plus — et la boutique de départ perd justement le droit
           d'ouvrir la moto. */
        numeroChassis: moto.numeroChassis,
        deBoutiqueId: moto.boutiqueId,
        versBoutiqueId: vers,
        motif: saisie.motif.trim(),
        ...traceCreation(auteur),
      });
    }

    /* Lancés dans l'ordre, sans s'attendre : l'envoi d'abord, puis les coûts,
       qui trouvent ainsi leur moto déjà arrivée (`coutSuitSaMoto`). */
    const ecritures = [lot.commit()];
    const references = coutsAEcrire.filter((reference) => reference !== null);
    for (const tranche of enTranches(references, COUTS_PAR_ECRITURE)) {
      const lotCouts = writeBatch(db());
      for (const reference of tranche) lotCouts.update(reference, { boutiqueId: vers });
      ecritures.push(lotCouts.commit());
    }
    await Promise.all(ecritures);
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
 * Les transferts arrivés dans cette boutique, ou dans toutes (9 novembre 2026).
 *
 * Ils nomment, dans la colonne « Fournisseur » du stock, la boutique d'où une
 * moto transférée vient (`origineParTransfert`). `null` lit toutes les traces :
 * seul le responsable regarde « Toutes les boutiques », et la règle le laisse
 * tout lire. Un gérant pose `versBoutiqueId` — pour la même raison que
 * `ecouterDeparts` pose `deBoutiqueId` : sans elle, la liste entière serait
 * refusée.
 */
export function ecouterArrivees(
  boutiqueId: string | null,
  auChangement: (transferts: Transfert[]) => void,
  enErreur: (cause: unknown) => void,
): () => void {
  const base = collection(db(), "transfertsMotos");
  const requete = boutiqueId ? query(base, where("versBoutiqueId", "==", boutiqueId)) : base;

  return onSnapshot(
    requete,
    (instantane) => auChangement(instantane.docs.map(lireTransfert)),
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
