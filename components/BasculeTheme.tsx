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
 * **Trois états, pas deux.** Sans choix explicite, on suit le système : c’est
 * l’acquis, et le retirer serait une régression pour qui a réglé son appareil
 * une fois pour toutes. Le choix explicite, lui, doit gagner **dans les deux
 * sens** — forcer le clair sur une machine réglée en sombre est le cas qui
 * compte au comptoir. D’où `data-theme="clair"` et `data-theme="sombre"`,
 * l’absence d’attribut valant « comme le système » (`maquettes/socle.css:155`).
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
 * Le thème effectivement rendu, système compris.
 *
 * On ne lit pas seulement l'attribut : sans choix explicite, il est absent, et
 * c'est `prefers-color-scheme` qui décide. Le bouton doit alors dire le vrai
 * état — sinon, sur une machine réglée en sombre, il annoncerait « Thème
 * clair » devant un écran noir, et le premier appui ne changerait rien de
 * visible.
 */
function useSombre(): boolean {
  return useSyncExternalStore(souscrire, lire, () => false);
}

function lire(): boolean {
  const choix = document.documentElement.dataset.theme;
  if (choix === "sombre") return true;
  if (choix === "clair") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function souscrire(auChangement: () => void): () => void {
  const observateur = new MutationObserver(auChangement);
  observateur.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  /* Le réglage système peut changer pendant qu'on travaille — la nuit tombe,
     et Windows bascule tout seul. Sans cette écoute, le bouton mentirait
     jusqu'au rechargement suivant. */
  const systeme = window.matchMedia("(prefers-color-scheme: dark)");
  systeme.addEventListener("change", auChangement);
  return () => {
    observateur.disconnect();
    systeme.removeEventListener("change", auChangement);
  };
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
