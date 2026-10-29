import type { ReactNode } from "react";

/**
 * Le champ : son intitulé, sa saisie, son erreur — dans cet ordre.
 *
 * **Plus d'aide sous le champ** (28 octobre 2026). Le commanditaire l'a
 * demandé pour tout le produit : « on ne doit plus voir de détails ». Ce que
 * l'intitulé ne dit pas, l'erreur le dira au moment où ça compte. Une consigne
 * qu'on ne peut vraiment pas perdre va dans le `placeholder` de la saisie, qui
 * s'efface dès qu'on tape.
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
 *
 * **Dix-huit rem au plus** (29 octobre 2026). Le commanditaire trouvait les
 * champs trop longs : un nom ou un montant n'a pas besoin de la largeur de
 * l'écran. La borne est sur le champ, et non sur sa saisie, pour que des champs
 * posés dans une `.rangee-champs` se rangent côte à côte d'eux-mêmes. `large`
 * la lève — une barre de recherche garde sa longueur.
 */
export function Champ({
  id,
  libelle,
  facultatif = false,
  erreur,
  large = false,
  children,
}: {
  id: string;
  libelle: string;
  facultatif?: boolean;
  erreur?: string | null;
  large?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={large ? "champ w-full" : "champ w-full max-w-72"}>
      <label htmlFor={id} className="block font-medium text-encre">
        {libelle}
        {facultatif && <span className="font-normal text-encre-doux"> (facultatif)</span>}
      </label>
      <div className="mt-1.5">{children}</div>
      {erreur && (
        <p id={`${id}-erreur`} className="mt-1 text-corps font-semibold text-alerte">
          {erreur}
        </p>
      )}
    </div>
  );
}
