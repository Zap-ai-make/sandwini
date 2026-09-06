"use client";

import { CircleAlert, FolderCheck, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import {
  dossiersEnAttente,
  FILTRES_DOSSIERS_VIDES,
  type FiltresDossiers,
} from "@/lib/domain/dossier";
import { formaterDateCourte } from "@/lib/domain/format";
import type { Prestataire } from "@/lib/domain/prestataire";
import {
  LIBELLE_DOCUMENT,
  LIBELLE_STATUT_DOCUMENT,
  TYPES_DOCUMENT,
  type DocumentDossier,
  type TypeDocument,
  type Vente,
} from "@/lib/domain/vente";
import { usePerimetre } from "@/lib/perimetre/perimetre";
import { useAbonnement } from "@/lib/repositories/abonnement";
import { useFichierClients } from "@/lib/repositories/fichier-clients";
import { ecouterPrestataires } from "@/lib/repositories/prestataires";
import { ecouterDossiers, ecouterVentes } from "@/lib/repositories/ventes";
import { EtatChargement } from "@/components/patrons/Etats";
import { TetePage } from "@/components/patrons/Page";

/**
 * Les dossiers en attente (§7.3).
 *
 * Une file, pas un journal : du plus ancien au plus récent, et l’on n’y voit
 * que ce qui reste à faire. Le tri et les filtres vivent dans
 * `lib/domain/dossier.ts`, en fonction pure testée — l’écran ne fait que la
 * nourrir et la rendre.
 *
 * **Tout est filtré en mémoire.** Le retard dépend de la date du jour : une
 * requête Firestore figée serait fausse dès le lendemain. Et un filtre qui ne
 * marcherait qu’en ligne ne servirait à rien au comptoir.
 */
export default function PageDossiers() {
  const { perimetre, chargement: perimetreEnCours } = usePerimetre();
  const { clients } = useFichierClients();
  const [filtres, setFiltres] = useState<FiltresDossiers>(FILTRES_DOSSIERS_VIDES);
  const boutiqueId = perimetre.boutiqueId;

  const souscrireVentes = useCallback(
    (auChangement: (ventes: Vente[]) => void, enErreur: (cause: unknown) => void) =>
      ecouterVentes(boutiqueId, auChangement, enErreur),
    [boutiqueId],
  );
  const { valeur: ventes, erreur } = useAbonnement(
    souscrireVentes,
    "Les ventes n’ont pas pu être chargées.",
  );

  const souscrireDossiers = useCallback(
    (auChangement: (documents: DocumentDossier[]) => void, enErreur: (cause: unknown) => void) =>
      ecouterDossiers(boutiqueId, auChangement, enErreur),
    [boutiqueId],
  );
  const { valeur: documents } = useAbonnement(
    souscrireDossiers,
    "L’état des dossiers n’a pas pu être lu.",
  );

  const souscrirePrestataires = useCallback(
    (auChangement: (prestataires: Prestataire[]) => void, enErreur: (cause: unknown) => void) =>
      ecouterPrestataires(auChangement, enErreur),
    [],
  );
  const { valeur: prestataires } = useAbonnement(
    souscrirePrestataires,
    "La liste des prestataires n’a pas pu être lue.",
  );

  const nomDuClient = useMemo(
    () => new Map(clients.map((client) => [client.id, client.nom])),
    [clients],
  );

  /* La date du jour est figée au rendu : recalculée à chaque ligne, deux
     documents de la même liste pourraient être jugés à des instants
     différents. */
  const dossiers = useMemo(
    () => dossiersEnAttente(ventes ?? [], documents ?? [], filtres, new Date()),
    [ventes, documents, filtres],
  );

  const chargement = perimetreEnCours || ventes === null || documents === null;
  const filtreActif =
    Boolean(filtres.boutiqueId || filtres.prestataireId || filtres.type) ||
    filtres.enRetardSeulement;

  return (
    <div>
      <TetePage
        titre="Dossiers en attente"
        sousTitre={
          <>
            Les dossiers dont un document reste à traiter, du plus ancien au plus récent. Le retard
            se calcule sur l’horloge de cet appareil&nbsp;: il reste juste sans réseau.
          </>
        }
      />

      <Filtres
        filtres={filtres}
        changer={(partie) => setFiltres((actuel) => ({ ...actuel, ...partie }))}
        prestataires={(prestataires ?? []).filter((prestataire) => prestataire.actif)}
        montrerBoutique={perimetre.type === "toutes"}
      />

      {erreur && (
        <p
          role="alert"
          className="mt-4 flex items-center gap-3 cadre p-4 text-sm text-encre"
        >
          <TriangleAlert aria-hidden="true" className="size-5 shrink-0 text-alerte" />
          {erreur}
        </p>
      )}

      {chargement ? (
        <EtatChargement className="mt-6">Lecture des dossiers…</EtatChargement>
      ) : dossiers.length === 0 ? (
        <p className="mt-6 flex items-start gap-3 cadre p-4 text-sm text-encre">
          <FolderCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-encre-doux" />
          {filtreActif
            ? "Aucun dossier ne correspond à ces filtres. Élargissez-les pour voir le reste."
            : "Aucun dossier n’attend. Tous les documents des ventes en cours sont remis ou écartés."}
        </p>
      ) : (
        <ul className="mt-6 cadre cadre-liste">
          {dossiers.map((dossier) => (
            <li key={dossier.venteId}>
              <Link
                href={`/motos/ventes?vente=${dossier.venteId}`}
                className="block px-4 py-4 hover:bg-fond"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="font-medium text-encre">
                    <span className="plaque-code">{dossier.numero}</span>{" "}
                    {nomDuClient.get(dossier.clientId) ?? "Client inconnu"}
                  </span>
                  {dossier.date && (
                    <span className="text-sm text-encre-doux">
                      Vendue le {formaterDateCourte(dossier.date)}
                    </span>
                  )}
                </div>

                {/* Jamais la couleur seule : le retard est écrit (DESIGN.md §5). */}
                {dossier.enRetard && (
                  <p className="mt-1 flex items-center gap-2 text-sm font-medium text-alerte">
                    <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
                    En retard sur la date annoncée
                  </p>
                )}

                <ul className="mt-2 space-y-1">
                  {dossier.enCours.map((document) => (
                    <li key={document.id} className="text-sm text-encre-doux">
                      {LIBELLE_DOCUMENT[document.type]}
                      {" · "}
                      {LIBELLE_STATUT_DOCUMENT[document.statut]}
                      {/* Qui détient le document en ce moment : c'est la seule
                          question à laquelle cette liste doit répondre (§7.3). */}
                      {document.statut === "chez_prestataire" && document.prestataireNom
                        ? ` · ${document.prestataireNom}`
                        : ""}
                      {document.disponibleLe
                        ? ` · annoncé le ${formaterDateCourte(document.disponibleLe)}`
                        : ""}
                    </li>
                  ))}
                </ul>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Filtres({
  filtres,
  changer,
  prestataires,
  montrerBoutique,
}: {
  filtres: FiltresDossiers;
  changer: (partie: Partial<FiltresDossiers>) => void;
  prestataires: readonly Prestataire[];
  montrerBoutique: boolean;
}) {
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-3">
      {/* Le filtre par boutique n'a de sens que sur « toutes les boutiques » :
          ailleurs le périmètre a déjà tranché, et l'offrir ferait croire qu'on
          peut voir au-delà. */}
      {montrerBoutique && (
        <div>
          <label htmlFor="filtre-boutique" className="block text-sm font-medium text-encre">
            Boutique
          </label>
          <input
            id="filtre-boutique"
            value={filtres.boutiqueId}
            placeholder="Code à trois lettres"
            onChange={(evenement) =>
              changer({ boutiqueId: evenement.target.value.trim().toUpperCase() })
            }
            className="plaque-code saisie mt-1.5"
          />
        </div>
      )}

      <div>
        <label htmlFor="filtre-prestataire" className="block text-sm font-medium text-encre">
          Prestataire
        </label>
        <select
          id="filtre-prestataire"
          value={filtres.prestataireId}
          onChange={(evenement) => changer({ prestataireId: evenement.target.value })}
          className="saisie mt-1.5"
        >
          <option value="">Tous</option>
          {prestataires.map((prestataire) => (
            <option key={prestataire.id} value={prestataire.id}>
              {prestataire.nom}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="filtre-type" className="block text-sm font-medium text-encre">
          Document
        </label>
        <select
          id="filtre-type"
          value={filtres.type}
          onChange={(evenement) =>
            changer({ type: evenement.target.value as TypeDocument | "" })
          }
          className="saisie mt-1.5"
        >
          <option value="">Tous</option>
          {TYPES_DOCUMENT.map((type) => (
            <option key={type} value={type}>
              {LIBELLE_DOCUMENT[type]}
            </option>
          ))}
        </select>
      </div>

      <label className="flex items-center gap-2 text-encre sm:col-span-3">
        <input
          type="checkbox"
          checked={filtres.enRetardSeulement}
          onChange={(evenement) => changer({ enRetardSeulement: evenement.target.checked })}
          className="size-5 rounded-plaque border-bord accent-plaque"
        />
        En retard seulement
      </label>
    </div>
  );
}
