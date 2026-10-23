"use client";

import { Plus } from "lucide-react";
import { useCallback, useState } from "react";

import { GardeEspace } from "@/components/GardeSession";
import {
  NouveauDossierModale,
  RemiseModale,
  RetourModale,
} from "@/components/GestesDossierCarteGrise";
import { Avis } from "@/components/patrons/Avis";
import {
  ErreurDeLecture,
  EtatChargement,
  EtatSansResultat,
} from "@/components/patrons/Etats";
import { Onglets } from "@/components/patrons/Onglets";
import { TetePage } from "@/components/patrons/Page";
import { Tableau, type Colonne } from "@/components/patrons/Tableau";
import { useSession } from "@/lib/auth/session";
import {
  LIBELLE_STATUT_CARTE_GRISE,
  rangerDossiers,
  type DossierCarteGrise,
} from "@/lib/domain/dossier-carte-grise";
import { formaterDateCourte, formaterMontant } from "@/lib/domain/format";
import { usePerimetre } from "@/lib/perimetre/perimetre";
import { useAbonnement } from "@/lib/repositories/abonnement";
import { ecouterDossiersCarteGrise } from "@/lib/repositories/dossiers-carte-grise";

/**
 * Les dossiers de carte grise (S59).
 *
 * L'écran de celle qui ne fait que ça. Elle y voit les papiers de **toutes** les
 * boutiques, en ouvre un pour une moto qui n'a pas été vendue ici, inscrit le
 * numéro d'immatriculation au retour, et note qui est venu chercher.
 *
 * **Pourquoi cet écran plutôt que la file des dossiers motos.** Celle-ci vit
 * sous `/motos/`, derrière la garde de l'espace motos : une boutique « Carte
 * grise et plaque » s'y verrait refuser l'entrée. Les deux coexistent le temps
 * que la migration passe — rien n'est supprimé, et un écran vide valait moins
 * qu'un écran juste.
 *
 * **Il tient à plusieurs centaines de lignes, et c'est une contrainte relevée
 * sur le fichier du client** : presque un an entre le dépôt et le retrait. Ce
 * n'est pas une file qu'on vide dans la semaine, donc « en retard » au sens de
 * S53 n'est pas le signal principal. L'ordre fait le travail : ce qui n'est pas
 * encore parti vient en tête, puis du plus ancien dépôt.
 */
export default function PageDossiersCarteGrise() {
  return (
    <GardeEspace espace="cartes_grises">
      <Ecran />
    </GardeEspace>
  );
}

type Panneau = "cours" | "historique";

function Ecran() {
  const session = useSession();
  const { perimetre } = usePerimetre();
  const [panneau, setPanneau] = useState<Panneau>("cours");
  const [creation, setCreation] = useState(false);

  /**
   * **Toute l'entreprise dès que le périmètre porte le métier.** C'est ce que
   * le métier veut dire : elle traite les papiers de l'entreprise, pas ceux
   * d'un magasin. Une boutique motos, elle, ne voit que les siens.
   *
   * Les règles tranchent pour de bon (D27) ; ici on ne fait que poser la
   * question la plus large que le compte ait le droit de poser.
   */
  const traiteTout = perimetre.metiers.includes("cartes_grises");
  const portee = traiteTout ? null : perimetre.boutiqueId;

  const { valeur, erreur, echec, reessayer } = useAbonnement<DossierCarteGrise[]>(
    useCallback(
      (auChangement, enErreur) => ecouterDossiersCarteGrise(portee, auChangement, enErreur),
      [portee],
    ),
    "Les dossiers n’ont pas pu être lus.",
  );

  if (session.statut !== "connecte") return null;
  const auteur = { uid: session.utilisateur.uid, nom: session.utilisateur.nom };

  const { cours, termines } = rangerDossiers(valeur ?? []);

  /* Un dossier extérieur appartient à la boutique des cartes grises : sans
     boutique choisie, il n'y a pas de propriétaire à lui donner. */
  const boutiqueId = perimetre.boutiqueId;

  return (
    <div>
      <TetePage
        titre="Dossiers"
        sousTitre="Les cartes grises et les plaques, de la demande à la remise."
        actions={
          boutiqueId !== null ? (
            <button
              type="button"
              onClick={() => setCreation(true)}
              className="bouton bouton-principal"
            >
              <Plus aria-hidden="true" className="size-4" />
              Nouveau dossier
            </button>
          ) : undefined
        }
      />

      {boutiqueId === null && (
        <Avis ton="transit" titre="Choisissez une boutique pour ouvrir un dossier">
          Un dossier venu du dehors appartient à une boutique — celle qui en répond. La liste,
          elle, montre déjà tout ce que vous avez le droit de voir.
        </Avis>
      )}

      {/* **La liste entière manque, et l'écran n'a plus rien à montrer.** Un
          bandeau au-dessus d'un tableau vide laisserait croire qu'il n'y a
          aucun dossier — ce qui est la pire des deux réponses possibles ici. */}
      {erreur !== null ? (
        <ErreurDeLecture
          titre="Les dossiers n’ont pas pu être lus"
          echec={echec}
          reessayer={reessayer}
          sortie={{ href: "/prestataires", libelle: "Voir les prestataires" }}
        >
          Sans cette lecture, impossible de dire ce qui est dehors ni chez qui. La liste des
          prestataires, elle, reste consultable.
        </ErreurDeLecture>
      ) : (
      <Onglets
        className="mt-6"
        libelle="Les dossiers"
        valeur={panneau}
        changer={setPanneau}
        onglets={[
          {
            valeur: "cours",
            libelle: `En cours${cours.length > 0 ? ` (${cours.length})` : ""}`,
            contenu: (
              <Liste
                dossiers={cours}
                chargement={valeur === null}
                vide="Aucun dossier en cours. Tout ce qui est parti est revenu et a été remis."
                auteur={auteur}
              />
            ),
          },
          {
            valeur: "historique",
            libelle: "Terminés",
            contenu: (
              <Liste
                dossiers={termines}
                chargement={valeur === null}
                vide="Rien de terminé pour l’instant."
                auteur={auteur}
              />
            ),
          },
        ]}
      />
      )}

      {creation && boutiqueId !== null && (
        <NouveauDossierModale
          boutiqueId={boutiqueId}
          auteur={auteur}
          onFermer={() => setCreation(false)}
        />
      )}
    </div>
  );
}

