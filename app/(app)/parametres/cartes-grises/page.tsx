"use client";

import { useCallback, useMemo, useState } from "react";

import { GardeCapacite } from "@/components/GardeSession";
import { Avis } from "@/components/patrons/Avis";
import { EtatChargement, EtatErreur, EtatErreurSaisie } from "@/components/patrons/Etats";
import { TetePage } from "@/components/patrons/Page";
import { useSession } from "@/lib/auth/session";
import { nomDuClient } from "@/lib/domain/client";
import type { DossierCarteGrise } from "@/lib/domain/dossier-carte-grise";
import { preparerMigration } from "@/lib/domain/migration-cartes-grises";
import type { Moto } from "@/lib/domain/moto";
import type { DocumentDossier, Vente } from "@/lib/domain/vente";
import { useAbonnement } from "@/lib/repositories/abonnement";
import { useCatalogue } from "@/lib/repositories/catalogue";
import { ecouterDossiersCarteGrise } from "@/lib/repositories/dossiers-carte-grise";
import { useFichierClients } from "@/lib/repositories/fichier-clients";
import {
  lancerMigration,
  messageErreurMigration,
  type AvanceeMigration,
} from "@/lib/repositories/migration-cartes-grises";
import { ecouterStock } from "@/lib/repositories/motos";
import { ecouterDossiers, ecouterRetoursCartes, ecouterVentes } from "@/lib/repositories/ventes";

/**
 * Faire entrer les cartes grises existantes dans leur collection (S59).
 *
 * **Pourquoi un écran et non un script.** Le SDK Admin ne peut pas joindre le
 * projet réel depuis le poste du commanditaire : il n'y a pas d'identifiants
 * applicatifs, et fabriquer une clé de compte de service ne doit jamais entrer
 * dans ce dépôt. La migration passe donc par le navigateur du responsable
 * connecté, comme l'assistant — les règles s'appliquent sans une ligne de code
 * en plus, et chaque dossier créé porte le nom de qui l'a créé.
 *
 * **L'écran compte avant d'écrire, et le bouton ne ment pas.** Une migration ne
 * se défait pas : on voit combien de dossiers seront créés, combien sont déjà
 * là, et lesquels sont laissés de côté — avant de cliquer.
 *
 * **Opération en ligne.** Chaque vague doit être confirmée par le serveur avant
 * la suivante. Si le réseau tombe, elle s'arrête ; ce qui est écrit reste, et
 * relancer ne refait que le reste.
 */
export default function PageMigrationCartesGrises() {
  return (
    <GardeCapacite capacite="gerer_boutiques">
      <Ecran />
    </GardeCapacite>
  );
}

