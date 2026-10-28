"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { GardeCapacite, GardeEspace } from "@/components/GardeSession";
import { EtatErreurSaisie, SansBoutique } from "@/components/patrons/Etats";
import { TetePage } from "@/components/patrons/Page";
import { ChampsPiece } from "@/components/ChampsPiece";
import { useSession } from "@/lib/auth/session";
import {
  PIECE_VIDE,
  categoriesEmployees,
  referenceDejaPrise,
  validerPiece,
  type Piece,
  type SaisiePiece,
} from "@/lib/domain/piece";
import { usePerimetre } from "@/lib/perimetre/perimetre";
import { useAbonnement } from "@/lib/repositories/abonnement";
import { creerPiece, ecouterCatalogue, messageErreurPiece } from "@/lib/repositories/pieces";

export default function PageNouvellePiece() {
  return (
    <GardeEspace espace="pieces">
      {/* **Le gérant tient ce catalogue, et c'est un renversement.** Il
          appartenait au responsable, parce qu'une référence porte un prix et
          que les prix appartenaient à la supervision (S20, réponse 4). Le
          commanditaire a tranché l'inverse pour les pièces : « le responsable
          ne fera que superviser, rien d'autre — donc tout est fait par le
          gérant ». D'où `gerer_pieces`, la seule capacité qu'un gérant porte.

          Les marques et les modèles de motos, eux, restent sous
          `gerer_referentiels` : une marque est un mot du vocabulaire commun,
          une référence de pièce est un article d'une boutique. */}
      <GardeCapacite capacite="gerer_pieces">
        <NouvellePiece />
      </GardeCapacite>
    </GardeEspace>
  );
}

/**
 * Créer une référence.
 *
 * **La catégorie est un champ libre à suggestions**, et c'est la réponse du
 * commanditaire : « le client doit avoir le choix de déclarer comme il veut, ce
 * qu'il veut ». Il n'y a donc aucun écran de paramétrage des catégories, et
 * aucune collection pour les tenir — ce que `prompt.md` §14 prévoyait. Une
 * catégorie naît d'un usage. Ce qui a déjà servi se propose dans la liste ;
 * rien ne s'impose (D90).
 *
 * **Le seuil d'alerte est ici plutôt qu'ailleurs** parce qu'il décrit la
 * référence, pas la boutique : une plaquette de frein se réapprovisionne au
 * même rythme partout. S'il doit varier par boutique un jour, ce sera une
 * décision à prendre, pas un oubli à rattraper.
 */
function NouvellePiece() {
  const session = useSession();
  /* Une référence naît dans une boutique : c'est le périmètre courant qui la
     désigne, jamais un champ du formulaire. Un gérant n'a qu'une boutique, et
     un responsable posé sur « toutes les boutiques » n'en désigne aucune — on
     le lui dit plutôt que d'en choisir une pour lui. */
  const { perimetre } = usePerimetre();
  const boutiqueId = perimetre.boutiqueId;
  const surUneBoutique = perimetre.type === "boutique";

  const souscrire = useCallback(
    (auChangement: (pieces: Piece[]) => void, enErreur: (cause: unknown) => void) =>
      ecouterCatalogue(boutiqueId, auChangement, enErreur),
    [boutiqueId],
  );
  const { valeur: catalogue } = useAbonnement(souscrire, "Le catalogue n’a pas pu être lu.");

  const [saisie, setSaisie] = useState<SaisiePiece>(PIECE_VIDE);
  const [erreur, setErreur] = useState<string | null>(null);
  const [creee, setCreee] = useState<string | null>(null);

  const categories = useMemo(() => categoriesEmployees(catalogue ?? []), [catalogue]);
  const changer = (partie: Partial<SaisiePiece>) =>
    setSaisie((actuel) => ({ ...actuel, ...partie }));

  function soumettre(evenement: React.FormEvent) {
    evenement.preventDefault();
    if (session.statut !== "connecte" || !boutiqueId) return;
    setCreee(null);

    const probleme = validerPiece(saisie);
    if (probleme) {
      setErreur(probleme);
      return;
    }

    /* **Un catalogue pas encore lu n'est pas un catalogue vide.** `catalogue`
       vaut `null` tant que la première réponse de l'écoute n'est pas arrivée.
       Le remplacer ici par une liste vide ferait répondre « aucun doublon » à
       une question qu'on n'a pas encore posée — et la référence se créerait
       deux fois. C'est D82 vu du côté de l'écriture : une absence de lecture
       n'est pas une réponse, et le contrôle d'unicité est précisément l'endroit
       où s'en contenter produit ce qu'il devait empêcher. */
    if (catalogue === null) {
      setErreur("Le catalogue n’a pas fini d’arriver. Réessayez dans un instant.");
      return;
    }

    /* Deux références identiques couperaient le stock en deux, exactement
       comme la troisième orthographe d'une marque (D90). La comparaison ignore
       casse et accents. */
    const doublon = referenceDejaPrise(saisie.reference, catalogue);
    if (doublon) {
      setErreur(`Cette référence existe déjà : ${doublon.reference} — ${doublon.designation}.`);
      return;
    }

    setErreur(null);
    const { enregistre } = creerPiece(saisie, boutiqueId, {
      uid: session.utilisateur.uid,
      nom: session.utilisateur.nom,
    });
    enregistre.catch((cause) => setErreur(messageErreurPiece(cause)));

    setCreee(`${saisie.reference.trim().toUpperCase()} — ${saisie.designation.trim()}`);
    setSaisie(PIECE_VIDE);
  }

  /* Après les crochets, jamais avant : React exige le même nombre d'appels à
     chaque rendu. Même montage que l'écran de vente de pièces. */
  if (!surUneBoutique) {
    return (
      <SansBoutique
        titre="Nouvelle référence"
        sansBoutiqueDeclaree="Une référence appartient à une boutique. Choisissez-en une dans le bandeau, en haut de l’écran."
      />
    );
  }

  return (
    <div>
      <TetePage
        retour={{ href: "/pieces", libelle: "Catalogue" }}
        titre="Nouvelle référence"
      />

      {creee && (
        <div role="status" className="mb-6 cadre p-4 max-w-[40rem]">
          <p className="font-medium text-encre">Référence créée — {creee}</p>
          <p className="mt-1 text-sm text-encre-doux">
            Elle n’a encore aucun stock : une quantité est la somme des mouvements. Faites entrer un
            lot depuis le catalogue.
          </p>
          <Link href="/pieces" className="mt-4 inline-flex bouton bouton-neutre">
            Retour au catalogue
          </Link>
        </div>
      )}

      <form onSubmit={soumettre} className="colonne-formulaire max-w-[40rem]" noValidate>
        <ChampsPiece saisie={saisie} changer={changer} categories={categories} />

        <EtatErreurSaisie message={erreur} className="mt-3" />

        {/* Le bouton dit l'état du contrôle d'unicité, au lieu de laisser
            croire qu'il est prêt. Sans le catalogue, cet écran ne sait pas si
            la référence est libre ; l'annoncer coûte une seconde, le taire
            coûte une référence en double. */}
        <button type="submit" disabled={catalogue === null} className="mt-3 bouton bouton-principal">
          {catalogue === null ? "Lecture du catalogue…" : "Créer la référence"}
        </button>
      </form>
    </div>
  );
}
