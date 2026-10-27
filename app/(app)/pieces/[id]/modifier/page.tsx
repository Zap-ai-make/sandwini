"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { ChampsPiece } from "@/components/ChampsPiece";
import { GardeCapacite, GardeEspace } from "@/components/GardeSession";
import { Avis } from "@/components/patrons/Avis";
import { EtatErreurSaisie, EtatVide, SansBoutique } from "@/components/patrons/Etats";
import { TetePage } from "@/components/patrons/Page";
import { useSession } from "@/lib/auth/session";
import {
  PIECE_VIDE,
  categoriesEmployees,
  referenceDejaPrise,
  saisieDepuisPiece,
  validerPiece,
  type Piece,
  type SaisiePiece,
} from "@/lib/domain/piece";
import { usePerimetre } from "@/lib/perimetre/perimetre";
import { useAbonnement } from "@/lib/repositories/abonnement";
import {
  changerActivationPiece,
  ecouterCatalogue,
  messageErreurPiece,
  modifierPiece,
} from "@/lib/repositories/pieces";

export default function PageModifierPiece() {
  return (
    <GardeEspace espace="pieces">
      {/* Même garde que la création : le gérant tient son catalogue, prix
          d'achat compris, et le responsable la porte aussi (S20 réponse 4,
          renversée par `3c8b2fe`). Le cloisonnement réel est dans les règles
          Firestore ; cette garde ne fait qu'éviter un écran qu'elles
          refuseraient ensuite. */}
      <GardeCapacite capacite="gerer_pieces">
        <ModifierPiece />
      </GardeCapacite>
    </GardeEspace>
  );
}

/**
 * Corriger une référence, et l'archiver (S63).
 *
 * **L'écran de création, en sens inverse.** On ne recrée pas un formulaire : on
 * reprend `ChampsPiece`, pré-rempli par `saisieDepuisPiece`. Ce qui change, ce
 * sont les bords — on reste sur la même pièce après l'enregistrement, et un
 * bouton archive la référence au lieu d'en ouvrir une seconde.
 *
 * **Rien ne se supprime.** Des mouvements citent la référence, et sa quantité
 * d'hier se relit : l'archivage la retire des listes courantes sans effacer son
 * passé. Il est réversible, donc il ne relève pas de la règle 6 — mais il se
 * confirme quand même, parce qu'un clic de trop ferait disparaître une pièce
 * vendable du comptoir.
 */