function Liste({
  dossiers,
  chargement,
  vide,
  auteur,
}: {
  dossiers: DossierCarteGrise[];
  chargement: boolean;
  vide: string;
  auteur: { uid: string; nom: string };
}) {
  /** Un seul geste ouvert à la fois : deux modales empilées font valider la mauvaise. */
  const [geste, setGeste] = useState<{ quoi: "retour" | "remise"; dossier: DossierCarteGrise } | null>(
    null,
  );

  const colonnes: Colonne<DossierCarteGrise>[] = [
    {
      cle: "client",
      titre: "Propriétaire",
      principal: true,
      rendu: (dossier) => (
        <span>
          {dossier.clientNom || "—"}
          {dossier.origine === "exterieur" && (
            /* Dire d'où vient le dossier : un dossier extérieur n'a pas de vente
               à ouvrir derrière, et le chercher serait du temps perdu. */
            <span className="ml-2 text-legende text-encre-doux">de l’extérieur</span>
          )}
        </span>
      ),
    },
    { cle: "moto", titre: "Moto", rendu: (dossier) => dossier.motoLibelle || "—" },
    {
      cle: "chassis",
      titre: "Numéro de châssis",
      titreReplie: "Châssis",
      chiffre: true,
      rendu: (dossier) => dossier.numeroChassis,
    },
    {
      cle: "etat",
      titre: "État",
      rendu: (dossier) => LIBELLE_STATUT_CARTE_GRISE[dossier.statut],
    },
    {
      cle: "chez",
      titre: "Chez qui, depuis quand",
      rendu: (dossier) =>
        dossier.prestataireNom
          ? `${dossier.prestataireNom}${dossier.deposeLe ? ` · ${formaterDateCourte(dossier.deposeLe)}` : ""}`
          : "—",
    },
    {
      cle: "avance",
      titre: "Avance",
      chiffre: true,
      /* Elle ne passe plus par la caisse (arbitrage du 21 octobre 2026) : c'est
         ici et dans l'historique des départs qu'on la retrouve. */
      rendu: (dossier) => (dossier.avance === null ? "—" : formaterMontant(dossier.avance)),
    },
    {
      cle: "immat",
      titre: "Immatriculation",
      chiffre: true,
      rendu: (dossier) => dossier.immatriculation || "—",
    },
    {
      cle: "remis",
      titre: "Remis à",
      rendu: (dossier) =>
        dossier.remisANom
          ? `${dossier.remisANom}${dossier.remisLe ? ` · ${formaterDateCourte(dossier.remisLe)}` : ""}`
          : "—",
    },
    {
      cle: "geste",
      titre: "À faire",
      rendu: (dossier) => {
        if (dossier.statut === "chez_prestataire") {
          return (
            <button
              type="button"
              onClick={() => setGeste({ quoi: "retour", dossier })}
              className="bouton bouton-neutre"
            >
              C’est revenu
            </button>
          );
        }
        if (dossier.statut === "revenu_magasin") {
          return (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setGeste({ quoi: "remise", dossier })}
                className="bouton bouton-principal"
              >
                Remettre
              </button>
              {/* Le numéro se complète après coup : la carte revient parfois
                  avant qu'on l'ait sous la main. */}
              <button
                type="button"
                onClick={() => setGeste({ quoi: "retour", dossier })}
                className="bouton bouton-neutre"
              >
                {dossier.immatriculation ? "Corriger" : "Ajouter le numéro"}
              </button>
            </div>
          );
        }
        return <span className="text-encre-doux">—</span>;
      },
    },
  ];

  if (chargement) {
    return <EtatChargement className="mt-3">Chargement des dossiers…</EtatChargement>;
  }
  if (dossiers.length === 0) {
    return <EtatSansResultat className="mt-3">{vide}</EtatSansResultat>;
  }

  return (
    <>
      <Tableau
        legende="Les dossiers de carte grise, ceux qui n’ont pas encore été confiés d’abord, puis du plus ancien dépôt."
        colonnes={colonnes}
        lignes={dossiers}
        cleDe={(dossier) => dossier.id}
      />

      {geste?.quoi === "retour" && (
        <RetourModale
          dossier={geste.dossier}
          auteur={auteur}
          onFermer={() => setGeste(null)}
        />
      )}
      {geste?.quoi === "remise" && (
        <RemiseModale
          dossier={geste.dossier}
          auteur={auteur}
          onFermer={() => setGeste(null)}
        />
      )}
    </>
  );
}
