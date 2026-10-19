"use client";

import { LoaderCircle, Trash2 } from "lucide-react";
import { useState } from "react";
import { EtatErreurSaisie } from "@/components/patrons/Etats";
import { Modale } from "@/components/patrons/Modale";
import {
  messageErreurUtilisateur,
  supprimerGerant,
  type FicheUtilisateur,
} from "@/lib/repositories/utilisateurs";

/**
 * Effacer pour de bon un compte de gérant (S52).
 *
 * **La confirmation nomme le compte visé.** Une liste de comptes se ressemble —
 * même pastille, même mise en page, souvent des noms proches — et on clique sur
 * la mauvaise ligne. Un « Êtes-vous sûr ? » ne protège de rien : il demande de
 * se souvenir de ce qu'on a cliqué, au lieu de le montrer.
 *
 * **Le refus est le cas normal, et il n'est pas vérifié ici.** Seul le serveur
 * sait si ce compte a enregistré des ventes, des encaissements, des clôtures ou
 * des mouvements de stock : il interroge cinq collections, et refuse dès la
 * première signature trouvée. Le vérifier aussi dans le navigateur demanderait
 * au gérant des lectures que les règles lui refusent, et produirait une seconde
 * version de la règle — donc une occasion de diverger. L'écran dit la condition
 * d'avance, et affiche le refus du serveur tel quel.
 */
export function SupprimerGerantModal({
  utilisateur,
  ouvert,
  onFermer,
}: {
  utilisateur: FicheUtilisateur;
  ouvert: boolean;
  onFermer: () => void;
}) {
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function effacer() {
    if (envoi) return;
    setErreur(null);
    setEnvoi(true);
    try {
      await supprimerGerant(utilisateur.uid);
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
      titre="Effacer ce compte"
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
            onClick={effacer}
            disabled={envoi}
            className="bouton bouton-destructif"
          >
            {envoi ? (
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <Trash2 aria-hidden="true" className="size-4" />
            )}
            {envoi ? "Effacement…" : "Effacer définitivement"}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Le compte visé, en toutes lettres : c'est toute la confirmation. */}
        <div className="rounded-plaque border border-bord bg-fond p-3">
          <p className="font-medium text-encre">{utilisateur.nom}</p>
          <p className="text-corps wrap-break-word text-encre-doux">{utilisateur.email}</p>
          {utilisateur.boutiqueId && (
            <p className="text-corps text-encre-doux">
              Rattaché à <span className="plaque-code">{utilisateur.boutiqueId}</span>
            </p>
          )}
        </div>

        {/* « Le compte », jamais « il » : dans une phrase qui suit un prénom,
            le pronom se lit comme la personne. On parle du compte. */}
        <p className="text-corps text-encre">
          Le compte de connexion disparaît, et la ligne quitte cette liste. L’opération ne s’annule
          pas.
        </p>

        <p className="text-corps text-encre-doux">
          Elle n’aboutit que si ce compte n’a <strong className="font-semibold">rien</strong>{" "}
          enregistré — aucune vente, aucun encaissement, aucune clôture de caisse, aucun mouvement
          de stock. Sinon le serveur refuse&nbsp;: son nom doit rester lisible dans l’historique, et
          c’est <em>Désactiver</em> qu’il faut employer. Désactiver coupe l’accès et ferme les
          sessions ouvertes, sans rien effacer.
        </p>

        <EtatErreurSaisie message={erreur} />
      </div>
    </Modale>
  );
}
