"use client";

import { Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { ChampsReception } from "@/components/ChampsReception";
import { GardeCapacite, GardeEspace } from "@/components/GardeSession";
import { Champ } from "@/components/patrons/Champ";
import { EtatErreurSaisie, SansBoutique } from "@/components/patrons/Etats";
import { TetePage } from "@/components/patrons/Page";
import { useSession } from "@/lib/auth/session";
import { formaterNombre } from "@/lib/domain/format";
import { comparerPieces, filtrerPieces, type Piece } from "@/lib/domain/piece";
import {
  RECEPTION_VIDE,
  ajouterAReception,
  retirerDeReception,
  totalUnitesRecues,
  validerReception,
} from "@/lib/domain/reception";
import { usePerimetre } from "@/lib/perimetre/perimetre";
import { useAbonnement } from "@/lib/repositories/abonnement";
import { ecouterCatalogue, enregistrerReception, messageErreurPiece } from "@/lib/repositories/pieces";

export default function PageReception() {
  return (
    <GardeEspace espace="pieces">
      {/* Même garde que la création : le gérant tient son catalogue, coût
          compris (S21). La réception met justement ce coût à jour. */}
      <GardeCapacite capacite="gerer_pieces">
        <Reception />
      </GardeCapacite>
    </GardeEspace>
  );
}

/**
 * Faire entrer un arrivage de pièces (S66).
 *
 * **L'écran d'un carton qu'on range.** On cherche une référence, on l'ajoute, on
 * corrige la quantité, et on passe à la suivante — tout l'arrivage se compose
 * d'un coup, et part en un seul lot. Le prix d'achat de chaque ligne est
 * pré-rempli du catalogue et reste modifiable : s'il change, il met à jour le
 * coût de la référence.
 *
 * **Ce n'est pas un `<form>`**, pour la raison exacte de l'écran de vente : le
 * premier champ est une recherche, et un formulaire validerait à la touche
 * Entrée — ici, enregistrer l'arrivage avant de l'avoir fini. Les `fieldset`
 * restent : ils groupent et nomment sans demander de formulaire.
 */
function Reception() {
  const session = useSession();
  const { perimetre } = usePerimetre();
  const boutiqueId = perimetre.boutiqueId;
  const surUneBoutique = perimetre.type === "boutique";

  const souscrire = useCallback(
    (auChangement: (pieces: Piece[]) => void, enErreur: (cause: unknown) => void) =>
      ecouterCatalogue(boutiqueId, auChangement, enErreur),
    [boutiqueId],
  );
  const catalogue = useAbonnement(souscrire, "Le catalogue n’a pas pu être lu.");
  const pieces = catalogue.valeur;

  const [saisie, setSaisie] = useState(RECEPTION_VIDE);
  const [recherche, setRecherche] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [faite, setFaite] = useState<number | null>(null);

  const parId = useMemo(() => new Map((pieces ?? []).map((piece) => [piece.id, piece])), [pieces]);
  const resultats = useMemo(() => {
    if (!recherche.trim() || pieces === null) return [];
    return filtrerPieces(pieces, new Map(), { recherche, stock: "tout", categorie: "", archivees: false })
      .sort(comparerPieces)
      .slice(0, 8);
  }, [pieces, recherche]);

  const pret = pieces !== null;
  const totalUnites = totalUnitesRecues(saisie);

  function ajouter(piece: Piece) {
    setErreur(null);
    setFaite(null);
    setSaisie((actuel) => ajouterAReception(actuel, piece));
    setRecherche("");
  }

  function enregistrer() {
    if (session.statut !== "connecte" || !surUneBoutique || !boutiqueId || pieces === null) return;
    setFaite(null);
    const probleme = validerReception(saisie, parId);
    if (probleme) {
      setErreur(probleme);
      return;
    }
    setErreur(null);
    const unites = totalUnitesRecues(saisie);
    const { enregistre } = enregistrerReception(saisie, parId, boutiqueId, {
      uid: session.utilisateur.uid,
      nom: session.utilisateur.nom,
    });
    enregistre.catch((cause) => setErreur(messageErreurPiece(cause)));
    setFaite(unites);
    setSaisie(RECEPTION_VIDE);
    setRecherche("");
  }

  if (!surUneBoutique) {
    return (
      <SansBoutique
        titre="Faire entrer un arrivage"
        sansBoutiqueDeclaree="Un stock entre dans une boutique précise. Choisissez-en une dans le bandeau, en haut de l’écran."
      />
    );
  }

  return (
    <div>
      <TetePage
        retour={{ href: "/pieces", libelle: "Catalogue" }}
        titre="Faire entrer un arrivage"
      />

      {faite !== null && (
        <div role="status" className="mt-6 cadre p-4 max-w-[46rem]">
          <p className="font-medium text-encre">
            Arrivage enregistré — {formaterNombre(faite)} unité{faite > 1 ? "s" : ""} entrée
            {faite > 1 ? "s" : ""}.
          </p>
          <p className="mt-1 text-corps text-encre-doux">
            Le stock est déjà à jour sur cet appareil. Si le réseau manque, l’arrivage partira seul.
          </p>
          <Link href="/pieces" className="mt-4 inline-flex bouton bouton-neutre">
            Voir le catalogue
          </Link>
        </div>
      )}

      <div className="mt-6 max-w-[46rem]">
        <fieldset className="cadre p-4">
          <legend className="px-1 font-semibold text-encre">Les pièces reçues</legend>
          <div className="mt-2">
            <Champ
              id="chercher-piece-reception"
              libelle="Chercher une pièce"
            >
              <input
                id="chercher-piece-reception"
                type="search"
                autoComplete="off"
                value={recherche}
                onChange={(evenement) => setRecherche(evenement.target.value)}
                className="saisie"
              />
            </Champ>

            {recherche.trim() && (
              <ul className="mt-3 cadre cadre-liste">
                {!pret ? (
                  <li className="px-4 py-3 text-corps text-encre-doux">Lecture du catalogue…</li>
                ) : resultats.length === 0 ? (
                  <li className="px-4 py-3 text-corps text-encre-doux">Aucune pièce ne correspond.</li>
                ) : (
                  resultats.map((piece) => (
                    <li key={piece.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-encre">
                          <span className="plaque-code">{piece.reference}</span> {piece.designation}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => ajouter(piece)}
                        className="bouton bouton-neutre shrink-0"
                      >
                        <Plus aria-hidden="true" className="size-4" />
                        Ajouter
                      </button>
                    </li>
                  ))
                )}
              </ul>
            )}

            <div className="mt-5">
              <h2 className="text-sm font-semibold tracking-wide text-encre-doux uppercase">
                L’arrivage
              </h2>
              {saisie.lignes.length === 0 ? (
                <p className="mt-3 text-corps text-encre-doux">
                  Rien encore. Cherchez une pièce ci-dessus pour commencer l’arrivage.
                </p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {saisie.lignes.map((ligne) => {
                    const piece = parId.get(ligne.pieceId);
                    return (
                      <li key={ligne.pieceId} className="cadre p-3">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="font-medium text-encre">
                            <span className="plaque-code">{piece?.reference}</span>{" "}
                            {piece?.designation}
                          </span>
                          <button
                            type="button"
                            onClick={() => setSaisie((actuel) => retirerDeReception(actuel, ligne.pieceId))}
                            className="inline-flex h-11 items-center gap-2 rounded-plaque border border-bord px-3 text-sm font-medium text-encre hover:bg-fond"
                          >
                            <Trash2 aria-hidden="true" className="size-4" />
                            Retirer
                          </button>
                        </div>
                        <ChampsReception
                          ligne={ligne}
                          changer={(partie) =>
                            setSaisie((actuel) => ({
                              ...actuel,
                              lignes: actuel.lignes.map((l) =>
                                l.pieceId === ligne.pieceId ? { ...l, ...partie } : l,
                              ),
                            }))
                          }
                        />
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </fieldset>

        <fieldset className="mt-6 cadre p-4">
          <legend className="px-1 font-semibold text-encre">L’arrivage</legend>
          <Champ
            id="note-reception"
            libelle="Note"
            facultatif
          >
            <input
              id="note-reception"
              maxLength={120}
              value={saisie.note}
              placeholder="Arrivage, bon de livraison…"
              onChange={(evenement) =>
                setSaisie((actuel) => ({ ...actuel, note: evenement.target.value }))
              }
              className="saisie"
            />
          </Champ>
          <p className="mt-4 flex items-baseline justify-between gap-4 border-t border-bord pt-3">
            <span className="font-medium text-encre">Total reçu</span>
            <span className="text-ecran font-bold tracking-tight text-encre">
              {formaterNombre(totalUnites)} unité{totalUnites > 1 ? "s" : ""}
            </span>
          </p>
        </fieldset>

        <EtatErreurSaisie message={erreur} className="mt-3" />
        <button
          type="button"
          onClick={enregistrer}
          disabled={!pret || saisie.lignes.length === 0}
          className="mt-3 bouton bouton-principal"
        >
          {!pret ? "Lecture du catalogue…" : "Enregistrer l’arrivage"}
        </button>
      </div>
    </div>
  );
}
