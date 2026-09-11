"use client";

import { Wallet } from "lucide-react";
import { useCallback, useMemo, useState, type FormEvent } from "react";
import { JournalCaisse } from "@/components/JournalCaisse";
import { ErreurDeLecture, EtatChargement, EtatErreurSaisie, SansBoutique } from "@/components/patrons/Etats";
import { TetePage } from "@/components/patrons/Page";
import { useSession } from "@/lib/auth/session";
import { mouvementsDuJour, type Mouvement } from "@/lib/domain/caisse";
import { formaterDate, jourLocal } from "@/lib/domain/format";
import { usePerimetre } from "@/lib/perimetre/perimetre";
import { useAbonnement } from "@/lib/repositories/abonnement";
import { ecouterMouvements, enregistrerSortieEspeces } from "@/lib/repositories/caisse";

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
  const peutSortirDesEspeces =
    utilisateur?.role === "gerant" && utilisateur.boutiqueId === boutiqueId;

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

  const chargement = mouvements === null && !erreur;
  const tousLesMouvements = useMemo(() => mouvements ?? [], [mouvements]);

  const duJour = useMemo(
    () => mouvementsDuJour(tousLesMouvements, jour),
    [tousLesMouvements, jour],
  );

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
        <div className="min-w-0 max-w-4xl">
          <JournalCaisse
            mouvements={duJour}
            chargement={chargement}
            jourEstPasse={jour !== aujourdhui}
          />
          {peutSortirDesEspeces && jour === aujourdhui && (
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
      )}
    </div>
  );
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

  /**
   * **On n'attend pas l'accusé de réception du serveur** (D76).
   *
   * Ce formulaire le faisait — `await enregistrer(…)`, bouton désactivé le
   * temps du trajet — et c'était le seul geste du comptoir qui s'y risquait
   * encore. Hors ligne, la promesse de Firestore ne se résout **jamais** : le
   * bouton serait resté désactivé et les champs pleins, indéfiniment, pour une
   * écriture pourtant déjà acquise dans le cache local. Sur une connexion
   * seulement lente, le même mécanisme rendait la main au bout d'une minute.
   *
   * La validation, elle, reste immédiate : `enregistrerSortieEspeces` lève de
   * façon synchrone sur un montant absurde ou un libellé vide, avant même de
   * toucher à Firestore. Ce qui part en différé, c'est le seul refus qu'on ne
   * peut pas connaître d'avance — celui du serveur.
   */
  function soumettre(evenement: FormEvent) {
    evenement.preventDefault();
    setErreur(null);
    try {
      const partie = enregistrer({ montant, libelle });
      setMontant("");
      setLibelle("");
      partie.catch((cause) =>
        setErreur(
          cause instanceof Error ? cause.message : "La sortie n’a pas pu être enregistrée.",
        ),
      );
    } catch (cause) {
      setErreur(cause instanceof Error ? cause.message : "La sortie n’a pas pu être enregistrée.");
    }
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
        <button type="submit" className="bouton bouton-neutre h-11">
          Enregistrer la sortie
        </button>
      </div>

      <EtatErreurSaisie message={erreur} className="mt-2" />
    </form>
  );
}
