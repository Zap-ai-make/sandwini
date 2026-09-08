"use client";

import { CircleAlert } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
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
import { avancerDocument, messageErreurDossier } from "@/lib/repositories/dossier";
import { ecouterPrestataires } from "@/lib/repositories/prestataires";
import { jourLocal } from "@/lib/domain/recu";
import { EtatErreur } from "@/components/patrons/Etats";

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
  const [erreur, setErreur] = useState<string | null>(null);
  /* Un geste part une fois. Le verrou se lève dès que le document a changé de
     statut — ce que l'écriture locale provoque en un souffle. Un état de React
     ferait clignoter les boutons pour rien ; une référence suffit à empêcher
     le double clic sans rien raconter à l'écran. */
  const gesteParti = useRef(false);
  useEffect(() => {
    gesteParti.current = false;
  }, [document.statut]);

  const suivants = statutsSuivants(document.type, document.statut);
  const enRetard =
    document.statut === "chez_prestataire" && estEnRetard(document.disponibleLe, new Date());

  /* On n'attend pas le serveur pour rendre la main. Firestore applique
     l'écriture au cache local sur-le-champ : la ligne affiche déjà le nouveau
     statut, donc le formulaire n'a plus de raison d'être ouvert et l'étape
     suivante doit être offerte. Attendre l'accusé de réception, c'était laisser
     le gérant devant un formulaire qui ne se referme jamais — pour toujours au
     comptoir sans réseau, et le temps d'une file encombrée le reste du temps.
     Ce qui n'est pas encore parti est annoncé par le bandeau, qui compte les
     écritures en attente ; un refus tardif revient par le `catch`. */
  function avancer(vers: StatutDocument, depot?: SaisieDepot) {
    if (session.statut !== "connecte" || gesteParti.current) return;
    setErreur(null);
    try {
      const enregistre = avancerDocument(
        document,
        vers,
        { uid: session.utilisateur.uid, nom: session.utilisateur.nom },
        depot,
      );
      gesteParti.current = true;
      setDepotOuvert(false);
      enregistre.catch((cause) => setErreur(messageErreurDossier(cause)));
    } catch (cause) {
      /* Refus immédiat : transition impossible ou dépôt incomplet. Ces
         phrases-là sont écrites pour être lues, on les garde telles quelles. */
      setErreur(cause instanceof Error ? cause.message : "L’enregistrement a échoué.");
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

      <EtatErreur message={erreur} className="mt-2" />

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
                onClick={() => avancer(vers)}
                className="inline-flex h-11 items-center gap-2 rounded-plaque border border-bord px-3 text-sm font-medium text-encre hover:bg-fond"
              >
                {LIBELLE_ACTION[vers]}
              </button>
            ),
          )}
        </div>
      )}

      {depotOuvert && (
        <FormulaireDepot
          type={document.type}
          onAnnuler={() => setDepotOuvert(false)}
          onDeposer={(depot) => avancer("chez_prestataire", depot)}
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
  onAnnuler,
  onDeposer,
}: {
  type: DocumentDossier["type"];
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
              className="saisie mt-1.5"
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
                className="saisie mt-1.5"
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
                className="saisie mt-1.5"
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
                className="saisie mt-1.5 text-lg"
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
                className="saisie mt-1.5"
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

          <EtatErreur message={probleme} className="mt-3" />

          <div className="mt-4 flex flex-wrap gap-2">
            <button type="submit" className="bouton bouton-plaque">
              Enregistrer le dépôt
            </button>
            <button
              type="button"
              onClick={onAnnuler}
              className="bouton bouton-neutre"
            >
              Annuler
            </button>
          </div>
        </>
      )}
    </form>
  );
}
