"use client";

import { Download, Share } from "lucide-react";
import { useSyncExternalStore } from "react";

import {
  dejaPosee,
  ecouterInstallation,
  lireInvite,
  proposerInstallation,
} from "@/lib/pwa/installation";

/**
 * Poser l'application sur l'écran d'accueil.
 *
 * **Le navigateur sait le faire, mais personne ne le trouve.** Chrome range
 * « Installer » au fond d'un menu à trois points, Safari derrière l'icône de
 * partage. Un gérant qui ouvre le lien une fois par jour depuis un onglet perd
 * l'écran de démarrage, le plein écran, et surtout le travail hors ligne — qui
 * est la promesse centrale du produit (D40). Le bouton le dit donc à voix
 * haute, là où l'on vient déjà régler son appareil.
 *
 * **Deux mondes, et un seul a une interface.** Chrome et Edge annoncent leur
 * disponibilité par `beforeinstallprompt`, qu'on retient pour le rejouer au
 * clic. iOS n'a pas d'équivalent — Apple ne l'expose pas — et il ne reste qu'à
 * montrer le geste. Inventer un bouton qui ne ferait rien y serait pire que la
 * phrase.
 *
 * **L'invite ne s'écoute pas ici.** Elle part une seule fois, quelques
 * centaines de millisecondes après l'ouverture de la page — bien avant que cet
 * écran ne soit monté. C'est pourquoi le bouton apparaissait puis
 * disparaissait : il ne la captait que si l'on atterrissait droit sur les
 * réglages. L'écoute vit désormais dans `lib/pwa/installation.ts`, posée dès
 * le chargement de la coquille, et ce composant ne fait que la lire.
 */

function surIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  /* `MSStream` écarte les vieux Windows Phone, qui se déclaraient « like
     iPhone » dans leur identifiant. */
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) &&
    !(globalThis as { MSStream?: unknown }).MSStream
  );
}

export function BoutonInstaller() {
  /* Au rendu serveur, on ne connaît ni le navigateur ni le mode d'affichage :
     `null` fait rendre la phrase générique, et l'hydratation la remplace sans
     clignoter puisque la valeur ne change qu'une fois. */
  const invite = useSyncExternalStore(
    ecouterInstallation,
    () => lireInvite(),
    () => null,
  );
  const posee = useSyncExternalStore(
    ecouterInstallation,
    () => dejaPosee(),
    () => false,
  );

  if (posee) {
    return null;
  }

  if (invite) {
    return (
      <div>
        <button
          type="button"
          onClick={proposerInstallation}
          className="bouton bouton-principal gap-1.5"
        >
          <Download aria-hidden="true" className="size-4" />
          Installer l’application
        </button>
      </div>
    );
  }

  if (surIOS()) {
    return (
      <div className="text-sm text-encre-doux">
        <p className="flex items-center gap-1.5 font-medium text-encre">
          <Share aria-hidden="true" className="size-4" />
          Pour l’installer sur cet iPhone
        </p>
        <p className="mt-1">
          Appuyez sur le bouton Partager, en bas de Safari, puis sur « Sur l’écran d’accueil ».
          Elle s’ouvrira ensuite sans navigateur.
        </p>
      </div>
    );
  }

  /* Ni invite ni iOS : navigateur qui ne sait pas installer, ou conditions pas
     encore réunies. Dire le geste vaut mieux que de ne rien dire — mais sans
     promettre un bouton qui n'apparaîtra peut-être jamais. */
  return null;
}
