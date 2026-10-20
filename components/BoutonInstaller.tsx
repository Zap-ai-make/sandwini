"use client";

import { Download, Share } from "lucide-react";
import { useEffect, useState } from "react";

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
 */

/** Le type n'existe pas encore dans les définitions du DOM. */
type InviteInstallation = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function surIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  /* `MSStream` écarte les vieux Windows Phone, qui se déclaraient « like
     iPhone » dans leur identifiant. */
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) &&
    !(globalThis as { MSStream?: unknown }).MSStream
  );
}

/** Vrai quand l'application tourne déjà depuis l'écran d'accueil. */
function dejaInstallee(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    /* Le drapeau propriétaire d'iOS, seul moyen de le savoir sur Safari. */
    (navigator as { standalone?: boolean }).standalone === true
  );
}

export function BoutonInstaller() {
  const [invite, setInvite] = useState<InviteInstallation | null>(null);
  const [posee, setPosee] = useState(false);
  /* Rien n'est décidé au premier rendu : le serveur ne connaît ni le
     navigateur ni le mode d'affichage, et trancher trop tôt ferait clignoter
     la carte à l'hydratation. */
  const [examine, setExamine] = useState(false);

  useEffect(() => {
    setPosee(dejaInstallee());
    setExamine(true);

    const retenir = (evenement: Event) => {
      /* Sans ça, Chrome affiche sa propre bannière et la retire aussitôt. On
         la garde pour la rejouer au moment choisi par l'utilisateur. */
      evenement.preventDefault();
      setInvite(evenement as InviteInstallation);
    };
    const installee = () => {
      setPosee(true);
      setInvite(null);
    };

    window.addEventListener("beforeinstallprompt", retenir);
    window.addEventListener("appinstalled", installee);
    return () => {
      window.removeEventListener("beforeinstallprompt", retenir);
      window.removeEventListener("appinstalled", installee);
    };
  }, []);

  if (!examine) return null;

  if (posee) {
    return (
      <p className="text-sm text-encre-doux">
        L’application est installée sur cet appareil. Elle s’ouvre sans navigateur et fonctionne
        sans réseau.
      </p>
    );
  }

  if (invite) {
    return (
      <div>
        <button
          type="button"
          onClick={() => {
            void invite.prompt();
            /* L'invite ne se rejoue pas : une fois consommée, le navigateur
               la refuse. On la retire donc du bouton plutôt que de laisser
               cliquer dans le vide. */
            setInvite(null);
          }}
          className="bouton bouton-principal gap-1.5"
        >
          <Download aria-hidden="true" className="size-4" />
          Installer l’application
        </button>
        <p className="mt-2 text-sm text-encre-doux">
          Elle s’ouvrira comme une application, sans barre d’adresse, et continuera de fonctionner
          quand le réseau tombe.
        </p>
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
  return (
    <p className="text-sm text-encre-doux">
      Pour poser l’application sur l’écran d’accueil, ouvrez le menu de votre navigateur et
      choisissez « Installer » ou « Ajouter à l’écran d’accueil ».
    </p>
  );
}
