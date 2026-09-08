import type { ReactNode } from "react";

/**
 * Le champ : son intitulé, sa saisie, son aide, son erreur — dans cet ordre.
 *
 * La saisie est passée en enfant plutôt que décrite en propriétés. Le produit
 * emploie l’`input` natif, le `select` natif et le champ date natif
 * (`ARCHITECTURE.md` §1, échelle 3) : les décrire tous derrière une même liste
 * de propriétés aurait produit le composant à quinze options que ce principe
 * interdit. Ce qui se répète vraiment, c’est l’enveloppe — et c’est elle qu’on
 * écrit une fois.
 *
 * **L’erreur se lit deux fois, jamais par la couleur seule** : le texte sous le
 * champ le dit, et `aria-describedby` le porte à qui n’a pas l’écran. Au
 * comptoir, en plein soleil sur un écran bon marché, le rouge est la première
 * chose qui disparaît (`DESIGN.md` §11).
 *
 * `facultatif` marque le facultatif, pas l’obligatoire. Sur un formulaire dont
 * presque tout est requis, l’astérisque partout ne dit plus rien ; c’est
 * l’exception qui mérite le mot.
 */
export function Champ({
  id,
  libelle,
  facultatif = false,
  aide,
  erreur,
  children,
}: {
  id: string;
  libelle: string;
  facultatif?: boolean;
  aide?: ReactNode;
  erreur?: string | null;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="block font-medium text-encre">
        {libelle}
        {facultatif && <span className="font-normal text-encre-doux"> (facultatif)</span>}
      </label>
      <div className="mt-1.5">{children}</div>
      {aide && (
        <p id={`${id}-aide`} className="mt-1 text-corps text-encre-doux">
          {aide}
        </p>
      )}
      {erreur && (
        <p id={`${id}-erreur`} className="mt-1 text-corps font-semibold text-alerte">
          {erreur}
        </p>
      )}
    </div>
  );
}
