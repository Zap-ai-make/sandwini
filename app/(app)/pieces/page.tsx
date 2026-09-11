"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { GardeEspace } from "@/components/GardeSession";
import { PanneauPiece } from "@/components/PanneauPiece";
import { ErreurDeLecture, EtatVide } from "@/components/patrons/Etats";
import { TetePage, useSurTitre } from "@/components/patrons/Page";
import { Tableau, type Colonne } from "@/components/patrons/Tableau";
import { useSession } from "@/lib/auth/session";
import { formaterMontant, formaterNombre } from "@/lib/domain/format";
import {
  FILTRES_PIECES_VIDES,
  LIBELLE_ETAT_STOCK,
  categoriesEmployees,
  etatStock,
  filtrerPieces,
  stockParPiece,
  type FiltreStock,
  type MouvementPiece,
  type Piece,
} from "@/lib/domain/piece";
import { peut } from "@/lib/domain/roles";
import { usePerimetre } from "@/lib/perimetre/perimetre";
import { useAbonnement } from "@/lib/repositories/abonnement";
import { ecouterCatalogue, ecouterMouvements } from "@/lib/repositories/pieces";

export default function EspacePieces() {
  return (
    <GardeEspace espace="pieces">
      <Catalogue />
    </GardeEspace>
  );
}

/**
 * Le catalogue, et le stock de la boutique qu'on regarde (S20, maquette `c1`).
 *
 * **Deux choses de nature différente sur un seul écran, et c'est voulu.** Le
 * catalogue est commun à l'entreprise — une référence n'appartient à personne.
 * Le stock, lui, est celui de la boutique du bandeau. La colonne « Quantité »
 * change donc quand on change de boutique, et pas les autres.
 *
 * **La quantité se compte, elle ne se lit pas.** Il n'existe aucun document de
 * stock dans ce produit : la colonne est la somme des mouvements de la
 * boutique, calculée ici (D61). C'est ce qui la rend juste hors ligne — un
 * mouvement écrit sans réseau la fait bouger tout de suite, là où un agrégat
 * entretenu par déclencheur aurait attendu le retour du réseau pour dire la
 * vérité.
 *
 * La maquette montre une colonne « Compatible ». Elle ne sera pas reprise : le
 * commanditaire a tranché que l'espace pièces n'a rien à voir avec les motos,
 * chaque métier étant celui d'une boutique (D62).
 */
