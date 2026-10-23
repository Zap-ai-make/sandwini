"use client";

import { Timestamp, doc, writeBatch } from "firebase/firestore";

import { type PlanMigration, vaguesDeMigration } from "@/lib/domain/migration-cartes-grises";
import { db } from "@/lib/firebase/client";
import { traceCreation, traceModification, type Auteur } from "@/lib/repositories/referentiels";

/**
 * Lance la migration des cartes grises depuis le navigateur (S59).
 *
 * **Elle attend le serveur, à l'inverse de tout le reste du produit.** Partout
 * ailleurs on rend la main sur l'écriture locale (D76), parce qu'un geste de
 * comptoir ne doit pas dépendre du réseau. Ici c'est l'opposé : chaque vague
 * doit être **confirmée** avant la suivante, puisque les règles jugent un
 * `update` contre l'état d'avant le lot. Une migration est donc une opération
 * en ligne, et elle s'arrête si le réseau tombe — ce qui est la bonne
 * conséquence : reprise plus tard, sans rien écraser.
 *
 * **Elle n'écrase jamais.** Les dossiers déjà présents ont été retirés du plan
 * en amont (`preparerMigration`). Relancer après un échec partiel ne refait
 * donc que ce qui manque.
 *
 * **Elle ne supprime rien.** Les documents d'origine restent en place et
 * continuent d'être lus ; leur retrait est une opération distincte, décidée
 * après vérification.
 */

/** La taille d'un lot. Le plafond est 500 ; on garde de la marge. */
const PAR_LOT = 400;

export type AvanceeMigration = {
  /** Le rang de la vague en cours, et combien il y en a. */
  vague: number;
  vagues: number;
  ecrites: number;
  total: number;
};

export async function lancerMigration(
  plan: PlanMigration,
  auteur: Auteur,
  onAvancee: (avancee: AvanceeMigration) => void,
): Promise<number> {
  const vagues = vaguesDeMigration(plan);
  let ecrites = 0;

  for (const vague of vagues) {
    for (let depart = 0; depart < vague.ecritures.length; depart += PAR_LOT) {
      const tranche = vague.ecritures.slice(depart, depart + PAR_LOT);
      const lot = writeBatch(db());

      for (const ecriture of tranche) {
        const reference = doc(db(), "dossiersCarteGrise", ecriture.id);
        const champs = horodater(ecriture.champs);
        if (vague.rang === 0) lot.set(reference, { ...champs, ...traceCreation(auteur) });
        else lot.update(reference, { ...champs, ...traceModification(auteur) });
      }

      /* **On attend vraiment.** Sans ce `await`, la vague suivante partirait
         avant que celle-ci soit visible des règles, et chaque `update` serait
         refusé sur un document qui n'existe pas encore. */
      await lot.commit();

      ecrites += tranche.length;
      onAvancee({
        vague: vague.rang + 1,
        vagues: vagues.length,
        ecrites,
        total: plan.ecritures,
      });
    }
  }

  return ecrites;
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
 * Ce qu'on montre quand le serveur refuse au milieu d'une migration.
 *
 * Le message brut cite des numéros de ligne d'un fichier de règles. Et il faut
 * dire ce qui est acquis : ce qui est écrit l'est, et relancer ne refera que le
 * reste.
 */
export function messageErreurMigration(cause: unknown): string {
  const code = (cause as { code?: string }).code ?? "";
  if (code.includes("permission-denied")) {
    return "Le serveur a refusé une écriture. Ce qui est déjà créé reste en place : vous pouvez relancer, rien ne sera écrit deux fois.";
  }
  if (code.includes("unauthenticated")) return "Votre session a expiré. Reconnectez-vous.";
  return "La migration s’est arrêtée. Ce qui est déjà créé reste en place ; relancez pour reprendre.";
}
