"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Les réglages n'ont plus d'accueil : ils ouvrent sur l'identité (26 octobre 2026).
 *
 * **Ce qu'il y avait ici, et pourquoi c'est parti.** Un sommaire listait les
 * écrans de réglages, répétait l'identité de l'entreprise à plat et portait la
 * version de l'appareil. Le commanditaire l'a retiré : la barre latérale liste
 * déjà ces écrans, donc le sommaire les disait deux fois, et on traversait une
 * page de transit pour arriver où l'on allait de toute façon.
 *
 * **Ce qu'elle seule portait a déménagé, et n'a pas été perdu.** La version de
 * l'appareil, l'avis de mise à jour et le bouton d'installation sont descendus
 * sur « Identité de l'entreprise », sous un titre à eux. Les supprimer aurait
 * coûté le geste qui donne le plein écran et le hors-ligne (D40), qu'aucun
 * autre écran ne propose.
 *
 * **Une redirection et non un changement d'adresse dans la barre.** L'espace
 * des réglages se reconnaît au préfixe `/parametres` : pointer la barre
 * directement sur `/parametres/entreprise` aurait fait sortir les boutiques et
 * les utilisateurs de leur propre espace. L'adresse reste donc, et elle mène.
 */
export default function PageParametres() {
  const router = useRouter();

  useEffect(() => {
    /* `replace` et non `push` : cette page n'est pas une étape, et un retour
       arrière qui retombe dessus rebondirait aussitôt. */
    router.replace("/parametres/entreprise");
  }, [router]);

  /* Le lien est là pour le temps — court — où le script n'a pas encore repris
     la main, et pour qui navigue sans lui. Un écran blanc ne dit rien. */
  return (
    <p className="mt-6 text-corps text-encre-doux">
      Ouverture des paramètres…{" "}
      <Link href="/parametres/entreprise" className="underline">
        Identité de l’entreprise
      </Link>
    </p>
  );
}
