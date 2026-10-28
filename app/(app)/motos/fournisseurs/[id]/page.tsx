"use client";

import { Truck } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import { BarreEcoulement } from "@/components/BarreEcoulement";
import {
  ErreurDeLecture,
  EtatChargement,
  SansBoutique,
} from "@/components/patrons/Etats";
import { TetePage, useSurTitre } from "@/components/patrons/Page";
import { Statut } from "@/components/StatutMoto";
import { lotsDuFournisseur, type Arrivage } from "@/lib/domain/arrivage";
import { formaterDateCourte, formaterNombre } from "@/lib/domain/format";
import type { Fournisseur } from "@/lib/domain/fournisseur";
import type { Moto } from "@/lib/domain/moto";
import { usePerimetre } from "@/lib/perimetre/perimetre";
import { useAbonnement } from "@/lib/repositories/abonnement";
import { ecouterArrivages } from "@/lib/repositories/arrivages";
import { useCatalogue } from "@/lib/repositories/catalogue";
import { ecouterFournisseurs } from "@/lib/repositories/fournisseurs";
import { ecouterStock } from "@/lib/repositories/motos";

/**
 * L'historique d'un fournisseur (S50).
 *
 * Demandé en ces mots : « quand on clique sur un fournisseur on atterrit sur
 * l'historique, tous les lots pris avec lui, date, moto ». Un fournisseur
 * n'avait aucune page à lui — son nom n'était qu'une colonne de la liste des
 * arrivages, et rien ne répondait à « qu'est-ce qu'on a pris chez celui-là ».
 *
 * **Aucune règle Firestore n'a été ouverte**, et c'est le point d'architecture.
 * L'écran n'interroge pas « les lots du fournisseur X » : il écoute les
 * arrivages de son périmètre — ceux que les règles laissent déjà lire, la
 * boutique pour un gérant, toutes pour le responsable — et `lotsDuFournisseur`
 * trie en mémoire. Un gérant voit donc ce qu'il a pris chez ce fournisseur
 * *dans sa boutique*, ce qui est la bonne réponse à sa question, et le
 * cloisonnement reste exactement là où il était.
 *
 * Même raison que `periode.ts` pour le tri en mémoire : une requête par
 * fournisseur demanderait un index de plus et un aller-retour réseau, sur un
 * écran qui doit répondre coupure faite (D66).
 */
