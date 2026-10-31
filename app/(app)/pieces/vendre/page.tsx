"use client";

import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { GardeEspace } from "@/components/GardeSession";
import { Champ } from "@/components/patrons/Champ";
import { EtatErreurSaisie, SansBoutique } from "@/components/patrons/Etats";
import { TetePage } from "@/components/patrons/Page";
import { useSession } from "@/lib/auth/session";
import { formaterMontant } from "@/lib/domain/format";
import {
  comparerPieces,
  filtrerPieces,
  stockParPiece,
  type MouvementPiece,
  type Piece,
} from "@/lib/domain/piece";
import {
  ajouterAuPanier,
  changerLigne,
  LIGNES_MAX,
  MESSAGE_REFUS,
  PANIER_VIDE,
  refusAjout,
  retirerDuPanier,
  totalLigne,
  totalPanier,
  validerPanier,
  type RefusAjout,
} from "@/lib/domain/vente-piece";
import { usePerimetre } from "@/lib/perimetre/perimetre";
import { useAbonnement } from "@/lib/repositories/abonnement";
import { ecouterCatalogue, ecouterMouvements } from "@/lib/repositories/pieces";
import { ecouterVentes } from "@/lib/repositories/ventes";
import {
  ecouterVentesPieces,
  enregistrerVentePiece,
  messageErreurVentePiece,
} from "@/lib/repositories/ventes-pieces";
import type { Vente } from "@/lib/domain/vente";
import type { VentePiece } from "@/lib/domain/vente-piece";
import { numeroLisible } from "@/lib/domain/numerotation";

/**
 * Le libellé du lien de réparation, quand le refus s'en répare un (D90).
 *
 * Absent pour les refus qui se lèvent sur place — changer une quantité,
 * encaisser le panier en cours : y mettre un lien enverrait ailleurs quelqu'un
 * qui n'a rien à y faire.
 */
const REPARATION: Partial<Record<RefusAjout, string>> = {
  sans_prix: "Fixer le prix",
  epuise: "Faire entrer un lot",
  stock_incoherent: "Corriger le stock",
};

/**
 * Vendre des pièces au comptoir (S21).
 *
 * **L'écran d'un geste debout.** On cherche une pièce, on l'ajoute, on ajuste la
 * quantité, on encaisse. Le client est facultatif et vient en dernier, parce
 * qu'au comptoir on prend l'argent avant de demander un nom — et souvent on ne
 * le demande pas.
 *
 * **Le refus propose la réparation** (D90). Une pièce sans prix ne se vend pas :
 * l'écran le dit et renvoie au catalogue pour l'y poser. Une pièce épuisée ne se
 * vend pas non plus : l'écran le dit et renvoie à l'entrée de stock. Un refus
 * qui ne dit pas la suite se contourne, et ici il n'y a pas de contournement —
 * c'est l'arbitrage 4, « pas de stock négatif », et il n'a pas de porte dérobée.
 *
 * **Ce n'est délibérément pas un `<form>`**, pour la raison exacte que l'écran
 * de vente de moto énonce déjà (`motos/ventes/nouvelle`). Le premier champ est
 * une recherche, et un formulaire dont le bouton d'envoi est actif valide à la
 * touche Entrée : taper une référence puis Entrée aurait encaissé le panier en
 * cours au lieu d'y ajouter la pièce — stock descendu, recette au journal,
 * numéro brûlé, et une vente qu'on ne peut plus reprendre puisqu'elle est
 * immuable. Perdre la validation au clavier est ici un gain. Les `fieldset`
 * restent : ils groupent et ils nomment, ce qui ne demande aucun formulaire.
 */
export default function PageVendrePieces() {
  return (
    <GardeEspace espace="pieces">
      <VendrePieces />
    </GardeEspace>
  );
}

