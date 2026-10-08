"use client";

import { CircleAlert, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { Champ } from "@/components/patrons/Champ";
import { EtatErreurSaisie } from "@/components/patrons/Etats";
import { Modale } from "@/components/patrons/Modale";
import {
  messageErreurUtilisateur,
  modifierGerant,
  type FicheUtilisateur,
  type ModificationGerant,
} from "@/lib/repositories/utilisateurs";

/**
 * Corriger l'identité d'un gérant : son nom, son adresse de connexion, son mot
 * de passe (S52).
 *
 * **Trois champs, un seul envoi, et seuls les champs modifiés partent.** Le
 * serveur distingue « absent » de « vidé » (`functions/src/gerants.ts`) : un
 * champ qu'on ne touche pas n'est pas envoyé, et un champ vidé est refusé
 * plutôt qu'ignoré. Sans cette distinction, effacer le nom puis enregistrer
 * répondrait « c'est fait » sans rien avoir fait.
 *
 * **Le mot de passe part vide et le reste s'il n'est pas rempli.** Pré-remplir
 * un mot de passe est impossible — personne, pas même le serveur, ne le connaît
 * — et afficher des points fait croire qu'il y a quelque chose à conserver. Vide
 * veut dire « je n'y touche pas », et le libellé le dit.
 *
 * **Deux conséquences sont annoncées avant la validation, pas après.** Changer
 * l'adresse ou le mot de passe ferme les sessions ouvertes du gérant : le
 * responsable fait souvent ce geste pendant que l'autre est au comptoir. Et les
 * ventes déjà enregistrées gardent l'ancien nom, parce qu'un journal ne se
 * réécrit pas.
 */
export function ModifierGerantModal({
  utilisateur,
  ouvert,
  onFermer,
}: {
  utilisateur: FicheUtilisateur;
  ouvert: boolean;
  onFermer: () => void;
}) {
  /* Monté seulement quand il est ouvert (cf. `LigneUtilisateur`) : l'état part
     donc des valeurs actuelles à chaque ouverture, sans effet de remise à zéro. */
  const [nom, setNom] = useState(utilisateur.nom);
  const [email, setEmail] = useState(utilisateur.email);
  const [motDePasse, setMotDePasse] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const nomChange = nom.trim() !== utilisateur.nom;
  const emailChange = email.trim().toLowerCase() !== utilisateur.email;
  const motDePasseChange = motDePasse !== "";
  const rienAEnvoyer = !nomChange && !emailChange && !motDePasseChange;
  const fermeLesSessions = emailChange || motDePasseChange;

  async function soumettre() {
    if (envoi || rienAEnvoyer) return;
    setErreur(null);
    setEnvoi(true);

    /* On n'envoie que ce qui change : c'est ce qui permet au serveur de ne
       toucher à rien d'autre, et de ne révoquer les jetons que pour les deux
       champs qui le méritent. */
    const modification: ModificationGerant = { uid: utilisateur.uid };
    if (nomChange) modification.nom = nom;
    if (emailChange) modification.email = email;
    if (motDePasseChange) modification.motDePasse = motDePasse;

    try {
      await modifierGerant(modification);
      onFermer();
    } catch (cause) {
      setErreur(messageErreurUtilisateur(cause));
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <Modale
      ouvert={ouvert}
      onFermer={onFermer}
      titre={`Modifier ${utilisateur.nom}`}
      description="Ce que ce compte porte aujourd’hui. Laissez un champ tel quel pour ne pas y toucher."
      taille="etroite"
      pied={
        <div className="ml-auto flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onFermer}
            disabled={envoi}
            className="bouton bouton-discret"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={soumettre}
            disabled={envoi || rienAEnvoyer}
            className="bouton bouton-principal"
          >
            {envoi && <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />}
            {envoi ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      }
    >
      <div
        /* Entrée valide, comme le ferait un formulaire — mais ce n'en est pas
           un : la modale porte déjà son pied d'actions, et un `<form>` y
           ajouterait une seconde façon de soumettre. */
        onKeyDown={(evenement) => {
          if (evenement.key === "Enter" && evenement.target instanceof HTMLInputElement) {
            evenement.preventDefault();
            void soumettre();
          }
        }}
        className="space-y-4"
      >
        <p className="flex gap-2 text-corps text-encre-doux">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>Cette action demande du réseau, contrairement au reste de l’application.</span>
        </p>

        <Champ
          id="modifier-nom"
          libelle="Nom"
          aide="Les ventes déjà enregistrées gardent l’ancien nom : un journal ne se réécrit pas."
        >
          <input
            id="modifier-nom"
            value={nom}
            maxLength={200}
            autoFocus
            onChange={(evenement) => setNom(evenement.target.value)}
            aria-describedby="modifier-nom-aide"
            className="saisie"
          />
        </Champ>

        <Champ id="modifier-email" libelle="Adresse e-mail">
          <input
            id="modifier-email"
            type="email"
            inputMode="email"
            value={email}
            onChange={(evenement) => setEmail(evenement.target.value)}
            className="saisie"
          />
        </Champ>

        <Champ
          id="modifier-mot-de-passe"
          libelle="Nouveau mot de passe"
          facultatif
          aide="Laissez vide pour garder le mot de passe actuel. Au moins 10 caractères, affiché en clair pour que vous puissiez le dicter."
        >
          <input
            id="modifier-mot-de-passe"
            type="text"
            autoComplete="off"
            value={motDePasse}
            onChange={(evenement) => setMotDePasse(evenement.target.value)}
            aria-describedby="modifier-mot-de-passe-aide"
            className="saisie font-code"
          />
        </Champ>

        {/* La conséquence s'annonce avant le geste. Après, il est trop tard pour
            prévenir le gérant qui vient d'être déconnecté en pleine vente.

            « Devra se reconnecter » plutôt que « sera déconnecté » : la seconde
            tournure s'accorde avec la personne, et un prénom ne dit pas comment
            l'accorder. C'est déjà la formule du rattachement, juste à côté. */}
        {fermeLesSessions && (
          <p className="rounded-plaque border border-bord bg-fond p-3 text-corps text-encre-doux">
            {utilisateur.nom} devra se reconnecter&nbsp;: changer l’adresse de connexion ou le mot
            de passe ferme les sessions ouvertes. Prévenez cette personne, et dictez-lui ses
            nouveaux identifiants.
          </p>
        )}

        <EtatErreurSaisie message={erreur} />
      </div>
    </Modale>
  );
}
