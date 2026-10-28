"use client";

import { Wallet } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { JournalCaisse } from "@/components/JournalCaisse";
import { ResumeCaisse } from "@/components/ResumeCaisse";
import { ErreurDeLecture, EtatChargement, SansBoutique } from "@/components/patrons/Etats";
import { TetePage } from "@/components/patrons/Page";
import { FiltrePeriode } from "@/components/patrons/FiltrePeriode";
import {
  PLAGE_VIDE,
  bornesPeriode,
  type Periode,
  type PlagePeriode,
} from "@/lib/domain/periode";
import {
  bilanParBoutique,
  mouvementsDeLaPeriode,
  type Mouvement,
} from "@/lib/domain/caisse";
import { formaterMontant } from "@/lib/domain/format";
import { usePerimetre } from "@/lib/perimetre/perimetre";
import { useAbonnement } from "@/lib/repositories/abonnement";
import { ecouterMouvements } from "@/lib/repositories/caisse";
import { usePostesDepense } from "@/lib/repositories/catalogue";

/**
 * La caisse — le journal du jour (S22, `c2-caisse.html`).
 *
 * **Une caisse est toujours celle d’une boutique** (arbitrage 6). En périmètre
 * entreprise, l’écran demande d’en choisir une : une caisse consolidée ne
 * désigne aucun tiroir. Ce que le responsable veut voir de plusieurs boutiques
 * à la fois, S24 le lui donne au mois.
 *
 * **Tout se calcule à la lecture** (D61), sur les mouvements déjà écrits par
 * S8, S9 et S11. Cet écran ne crée qu’une chose : la sortie d’espèces, parce
 * qu’un billet pris dans le tiroir pour du carburant n’a aucun autre geste qui
 * l’écrive.
 *
 * **Il n’y a pas de clôture, et c’est une réponse et non un manque.** « Pas de
 * fermeture ni d’ouverture » : personne ne compte le tiroir le soir, donc rien
 * n’affirme, donc l’écran ne réclame pas un geste que rien ne motive (D87). Le
 * domaine et les règles de la clôture sont restés en place, prouvés et sans
 * appelant — la question peut se rouvrir le jour où le volume la pose.
 */
export default function EspaceCaisse() {
  const { perimetre, chargement } = usePerimetre();

  if (chargement) return <EtatChargement>Ouverture de la caisse…</EtatChargement>;

  if (perimetre.type === "aucune") {
    return (
      <SansBoutique
        titre="Caisse"
        sansBoutiqueDeclaree="Déclarez une boutique : c’est elle qui tient un tiroir, et la caisse suit le tiroir."
      />
    );
  }

  /* Toutes les boutiques : le bilan du système, une ligne par tiroir. L'écran
     refusait ce périmètre — « un tiroir se compte là où il est » —, et la
     réserve tient toujours : on range, on ne fond pas. Voir `bilanParBoutique`. */
  if (perimetre.type !== "boutique" || !perimetre.boutiqueId) {
    return <BilanDesBoutiques />;
  }

  return <Caisse boutiqueId={perimetre.boutiqueId} nomBoutique={perimetre.nom} />;
}

/**
 * Le bilan de toutes les boutiques — ce que chaque tiroir a fait aujourd'hui.
 *
 * **Pas de sortie d'espèces ici, et ce n'est pas une permission manquante.**
 * C'est le seul geste d'écriture de cet écran, et il vise un tiroir : on ne
 * retire pas d'argent de trois boutiques à la fois. Le bouton ne paraît donc
 * pas, plutôt que de paraître grisé sans raison lisible. Choisir une boutique
 * dans la plaque le fait revenir.
 */
