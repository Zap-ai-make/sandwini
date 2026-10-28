"use client";

import { useCallback, useMemo, useState } from "react";
import { Champ } from "@/components/patrons/Champ";
import { EtatErreurSaisie } from "@/components/patrons/Etats";
import { Modale } from "@/components/patrons/Modale";
import { useSession } from "@/lib/auth/session";
import { joursEcoules, lireJour } from "@/lib/domain/dossier";
import { formaterAnciennete } from "@/lib/domain/format";
import {
  validerPaquet,
  type CarteAConfier,
  type PaquetConfie,
  type SaisiePaquet,
} from "@/lib/domain/paquet";
import type { Prestataire } from "@/lib/domain/prestataire";
import { lireMontant } from "@/lib/domain/vente";
import { useAbonnement } from "@/lib/repositories/abonnement";
import { messageErreurDossier } from "@/lib/repositories/dossier";
import { confierPaquet } from "@/lib/repositories/paquets";
import { ecouterPrestataires } from "@/lib/repositories/prestataires";

/** Aujourd'hui au format d'un `<input type="date">`, sur l'horloge de l'appareil. */
function jourLocal(date: Date): string {
  const mois = String(date.getMonth() + 1).padStart(2, "0");
  return `${date.getFullYear()}-${mois}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * Confier plusieurs cartes grises d'un coup (S53, arbitrages 2 et 6).
 *
 * **Le formulaire du dépôt unitaire, moins le document et plus le nombre.** Un
 * prestataire, une date, une avance, une date annoncée facultative — et la
 * liste de ce qui part, à cocher, parce que dix cartes confiées à la mauvaise
 * personne ne se rattrapent qu'en allant la voir.
 *
 * **Deux portes, une seule modale** (20 octobre 2026). On y entre depuis la
 * file des dossiers, en ayant déjà coché des lignes ; ou depuis la fiche d'un
 * prestataire, où rien n'est coché mais où la personne est connue d'avance.
 * Les deux chemins posent les mêmes questions dans le même ordre — en faire
 * deux écrans aurait fait diverger deux formulaires qui écrivent le même
 * paquet.
 *
 * **La sélection se corrige ici.** Elle était figée à l'ouverture : s'être
 * trompé d'une ligne obligeait à fermer, décocher dans le tableau, rouvrir.
 * C'est aussi ce qui rend l'entrée par le prestataire possible — elle arrive
 * sans rien de coché.
 *
 * **L'avance est celle du paquet, pas celle d'une carte.** On tape ce qu'on
 * verse, une fois, parce que c'est un seul billet qui change de main. Le dépôt
 * la répartit ensuite sur les dossiers pour que leur somme retombe sur l'avance
 * du paquet ; l'écran, lui, ne demande qu'un chiffre.
 *
 * **Et elle ne passe plus par la caisse** (arbitrage du 21 octobre 2026) : d'où
 * la disparition du moyen de paiement, qui ne servait qu'à la ligne du journal.
 *
 * **On attend le serveur ici, et c'est l'exception.** Partout ailleurs le
 * produit rend la main tout de suite (D76). Mais un lot de `2N + 2` écritures
 * refusé en bloc ne laisse rien derrière lui : fermer la modale avant la
 * réponse afficherait dix cartes parties qui ne seraient jamais parties, et le
 * gérant les croirait chez le prestataire. Le bouton dit « Envoi… » le temps
 * que ça tranche.
 */
export function ConfierPaquetModal({
  cartes,
  choisies,
  prestataireImpose,
  boutiqueId,
  onFermer,
  onConfie,
}: {
  /** Tout ce qui peut partir, et non seulement ce qui est déjà coché. */
  cartes: readonly CarteAConfier[];
  /** Les ventes cochées à l'ouverture. Vide quand on part du prestataire. */
  choisies?: readonly string[];
  /** Quand on vient de sa fiche : il n'y a plus personne à choisir. */
  prestataireImpose?: { id: string; nom: string } | null;
  boutiqueId: string;
  onFermer: () => void;
  /**
   * Ce qui vient d'être confié, pour le bordereau.
   *
   * **Passé en mémoire plutôt que relu de la base.** Le lot ne s'attend pas
   * (D76) : hors ligne il n'est nulle part à relire, et c'est précisément là,
   * le transitaire devant soi, qu'on veut imprimer le papier.
   */
  onConfie: (confie: PaquetConfie) => void;
}) {
  const session = useSession();

  const souscrire = useCallback(
    (auChangement: (prestataires: Prestataire[]) => void, enErreur: (cause: unknown) => void) =>
      ecouterPrestataires(auChangement, enErreur),
    [],
  );
  const { valeur: prestataires } = useAbonnement(
    souscrire,
    "La liste des prestataires n’a pas pu être lue.",
  );

  const [coches, setCoches] = useState<Set<string>>(() => new Set(choisies ?? []));
  const [saisie, setSaisie] = useState<Omit<SaisiePaquet, "dossierIds">>({
    prestataireId: prestataireImpose?.id ?? "",
    prestataireNom: prestataireImpose?.nom ?? "",
    deposeLe: jourLocal(new Date()),
    avance: "",
      disponibleLe: "",
  });
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  /* **La sélection se recoupe avec ce qui peut encore partir.** Les cartes
     viennent d'une écoute en direct : une carte confiée depuis un autre poste
     pendant qu'on remplit ce formulaire disparaît de la liste, et la garder
     cochée ferait refuser le lot entier au moment d'envoyer — sans dire
     laquelle des dix a fauté. */
  const retenues = useMemo(
    () => cartes.filter((carte) => coches.has(carte.dossierId)),
    [cartes, coches],
  );

  /* Seuls les prestataires actifs qui traitent la carte grise : proposer les
     autres, c'est proposer une erreur que la base refusera. */
  const candidats = (prestataires ?? []).filter(
    (prestataire) => prestataire.actif && prestataire.typesDocuments.includes("carte_grise"),
  );

  function changer(partie: Partial<Omit<SaisiePaquet, "dossierIds">>) {
    setSaisie((ancienne) => ({ ...ancienne, ...partie }));
    setErreur(null);
  }

  function basculer(venteId: string, choisi: boolean) {
    setCoches((anciennes) => {
      const suivantes = new Set(anciennes);
      if (choisi) suivantes.add(venteId);
      else suivantes.delete(venteId);
      return suivantes;
    });
    setErreur(null);
  }

  async function soumettre(evenement: React.FormEvent) {
    evenement.preventDefault();
    if (session.statut !== "connecte" || envoi) return;

    const complete: SaisiePaquet = {
      ...saisie,
      dossierIds: retenues.map((carte) => carte.dossierId),
    };

    /* Validé ici avant de partir : le même refus vu côté serveur arriverait
       après que le lot a été monté, et son message parlerait de règles. */
    const probleme = validerPaquet(complete);
    if (probleme) {
      setErreur(probleme);
      return;
    }

    setErreur(null);
    setEnvoi(true);
    try {
      /* Les cartes entières, et non leurs documents : chacune peut avoir deux
         faces à écrire — l'ancien document et le nouveau dossier — et c'est le
         dépôt qui sait lesquelles existent (S59). */
      await confierPaquet(
        complete,
        retenues,
        boutiqueId,
        { uid: session.utilisateur.uid, nom: session.utilisateur.nom },
      );
      onConfie({
        prestataireNom: complete.prestataireNom,
        deposeLe: lireJour(complete.deposeLe) ?? new Date(),
        disponibleLe: complete.disponibleLe ? lireJour(complete.disponibleLe) : null,
        avance: lireMontant(complete.avance),
        cartes: retenues,
      });
    } catch (cause) {
      setErreur(cause instanceof Error ? cause.message : messageErreurDossier(cause));
      setEnvoi(false);
    }
  }

  return (
    <Modale
      ouvert
      onFermer={onFermer}
      titre={
        prestataireImpose
          ? `Confier des cartes grises à ${prestataireImpose.nom}`
          : "Confier des cartes grises"
      }
    >
      {cartes.length === 0 ? (
        /* **Pas un formulaire vide.** Sans carte à confier, tous les champs
           resteraient saisissables pour un envoi que la validation refuserait
           à la fin — on aurait tapé une avance pour rien. */
        <p className="text-corps text-encre">
          Aucune carte grise n’attend d’être confiée dans cette boutique. Elles apparaissent ici
          dès qu’une vente est enregistrée.
        </p>
      ) : !prestataireImpose && prestataires === null ? (
        <p className="text-corps text-encre-doux">Lecture des prestataires…</p>
      ) : !prestataireImpose && candidats.length === 0 ? (
        <p className="text-corps text-encre">
          Aucun prestataire ne traite les cartes grises. Déclarez-en un dans l’onglet Prestataires,
          puis revenez.
        </p>
      ) : (
        <form onSubmit={soumettre} className="space-y-4">
          {!prestataireImpose && (
            <Champ id="paq-prestataire" libelle="Prestataire">
              <select
                id="paq-prestataire"
                value={saisie.prestataireId}
                onChange={(evenement) => {
                  const choisi = candidats.find((c) => c.id === evenement.target.value);
                  changer({
                    prestataireId: choisi?.id ?? "",
                    prestataireNom: choisi?.nom ?? "",
                  });
                }}
                className="saisie"
              >
                <option value="">Choisissez…</option>
                {candidats.map((prestataire) => (
                  <option key={prestataire.id} value={prestataire.id}>
                    {prestataire.nom}
                  </option>
                ))}
              </select>
            </Champ>
          )}

          <ChoixDesCartes
            cartes={cartes}
            coches={coches}
            basculer={basculer}
            toutCocher={() => setCoches(new Set(cartes.map((carte) => carte.dossierId)))}
            toutDecocher={() => setCoches(new Set())}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Champ id="paq-depose" libelle="Date du dépôt">
              <input
                id="paq-depose"
                type="date"
                value={saisie.deposeLe}
                onChange={(evenement) => changer({ deposeLe: evenement.target.value })}
                className="saisie"
              />
            </Champ>

            <Champ id="paq-dispo" libelle="Annoncé pour le" facultatif>
              <input
                id="paq-dispo"
                type="date"
                value={saisie.disponibleLe}
                onChange={(evenement) => changer({ disponibleLe: evenement.target.value })}
                className="saisie"
              />
            </Champ>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Champ id="paq-avance" libelle="Avance versée">
              <input
                id="paq-avance"
                inputMode="numeric"
                value={saisie.avance}
                onChange={(evenement) => changer({ avance: evenement.target.value })}
                className="saisie"
              />
            </Champ>
          </div>

          <EtatErreurSaisie message={erreur} />

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={envoi || retenues.length === 0}
              className="bouton bouton-principal"
            >
              {envoi
                ? "Envoi…"
                : retenues.length === 0
                  ? "Choisissez des cartes grises"
                  : retenues.length === 1
                    ? "Confier la carte grise"
                    : `Confier les ${retenues.length} cartes grises`}
            </button>
            <button
              type="button"
              onClick={onFermer}
              disabled={envoi}
              className="bouton bouton-neutre"
            >
              Annuler
            </button>
          </div>
        </form>
      )}
    </Modale>
  );
}

/**
 * Ce qui part, coché ligne à ligne.
 *
 * **Le numéro ne suffit pas à reconnaître un dossier**, et c'est tout l'enjeu
 * quand on arrive par la fiche d'un prestataire : on ne vient pas de voir le
 * tableau. Le nom du client dit lequel on tient en main, et l'ancienneté dit
 * lequel aurait dû partir la semaine dernière.
 *
 * La liste est bornée en hauteur et défile : une boutique peut porter quarante
 * dossiers ouverts, et repousser l'avance hors de l'écran ferait valider un
 * formulaire qu'on n'a pas fini de lire.
 */
function ChoixDesCartes({
  cartes,
  coches,
  basculer,
  toutCocher,
  toutDecocher,
}: {
  cartes: readonly CarteAConfier[];
  coches: ReadonlySet<string>;
  basculer: (venteId: string, choisi: boolean) => void;
  toutCocher: () => void;
  toutDecocher: () => void;
}) {
  /* Figée au rendu : recalculée par ligne, deux cartes de la même liste
     seraient datées d'instants différents. */
  const maintenant = new Date();
  const nombre = cartes.filter((carte) => coches.has(carte.dossierId)).length;

  return (
    <fieldset className="cadre p-3">
      <legend className="sr-only">Les cartes grises à confier</legend>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-legende font-bold tracking-[0.07em] text-encre-doux uppercase">
          Ce qui part
        </p>
        {/* `aria-live` : cocher dix cases une à une ne doit pas obliger à
            retrouver le compte des yeux à chaque fois. */}
        <p aria-live="polite" className="text-corps text-encre">
          <strong className="font-semibold">{nombre}</strong>
          {" sur "}
          {cartes.length}
        </p>
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" onClick={toutCocher} className="filtre">
          Tout cocher
        </button>
        <button type="button" onClick={toutDecocher} className="filtre">
          Tout décocher
        </button>
      </div>

      <ul className="mt-2 max-h-64 overflow-y-auto">
        {cartes.map((carte) => {
          const jours = joursEcoules(carte.date, maintenant);
          return (
            <li key={carte.dossierId}>
              <label className="flex cursor-pointer items-center gap-2 rounded-champ py-2 hover:bg-fond">
                <input
                  type="checkbox"
                  checked={coches.has(carte.dossierId)}
                  onChange={(evenement) => basculer(carte.dossierId, evenement.target.checked)}
                  className="size-4 shrink-0 accent-[var(--color-solde)]"
                />
                <span className="plaque-code shrink-0 text-corps text-encre">{carte.repere}</span>
                <span className="min-w-0 flex-1 truncate text-corps text-encre">
                  {carte.client}
                </span>
                {jours !== null && (
                  <span className="shrink-0 text-legende text-encre-doux">
                    {formaterAnciennete(jours)}
                  </span>
                )}
              </label>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
