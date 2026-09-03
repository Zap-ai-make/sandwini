import { Timestamp, collection, doc, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import {
  lireJour,
  transitionAutorisee,
  validerDepot,
  type SaisieDepot,
} from "@/lib/domain/dossier";
import {
  lireMontant,
  LIBELLE_DOCUMENT,
  type DocumentDossier,
  type StatutDocument,
} from "@/lib/domain/vente";
import { traceCreation, traceModification, type Auteur } from "./referentiels";

/**
 * Faire avancer un document de dossier (S11).
 *
 * Trois écritures dans **un seul lot** : le nouveau statut, la ligne
 * d'historique qui garde la trace du passage, et — au dépôt — la sortie de
 * caisse de l'avance. Un `writeBatch` reste atomique hors ligne : Firestore le
 * garde entier dans sa file et le rejoue d'un bloc au retour du réseau. C'est
 * ce qui interdit l'état le plus coûteux à démêler : un document déposé chez un
 * prestataire dont l'argent n'est jamais sorti de la caisse, ou l'inverse.
 *
 * La transition est revalidée ici même si l'écran ne propose que des passages
 * licites : entre l'affichage d'un bouton et le clic, un autre appareil a pu
 * faire avancer le même document. Les règles Firestore refuseraient de toute
 * façon (D27), mais elles refusent sans expliquer — autant s'arrêter avant, avec
 * une phrase.
 */
export async function avancerDocument(
  document: DocumentDossier,
  vers: StatutDocument,
  auteur: Auteur,
  depot?: SaisieDepot,
): Promise<void> {
  if (!transitionAutorisee(document.type, document.statut, vers)) {
    throw new Error(
      `Ce document ne peut pas passer à cette étape. Il a peut-être avancé sur un autre appareil ; rouvrez la fiche.`,
    );
  }

  const maintenant = Timestamp.fromDate(new Date());
  const reference = doc(db(), "ventesMotos", document.venteId, "documents", document.type);
  const lot = writeBatch(db());

  const changement: Record<string, unknown> = { statut: vers, ...traceModification(auteur) };

  if (vers === "chez_prestataire") {
    if (!depot) throw new Error("Un dépôt demande le prestataire, la date et l’avance.");
    const probleme = validerDepot(depot);
    if (probleme) throw new Error(probleme);

    const montant = lireMontant(depot.avance) ?? 0;
    const disponible = depot.disponibleLe ? lireJour(depot.disponibleLe) : null;

    changement.prestataireId = depot.prestataireId;
    changement.prestataireNom = depot.prestataireNom;
    changement.deposeLe = Timestamp.fromDate(lireJour(depot.deposeLe) as Date);
    changement.avance = montant;
    changement.disponibleLe = disponible ? Timestamp.fromDate(disponible) : null;

    /* L'avance est de l'argent qui quitte la caisse aujourd'hui. Elle n'est
       jamais nulle — sans montant, le travail serait confié à crédit, ce que le
       modèle traite ailleurs — donc cette écriture est inconditionnelle : il
       n'existe pas de dépôt sans mouvement correspondant. */
    lot.set(doc(collection(db(), "encaissements")), {
      boutiqueId: document.boutiqueId,
      date: maintenant,
      sens: "sortie",
      montant,
      moyenPaiement: depot.moyenPaiement,
      origine: "avance_prestataire",
      origineRefId: document.venteId,
      libelle: `Avance ${depot.prestataireNom} — ${LIBELLE_DOCUMENT[document.type]}`,
      /* Une sortie de caisse n'est jamais un engagement de tranches : ce drapeau
         ne concerne que l'argent qui entre (§6.2). */
      categorieTranches: false,
      ...traceCreation(auteur),
    });
  }

  if (vers === "remis_client") changement.remisLe = maintenant;

  lot.update(reference, changement);

  /* L'identifiant porte l'horodatage : les entrées se lisent dans l'ordre sans
     tri ni index, et deux appareils hors ligne qui avancent le même document
     produisent deux lignes distinctes plutôt qu'une qui écrase l'autre. */
  lot.set(doc(collection(reference, "historique")), {
    boutiqueId: document.boutiqueId,
    venteId: document.venteId,
    type: document.type,
    de: document.statut,
    vers,
    le: maintenant,
    ...traceCreation(auteur),
  });

  await lot.commit();
}
