"use client";

import { LoaderCircle } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Champ } from "@/components/patrons/Champ";
import { EtatErreurSaisie } from "@/components/patrons/Etats";
import { TetePage } from "@/components/patrons/Page";
import { changerMonMotDePasse } from "@/lib/auth/session";
import {
  LONGUEUR_MOT_DE_PASSE_MIN,
  messageErreurMotDePasse,
  validerChangementMotDePasse,
} from "@/lib/domain/mot-de-passe";

/**
 * Changer son propre mot de passe (15 novembre 2026).
 *
 * « Permets au superviseur de changer son mot de passe », ouvert ensuite à
 * chaque compte : chacun change le sien. Celui d'un gérant oublié se
 * réinitialise toujours depuis Utilisateurs, par le responsable.
 *
 * **Trois champs, et le premier n'est pas une formalité.** Firebase exige une
 * connexion récente pour changer un mot de passe ; redemander l'actuel la
 * renouvelle, et empêche qu'un appareil resté ouvert au comptoir change le mot
 * de passe de son propriétaire.
 *
 * Les champs se vident après chaque tentative, réussie ou non : un mot de
 * passe ne reste pas affiché sur un écran que d'autres regardent.
 */
export default function PageMotDePasse() {
  const [actuel, setActuel] = useState("");
  const [nouveau, setNouveau] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [change, setChange] = useState(false);

  async function soumettre(evenement: FormEvent) {
    evenement.preventDefault();
    if (envoi) return;
    setErreur(null);
    setChange(false);

    const refus = validerChangementMotDePasse({ actuel, nouveau, confirmation });
    if (refus) {
      setErreur(refus);
      return;
    }

    setEnvoi(true);
    try {
      await changerMonMotDePasse(actuel, nouveau);
      setChange(true);
      setNouveau("");
      setConfirmation("");
    } catch (cause) {
      setErreur(messageErreurMotDePasse(cause));
    } finally {
      setActuel("");
      setEnvoi(false);
    }
  }

  return (
    <div>
      <TetePage retour={{ href: "/parametres", libelle: "Paramètres" }} titre="Mot de passe" />

      <form onSubmit={soumettre} noValidate className="cadre max-w-[40rem] p-4 sm:p-5">
        <div className="grid gap-4">
          <Champ id="mdp-actuel" libelle="Mot de passe actuel">
            <input
              id="mdp-actuel"
              type="password"
              autoComplete="current-password"
              value={actuel}
              onChange={(evenement) => setActuel(evenement.target.value)}
              className="saisie"
            />
          </Champ>
          <Champ id="mdp-nouveau" libelle="Nouveau mot de passe">
            <input
              id="mdp-nouveau"
              type="password"
              autoComplete="new-password"
              minLength={LONGUEUR_MOT_DE_PASSE_MIN}
              value={nouveau}
              onChange={(evenement) => setNouveau(evenement.target.value)}
              className="saisie"
            />
          </Champ>
          <Champ id="mdp-confirmation" libelle="Confirmer le nouveau mot de passe">
            <input
              id="mdp-confirmation"
              type="password"
              autoComplete="new-password"
              value={confirmation}
              onChange={(evenement) => setConfirmation(evenement.target.value)}
              className="saisie"
            />
          </Champ>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={envoi}
            className="bouton bouton-principal disabled:opacity-60"
          >
            {envoi && <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />}
            {envoi ? "Changement…" : "Changer le mot de passe"}
          </button>
          {/* Le seul retour d'un geste qui ne laisse rien voir : sans lui, on
              ne saurait pas lequel des deux mots de passe ouvrira demain. */}
          {change && (
            <p role="status" aria-live="polite" className="text-corps font-semibold text-solde">
              Mot de passe changé.
            </p>
          )}
        </div>

        <EtatErreurSaisie message={erreur} className="mt-3" />
      </form>
    </div>
  );
}