function BilanDesBoutiques() {
  const { boutiques } = usePerimetre();
  /**
   * **Le consolidé se lit au mois, pas au jour (S55).**
   *
   * Il portait un sélecteur de journée, comme le journal d'une boutique. Mais
   * les deux écrans ne répondent pas à la même question : le journal dit ce qui
   * s'est passé aujourd'hui au comptoir, le consolidé est l'écran du
   * superviseur, et « combien de carburant ce mois-ci » est la seule échelle à
   * laquelle cette question veut dire quelque chose. Le commanditaire tient
   * cette caisse pour « une mini comptabilité » : une comptabilité ne se lit
   * pas une journée à la fois.
   *
   * « Ce mois-ci » à l'ouverture, et non « tout » : un total depuis l'origine
   * ne se compare à rien.
   */
  const [periode, setPeriode] = useState<Periode>("ce-mois");
  const [plage, setPlage] = useState<PlagePeriode>(PLAGE_VIDE);
  const maintenant = useMemo(() => new Date(), []);
  const bornes = useMemo(
    () => bornesPeriode(periode, maintenant, plage),
    [periode, maintenant, plage],
  );

  /* `null` : les mouvements de toutes les boutiques du périmètre. C'est la même
     écoute que la caisse d'une boutique, sans son filtre. */
  const souscrireMouvements = useCallback(
    (auChangement: (m: Mouvement[]) => void, enErreur: (cause: unknown) => void) =>
      ecouterMouvements(null, auChangement, enErreur),
    [],
  );
  const {
    valeur: mouvements,
    erreur,
    echec,
    reessayer,
  } = useAbonnement(souscrireMouvements, "Les mouvements de caisse n’ont pas pu être lus.");

  const deLaPeriode = useMemo(
    () => mouvementsDeLaPeriode(mouvements ?? [], bornes),
    [mouvements, bornes],
  );
  const lignes = useMemo(
    () => bilanParBoutique(deLaPeriode, boutiques),
    [deLaPeriode, boutiques],
  );
  const chargement = mouvements === null && !erreur;

  return (
    <div>
      <TetePage
        surTitre="Caisse · Toutes les boutiques"
        titre="Le bilan consolidé"
      />

      <FiltrePeriode
        periode={periode}
        changer={setPeriode}
        plage={plage}
        changerPlage={setPlage}
        className="mt-4"
      />

      {erreur ? (
        <ErreurDeLecture
          titre="La caisse n’a pas pu être lue"
          echec={echec}
          reessayer={reessayer}
          sortie={{ href: "/motos/ventes", libelle: "Voir les ventes" }}
        >
          {erreur} Les ventes et les versements restent consultables depuis leurs écrans.
        </ErreurDeLecture>
      ) : chargement ? (
        <EtatChargement>Lecture des mouvements…</EtatChargement>
      ) : lignes.length === 0 ? (
        /* Aucune ligne n'est pas « tout à zéro » : aucun tiroir n'a bougé sur
           cet intervalle, ce qui est une information et non un bilan vide (D63). */
        <div className="bloc-etat mt-6">
          <Wallet aria-hidden="true" className="size-10" />
          <h2 className="mt-3 text-bloc font-bold tracking-tight text-encre">
            Aucun mouvement sur cette période
          </h2>
        </div>
      ) : (
        <div className="mt-6 min-w-0 max-w-4xl">
          {/* **Le consolidé lit le même bloc que le gérant (S55).** Il portait
              un tableau de cinq colonnes et, dessous, une ligne « Total » qui
              répétait mot pour mot ces mêmes chiffres. À une boutique — le cas
              courant tant que les deux autres n'encaissent pas — le tableau et
              son total disaient deux fois la même chose, en deux mises en page
              différentes. Le commanditaire a tranché : « l'espace du gérant est
              très joli, celui du superviseur doit être pareil ». */}
          <ResumeCaisse mouvements={deLaPeriode} agrege />

          {/* **Le détail par boutique ne paraît qu'à plusieurs.** Avec une seule
              qui a bougé, chaque ligne redirait le bloc du dessus : c'est
              exactement la répétition qu'on vient de retirer. D63 vaut ici
              comme ailleurs. */}
          {lignes.length > 1 && (
            <section aria-labelledby="titre-par-boutique" className="mt-6">
              <h2
                id="titre-par-boutique"
                className="mb-3 text-bloc font-bold tracking-tight text-encre"
              >
                Boutique par boutique
              </h2>
              <div className="cadre p-4 sm:p-5">
                <dl className="grid gap-4">
                  {lignes.map((ligne) => (
                    <div key={ligne.boutiqueId} className="grid gap-0.5">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <dt className="flex min-w-0 items-center gap-2 text-corps text-encre">
                          <span className="plaque-code">{ligne.code}</span>
                          <span className="min-w-0 truncate font-medium">{ligne.nom}</span>
                        </dt>
                        <dd className="font-code text-corps font-semibold tabular-nums text-encre">
                          {formaterMontant(ligne.solde)}
                        </dd>
                      </div>
                      {/* Le détail en sous-ligne, et non en colonnes : quatre
                          montants alignés obligeaient à relire l'en-tête pour
                          savoir lequel était lequel.

                          **« Dont X en espèces » était faux.** `especes` est le
                          *net* du tiroir — entrées moins sorties en espèces —,
                          pas une part des encaissements. Annoncé comme une part
                          d'un brut, il pouvait afficher « dont −50 000 » le jour
                          où une boutique sort plus d'espèces qu'elle n'en
                          encaisse. Le mot « mouvement » le dit pour ce qu'il
                          est, et c'est déjà le vocabulaire du bloc au-dessus. */}
                      <p className="text-legende text-encre-doux">
                        {formaterMontant(ligne.entrees)} encaissés
                        {ligne.sorties > 0 && ` · ${formaterMontant(ligne.sorties)} sortis`}
                        {` · mouvement du tiroir ${formaterMontant(ligne.especes)}`}
                      </p>
                    </div>
                  ))}
                </dl>
              </div>
            </section>
          )}

        </div>
      )}
    </div>
  );
}

