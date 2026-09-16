"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * L'ancienne adresse de la saisie d'une vente — désormais une redirection.
 *
 * Depuis S44 la vente s'enregistre dans une modale posée sur le registre des
 * ventes, ouverte par `?nouvelle=1`. Cette page ne rend plus de formulaire ;
 * elle existe pour les raccourcis déjà pris : un favori, une icône posée sur
 * l'écran d'accueil du téléphone, un lien collé dans une conversation.
 *
 * **Elle reste dans `ECRANS_HORS_LIGNE`** (`next.config.ts`), et c'est le point
 * de cette page : un raccourci ouvert réseau coupé doit aboutir. Sans cette
 * entrée de cache, il tomberait sur la page de repli — précisément le défaut
 * que D39 et D40 ont mesuré en S5.
 *
 * `replace` et non `push` : l'ancienne adresse ne mérite pas une entrée dans
 * l'historique, sans quoi le bouton « retour » y repasserait et redirigerait à
 * nouveau, en boucle.
 */
export default function RedirectionNouvelleVente() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/motos/ventes?nouvelle=1");
  }, [router]);

  /* Pas un écran blanc le temps de la redirection : sur un téléphone lent, ou
     réseau coupé, elle prend un instant visible (`DESIGN.md` §10). */
  return (
    <p aria-live="polite" className="text-encre-doux">
      Ouverture de la nouvelle vente…
    </p>
  );
}
