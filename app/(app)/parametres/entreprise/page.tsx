"use client";

import { useCallback, useState } from "react";
import { GardeCapacite } from "@/components/GardeSession";
import { IdentiteEntreprise, NumerosAConfirmer } from "@/components/IdentiteEntreprise";
import { Champ } from "@/components/patrons/Champ";
import { EtatChargement, EtatErreur, EtatErreurSaisie } from "@/components/patrons/Etats";
import { TetePage } from "@/components/patrons/Page";
import { useSession } from "@/lib/auth/session";
import {
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
  return (
    <section className="cadre p-4">
      <h2 className="font-semibold text-encre">Ce qui s’imprime en tête de chaque reçu</h2>
      <p className="mt-1 max-w-prose text-corps text-encre-doux">
        Ces informations font partie du logiciel. Elles ne se saisissent pas, et elles ne peuvent
        pas être effacées&nbsp;: un reçu sans mentions légales n’est pas conforme.
      </p>

      <div className="mt-4 border-y border-bord">
        <IdentiteEntreprise />
      </div>

      <NumerosAConfirmer />
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
    return <EtatErreur message={erreurLecture} className="mt-6" />;
  }

  if (!saisie) {
    return <EtatChargement className="mt-6">Chargement du réglage…</EtatChargement>;
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
      <div className="cadre p-4">
        <h2 className="font-semibold text-encre">Tranches inactives</h2>
        <p className="mt-1 max-w-prose text-sm text-encre-doux">
          Une vente en tranches dont le client n’a rien versé depuis ce nombre de jours est signalée
          dans la liste des tranches. Rien ne se déclenche tout seul&nbsp;: la moto reste au
          magasin, et l’argent reste au client.
        </p>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <Champ id="seuil-inactivite" libelle="Signaler après">
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
              className="saisie w-28 tabular-nums"
              aria-invalid={erreur ? true : undefined}
            />
          </Champ>
          <span className="pb-3 text-encre-doux">jours sans versement</span>
        </div>
      </div>

      <EtatErreurSaisie message={erreur} className="mt-3" />
      {succes && (
        <p role="status" aria-live="polite" className="text-sm text-solde">
          {succes}
        </p>
      )}

      <button type="submit" className="bouton bouton-principal mt-3">
        Enregistrer le réglage
      </button>
    </form>
  );
}

function Cadre({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <TetePage
        retour={{ href: "/parametres", libelle: "Réglages" }}
        titre="Identité de l’entreprise"
      />
      <p className="mt-2 mb-6 max-w-prose text-encre-doux">
        L’en-tête de chaque reçu remis à un client, et le seul réglage qui l’accompagne.
      </p>
      {children}
    </div>
  );
}