function Caisse({ boutiqueId, nomBoutique }: { boutiqueId: string; nomBoutique: string }) {
  const [periode, setPeriode] = useState<Periode>("ce-mois");
  const [plage, setPlage] = useState<PlagePeriode>(PLAGE_VIDE);
  const maintenant = useMemo(() => new Date(), []);
  const bornes = useMemo(
    () => bornesPeriode(periode, maintenant, plage),
    [periode, maintenant, plage],
  );

  /* Pour la colonne « Objet » seulement : une dépense dont le détail est resté
     vide porte son poste à la place (S55). */
  const { nomDuPoste } = usePostesDepense();

  const souscrireMouvements = useCallback(
    (auChangement: (m: Mouvement[]) => void, enErreur: (cause: unknown) => void) =>
      ecouterMouvements(boutiqueId, auChangement, enErreur),
    [boutiqueId],
  );
  const {
    valeur: mouvements,
    erreur,
    echec,
    reessayer,
  } = useAbonnement(souscrireMouvements, "Les mouvements de caisse n’ont pas pu être lus.");

  const chargement = mouvements === null && !erreur;
  const tousLesMouvements = useMemo(() => mouvements ?? [], [mouvements]);

  const deLaPeriode = useMemo(
    () => mouvementsDeLaPeriode(tousLesMouvements, bornes),
    [tousLesMouvements, bornes],
  );

  return (
    <div>
      <TetePage
        surTitre={`Caisse · ${nomBoutique}`}
        titre="Journal de caisse"
      />

      {/* **Mensuel à l'ouverture, « Aujourd'hui » à un clic (S55).** Le
          commanditaire veut des calculs mensuels ; le comptoir, lui, ouvre la
          caisse pour voir sa journée. Remplacer le jour par le mois aurait
          réglé la comptabilité en cassant l'usage — les deux tiennent dans le
          même filtre, et « Du… au… » couvre le reste. */}
      <FiltrePeriode
        periode={periode}
        changer={setPeriode}
        plage={plage}
        changerPlage={setPlage}
        className="mt-4"
      />

      {erreur ? (
        <ErreurDeLecture
          titre="La caisse n’a pas pu être lue"
          echec={echec}
          reessayer={reessayer}
          sortie={{ href: "/motos/ventes", libelle: "Voir les ventes" }}
        >
          {erreur} Les ventes et les versements restent consultables depuis leurs écrans.
        </ErreurDeLecture>
      ) : (
        <div className="min-w-0 max-w-4xl">
          {/* Le compte avant le détail : on ouvre la caisse pour savoir combien,
              puis seulement pour savoir d'où. Il ne paraît pas pendant la
              lecture — un total qui s'affiche à moitié est pire qu'un total
              qui attend. */}
          {!chargement && (
            <ResumeCaisse mouvements={deLaPeriode} />
          )}

          <JournalCaisse
            mouvements={deLaPeriode}
            chargement={chargement}
            avecDate={periode !== "aujourd-hui"}
            nomDuPoste={nomDuPoste}
          />
        </div>
      )}
    </div>
  );
}