function Catalogue() {
  const { perimetre } = usePerimetre();
  const session = useSession();
  const surTitre = useSurTitre("Pièces");

  const boutiqueId = perimetre.boutiqueId;
  const sansPerimetre = perimetre.type === "aucune";

  const souscrireCatalogue = useCallback(
    (auChangement: (pieces: Piece[]) => void, enErreur: (cause: unknown) => void) =>
      ecouterCatalogue(auChangement, enErreur),
    [],
  );
  const souscrireMouvements = useCallback(
    (auChangement: (m: MouvementPiece[]) => void, enErreur: (cause: unknown) => void) =>
      sansPerimetre ? () => {} : ecouterMouvements(boutiqueId, auChangement, enErreur),
    [boutiqueId, sansPerimetre],
  );

  const catalogue = useAbonnement(souscrireCatalogue, "Le catalogue n’a pas pu être lu.");
  const journal = useAbonnement(souscrireMouvements, "Les mouvements n’ont pas pu être lus.");

  const [filtres, setFiltres] = useState(FILTRES_PIECES_VIDES);
  const [ouverte, setOuverte] = useState<string | null>(null);

  const pieces = catalogue.valeur;
  const mouvements = journal.valeur;
  const chargement = pieces === null || mouvements === null;

  const quantites = useMemo(() => stockParPiece(mouvements ?? []), [mouvements]);
  const lignes = useMemo(
    () => filtrerPieces(pieces ?? [], quantites, filtres),
    [pieces, quantites, filtres],
  );
  const categories = useMemo(() => categoriesEmployees(pieces ?? []), [pieces]);

  /* **La colonne dit de quoi elle est la quantité.** En périmètre « toutes les
     boutiques », la somme des mouvements est celle de l'entreprise entière — un
     chiffre juste, mais qui n'est pas celui d'une étagère. Le laisser sous un
     simple « Quantité » ferait lire un stock de comptoir là où il y a un total
     d'entreprise. Un nombre juste sous un mauvais nom est un nombre faux. */
  const surUneBoutique = perimetre.type === "boutique";

  const role = session.statut === "connecte" ? session.utilisateur.role : null;
  const tientLeCatalogue = role !== null && peut(role, "gerer_referentiels");

  if (catalogue.echec || journal.echec) {
    return (
      <div>
        <TetePage surTitre={surTitre} titre="Pièces détachées" />
        <ErreurDeLecture
          titre="Le catalogue n’a pas pu être lu"
          echec={catalogue.echec ?? journal.echec}
          reessayer={catalogue.echec ? catalogue.reessayer : journal.reessayer}
        >
          {catalogue.erreur ?? journal.erreur} Sans lui, aucune quantité ne peut être comptée.
        </ErreurDeLecture>
      </div>
    );
  }

  const colonnes: Colonne<Piece>[] = [
    {
      cle: "reference",
      titre: "Référence",
      chiffre: true,
      rendu: (piece) => (
        <button
          type="button"
          onClick={() => setOuverte(ouverte === piece.id ? null : piece.id)}
          aria-expanded={ouverte === piece.id}
          className="plaque-code text-left text-encre underline decoration-bord underline-offset-4 hover:decoration-encre"
        >
          {piece.reference}
        </button>
      ),
    },
    { cle: "designation", titre: "Désignation", principal: true, rendu: (piece) => piece.designation },
    {
      cle: "categorie",
      titre: "Catégorie",
      rendu: (piece) => piece.categorie || <span className="text-encre-doux">—</span>,
    },
    {
      cle: "quantite",
      titre: surUneBoutique ? "Quantité" : "Toutes boutiques",
      titreReplie: surUneBoutique ? "Quantité" : "Quantité, toutes boutiques",
      chiffre: true,
      rendu: (piece) => formaterNombre(quantites.get(piece.id) ?? 0),
    },
    {
      cle: "prix",
      titre: "Prix",
      chiffre: true,
      rendu: (piece) =>
        piece.prixVente === null ? (
          <span className="text-encre-doux">à fixer</span>
        ) : (
          formaterMontant(piece.prixVente)
        ),
    },
    {
      cle: "statut",
      titre: "Statut",
      /* L'etat d'alerte n'a de sens que sur une etagere : un seuil compare a
         un total d'entreprise ne dit rien de ce qui manque a Pouytenga. */
      rendu: (piece) =>
        surUneBoutique ? (
          LIBELLE_ETAT_STOCK[etatStock(quantites.get(piece.id) ?? 0, piece.seuilAlerte)]
        ) : (
          <span className="text-encre-doux">—</span>
        ),
    },
  ];

  const totalActives = (pieces ?? []).filter((piece) => piece.actif).length;
  const pieceOuverte = (pieces ?? []).find((piece) => piece.id === ouverte);

  return (
    <div>
      <TetePage
        surTitre={surTitre}
        titre="Pièces détachées"
        sousTitre={
          surUneBoutique
            ? "Le catalogue est commun à l’entreprise ; les quantités sont celles de cette boutique."
            : "Le catalogue est commun à l’entreprise, et les quantités sont celles de toutes les boutiques réunies. Choisissez-en une pour voir son étagère et y faire bouger le stock."
        }
        actions={
          tientLeCatalogue ? (
            <Link href="/pieces/nouvelle" className="bouton bouton-principal">
              <Plus aria-hidden="true" className="size-4" />
              Nouvelle référence
            </Link>
          ) : undefined
        }
      />

      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 basis-64">
          <label htmlFor="recherche-piece" className="block text-sm font-medium text-encre">
            Chercher une pièce
          </label>
          <input
            id="recherche-piece"
            type="search"
            placeholder="Référence, désignation…"
            value={filtres.recherche}
            onChange={(evenement) =>
              setFiltres((actuels) => ({ ...actuels, recherche: evenement.target.value }))
            }
            className="saisie mt-1.5"
          />
        </div>

        {categories.length > 0 && (
          <div className="basis-48">
            <label htmlFor="categorie-piece" className="block text-sm font-medium text-encre">
              Catégorie
            </label>
            <select
              id="categorie-piece"
              value={filtres.categorie}
              onChange={(evenement) =>
                setFiltres((actuels) => ({ ...actuels, categorie: evenement.target.value }))
              }
              className="saisie mt-1.5"
            >
              <option value="">Toutes</option>
              {categories.map((categorie) => (
                <option key={categorie} value={categorie}>
                  {categorie}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Filtrer le catalogue">
        {(surUneBoutique ? FILTRES_STOCK : FILTRES_STOCK.slice(0, 1)).map(({ cle, libelle }) => (
          <button
            key={cle}
            type="button"
            onClick={() => setFiltres((actuels) => ({ ...actuels, stock: cle }))}
            aria-pressed={filtres.stock === cle}
            className={[
              "inline-flex h-11 items-center rounded-plaque border px-3 text-sm font-medium",
              filtres.stock === cle
                ? "border-2 border-encre bg-papier font-semibold text-encre"
                : "border-bord bg-papier text-encre hover:bg-fond",
            ].join(" ")}
          >
            {libelle}
          </button>
        ))}
        <p className="ml-auto self-center text-sm text-encre-doux">
          <strong className="font-semibold text-encre">{formaterNombre(lignes.length)}</strong> sur{" "}
          {formaterNombre(totalActives)} référence{totalActives > 1 ? "s" : ""}
        </p>
      </div>

      {lignes.length === 0 && !chargement ? (
        <EtatVide
          titre={totalActives === 0 ? "Aucune référence au catalogue" : "Aucune pièce ne correspond"}
          action={
            totalActives === 0 && tientLeCatalogue ? (
              <Link href="/pieces/nouvelle" className="bouton bouton-principal">
                Créer la première référence
              </Link>
            ) : undefined
          }
        >
          {totalActives === 0
            ? "Le catalogue est commun à l’entreprise : une référence créée ici sert à toutes les boutiques."
            : "Changez de filtre, ou cherchez autre chose."}
        </EtatVide>
      ) : (
        <Tableau
          legende="Le catalogue des pièces et les quantités de la boutique"
          colonnes={colonnes}
          lignes={lignes}
          cleDe={(piece) => piece.id}
          chargement={chargement && lignes.length === 0}
          cleActive={ouverte}
          enRetard={(piece) => {
            const etat = etatStock(quantites.get(piece.id) ?? 0, piece.seuilAlerte);
            return etat === "epuise" || etat === "anomalie";
          }}
        />
      )}

      {pieceOuverte && (
        <PanneauPiece
          key={pieceOuverte.id}
          piece={pieceOuverte}
          mouvements={(mouvements ?? []).filter((m) => m.pieceId === pieceOuverte.id)}
          boutiqueId={perimetre.type === "boutique" ? boutiqueId : null}
          fermer={() => setOuverte(null)}
        />
      )}
    </div>
  );
}

const FILTRES_STOCK: { cle: FiltreStock; libelle: string }[] = [
  { cle: "tout", libelle: "Tout" },
  { cle: "bas", libelle: "Stock bas" },
  { cle: "epuise", libelle: "Épuisé" },
];
