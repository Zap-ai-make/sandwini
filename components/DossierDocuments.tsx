"use client";

import { CircleAlert, LoaderCircle } from "lucide-react";
import { useCallback, useState } from "react";
import { useSession } from "@/lib/auth/session";
import {
  estEnRetard,
  statutsSuivants,
  validerDepot,
  type SaisieDepot,
} from "@/lib/domain/dossier";
import { formaterDateCourte, formaterMontant } from "@/lib/domain/format";
import { estTypeDocument, type Prestataire } from "@/lib/domain/prestataire";
import {
  LIBELLE_DOCUMENT,
  LIBELLE_MOYEN,
  LIBELLE_STATUT_DOCUMENT,
  MOYENS_PAIEMENT,
  type DocumentDossier,
  type MoyenPaiement,
  type StatutDocument,
} from "@/lib/domain/vente";
import { useAbonnement } from "@/lib/repositories/abonnement";
import { avancerDocument } from "@/lib/repositories/dossier";
import { ecouterPrestataires } from "@/lib/repositories/prestataires";
import { jourLocal } from "@/lib/domain/recu";

/**
 * Le dossier d'une vente, et ce qu'on peut y faire (S11).
 *
 * Les boutons proposés viennent de `statutsSuivants` — la même fonction que les
 * règles Firestore répliquent côté serveur (D65, D27). Aucune condition écrite
 * ici : un bouton qui n'a pas de sens n'est pas grisé, il n'existe pas. Un
 * bouton grisé invite à chercher ce qui le débloquerait ; son absence dit que
 * le chemin passe ailleurs.
 */