export default function PageFournisseur() {
  const parametres = useParams<{ id: string }>();
  const fournisseurId = parametres.id;
  const { perimetre } = usePerimetre();
  const surTitre = useSurTitre("Motos");
  const catalogue = useCatalogue();
  const boutiqueId = perimetre.boutiqueId;

  const souscrireArrivages = useCallback(
    (auChangement: (arrivages: Arrivage[]) => void, enErreur: (cause: unknown) => void) =>
      ecouterArrivages(boutiqueId, auChangement, enErreur),
    [boutiqueId],
  );
  const { valeur: arrivages, erreur } = useAbonnement(
    souscrireArrivages,
    "Les arrivages n’ont pas pu être chargés.",
  );

  const souscrireFournisseurs = useCallback(
    (auChangement: (fournisseurs: Fournisseur[]) => void, enErreur: (cause: unknown) => void) =>
      ecouterFournisseurs(auChangement, enErreur),
    [],
  );
  const { valeur: fournisseurs } = useAbonnement(
    souscrireFournisseurs,
    "Les fournisseurs n’ont pas pu être chargés.",
  );

  const souscrireStock = useCallback(
    (auChangement: (motos: Moto[]) => void, enErreur: (cause: unknown) => void) =>
      ecouterStock(boutiqueId, auChangement, enErreur),
    [boutiqueId],
  );
  const { valeur: stock } = useAbonnement(souscrireStock, "Le stock n’a pas pu être chargé.");

  const fournisseur = (fournisseurs ?? []).find((f) => f.id === fournisseurId) ?? null;
  const lots = useMemo(
    () => lotsDuFournisseur(fournisseurId, arrivages ?? [], stock ?? []),
    [fournisseurId, arrivages, stock],
  );

  /* **Le stock n'est pas encore là n'est pas « le lot est vide ».** Les deux
     écoutes ne répondent pas en même temps : les arrivages arrivent d'abord, et
     pendant ce temps chaque lot s'affichait « ne porte aucune moto » avec ses
     compteurs à zéro. C'était faux, et c'est le genre de faux qu'on croit —
     rien à l'écran ne disait que la réponse manquait encore. Vu sur la première
     capture, qui n'a donc pas servi à rien. */
  const chargementStock = stock === null;

  /* Les totaux portent sur les lots **non annulés**, comme `bilanArrivages` :
     un lot annulé reste affiché plus bas parce qu'il fait partie de l'histoire,
     mais le compter ici gonflerait ce qu'on a réellement pris. */
  const vivants = lots.filter((lot) => !lot.arrivage.annule);
  const motosRecues = vivants.reduce((total, lot) => total + lot.ecoulement.total, 0);
  const vendues = vivants.reduce((total, lot) => total + lot.ecoulement.vendues, 0);

  if (perimetre.type === "aucune")
    return (
      <SansBoutique
        titre="Fournisseur"
        sansBoutiqueDeclaree="Aucune boutique n’est déclarée : il n’y a pas encore de lot à retracer."
      />
    );

  return (
    <div>
      <TetePage
        surTitre={surTitre}
        retour={{ href: "/motos/arrivages", libelle: "Arrivages" }}
        titre={fournisseur?.nom ?? "Fournisseur"}
      />

      {erreur ? (
        <ErreurDeLecture
          titre="Les lots de ce fournisseur n’ont pas pu être lus"
          sortie={{ href: "/motos/arrivages", libelle: "Revenir aux arrivages" }}
        >
          {erreur}
        </ErreurDeLecture>
      ) : arrivages === null ? (
        /* **Trois états, et non deux.** « Les lots n'ont pas encore été lus » ne
           se confond pas avec « ce fournisseur n'a aucun lot » : la première
           capture affichait fièrement « 0 lot pris » sur une page qui attendait
           encore sa réponse. Un zéro est une affirmation ; tant qu'on ne sait
           pas, on le dit (même principe que D82). */
        <EtatChargement>Lecture des lots de ce fournisseur…</EtatChargement>
      ) : lots.length === 0 ? (
        null
      ) : (
        <>
          <div className="mb-5 cadre p-4 sm:p-5">
            <dl className="grid gap-4 sm:grid-cols-3">
              <Compteur nom="Lots pris" valeur={vivants.length} />
              <Compteur nom="Motos reçues" valeur={motosRecues} enAttente={chargementStock} />
              <Compteur nom="Déjà vendues" valeur={vendues} enAttente={chargementStock} />
            </dl>
          </div>

          <ul className="grid gap-4">
            {lots.map((lot) => (
              <li key={lot.arrivage.id} className="cadre p-4 sm:p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h2 className="text-bloc font-bold tracking-tight text-encre">
                    {lot.arrivage.nom}
                    {lot.arrivage.annule && (
                      <span className="ml-2 pastille pastille-retard">Annulé</span>
                    )}
                  </h2>
                  <p className="text-corps text-encre-doux">
                    {/* Un lot sans date vient d'être saisi hors ligne : il n'a
                        pas encore l'horodatage du serveur. Le dire, plutôt que
                        d'afficher un tiret qu'on lirait comme une date perdue. */}
                    {lot.arrivage.date
                      ? formaterDateCourte(lot.arrivage.date)
                      : "Date en attente de synchronisation"}
                  </p>
                </div>

                {lot.arrivage.description && (
                  <p className="mt-1 max-w-prose text-corps text-encre-doux">
                    {lot.arrivage.description}
                  </p>
                )}

                {!chargementStock && (
                  <div className="mt-3 max-w-md">
                    <BarreEcoulement compte={lot.ecoulement} />
                  </div>
                )}

                {chargementStock ? (
                  <p className="mt-3 text-corps text-encre-doux">Chargement des motos…</p>
                ) : lot.motos.length === 0 ? (
                  <p className="mt-3 text-corps text-encre-doux">
                    Ce lot ne porte aucune moto.
                  </p>
                ) : (
                  <ul className="mt-3 grid gap-1">
                    {lot.motos.map((moto) => (
                      <li
                        key={moto.id}
                        className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-bord py-1 last:border-b-0"
                      >
                        <span className="font-code text-corps text-encre">
                          {moto.numeroChassis}
                        </span>
                        <span className="text-corps text-encre-doux">
                          {/* `nomModele` rend la chaîne vide quand le modèle
                              n'a pas été saisi (D105) : le `trim` évite
                              l'espace orphelin derrière la marque. */}
                          {`${catalogue.nomMarque(moto.marqueId)} ${catalogue.nomModele(moto.modeleId)}`.trim()}
                        </span>
                        <Statut statut={moto.statut} />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function Compteur({
  nom,
  valeur,
  enAttente = false,
}: {
  nom: string;
  valeur: number;
  /* Un tiret plutôt qu'un zéro tant que la réponse n'est pas là : zéro est une
     affirmation, et elle serait fausse (même principe que D82). */
  enAttente?: boolean;
}) {
  return (
    <div>
      <dt className="text-legende font-bold tracking-[0.07em] text-encre-doux uppercase">
        <Truck aria-hidden="true" className="mr-1 inline size-3.5" />
        {nom}
      </dt>
      <dd className="mt-1 font-code text-chiffre leading-tight tabular-nums text-encre">
        {enAttente ? "—" : formaterNombre(valeur)}
      </dd>
    </div>
  );
}
