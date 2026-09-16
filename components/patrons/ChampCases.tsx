"use client";

import { useState } from "react";
import { Champ } from "@/components/patrons/Champ";

/**
 * Un numéro long, saisi dans autant de cases qu'il a de chiffres.
 *
 * **Les cases sont un dessin, pas un mécanisme.** Il y a un seul `<input>`, et
 * il est réel : posé par-dessus la rangée, transparent, il garde tout ce qu'un
 * champ sait faire — le collage d'un numéro entier, le clavier numérique du
 * téléphone, la correction au retour arrière, un nom accessible, et une seule
 * annonce au lecteur d'écran. Dix-sept champs séparés auraient exactement le
 * même rendu et perdraient les cinq. C'est le raisonnement déjà écrit pour
 * `Choix` : « une pile de `<button>` aurait l'air pareille et ne dirait rien de
 * tel » (`app/(app)/motos/ventes/nouvelle/page.tsx`).
 *
 * Parce que le texte de l'`<input>` est **entièrement** transparent, rien n'a à
 * s'aligner sur les cases : elles peuvent se grouper, s'espacer, et passer à la
 * ligne sur un téléphone sans qu'un calcul de chasse ne s'en mêle.
 *
 * Ce que ce montage ne rend pas : le curseur ne se pose pas au milieu du
 * numéro. Les gestes qui comptent — taper, coller, effacer — sont intacts ;
 * placer le curseur entre deux chiffres d'un numéro qu'on recopie ne l'est pas,
 * et c'est l'échange assumé.
 */
export function ChampCases({
  id,
  libelle,
  valeur,
  changer,
  longueur,
  groupe = 4,
  facultatif = false,
  aide,
  erreur,
}: {
  id: string;
  libelle: string;
  /** Déjà normalisée par l'appelant : on n'affiche que ce qu'on rangerait. */
  valeur: string;
  changer: (valeur: string) => void;
  longueur: number;
  /** Les cases se relisent par paquets ; dix-sept d'affilée, non. */
  groupe?: number;
  facultatif?: boolean;
  aide?: string;
  erreur?: string | null;
}) {
  const [focalise, setFocalise] = useState(false);

  const complet = valeur.length === longueur;
  /* La case « en cours » est celle qu'on va remplir. Quand le numéro est
     entier, aucune ne l'est : sinon la dernière resterait allumée comme si la
     saisie continuait. */
  const active = focalise && !complet ? valeur.length : -1;

  const paquets: number[][] = [];
  for (let debut = 0; debut < longueur; debut += groupe) {
    paquets.push(
      Array.from({ length: Math.min(groupe, longueur - debut) }, (_, rang) => debut + rang),
    );
  }

  return (
    <Champ
      id={id}
      libelle={libelle}
      facultatif={facultatif}
      aide={aide ?? `${longueur} chiffres, tels qu’ils sont écrits sur la pièce.`}
      erreur={erreur}
    >
      {/* Le champ posé par-dessus est transparent et sans contour : le focus
          clavier serait donc invisible, ce que `DESIGN.md` §11 ne permet pas.
          C'est l'enveloppe qui le montre, à la place du champ — même montage
          que `Choix` sur l'écran de vente. */}
      <div
        className={[
          "relative -m-1 rounded-champ p-1",
          "has-[:focus-visible]:outline has-[:focus-visible]:outline-2",
          "has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus-trait",
        ].join(" ")}
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {paquets.map((paquet) => (
            <div key={paquet[0]} className="flex gap-1">
              {paquet.map((rang) => (
                <span
                  key={rang}
                  aria-hidden="true"
                  className={[
                    "flex h-11 w-7 items-center justify-center rounded-plaque border font-code text-champ",
                    "tabular-nums transition-colors",
                    rang === active
                      ? "border-2 border-encre bg-papier text-encre"
                      : valeur[rang]
                        ? "border-bord-fort bg-papier text-encre"
                        : "border-bord bg-fond text-encre-doux",
                  ].join(" ")}
                >
                  {valeur[rang] ?? ""}
                </span>
              ))}
            </div>
          ))}

          {/* Le compte se lit sans avoir à pointer les cases du doigt. Il est
              `aria-hidden` : le lecteur d'écran a déjà la valeur du champ, et
              l'entendre deux fois à chaque frappe serait du bruit. */}
          <span
            aria-hidden="true"
            className={[
              "text-legende tabular-nums",
              complet ? "text-solde" : "text-encre-doux",
            ].join(" ")}
          >
            {valeur.length} / {longueur}
          </span>
        </div>

        {/* Le vrai champ, par-dessus et invisible. `inset-0` plutôt qu'une
            largeur calculée : la rangée peut passer à la ligne sans qu'il
            cesse de la couvrir. */}
        <input
          id={id}
          value={valeur}
          onChange={(evenement) => changer(evenement.target.value)}
          onFocus={() => setFocalise(true)}
          onBlur={() => setFocalise(false)}
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          maxLength={longueur}
          /* L'aide est rendue par `Champ` sous cet identifiant ; c'est elle qui
             annonce la longueur attendue, et une seule fois. */
          aria-describedby={`${id}-aide`}
          className="absolute inset-0 w-full cursor-text bg-transparent text-transparent caret-transparent outline-none"
        />
      </div>
    </Champ>
  );
}
