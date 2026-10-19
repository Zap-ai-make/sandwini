"use client";

import { Check, Copy, Link2 } from "lucide-react";
import { useState } from "react";
import { EtatErreur } from "@/components/patrons/Etats";
import { Modale } from "@/components/patrons/Modale";
import { lienDeSuivi } from "@/lib/domain/jeton-suivi";
import type { Prestataire } from "@/lib/domain/prestataire";
import { emettreJetonSuivi, messageErreurJeton } from "@/lib/repositories/jeton-suivi";

/**
 * Le lien de suivi d'un prestataire, sur sa fiche (S56).
 *
 * **Le lien s'affiche en texte, jamais en ancre cliquable**, et c'est un
 * critère de la spec : « aucun écran du produit n'y renvoie par un lien ». Un
 * `<a href>` dans une page interne est exactement le chemin par lequel un lien
 * secret finit dans un historique partagé ou dans un en-tête `Referer`. On le
 * donne à copier ; on n'y navigue pas depuis ici.
 *
 * **Trois états, et le troisième est celui qu'on oublie** : sans lien, avec
 * lien, et en cours d'émission. Sans ce dernier, deux clics émettent deux
 * jetons — et le premier lien, peut-être déjà envoyé au prestataire, meurt sans
 * que personne ne le sache.
 *
 * **Hors ligne, ce bouton ne marche pas**, et l'écran le dit (D66) : le jeton
 * se fabrique sur le serveur. Même traitement que la création d'un compte.
 */
export function LienDeSuivi({ prestataire }: { prestataire: Prestataire }) {
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [copie, setCopie] = useState(false);
  const [confirmation, setConfirmation] = useState(false);

  /* L'origine se lit du navigateur : le produit vit sur un domaine en ligne, sur
     un port local, et parfois sur l'adresse d'un téléphone du réseau de la
     boutique. Une constante serait fausse deux fois sur trois. */
  const lien = prestataire.jetonSuivi
    ? lienDeSuivi(typeof window === "undefined" ? "" : window.location.origin, prestataire.jetonSuivi)
    : null;

  async function emettre() {
    setErreur(null);
    setEnCours(true);
    try {
      await emettreJetonSuivi(prestataire.id);
      /* Rien à poser dans l'état : l'abonnement Firestore de la liste rapporte
         le nouveau jeton, et deux sources pour une même valeur finiraient par
         se contredire (D61). */
    } catch (cause) {
      setErreur(messageErreurJeton(cause));
    } finally {
      setEnCours(false);
      setConfirmation(false);
    }
  }

  async function copier() {
    if (!lien) return;
    try {
      await navigator.clipboard.writeText(lien);
      setCopie(true);
      window.setTimeout(() => setCopie(false), 2_000);
    } catch {
      /* Le presse-papiers est refusé hors contexte sécurisé, et sur certains
         navigateurs de téléphone. Le lien reste affiché en entier juste au
         dessus : il se sélectionne à la main, et c'est pour cela qu'il n'est
         pas tronqué. */
      setErreur("La copie automatique a échoué. Sélectionnez le lien ci-dessus pour le copier.");
    }
  }

  return (
    <div className="mt-3 rounded-plaque border border-bord bg-fond p-3">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-encre">
        <Link2 aria-hidden="true" className="size-4" />
        Lien de suivi
      </h3>

      {lien === null ? (
        <>
          <p className="mt-1 text-sm text-encre-doux">
            Une page de consultation où {prestataire.nom} voit ses cartes grises en cours, celles
            rendues, et le total des avances reçues. Sans compte ni mot de passe.
          </p>
          <button
            type="button"
            onClick={emettre}
            disabled={enCours}
            className="mt-3 bouton bouton-neutre disabled:opacity-60"
          >
            {enCours ? "Création…" : "Créer le lien de suivi"}
          </button>
        </>
      ) : (
        <>
          {/* Le lien en entier et sélectionnable, jamais tronqué : c'est le
              repli quand le presse-papiers est refusé, et c'est aussi ce qu'on
              relit pour vérifier qu'on envoie le bon. */}
          <p className="mt-2 font-mono text-xs break-all text-encre-doux select-all">{lien}</p>

          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={copier} className="bouton bouton-neutre">
              {copie ? (
                <Check aria-hidden="true" className="size-4" />
              ) : (
                <Copy aria-hidden="true" className="size-4" />
              )}
              {copie ? "Copié" : "Copier le lien"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmation(true)}
              disabled={enCours}
              className="bouton bouton-discret disabled:opacity-60"
            >
              Régénérer
            </button>
          </div>

          <p className="mt-2 text-sm text-encre-doux">
            Qui a ce lien voit ces informations. Envoyez-le au prestataire seul.
          </p>
        </>
      )}

      <EtatErreur message={erreur} className="mt-2" />

      {/* **Régénérer demande confirmation, et la confirmation dit ce qu'elle
          fait.** L'ancien lien meurt à l'instant, chez quelqu'un qui n'est pas
          dans la pièce et ne saura pas pourquoi sa page a cessé de répondre. Un
          bouton qui révoque sans le dire est un piège (règle 6). */}
      <Modale
        ouvert={confirmation}
        onFermer={() => setConfirmation(false)}
        titre="Régénérer le lien de suivi ?"
      >
        <p className="text-encre-doux">
          L’ancien lien cessera de fonctionner immédiatement. {prestataire.nom} verra « ce lien
          n’est plus valide » jusqu’à ce que vous lui envoyiez le nouveau.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={emettre}
            disabled={enCours}
            className="bouton bouton-principal disabled:opacity-60"
          >
            {enCours ? "Création…" : "Régénérer"}
          </button>
          <button
            type="button"
            onClick={() => setConfirmation(false)}
            className="bouton bouton-neutre"
          >
            Annuler
          </button>
        </div>
      </Modale>
    </div>
  );
}
