"use client";

import { Wallet } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ClotureCaisse } from "@/components/ClotureCaisse";
import { JournalCaisse } from "@/components/JournalCaisse";
import { ErreurDeLecture, EtatChargement, EtatErreurSaisie, SansBoutique } from "@/components/patrons/Etats";
import { TetePage } from "@/components/patrons/Page";
import { useSession } from "@/lib/auth/session";
import {
  clotureDuJour,
  fondsOuverturePour,
  journeesAFermer,
  mouvementsDuJour,
  resumerJournee,
  type Cloture,
  type Mouvement,
} from "@/lib/domain/caisse";
import { formaterDate, jourLocal } from "@/lib/domain/format";
import { usePerimetre } from "@/lib/perimetre/perimetre";
import { useAbonnement } from "@/lib/repositories/abonnement";
import {
  ecouterClotures,
  ecouterMouvements,
  enregistrerCloture,
  enregistrerSortieEspeces,
} from "@/lib/repositories/caisse";

/**
 * La caisse — journal du jour et clôture (S22, `c2-caisse.html`).
 *
 * **Une caisse est toujours celle d’une boutique** (arbitrage 6). En périmètre
 * entreprise, l’écran demande d’en choisir une : une caisse consolidée ne
 * désigne aucun tiroir, et on ne compte pas trois tiroirs à la fois. Ce que le
 * responsable veut voir de plusieurs boutiques à la fois, S24 le lui donne au
 * mois.
 *
 * **Tout se calcule à la lecture** (D61), sur les mouvements déjà écrits par
 * S8, S9 et S11. La clôture est le seul document que cet écran crée, et il ne
 * duplique rien : ses totaux figés ne sont pas une seconde vérité mais **une
 * affirmation datée** — ce que quelqu’un a déclaré ce soir-là.
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

  if (perimetre.type !== "boutique" || !perimetre.boutiqueId) {
    return (
      <div>
        <TetePage titre="Caisse" sousTitre="Une caisse est celle d’une boutique." />
        <div className="bloc-etat mt-6">
          <Wallet aria-hidden="true" className="size-10" />
          <h2 className="mt-3 text-bloc font-bold tracking-tight text-encre">
            Choisissez une boutique
          </h2>
          <p className="mt-1 max-w-prose text-corps text-encre-doux">
            Un tiroir se compte là où il est. Choisissez la boutique dans le bandeau, en haut de
            l’écran&nbsp;; pour comparer plusieurs boutiques sur un mois, les chiffres de la
            supervision répondent mieux.
          </p>
        </div>
      </div>
    );
  }

  return <Caisse boutiqueId={perimetre.boutiqueId} nomBoutique={perimetre.nom} />;
}

function Caisse({ boutiqueId, nomBoutique }: { boutiqueId: string; nomBoutique: string }) {
  const session = useSession();
  const utilisateur = session.statut === "connecte" ? session.utilisateur : null;
  /* Le gérant de cette boutique-là, et lui seul, clôture (arbitrage 3). Le
     responsable lit — et la fermeture automatique étant une écriture, elle ne
     part que sous ses mains à lui. */
  const peutCloturer = utilisateur?.role === "gerant" && utilisateur.boutiqueId === boutiqueId;

  const aujourdhui = useMemo(() => jourLocal(new Date()), []);
  const [jour, setJour] = useState(aujourdhui);

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

  const souscrireClotures = useCallback(
    (auChangement: (c: Cloture[]) => void, enErreur: (cause: unknown) => void) =>
      ecouterClotures(boutiqueId, auChangement, enErreur),
    [boutiqueId],
  );
  const { valeur: clotures } = useAbonnement(
    souscrireClotures,
    "Les clôtures n’ont pas pu être lues.",
  );

  const chargement = (mouvements === null || clotures === null) && !erreur;
  const tousLesMouvements = useMemo(() => mouvements ?? [], [mouvements]);
  const toutesLesClotures = useMemo(() => clotures ?? [], [clotures]);

  const duJour = useMemo(
    () => mouvementsDuJour(tousLesMouvements, jour),
    [tousLesMouvements, jour],
  );
  const fonds = useMemo(
    () => fondsOuverturePour(jour, toutesLesClotures),
    [jour, toutesLesClotures],
  );
  const resume = useMemo(() => resumerJournee(fonds.montant, duJour), [fonds.montant, duJour]);
  const clotureDeCeJour = clotureDuJour(toutesLesClotures, jour);

  useFermetureAutomatique({
    actif: peutCloturer && !chargement,
    mouvements: tousLesMouvements,
    clotures: toutesLesClotures,
    aujourdhui,
    auteur: utilisateur ? { uid: utilisateur.uid, nom: utilisateur.nom } : null,
    boutiqueId,
  });

  return (
    <div>
      <TetePage
        surTitre={`Caisse · ${nomBoutique}`}
        titre={jour === aujourdhui ? "Journal du jour" : "Journal d’une journée passée"}
        sousTitre={formaterDate(new Date(`${jour}T12:00:00`))}
        actions={
          <div className="champ">
            <label htmlFor="jour-caisse" className="sr-only">
              Journée affichée
            </label>
            <input
              id="jour-caisse"
              className="saisie h-11 w-auto lg:h-9"
              type="date"
              value={jour}
              max={aujourdhui}
              onChange={(evenement) => setJour(evenement.target.value || aujourdhui)}
            />
          </div>
        }
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
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="min-w-0">
            <JournalCaisse
              mouvements={duJour}
              chargement={chargement}
              jourEstPasse={jour !== aujourdhui}
            />
            {peutCloturer && jour === aujourdhui && !clotureDeCeJour && (
              <SortieEspeces
                enregistrer={(saisie) =>
                  enregistrerSortieEspeces(boutiqueId, saisie, {
                    uid: utilisateur!.uid,
                    nom: utilisateur!.nom,
                  })
                }
              />
            )}
          </div>

          <ClotureCaisse
            resume={resume}
            fonds={fonds}
            jour={jour}
            cloture={clotureDeCeJour}
            peutCloturer={peutCloturer && !chargement}
            enregistrer={(comptees, motif) =>
              enregistrerCloture(
                {
                  boutiqueId,
                  jour,
                  fondsOuverture: fonds.montant,
                  especesAttendues: resume.especesAttendues,
                  especesComptees: comptees,
                  motif,
                },
                { uid: utilisateur!.uid, nom: utilisateur!.nom },
              )
            }
          />
        </div>
      )}
    </div>
  );
}

