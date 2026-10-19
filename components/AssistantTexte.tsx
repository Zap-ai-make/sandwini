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

export function AssistantTexte({ texte }: { texte: string }) {
  const blocs = lireMarkdown(texte);

  return (
    <div className="text-encre">
      {blocs.map((bloc, rang) => {
        if (bloc.type === "titre") {
          return (
            <p key={rang} className="mt-3 font-semibold text-encre first:mt-0">
              <Fragments fragments={bloc.fragments} />
            </p>
          );
        }

        if (bloc.type === "liste") {
          return (
            <ul key={rang} className="mt-2 first:mt-0">
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
                  </span>
                </li>
              ))}
            </ul>
          );
        }

        return (
          <p key={rang} className="mt-2 whitespace-pre-wrap first:mt-0">
            <Fragments fragments={bloc.fragments} />
          </p>
        );
      })}
    </div>
  );
}
