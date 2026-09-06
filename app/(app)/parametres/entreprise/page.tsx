"use client";

import { ArrowLeft, LoaderCircle, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";
import { GardeCapacite } from "@/components/GardeSession";
import { useSession } from "@/lib/auth/session";
import { formaterTelephone } from "@/lib/domain/client";
import {
  IDENTITE,
  IDENTITE_A_CONFIRMER,
  LIBELLE_IDENTITE,
  REGLAGES_DEFAUT,
  SEUIL_INACTIVITE_MAX,
  SEUIL_INACTIVITE_MIN,
  validerReglages,
  type ReglagesEntreprise,
} from "@/lib/domain/entreprise";
import { useAbonnement } from "@/lib/repositories/abonnement";
import { ecouterReglages, enregistrerReglages } from "@/lib/repositories/entreprise";
import { messageErreurReferentiel } from "@/lib/repositories/referentiels";

/**
 * L'identité de l'entreprise — et ce qui, à côté d'elle, se règle encore.
 *
 * **Cet écran n'est plus un formulaire d'identité.** Raison sociale, siège,
 * téléphone, IFU et RCCM sont posés dans le code (D71) : ils s'impriment sur
 * chaque reçu sans que personne ait à les saisir, et personne ne peut les
 * vider. La forme de l'écran le dit — une carte qu'on lit, sans champ ni
 * bouton. Un champ grisé aurait laissé croire qu'il existe un moyen de le
 * dégriser.
 *
 * Reste un réglage, et un seul : au bout de combien de jours une vente en
 * tranches sans versement est signalée. Ce n'est pas de l'identité, c'est une
 * décision de commerce, et elle change.
 */
export default function PageEntreprise() {
  return (
    <GardeCapacite capacite="gerer_referentiels">
      <FicheEntreprise />
    </GardeCapacite>
  );
}

function FicheEntreprise() {
  return (
    <Cadre>
      <Identite />
      <Reglages />
    </Cadre>
  );
}

function Identite() {
  const aConfirmer = new Set<string>(IDENTITE_A_CONFIRMER);

  return (
    <section className="rounded-plaque border border-bord bg-papier p-4">
      <h2 className="font-semibold text-encre">Ce qui s’imprime en tête de chaque reçu</h2>
      <p className="mt-1 max-w-prose text-sm text-encre-doux">
        Ces informations font partie du logiciel. Elles ne se saisissent pas, et elles ne peuvent
        pas être effacées&nbsp;: un reçu sans mentions légales n’est pas conforme.
      </p>

      <dl className="mt-4 divide-y divide-bord border-y border-bord">
        {(Object.keys(IDENTITE) as (keyof typeof IDENTITE)[]).map((champ) => (
          <div key={champ} className="flex flex-wrap items-baseline justify-between gap-x-4 py-2">
            <dt className="text-sm text-encre-doux">{LIBELLE_IDENTITE[champ]}</dt>
            <dd className="text-right text-encre">
              <span className={aConfirmer.has(champ) ? "plaque-code" : undefined}>
                {champ === "telephone" ? formaterTelephone(IDENTITE[champ]) : IDENTITE[champ]}
              </span>
              {aConfirmer.has(champ) && (
                <span className="ml-2 text-sm font-semibold text-alerte">à confirmer</span>
              )}
            </dd>
          </div>
        ))}
      </dl>

      {/* Tant que ces deux numéros n'ont pas été communiqués, ils sont au bon
          format et faux. Le dire ici, en rouge, plutôt que dans un commentaire
          de code que personne n'ouvrira avant le premier contrôle fiscal.

          `note` et non `alert` : ce message est là en permanence, il ne
          survient pas. Un `alert` permanent est réannoncé à chaque ouverture de
          l'écran et entre en concurrence avec la vraie erreur de validation du
          formulaire juste en dessous — c'est un test bout en bout qui l'a
          montré, en trouvant celui-ci quand il cherchait celle-là. */}
      {IDENTITE_A_CONFIRMER.length > 0 && (
        <p
          role="note"
          className="mt-4 flex max-w-prose gap-3 rounded-plaque border border-alerte bg-alerte-surface p-3 text-sm text-encre"
        >
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-alerte" />
          <span>
            <strong className="font-semibold">
              {IDENTITE_A_CONFIRMER.length === 1
                ? "Un numéro n’a pas été confirmé"
                : "Deux numéros n’ont pas été confirmés"}
              .
            </strong>{" "}
            Ils s’impriment sur un document commercial. Communiquez les vrais numéros à qui
            maintient le logiciel avant de remettre un reçu à un client.
          </span>
        </p>
      )}
    </section>
  );
}

function Reglages() {
  const session = useSession();
  const souscrire = useCallback(
    (auChangement: (v: ReglagesEntreprise) => void, enErreur: (c: unknown) => void) =>
      ecouterReglages(auChangement, enErreur),
    [],
  );
  const { valeur, erreur: erreurLecture } = useAbonnement(
    souscrire,
    "Le réglage des tranches n’a pas pu être chargé.",
  );

  const [brouillon, setBrouillon] = useState<ReglagesEntreprise | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  /* Tant que rien n'a été touché, l'écran montre ce que dit la base ; dès la
     première frappe, il montre le brouillon et ne s'en écarte plus. Recopier
     les instantanés suivants dans l'état ferait sauter le nombre sous les
     doigts de celui qui tape — ce sont d'ailleurs nos propres écritures qui
     reviennent. */
  const saisie = brouillon ?? valeur;

  if (erreurLecture) {
    return (
      <p role="alert" className="mt-6 text-alerte">
        {erreurLecture}
      </p>
    );
  }

  if (!saisie) {
    return (
      <p className="mt-6 flex items-center gap-3 text-encre-doux">
        <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
        Chargement du réglage…
      </p>
    );
  }

  function soumettre(evenement: React.FormEvent) {
    evenement.preventDefault();
    if (session.statut !== "connecte" || !saisie) return;
    setSucces(null);

    const probleme = validerReglages(saisie);
    if (probleme) {
      setErreur(probleme);
      return;
    }

    setErreur(null);
    enregistrerReglages(saisie, {
      uid: session.utilisateur.uid,
      nom: session.utilisateur.nom,
    }).catch((cause) => setErreur(messageErreurReferentiel(cause)));
    setSucces("Réglage enregistré.");
  }

  return (
    <form onSubmit={soumettre} className="mt-6" noValidate>
      <div className="rounded-plaque border border-bord bg-papier p-4">
        <h2 className="font-semibold text-encre">Tranches inactives</h2>
        <p className="mt-1 max-w-prose text-sm text-encre-doux">
          Une vente en tranches dont le client n’a rien versé depuis ce nombre de jours est
          signalée dans la liste des tranches. Rien ne se déclenche tout seul&nbsp;: la moto reste
          au magasin, et l’argent reste au client.
        </p>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="seuil-inactivite" className="block text-sm font-medium text-encre">
              Signaler après
            </label>
            <input
              id="seuil-inactivite"
              type="number"
              inputMode="numeric"
              min={SEUIL_INACTIVITE_MIN}
              max={SEUIL_INACTIVITE_MAX}
              step={1}
              value={
                Number.isFinite(saisie.seuilInactiviteTranches)
                  ? String(saisie.seuilInactiviteTranches)
                  : ""
              }
              onChange={(evenement) => {
                const brut = evenement.target.value.trim();
                setBrouillon({
                  ...(brouillon ?? valeur ?? REGLAGES_DEFAUT),
                  seuilInactiviteTranches: brut === "" ? Number.NaN : Number(brut),
                });
              }}
              className="mt-1.5 h-12 w-28 rounded-plaque border border-bord bg-papier px-3 text-encre tabular-nums"
            />
          </div>
          <span className="pb-3 text-encre-doux">jours sans versement</span>
        </div>
      </div>

      <p role="alert" aria-live="assertive" className="mt-3 min-h-5 text-sm text-alerte">
        {erreur ?? ""}
      </p>
      {succes && (
        <p role="status" aria-live="polite" className="text-sm text-solde">
          {succes}
        </p>
      )}

      <button
        type="submit"
        className="mt-3 inline-flex h-12 items-center rounded-plaque border border-plaque-bord bg-plaque px-5 font-semibold text-encre-fixe"
      >
        Enregistrer le réglage
      </button>
    </form>
  );
}

function Cadre({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <Link
        href="/parametres"
        className="inline-flex items-center gap-2 text-sm text-encre-doux hover:text-encre"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Réglages
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-encre">
        Identité de l’entreprise
      </h1>
      <p className="mt-2 mb-6 max-w-prose text-encre-doux">
        L’en-tête de chaque reçu remis à un client, et le seul réglage qui l’accompagne.
      </p>
      {children}
    </div>
  );
}