/**
 * La fermeture des journées oubliées — arbitrage 4 du commanditaire.
 *
 * **Sur l’appareil, à l’ouverture de l’écran, et non par un déclencheur.** Même
 * raison que le jour local : c’est le comptoir qui sait qu’une journée est
 * finie, et un déclencheur qui fermerait à minuit UTC fermerait la journée de
 * Pouytenga à minuit moins deux.
 *
 * Chaque journée est fermée **dans l’ordre**, parce que chacune donne son fonds
 * d’ouverture à la suivante. Une journée fermée ainsi ne porte ni comptage ni
 * écart : elle n’a pas un écart nul, elle n’a pas d’écart. Les règles Firestore
 * le refusent autrement.
 *
 * Le garde-fou est une référence, lue dans l’effet et jamais pendant le rendu :
 * une écriture refusée ne doit pas être retentée à chaque rendu, sinon un refus
 * de règle devient une boucle.
 */
function useFermetureAutomatique({
  actif,
  mouvements,
  clotures,
  aujourdhui,
  auteur,
  boutiqueId,
}: {
  actif: boolean;
  mouvements: readonly Mouvement[];
  clotures: readonly Cloture[];
  aujourdhui: string;
  auteur: { uid: string; nom: string } | null;
  boutiqueId: string;
}) {
  const tentees = useRef<Set<string>>(new Set());
  const aFermer = actif && auteur ? journeesAFermer(mouvements, clotures, aujourdhui) : [];
  const cle = aFermer.join(",");

  useEffect(() => {
    if (cle === "" || !auteur) return;
    const jours = cle.split(",").filter((jour) => !tentees.current.has(jour));
    if (jours.length === 0) return;
    for (const jour of jours) tentees.current.add(jour);

    let vivant = true;
    void (async () => {
      /* En série, et pas en parallèle : le fonds d'ouverture de chaque journée
         est l'attendu de la précédente, et les lancer ensemble les ferait
         toutes partir du même montant. */
      let reporte = fondsOuverturePour(jours[0], clotures);
      for (const jour of jours) {
        if (!vivant) return;
        const resume = resumerJournee(reporte.montant, mouvementsDuJour(mouvements, jour));
        try {
          await enregistrerCloture(
            {
              boutiqueId,
              jour,
              fondsOuverture: reporte.montant,
              especesAttendues: resume.especesAttendues,
              especesComptees: null,
              motif: "",
            },
            auteur,
          );
        } catch {
          /* Un refus de règle ou une coupure : on n'insiste pas. La journée
             reste ouverte, l'écran continue de la montrer comme telle, et la
             prochaine ouverture réessaiera. Boucler ici transformerait un refus
             en tempête d'écritures. */
          return;
        }
        reporte = { montant: resume.especesAttendues, source: "attendue" };
      }
    })();

    return () => {
      vivant = false;
    };
    /* `clotures` et `mouvements` changent d'identité à chaque instantané ; la
       clé, elle, ne change que si la liste des journées à fermer change. C'est
       elle qui doit commander, sans quoi l'effet repartirait sans fin. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle]);
}

/**
 * La sortie d’espèces — arbitrage 2 du commanditaire.
 *
 * Le seul mouvement que quelqu’un saisit à la main : tous les autres sont la
 * conséquence d’un geste métier. Sans lui, chaque billet sorti du tiroir pour
 * du carburant devient un écart inexpliqué le soir — et un écart qu’on
 * s’habitue à voir est un écart qu’on ne regarde plus.
 *
 * Sur la journée en cours seulement : une sortie se saisit quand elle a lieu,
 * pas trois jours après, et l’antidater fausserait une clôture déjà faite.
 */
function SortieEspeces({
  enregistrer,
}: {
  enregistrer: (saisie: { montant: string; libelle: string }) => Promise<void>;
}) {
  const [montant, setMontant] = useState("");
  const [libelle, setLibelle] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function soumettre(evenement: FormEvent) {
    evenement.preventDefault();
    setEnCours(true);
    setErreur(null);
    try {
      await enregistrer({ montant, libelle });
      setMontant("");
      setLibelle("");
    } catch (cause) {
      setErreur(cause instanceof Error ? cause.message : "La sortie n’a pas pu être enregistrée.");
    }
    setEnCours(false);
  }

  return (
    <form onSubmit={soumettre} className="cadre mt-6 p-4 sm:p-5">
      <h2 className="text-bloc font-bold tracking-tight text-encre">Sortir des espèces</h2>
      <p className="mt-1 max-w-prose text-corps text-encre-doux">
        L’argent qui quitte le tiroir pour autre chose qu’un client&nbsp;: carburant, course,
        avance. Saisi ici, il ne se retrouve pas en écart ce soir.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-[10rem_minmax(0,1fr)_auto] sm:items-end">
        <div className="champ">
          <label htmlFor="sortie-montant">Montant</label>
          <input
            id="sortie-montant"
            className="saisie"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={montant}
            onChange={(evenement) => setMontant(evenement.target.value)}
          />
        </div>
        <div className="champ">
          <label htmlFor="sortie-libelle">À quoi</label>
          <input
            id="sortie-libelle"
            className="saisie"
            type="text"
            maxLength={120}
            autoComplete="off"
            value={libelle}
            onChange={(evenement) => setLibelle(evenement.target.value)}
          />
        </div>
        <button type="submit" className="bouton bouton-neutre h-11" disabled={enCours}>
          Enregistrer la sortie
        </button>
      </div>

      <EtatErreurSaisie message={erreur} className="mt-2" />
    </form>
  );
}