function VendrePieces() {
  const session = useSession();
  const { perimetre } = usePerimetre();
  const boutiqueId = perimetre.boutiqueId;
  const surUneBoutique = perimetre.type === "boutique";

  const souscrireCatalogue = useCallback(
    (auChangement: (pieces: Piece[]) => void, enErreur: (cause: unknown) => void) =>
      ecouterCatalogue(boutiqueId, auChangement, enErreur),
    [boutiqueId],
  );
  const souscrireMouvements = useCallback(
    (auChangement: (m: MouvementPiece[]) => void, enErreur: (cause: unknown) => void) =>
      surUneBoutique ? ecouterMouvements(boutiqueId, auChangement, enErreur) : () => {},
    [boutiqueId, surUneBoutique],
  );
  /* Les deux collections de pièces comptables, parce que le compteur est partagé
     (Q1) : un numéro dicté au téléphone doit désigner une seule vente. */
  const souscrireVentesMotos = useCallback(
    (auChangement: (v: Vente[]) => void, enErreur: (cause: unknown) => void) =>
      surUneBoutique ? ecouterVentes(boutiqueId, auChangement, enErreur) : () => {},
    [boutiqueId, surUneBoutique],
  );
  const souscrireVentesPieces = useCallback(
    (auChangement: (v: VentePiece[]) => void, enErreur: (cause: unknown) => void) =>
      surUneBoutique ? ecouterVentesPieces(boutiqueId, auChangement, enErreur) : () => {},
    [boutiqueId, surUneBoutique],
  );

  const catalogue = useAbonnement(souscrireCatalogue, "Le catalogue n’a pas pu être lu.");
  const journal = useAbonnement(souscrireMouvements, "Le stock n’a pas pu être lu.");
  const ventesMotos = useAbonnement(souscrireVentesMotos, "Les ventes n’ont pas pu être lues.");
  const ventesPieces = useAbonnement(souscrireVentesPieces, "Les ventes n’ont pas pu être lues.");

  const [panier, setPanier] = useState(PANIER_VIDE);
  const [recherche, setRecherche] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [refus, setRefus] = useState<{ piece: Piece; raison: keyof typeof MESSAGE_REFUS } | null>(
    null,
  );
  const [enregistree, setEnregistree] = useState<{ id: string; numero: string } | null>(null);

  const pieces = catalogue.valeur;
  const mouvements = journal.valeur;

  /* **`null` tant que le stock n'est pas lu**, et jamais une carte vide : une
     vente décidée sur un stock qu'on n'a pas compté est exactement le défaut
     que S40 a fermé ailleurs (D95). */
  const stocks = useMemo(
    () => (mouvements === null ? null : stockParPiece(mouvements)),
    [mouvements],
  );
  const parId = useMemo(() => new Map((pieces ?? []).map((piece) => [piece.id, piece])), [pieces]);

  const resultats = useMemo(() => {
    if (!recherche.trim() || pieces === null) return [];
    return filtrerPieces(pieces, stocks ?? new Map(), {
      recherche,
      stock: "tout",
      categorie: "",
      archivees: false,
    })
      .sort(comparerPieces)
      .slice(0, 8);
  }, [pieces, stocks, recherche]);

  const total = totalPanier(panier.lignes);
  const pret = pieces !== null && stocks !== null;

  function ajouter(piece: Piece) {
    const disponible = stocks?.get(piece.id) ?? 0;
    const raison = refusAjout(piece, disponible, panier.lignes);
    if (raison) {
      setRefus({ piece, raison });
      return;
    }
    setRefus(null);
    setErreur(null);
    setPanier((actuel) => ajouterAuPanier(actuel, piece, disponible));
    setRecherche("");
  }

  function enregistrer() {
    if (session.statut !== "connecte" || !surUneBoutique || !boutiqueId) return;
    setEnregistree(null);
    /* Le refus concernait un ajout ; on encaisse. Quoi qu'il advienne ensuite,
       le laisser à l'écran le collerait soit à une erreur de validation qu'il
       n'explique pas, soit à la confirmation « Vente enregistrée ». */
    setRefus(null);

    const probleme = validerPanier(panier, parId, stocks);
    if (probleme) {
      setErreur(probleme);
      return;
    }
    /* Les numéros connus ne sont pas une commodité d'affichage : sans eux, un
       appareil neuf repart de 1 et entre en collision avec le mois écoulé. Les
       deux listes doivent donc être arrivées. */
    if (ventesMotos.valeur === null || ventesPieces.valeur === null) {
      setErreur("Les numéros de vente n’ont pas fini d’arriver. Réessayez dans un instant.");
      return;
    }

    setErreur(null);
    const { id, numero, enregistre } = enregistrerVentePiece(
      panier,
      parId,
      {
        boutique: { boutiqueId, code: perimetre.code },
        numerosConnus: [
          ...ventesMotos.valeur.flatMap((vente) => [vente.numero, vente.numeroInitial]),
          ...ventesPieces.valeur.map((vente) => vente.numero),
        ],
        nomClient: panier.nomClient.trim(),
      },
      { uid: session.utilisateur.uid, nom: session.utilisateur.nom },
    );
    enregistre.catch((cause) => setErreur(messageErreurVentePiece(cause)));

    setEnregistree({ id, numero });
    setPanier(PANIER_VIDE);
    setRecherche("");
  }

  if (!surUneBoutique) {
    return (
      <SansBoutique
        titre="Vendre des pièces"
        sansBoutiqueDeclaree="Une vente sort d’un stock précis. Choisissez une boutique dans le bandeau, en haut de l’écran."
      />
    );
  }

  return (
    <div>
      <TetePage
        retour={{ href: "/pieces", libelle: "Catalogue" }}
        titre="Vendre des pièces"
      />

      {enregistree && (
        <div role="status" className="mt-6 cadre p-4 max-w-[46rem]">
          <p className="font-medium text-encre">
            Vente enregistrée — <span className="plaque-code">n° {numeroLisible(enregistree.numero)}</span>
          </p>
          {/* Le reçu existe enfin (S64) : il s'ouvre dans l'historique, d'où il
              s'imprime et se partage. Le reçu est consultable tout de suite,
              même hors ligne — le numéro et la vente existent dès la saisie
              (D76), avant même que l'écriture soit partie. */}
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href={`/pieces/ventes?vente=${enregistree.id}`} className="bouton bouton-principal">
              Voir le reçu
            </Link>
            <Link href="/pieces" className="bouton bouton-neutre">
              Retour au catalogue
            </Link>
          </div>
        </div>
      )}

      <div className="mt-4 max-w-[46rem]">
        <fieldset className="cadre p-3">
          <legend className="px-1 font-semibold text-encre">Les pièces</legend>

          <div className="mt-2">
            <Champ id="chercher-piece" libelle="Chercher une pièce" large>
              <input
                id="chercher-piece"
                type="search"
                autoComplete="off"
                value={recherche}
                onChange={(evenement) => {
                  setRecherche(evenement.target.value);
                  /* Le refus portait sur la pièce qu'on vient de quitter. Le
                     garder sous une autre recherche le ferait lire comme le
                     verdict de celle-ci. */
                  setRefus(null);
                }}
                className="saisie"
              />
            </Champ>

            {recherche.trim() && (
              <ul className="mt-3 cadre cadre-liste">
                {!pret ? (
                  <li className="px-4 py-3 text-corps text-encre-doux">Lecture du stock…</li>
                ) : resultats.length === 0 ? (
                  <li className="px-4 py-3 text-corps text-encre-doux">
                    Aucune pièce ne correspond.
                  </li>
                ) : (
                  resultats.map((piece) => {
                    const disponible = stocks?.get(piece.id) ?? 0;
                    return (
                      <li key={piece.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium text-encre">
                            <span className="plaque-code">{piece.reference}</span> {piece.designation}
                          </span>
                          <span className="block text-corps text-encre-doux">
                            {disponible > 0 ? `${disponible} en stock` : "Épuisé"}
                            {piece.prixVente !== null
                              ? ` · ${formaterMontant(piece.prixVente)}`
                              : " · prix à fixer"}
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
                    );
                  })
                )}
              </ul>
            )}

            {/* Le refus dit sa raison **et** où la lever : sans cela, le gérant
                se retrouve devant un « non » sans suite, et cherche une porte
                dérobée qui n'existe pas (D90). */}
            {refus && (
              <div role="alert" className="mt-3 cadre p-4">
                <p className="font-medium text-alerte">
                  {refus.piece.reference} — {MESSAGE_REFUS[refus.raison]}
                </p>
                {refus.raison === "sans_prix" && (
                  <p className="mt-1 text-corps text-encre-doux">
                    Un prix se pose au catalogue, et la pièce devient vendable aussitôt.
                  </p>
                )}
                {refus.raison === "epuise" && (
                  <p className="mt-1 text-corps text-encre-doux">
                    Faites entrer le carton depuis le catalogue, et revenez : la vente passera.
                  </p>
                )}
                {refus.raison === "stock_incoherent" && (
                  <p className="mt-1 text-corps text-encre-doux">
                    Le compte des mouvements est descendu sous zéro : une entrée a été oubliée, ou
                    annulée après des sorties. Saisissez-la, et la vente passera.
                  </p>
                )}
                {refus.raison === "panier_plein" && (
                  <p className="mt-1 text-corps text-encre-doux">
                    Encaissez ce panier, puis ouvrez-en un second pour la suite.
                  </p>
                )}
                {REPARATION[refus.raison] && (
                  <Link
                    /* « Fixer le prix » mène droit à l'écran qui le pose (S63) ;
                       « Faire entrer un lot » et « Corriger le stock » passent
                       par le panneau du catalogue, où vit le geste d'entrée. */
                    href={
                      refus.raison === "sans_prix"
                        ? `/pieces/${refus.piece.id}/modifier`
                        : `/pieces?piece=${refus.piece.id}`
                    }
                    className="bouton bouton-neutre mt-3"
                  >
                    {REPARATION[refus.raison]}
                  </Link>
                )}
              </div>
            )}
          </div>

          <div className="mt-4">
            <h2 className="text-sm font-semibold tracking-wide text-encre-doux uppercase">
              Le panier
            </h2>
            {panier.lignes.length === 0 ? (
              null
            ) : (
              <ul className="mt-3 space-y-3">
                {panier.lignes.map((ligne) => {
                  const piece = parId.get(ligne.pieceId);
                  const sousTotal = totalLigne(ligne);
                  /* Calculé une fois : l'aide et son `aria-describedby` doivent
                     apparaître et disparaître ensemble, sinon l'input désigne
                     un paragraphe qui n'existe pas. */
                  return (
                    <li key={ligne.pieceId} className="cadre p-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="font-medium text-encre">
                          <span className="plaque-code">{piece?.reference}</span>{" "}
                          {piece?.designation}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setPanier((actuel) => retirerDuPanier(actuel, ligne.pieceId));
                            /* Retirer une ligne lève « déjà au panier » comme
                               « panier complet » : le refus affiché peut ne plus
                               être vrai. */
                            setRefus(null);
                          }}
                          className="inline-flex h-11 items-center gap-2 rounded-plaque border border-bord px-3 text-sm font-medium text-encre hover:bg-fond"
                        >
                          <Trash2 aria-hidden="true" className="size-4" />
                          Retirer
                        </button>
                      </div>

                      <div className="mt-3 grid gap-3 sm:grid-cols-[8rem_10rem_minmax(0,1fr)] sm:items-end">
                        <Champ id={`q-${ligne.pieceId}`} libelle="Quantité">
                          <input
                            id={`q-${ligne.pieceId}`}
                            inputMode="numeric"
                            value={ligne.quantite}
                            onChange={(evenement) =>
                              setPanier((actuel) =>
                                changerLigne(actuel, ligne.pieceId, {
                                  quantite: evenement.target.value,
                                }),
                              )
                            }
                            className="saisie"
                          />
                        </Champ>
                        <Champ id={`p-${ligne.pieceId}`} libelle="Prix unitaire">
                          <input
                            id={`p-${ligne.pieceId}`}
                            inputMode="numeric"
                            value={ligne.prixUnitaire}
                            onChange={(evenement) =>
                              setPanier((actuel) =>
                                changerLigne(actuel, ligne.pieceId, {
                                  prixUnitaire: evenement.target.value,
                                }),
                              )
                            }
                            className="saisie"
                          />
                        </Champ>
                        <p className="text-right text-corps font-semibold text-encre sm:pb-3">
                          {sousTotal === null ? "—" : formaterMontant(sousTotal)}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {panier.lignes.length >= LIGNES_MAX && (
              <p className="mt-2 text-corps text-encre-doux">
                Vingt lignes au plus : au-delà, ce n’est plus une vente au comptoir.
              </p>
            )}
          </div>

          {/* Un seul formulaire : le nom du client et le total vivent avec le
              panier, pas dans un second cadre. Le nom se tape à la main, en
              dernier et facultatif — au comptoir on prend l'argent avant de
              demander un nom, et souvent on ne le demande pas (§9). Le
              commanditaire ne veut « que le nom », sans fiche ni compte, et plus
              de choix de moyen de paiement : une vente de pièces est payée
              comptant. */}
          <div className="mt-4 border-t border-bord pt-3">
            <Champ id="client" libelle="Nom du client" facultatif>
              <input
                id="client"
                type="text"
                autoComplete="off"
                value={panier.nomClient}
                onChange={(evenement) =>
                  setPanier((actuel) => ({ ...actuel, nomClient: evenement.target.value }))
                }
                className="saisie"
              />
            </Champ>

            <p className="mt-3 flex items-baseline justify-between gap-4">
              <span className="font-medium text-encre">Total à encaisser</span>
              <span className="text-ecran font-bold tracking-tight text-encre">
                {formaterMontant(total)}
              </span>
            </p>
          </div>
        </fieldset>

        <EtatErreurSaisie message={erreur} className="mt-2" />

        {/* Le bouton dit ce qui manque plutôt que de laisser cliquer dans le
            vide : sans le stock, cet écran ne sait pas si la vente est
            possible, et l'annoncer coûte une seconde (D96). */}
        <button
          type="button"
          onClick={enregistrer}
          disabled={!pret || panier.lignes.length === 0}
          className="mt-2 bouton bouton-principal"
        >
          {!pret ? "Lecture du stock…" : "Encaisser et enregistrer"}
        </button>
      </div>
    </div>
  );
}