function ModifierPiece() {
  const session = useSession();
  const { perimetre } = usePerimetre();
  const parametres = useParams<{ id: string }>();
  const pieceId = parametres.id;
  const boutiqueId = perimetre.boutiqueId;
  const surUneBoutique = perimetre.type === "boutique";

  const souscrire = useCallback(
    (auChangement: (pieces: Piece[]) => void, enErreur: (cause: unknown) => void) =>
      ecouterCatalogue(boutiqueId, auChangement, enErreur),
    [boutiqueId],
  );
  const { valeur: catalogue, echec, erreur: erreurLecture, reessayer } = useAbonnement(
    souscrire,
    "Le catalogue n’a pas pu être lu.",
  );

  /* Le catalogue courant ne porte que les actives. Une pièce archivée s'ouvre
     par le même lien, donc on la cherche parmi tout ce que l'écoute renvoie —
     `ecouterCatalogue` ne masque pas les archivées, c'est `filtrerPieces` qui
     le fait pour l'affichage. */
  const piece = useMemo(
    () => (catalogue ?? []).find((p) => p.id === pieceId),
    [catalogue, pieceId],
  );
  const categories = useMemo(() => categoriesEmployees(catalogue ?? []), [catalogue]);

  const [saisie, setSaisie] = useState<SaisiePiece>(PIECE_VIDE);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enregistree, setEnregistree] = useState(false);
  const [confirmeArchive, setConfirmeArchive] = useState(false);

  /* La saisie s'amorce dès que la pièce est lue, **une fois par pièce** :
     ensuite elle appartient à qui tape, et la réécrire à chaque
     rafraîchissement du catalogue effacerait une correction en cours sous les
     doigts. On suit l'id amorcé plutôt qu'un simple booléen : si l'adresse
     change de pièce sans remontage, l'amorçage repart proprement sur la
     nouvelle.

     Ajusté **pendant le rendu** et non dans un `useEffect` : c'est le patron
     que React recommande pour recaler un état sur une valeur qui change, et il
     évite le rendu en cascade d'un effet (react.dev, « You Might Not Need an
     Effect »). */
  const [amorceePour, setAmorceePour] = useState<string | null>(null);
  if (piece && amorceePour !== piece.id) {
    setSaisie(saisieDepuisPiece(piece));
    setAmorceePour(piece.id);
  }

  const changer = (partie: Partial<SaisiePiece>) => {
    setSaisie((actuel) => ({ ...actuel, ...partie }));
    setEnregistree(false);
  };

  function soumettre(evenement: React.FormEvent) {
    evenement.preventDefault();
    if (session.statut !== "connecte" || !piece) return;
    setEnregistree(false);

    const probleme = validerPiece(saisie);
    if (probleme) {
      setErreur(probleme);
      return;
    }

    if (catalogue === null) {
      setErreur("Le catalogue n’a pas fini d’arriver. Réessayez dans un instant.");
      return;
    }

    /* On s'exclut du contrôle d'unicité (le `sauf`), sinon rééditer sans
       toucher à la référence se bloquerait comme un doublon de soi-même. */
    const doublon = referenceDejaPrise(saisie.reference, catalogue, piece.id);
    if (doublon) {
      setErreur(`Cette référence existe déjà : ${doublon.reference} — ${doublon.designation}.`);
      return;
    }

    setErreur(null);
    modifierPiece(piece.id, saisie, {
      uid: session.utilisateur.uid,
      nom: session.utilisateur.nom,
    }).catch((cause) => setErreur(messageErreurPiece(cause)));
    setEnregistree(true);
  }

  function basculerActivation() {
    if (session.statut !== "connecte" || !piece) return;
    setConfirmeArchive(false);
    setEnregistree(false);
    changerActivationPiece(piece.id, !piece.actif, {
      uid: session.utilisateur.uid,
      nom: session.utilisateur.nom,
    }).catch((cause) => setErreur(messageErreurPiece(cause)));
  }

  if (!surUneBoutique) {
    return (
      <SansBoutique
        titre="Modifier une référence"
        sansBoutiqueDeclaree="Une référence appartient à une boutique. Choisissez la sienne dans le bandeau, en haut de l’écran."
      />
    );
  }

  if (echec) {
    return (
      <div>
        <TetePage titre="Modifier une référence" />
        <Avis ton="alerte" titre="Le catalogue n’a pas pu être lu" className="mt-4">
          {erreurLecture}{" "}
          <button type="button" onClick={reessayer} className="underline">
            Réessayer
          </button>
        </Avis>
      </div>
    );
  }

  /* Le catalogue est arrivé, et la pièce n'y est pas : identifiant d'une autre
     boutique, ou lien périmé. On le dit plutôt que de rediriger en silence
     (D105 : un identifiant introuvable n'est pas un identifiant vide). */
  if (catalogue !== null && !piece) {
    return (
      <div>
        <TetePage retour={{ href: "/pieces", libelle: "Catalogue" }} titre="Référence introuvable" />
        <EtatVide titre="Cette référence n’existe pas ici">
          Elle a peut-être été archivée, ou appartient à une autre boutique. Revenez au catalogue
          pour la retrouver.
        </EtatVide>
      </div>
    );
  }

  const chargement = catalogue === null || !piece;

  return (
    <div>
      <TetePage
        retour={{ href: "/pieces", libelle: "Catalogue" }}
        titre="Modifier une référence"
        sousTitre={
          piece && !piece.actif
            ? "Cette référence est archivée : elle ne paraît plus au catalogue. Réactivez-la pour la vendre de nouveau."
            : "Corrigez ses informations, ou archivez-la si elle ne se vend plus."
        }
      />

      {enregistree && (
        <div role="status" className="mb-6 cadre p-4 max-w-[40rem]">
          <p className="font-medium text-encre">Modifications enregistrées.</p>
          <p className="mt-1 text-sm text-encre-doux">
            Elles sont déjà à jour sur cet appareil. Si le réseau manque, elles partiront seules.
          </p>
          <Link href="/pieces" className="mt-4 inline-flex bouton bouton-neutre">
            Retour au catalogue
          </Link>
        </div>
      )}

      {chargement ? (
        <p className="text-sm text-encre-doux">Lecture de la référence…</p>
      ) : (
        <form onSubmit={soumettre} className="colonne-formulaire max-w-[40rem]" noValidate>
          <ChampsPiece saisie={saisie} changer={changer} categories={categories} />

          <EtatErreurSaisie message={erreur} className="mt-3" />

          <button type="submit" disabled={catalogue === null} className="mt-3 bouton bouton-principal">
            Enregistrer les modifications
          </button>

          {/* L'archivage se tient à l'écart du bouton d'enregistrement, et il se
              confirme : un geste réversible, mais qui retire une pièce du
              comptoir. */}
          <fieldset className="mt-8 cadre p-4">
            <legend className="px-1 font-semibold text-encre">
              {piece.actif ? "Archiver" : "Réactiver"}
            </legend>
            {piece.actif ? (
              <>
                <p className="mt-2 text-sm text-encre-doux">
                  Elle quittera le catalogue sans être supprimée : ses ventes et ses mouvements
                  passés restent lisibles, et vous pourrez la réactiver.
                </p>
                {confirmeArchive ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={basculerActivation}
                      className="bouton bouton-destructif"
                    >
                      Confirmer l’archivage
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmeArchive(false)}
                      className="bouton bouton-neutre"
                    >
                      Annuler
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmeArchive(true)}
                    className="mt-3 bouton bouton-neutre"
                  >
                    Archiver cette référence
                  </button>
                )}
              </>
            ) : (
              <>
                <p className="mt-2 text-sm text-encre-doux">
                  Elle reparaîtra au catalogue et redeviendra vendable.
                </p>
                <button
                  type="button"
                  onClick={basculerActivation}
                  className="mt-3 bouton bouton-principal"
                >
                  Réactiver cette référence
                </button>
              </>
            )}
          </fieldset>
        </form>
      )}
    </div>
  );
}
