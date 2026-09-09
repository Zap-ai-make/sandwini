"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "@/lib/auth/session";
import { statutsSuivants, validerDepot, type SaisieDepot } from "@/lib/domain/dossier";
import { estTypeDocument, type Prestataire } from "@/lib/domain/prestataire";
import { jourLocal } from "@/lib/domain/recu";
import {
  LIBELLE_DOCUMENT,
  LIBELLE_MOYEN,
  MOYENS_PAIEMENT,
  type DocumentDossier,
  type MoyenPaiement,
  type StatutDocument,
} from "@/lib/domain/vente";
import { useAbonnement } from "@/lib/repositories/abonnement";
import { avancerDocument, messageErreurDossier } from "@/lib/repositories/dossier";
import { ecouterPrestataires } from "@/lib/repositories/prestataires";
import { Champ } from "@/components/patrons/Champ";
import { EtatErreur } from "@/components/patrons/Etats";

/**
 * Les gestes qu'on peut faire sur un document, et rien d'autre.
 *
 * Deux écrans les proposent désormais : la fiche d'une vente, où le dossier est
 * une section parmi d'autres, et la file des dossiers en attente, où il est
 * l'objet même de l'écran (A7). La machine à états n'a pas à exister deux fois
 * — un chemin autorisé ici et refusé là serait un défaut invisible jusqu'au
 * jour où le serveur tranche.
 *
 * Les boutons proposés viennent de `statutsSuivants` — la même fonction que les
 * règles Firestore répliquent côté serveur (D65, D27). Aucune condition écrite
 * ici : **un bouton qui n'a pas de sens n'est pas grisé, il n'existe pas.** Un
 * bouton grisé invite à chercher ce qui le débloquerait ; son absence dit que
 * le chemin passe ailleurs. La maquette d'A7 grise « Remettre au client » avec
 * une phrase d'explication en dessous ; le relais dit déjà la même chose en
 * mieux, en montrant l'étape qui reste à franchir avant celle-là.
 */
export function GestesDocument({
  document,
  className = "",
}: {
  document: DocumentDossier;
  className?: string;
}) {
  const session = useSession();
  const [depotOuvert, setDepotOuvert] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  /* Un geste part une fois. Le verrou se leve des que le document a change de
     statut — ce que l'ecriture locale provoque en un souffle. */
  const gesteParti = useRef(false);
  useEffect(() => {
    gesteParti.current = false;
  }, [document.venteId, document.type, document.statut]);

  const suivants = statutsSuivants(document.type, document.statut);

  /* On n'attend pas le serveur pour rendre la main (D76). Firestore applique
     l'ecriture au cache local sur-le-champ : la ligne affiche deja le nouveau
     statut, donc le formulaire n'a plus de raison d'etre ouvert et l'etape
     suivante doit etre offerte. Attendre l'accuse de reception, c'etait laisser
     le gerant devant un formulaire qui ne se referme jamais — pour toujours au
     comptoir sans reseau. Ce qui n'est pas encore parti est annonce par le
     bandeau ; un refus tardif revient par le `catch`. */
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
      setErreur(cause instanceof Error ? cause.message : "L’enregistrement a échoué.");
    }
  }

  if (suivants.length === 0 && !erreur) return null;

  return (
    <div className={className}>
      <EtatErreur message={erreur} className="mb-2" />

      {suivants.length > 0 && !depotOuvert && (
        <div className="flex flex-wrap gap-2">
          {suivants.map((vers, rang) =>
            vers === "chez_prestataire" ? (
              <button
                key={vers}
                type="button"
                onClick={() => setDepotOuvert(true)}
                className="bouton bouton-plaque"
              >
                Déposer chez un prestataire
              </button>
            ) : (
              <button
                key={vers}
                type="button"
                onClick={() => avancer(vers)}
                /* Le premier proposé est celui qui fait avancer le document ;
                   « Non concerné par cette vente » le sort du parcours et ne
                   doit pas se cliquer par habitude. */
                className={
                  vers === "non_applicable"
                    ? "bouton bouton-discret"
                    : rang === 0
                      ? "bouton bouton-plaque disabled:opacity-60"
                      : "bouton bouton-neutre disabled:opacity-60"
                }
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
    </div>
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
    (auChangement: (prestataires: Prestataire[]) => void, enErreur: (cause: unknown) => void) =>
      ecouterPrestataires(auChangement, enErreur),
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
      prestataire.actif && estTypeDocument(type) && prestataire.typesDocuments.includes(type),
  );

  const changer = (partie: Partial<SaisieDepot>) => {
    setSaisie((precedent) => ({ ...precedent, ...partie }));
    setProbleme(null);
  };

  return (
    <form
      className="colonne-formulaire mt-3 rounded-plaque border border-bord bg-fond p-4"
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
            <Champ id={`prestataire-${type}`} libelle="Prestataire">
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
                className="saisie"
              >
                <option value="">Choisissez…</option>
                {candidats.map((prestataire) => (
                  <option key={prestataire.id} value={prestataire.id}>
                    {prestataire.nom}
                  </option>
                ))}
              </select>
            </Champ>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Champ id={`depose-${type}`} libelle="Date du dépôt">
              <input
                id={`depose-${type}`}
                type="date"
                value={saisie.deposeLe}
                onChange={(evenement) => changer({ deposeLe: evenement.target.value })}
                className="saisie"
              />
            </Champ>
            <Champ id={`dispo-${type}`} libelle="Annoncé pour le" facultatif>
              <input
                id={`dispo-${type}`}
                type="date"
                value={saisie.disponibleLe}
                min={saisie.deposeLe}
                onChange={(evenement) => changer({ disponibleLe: evenement.target.value })}
                className="saisie"
              />
            </Champ>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Champ id={`avance-${type}`} libelle="Avance versée">
              <input
                id={`avance-${type}`}
                inputMode="numeric"
                value={saisie.avance}
                onChange={(evenement) => changer({ avance: evenement.target.value })}
                className="saisie text-lg"
              />
            </Champ>
            <Champ id={`moyen-${type}`} libelle="Moyen de paiement">
              <select
                id={`moyen-${type}`}
                value={saisie.moyenPaiement}
                onChange={(evenement) =>
                  changer({
                    moyenPaiement: evenement.target.value as MoyenPaiement,
                  })
                }
                className="saisie"
              >
                {MOYENS_PAIEMENT.map((moyen) => (
                  <option key={moyen} value={moyen}>
                    {LIBELLE_MOYEN[moyen]}
                  </option>
                ))}
              </select>
            </Champ>
          </div>

          {/* L'avance sort de la caisse au moment du dépôt : le dire ici évite
              de le découvrir dans le journal de caisse. */}
          <p className="mt-2 text-sm text-encre-doux">
            L’avance est enregistrée comme une sortie de caisse, en même temps que le dépôt.
          </p>

          <EtatErreur message={probleme} className="mt-3" />

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="submit"
              className="bouton bouton-plaque disabled:opacity-60"
            >
              Enregistrer le dépôt
            </button>
            <button type="button" onClick={onAnnuler} className="bouton bouton-neutre">
              Annuler
            </button>
          </div>
        </>
      )}
    </form>
  );
}
