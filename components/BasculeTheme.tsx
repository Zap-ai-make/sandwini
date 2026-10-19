"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

/**
 * La bascule clair / sombre.
 *
 * **Pourquoi elle existe.** Le produit suivait `prefers-color-scheme` et rien
 * d’autre. Un gérant qui travaille en plein jour sous une tôle n’a pas de
 * réglage système à sa main : sur un poste partagé au comptoir, changer le
 * thème de Windows pour lire un écran n’est pas une option. Les maquettes
 * posent une bascule explicite en pied de rail, et `CAHIER-UI.md` §19 en
 * faisait une question ouverte — le commanditaire l’a tranchée en validant les
 * maquettes.
 *
 * **Deux états, et le clair est le défaut** (S54, décision du commanditaire).
 * Le produit suivait `prefers-color-scheme`, ce qui ouvrait l’application en
 * sombre sur toute machine réglée ainsi — alors qu’on travaille au comptoir,
 * souvent en plein jour. L’absence d’attribut vaut donc **clair**, et le
 * sombre ne s’obtient qu’en appuyant ici.
 *
 * Ce que ça retire : le suivi automatique du réglage système. Quelqu’un qui a
 * réglé son appareil en sombre devra appuyer une fois — son choix est ensuite
 * gardé. C’est le prix assumé pour qu’aucun comptoir n’ouvre sur un écran
 * noir en plein soleil sans l’avoir demandé.
 *
 * **L’état vit sur `<html>`, pas dans React**, comme le repli de la navigation
 * — et pour la même raison, apprise au même endroit : c’est le CSS qui le lit,
 * et un script d’amorçage synchrone le pose avant la première peinture. Passer
 * par un effet ferait basculer l’écran sous les yeux à chaque chargement de
 * page, ce que personne n’a demandé.
 */
const CLE = "sdi.theme";

type Theme = "clair" | "sombre";

export function BasculeTheme({ className }: { className?: string }) {
  const sombre = useSombre();

  return (
    <button
      type="button"
      onClick={() => poser(sombre ? "clair" : "sombre")}
      /* `aria-pressed` dit l'état, et le libellé dit ce qu'on obtiendra en
         pressant — deux choses différentes, et les deux sont utiles. Le libellé
         est celui des maquettes. */
      aria-pressed={sombre}
      className={className}
    >
      {sombre ? (
        <Moon aria-hidden="true" className="size-5" />
      ) : (
        <Sun aria-hidden="true" className="size-5" />
      )}
      {sombre ? "Thème sombre" : "Thème clair"}
    </button>
  );
}

/**
 * Le thème effectivement rendu.
 *
 * Il se lit entièrement dans l'attribut depuis S54 : son absence vaut clair.
 * Avant, il fallait interroger `prefers-color-scheme` en plus — sans quoi, sur
 * une machine réglée en sombre, le bouton annonçait « Thème clair » devant un
 * écran noir. Ce décalage ne peut plus exister : plus rien hors de cet
 * attribut ne décide de la couleur.
 */
function useSombre(): boolean {
  return useSyncExternalStore(souscrire, lire, () => false);
}

function lire(): boolean {
  return document.documentElement.dataset.theme === "sombre";
}

function souscrire(auChangement: () => void): () => void {
  /* Une seule source à surveiller, et c'est tout l'intérêt : le réglage
     système ne change plus rien, donc son écoute a disparu avec lui. */
  const observateur = new MutationObserver(auChangement);
  observateur.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => observateur.disconnect();
}

function poser(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(CLE, theme);
  } catch {
    /* Navigation privée, stockage plein : la bascule marche quand même, elle
       ne survit simplement pas au rechargement. Ce n'est pas une panne. */
  }
}