function Ecran() {
  const session = useSession();
  const catalogue = useCatalogue();
  const { clients } = useFichierClients();
  const [avancee, setAvancee] = useState<AvanceeMigration | null>(null);
  const [fini, setFini] = useState<number | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  /* **Toutes les boutiques, toujours.** Une migration partielle laisserait la
     moitié des dossiers dehors, et la relancer plus tard sur un autre périmètre
     donnerait deux dates de création pour un même lot de travail. */
  const { valeur: documents, erreur: erreurDocuments } = useAbonnement<DocumentDossier[]>(
    useCallback((ok, ko) => ecouterDossiers(null, ok, ko), []),
    "Les documents de dossier n’ont pas pu être lus.",
  );
  const { valeur: ventes, erreur: erreurVentes } = useAbonnement<Vente[]>(
    useCallback((ok, ko) => ecouterVentes(null, ok, ko), []),
    "Les ventes n’ont pas pu être lues.",
  );
  const { valeur: motos, erreur: erreurMotos } = useAbonnement<Moto[]>(
    useCallback((ok, ko) => ecouterStock(null, ok, ko), []),
    "Le stock n’a pas pu être lu.",
  );
  const { valeur: dossiers, erreur: erreurDossiers } = useAbonnement<DossierCarteGrise[]>(
    useCallback((ok, ko) => ecouterDossiersCarteGrise(null, ok, ko), []),
    "Les dossiers de carte grise n’ont pas pu être lus.",
  );
  const { valeur: retours } = useAbonnement<Map<string, Date>>(
    useCallback((ok, ko) => ecouterRetoursCartes(null, ok, ko), []),
    "Le journal des passages n’a pas pu être lu.",
  );

  const erreurLecture = erreurDocuments ?? erreurVentes ?? erreurMotos ?? erreurDossiers;
  const pret =
    documents !== null && ventes !== null && motos !== null && dossiers !== null;

  const plan = useMemo(() => {
    if (!pret) return null;
    return preparerMigration({
      documents,
      ventes,
      motos: new Map(
        motos.map((moto) => [
          moto.id,
          {
            numeroChassis: moto.numeroChassis,
            libelle: `${catalogue.nomMarque(moto.marqueId)} ${catalogue.nomModele(
              moto.modeleId,
            )}`.trim(),
          },
        ]),
      ),
      noms: new Map(clients.map((client) => [client.id, nomDuClient(client)])),
      /* Le journal peut manquer seul — sa règle est la plus récente. Sans lui,
         les dates de retour resteront vides : c'est une colonne de moins, pas
         une migration fausse. */
      retours: retours ?? new Map(),
      dejaMigres: new Set(dossiers.map((dossier) => dossier.id)),
    });
  }, [pret, documents, ventes, motos, dossiers, retours, clients, catalogue]);

  if (session.statut !== "connecte") return null;
  const auteur = { uid: session.utilisateur.uid, nom: session.utilisateur.nom };

  async function demarrer() {
    if (plan === null || avancee !== null) return;
    setErreur(null);
    setAvancee({ vague: 1, vagues: 1, ecrites: 0, total: plan.ecritures });
    try {
      const ecrites = await lancerMigration(plan, auteur, setAvancee);
      setFini(ecrites);
    } catch (cause) {
      setErreur(messageErreurMigration(cause));
    } finally {
      setAvancee(null);
    }
  }

  return (
    <div>
      <TetePage
        retour={{ href: "/parametres", libelle: "Paramètres" }}
        titre="Reprendre les cartes grises"
      />

      <EtatErreur message={erreurLecture} className="mt-4" />

      {!pret && !erreurLecture ? (
        <EtatChargement className="mt-4">Lecture de l’existant…</EtatChargement>
      ) : plan === null ? null : (
        <>
          <dl className="mt-6 grid gap-3 sm:grid-cols-3">
            <Compte libelle="Dossiers à créer" valeur={plan.aMigrer.length} />
            <Compte libelle="Déjà repris" valeur={plan.dejaLa} />
            <Compte libelle="Écritures au total" valeur={plan.ecritures} />
          </dl>


          {plan.sansChassis.length > 0 && (
            <Avis
              ton="transit"
              titre={`${plan.sansChassis.length} dossier(s) laissés de côté : pas de numéro de châssis`}
            >
              Ventes concernées : {plan.sansChassis.join(", ")}.
            </Avis>
          )}

          {plan.introuvables.length > 0 && (
            <Avis
              ton="transit"
              titre={`${plan.introuvables.length} dossier(s) sans vente ni moto retrouvée`}
            >
              Ventes concernées : {plan.introuvables.join(", ")}.
            </Avis>
          )}

          {plan.statutInconnu.length > 0 && (
            <Avis ton="transit" titre={`${plan.statutInconnu.length} dossier(s) à l’état inconnu`}>
              Ventes concernées : {plan.statutInconnu.join(", ")}.
            </Avis>
          )}

          <EtatErreurSaisie message={erreur} className="mt-4" />

          {fini !== null ? (
            <Avis ton="plaque" titre={`${fini} écriture(s) passées`}>
              Les dossiers sont dans leur collection. Ouvrez l’espace « Cartes grises » pour les
              voir. Les documents d’origine sont intacts.
            </Avis>
          ) : avancee !== null ? (
            <EtatChargement className="mt-4">
              Reprise en cours — étape {avancee.vague} sur {avancee.vagues}, {avancee.ecrites} sur{" "}
              {avancee.total} écritures. Ne fermez pas cet écran.
            </EtatChargement>
          ) : (
            <div className="mt-6">
              <button
                type="button"
                onClick={demarrer}
                disabled={plan.aMigrer.length === 0}
                className="bouton bouton-principal disabled:opacity-60"
              >
                {plan.aMigrer.length === 0
                  ? "Rien à reprendre"
                  : `Créer les ${plan.aMigrer.length} dossiers`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Un compte avec son intitulé. `Chiffre` n'en porte pas : il anime une valeur seule. */
function Compte({ libelle, valeur }: { libelle: string; valeur: number }) {
  return (
    <div className="cadre p-4">
      <dt className="text-legende text-encre-doux">{libelle}</dt>
      <dd className="plaque-code mt-1 text-bloc font-bold text-encre">{valeur}</dd>
    </div>
  );
}
