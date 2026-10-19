import { lireMarkdown, type Fragment } from "@/lib/ia/markdown";

/**
 * Le texte d'une réponse, rendu.
 *
 * **Jamais par `dangerouslySetInnerHTML`.** Ce texte vient d'un modèle qui a
 * lui-même lu des noms de clients et des notes saisis au comptoir ; l'injecter
 * comme du balisage exécuterait ce qu'on y aurait glissé. Tout passe par React,
 * qui échappe de lui-même — c'est le pendant à l'écran de ce que
 * `lib/ia/markdown.ts` garantit à la lecture.
 */
function Fragments({ fragments }: { fragments: Fragment[] }) {
  return (
    <>
      {fragments.map((fragment, rang) => {
        if (fragment.gras) {
          return (
            <strong key={rang} className="font-semibold text-encre">
              {fragment.texte}
            </strong>
          );
        }
        if (fragment.code) {
          return (
            <code key={rang} className="font-code text-sm">
              {fragment.texte}
            </code>
          );
        }
        return <span key={rang}>{fragment.texte}</span>;
      })}
    </>
  );
}

/**
 * Le trait qui marque où en est l'écriture.
 *
 * Posé **dans** le dernier bloc, et non après le texte : à côté, il tombait à
 * la ligne suivante dès que la réponse finissait par une liste, et l'œil le
 * lisait comme un défaut d'affichage plutôt que comme une plume en train
 * d'écrire.
 */
function Curseur() {
  return (
    <span
      aria-hidden="true"
      className="ml-0.5 inline-block h-[0.95em] w-[0.45em] translate-y-[0.1em] animate-pulse rounded-[1px] bg-encre align-baseline"
    />
  );
}

export function AssistantTexte({ texte, enCours = false }: { texte: string; enCours?: boolean }) {
  const blocs = lireMarkdown(texte);
  const dernier = blocs.length - 1;

  return (
    <div className="text-[0.975rem] leading-relaxed text-encre">
      {blocs.map((bloc, rang) => {
        const curseurIci = enCours && rang === dernier;
        if (bloc.type === "titre") {
          return (
            <p key={rang} className="mt-4 font-semibold text-encre first:mt-0">
              <Fragments fragments={bloc.fragments} />
              {curseurIci && <Curseur />}
            </p>
          );
        }

        if (bloc.type === "liste") {
          return (
            <ul key={rang} className="mt-2 space-y-1 first:mt-0">
              {bloc.elements.map((element, rangElement) => (
                <li
                  key={rangElement}
                  className="flex gap-2"
                  /* L'indentation porte la hiérarchie : une boutique, puis ses
                     motos. Aplatir les deux niveaux rendrait la réponse
                     illisible dès qu'il y a deux magasins. Bornée à deux crans
                     pour ne pas sortir du panneau sur un téléphone. */
                  style={{ paddingInlineStart: `${Math.min(element.niveau, 2) * 1}rem` }}
                >
                  <span aria-hidden="true" className="text-encre-doux">
                    •
                  </span>
                  <span className="min-w-0 flex-1">
                    <Fragments fragments={element.fragments} />
                    {curseurIci && rangElement === bloc.elements.length - 1 && <Curseur />}
                  </span>
                </li>
              ))}
            </ul>
          );
        }

        return (
          <p key={rang} className="mt-3 whitespace-pre-wrap first:mt-0">
            <Fragments fragments={bloc.fragments} />
            {curseurIci && <Curseur />}
          </p>
        );
      })}
    </div>
  );
}