export function DossierDocuments({ documents }: { documents: DocumentDossier[] | null }) {
  if (documents === null) {
    return <p className="px-4 py-3 text-sm text-encre-doux">Chargement du dossier…</p>;
  }
  if (documents.length === 0) {
    return (
      <p className="px-4 py-3 text-sm text-encre-doux">
        Aucun document n’est encore parvenu au serveur pour cette vente.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-bord">
      {documents.map((document) => (
        <LigneDocument key={document.id} document={document} />
      ))}
    </ul>
  );
}

function LigneDocument({ document }: { document: DocumentDossier }) {
  const session = useSession();
  const [depotOuvert, setDepotOuvert] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const suivants = statutsSuivants(document.type, document.statut);
  const enRetard =
    document.statut === "chez_prestataire" && estEnRetard(document.disponibleLe, new Date());

  async function avancer(vers: StatutDocument, depot?: SaisieDepot) {
    if (session.statut !== "connecte" || envoi) return;
    setErreur(null);
    setEnvoi(true);
    try {
      await avancerDocument(
        document,
        vers,
        { uid: session.utilisateur.uid, nom: session.utilisateur.nom },
        depot,
      );
      setDepotOuvert(false);
    } catch (cause) {
      setErreur(cause instanceof Error ? cause.message : "L’enregistrement a échoué.");
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="font-medium text-encre">{LIBELLE_DOCUMENT[document.type]}</span>
        <span className="text-sm text-encre-doux">
          {LIBELLE_STATUT_DOCUMENT[document.statut]}
        </span>
      </div>

      {document.statut === "chez_prestataire" && (
        <p className="mt-1 text-sm text-encre-doux">
          Chez {document.prestataireNom || "un prestataire"}
          {document.deposeLe ? ` depuis le ${formaterDateCourte(document.deposeLe)}` : ""}
          {document.avance !== null ? ` · avance ${formaterMontant(document.avance)}` : ""}
          {document.disponibleLe ? ` · annoncé le ${formaterDateCourte(document.disponibleLe)}` : ""}
        </p>
      )}

      {/* Jamais la couleur seule : le mot « en retard » est écrit (DESIGN.md §5). */}
      {enRetard && (
        <p className="mt-1 flex items-center gap-2 text-sm font-medium text-alerte">
          <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
          En retard sur la date annoncée
        </p>
      )}

      {document.statut === "remis_client" && document.remisLe && (
        <p className="mt-1 text-sm text-encre-doux">
          Remis au client le {formaterDateCourte(document.remisLe)}
        </p>
      )}

      {erreur && (
        <p role="alert" className="mt-2 text-sm text-alerte">
          {erreur}
        </p>
      )}

      {suivants.length > 0 && !depotOuvert && (
        <div className="mt-2 flex flex-wrap gap-2">
          {suivants.map((vers) =>
            vers === "chez_prestataire" ? (
              <button
                key={vers}
                type="button"
                onClick={() => setDepotOuvert(true)}
                className="inline-flex h-11 items-center rounded-plaque border border-bord px-3 text-sm font-medium text-encre hover:bg-fond"
              >
                Déposer chez un prestataire
              </button>
            ) : (
              <button
                key={vers}
                type="button"
                disabled={envoi}
                onClick={() => void avancer(vers)}
                className="inline-flex h-11 items-center gap-2 rounded-plaque border border-bord px-3 text-sm font-medium text-encre hover:bg-fond disabled:opacity-60"
              >
                {envoi && <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />}
                {LIBELLE_ACTION[vers]}
              </button>
            ),
          )}
        </div>
      )}

      {depotOuvert && (
        <FormulaireDepot
          type={document.type}
          envoi={envoi}
          onAnnuler={() => setDepotOuvert(false)}
          onDeposer={(depot) => void avancer("chez_prestataire", depot)}
        />
      )}
    </li>
  );
}

/** Ce que le bouton fait, dit du point de vue du gérant, pas de la machine. */
const LIBELLE_ACTION: Record<StatutDocument, string> = {
  a_faire: "À faire",
  chez_prestataire: "Déposer chez un prestataire",
  revenu_magasin: "Arrivé au magasin",
  remis_client: "Remettre au client",
  non_applicable: "Non concerné par cette vente",
};

function FormulaireDepot({
  type,
  envoi,
  onAnnuler,
  onDeposer,
}: {
  type: DocumentDossier["type"];
  envoi: boolean;
  onAnnuler: () => void;
  onDeposer: (depot: SaisieDepot) => void;
}) {
  const souscrire = useCallback(
    (
      auChangement: (prestataires: Prestataire[]) => void,
      enErreur: (cause: unknown) => void,
    ) => ecouterPrestataires(auChangement, enErreur),
    [],
  );
  const { valeur: prestataires } = useAbonnement(
    souscrire,
    "La liste des prestataires n’a pas pu être lue.",
  );

  const [saisie, setSaisie] = useState<SaisieDepot>({
    prestataireId: "",
    prestataireNom: "",
    deposeLe: jourLocal(new Date()),
    avance: "",
    moyenPaiement: "especes",
    disponibleLe: "",
  });
  const [probleme, setProbleme] = useState<string | null>(null);

  /* Seuls les prestataires actifs qui traitent ce document-là : proposer les
     autres, c'est proposer une erreur. */
  const candidats = (prestataires ?? []).filter(
    (prestataire) =>
      prestataire.actif &&
      estTypeDocument(type) &&
      prestataire.typesDocuments.includes(type),
  );

  const changer = (partie: Partial<SaisieDepot>) => {
    setSaisie((precedent) => ({ ...precedent, ...partie }));
    setProbleme(null);
  };

  return (
    <form
      className="mt-3 rounded-plaque border border-bord bg-fond p-4"
      onSubmit={(evenement) => {
        evenement.preventDefault();
        const message = validerDepot(saisie);
        if (message) {
          setProbleme(message);
          return;
        }
        onDeposer(saisie);
      }}
    >
      <p className="text-sm font-medium text-encre">
        Confier {LIBELLE_DOCUMENT[type].toLowerCase()} à un prestataire
      </p>

      {prestataires === null ? (
        <p className="mt-3 text-sm text-encre-doux">Lecture des prestataires…</p>
      ) : candidats.length === 0 ? (
        <p className="mt-3 text-sm text-encre">
          Aucun prestataire ne traite ce document. Déclarez-en un dans Réglages, puis revenez.
        </p>
      ) : (
        <>
          <div className="mt-3">
            <label htmlFor={`prestataire-${type}`} className="block text-sm font-medium text-encre">
              Prestataire
            </label>
            <select
              id={`prestataire-${type}`}
              value={saisie.prestataireId}
              onChange={(evenement) => {
                const choisi = candidats.find((c) => c.id === evenement.target.value);
                changer({
                  prestataireId: choisi?.id ?? "",
                  prestataireNom: choisi?.nom ?? "",
                });
              }}
              className="mt-1.5 h-12 w-full rounded-plaque border border-bord bg-papier px-3 text-encre"
            >
              <option value="">Choisissez…</option>
              {candidats.map((prestataire) => (
                <option key={prestataire.id} value={prestataire.id}>
                  {prestataire.nom}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={`depose-${type}`} className="block text-sm font-medium text-encre">
                Date du dépôt
              </label>
              <input
                id={`depose-${type}`}
                type="date"
                value={saisie.deposeLe}
                onChange={(evenement) => changer({ deposeLe: evenement.target.value })}
                className="mt-1.5 h-12 w-full rounded-plaque border border-bord bg-papier px-3 text-encre"
              />
            </div>
            <div>
              <label htmlFor={`dispo-${type}`} className="block text-sm font-medium text-encre">
                Annoncé pour le{" "}
                <span className="font-normal text-encre-doux">(facultatif)</span>
              </label>
              <input
                id={`dispo-${type}`}
                type="date"
                value={saisie.disponibleLe}
                min={saisie.deposeLe}
                onChange={(evenement) => changer({ disponibleLe: evenement.target.value })}
                className="mt-1.5 h-12 w-full rounded-plaque border border-bord bg-papier px-3 text-encre"
              />
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={`avance-${type}`} className="block text-sm font-medium text-encre">
                Avance versée
              </label>
              <input
                id={`avance-${type}`}
                inputMode="numeric"
                value={saisie.avance}
                onChange={(evenement) => changer({ avance: evenement.target.value })}
                className="mt-1.5 h-12 w-full rounded-plaque border border-bord bg-papier px-3 text-lg text-encre"
              />
            </div>
            <div>
              <label htmlFor={`moyen-${type}`} className="block text-sm font-medium text-encre">
                Moyen de paiement
              </label>
              <select
                id={`moyen-${type}`}
                value={saisie.moyenPaiement}
                onChange={(evenement) =>
                  changer({ moyenPaiement: evenement.target.value as MoyenPaiement })
                }
                className="mt-1.5 h-12 w-full rounded-plaque border border-bord bg-papier px-3 text-encre"
              >
                {MOYENS_PAIEMENT.map((moyen) => (
                  <option key={moyen} value={moyen}>
                    {LIBELLE_MOYEN[moyen]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* L'avance sort de la caisse au moment du dépôt : le dire ici évite
              de le découvrir dans le journal de caisse. */}
          <p className="mt-2 text-sm text-encre-doux">
            L’avance est enregistrée comme une sortie de caisse, en même temps que le dépôt.
          </p>

          {probleme && (
            <p role="alert" className="mt-3 text-sm text-alerte">
              {probleme}
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={envoi}
              className="inline-flex h-12 items-center gap-2 rounded-plaque border border-plaque-bord bg-plaque px-5 font-semibold text-encre-fixe disabled:opacity-60"
            >
              {envoi && <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />}
              Enregistrer le dépôt
            </button>
            <button
              type="button"
              onClick={onAnnuler}
              className="inline-flex h-12 items-center rounded-plaque border border-bord px-4 font-medium text-encre hover:bg-papier"
            >
              Annuler
            </button>
          </div>
        </>
      )}
    </form>
  );
}
