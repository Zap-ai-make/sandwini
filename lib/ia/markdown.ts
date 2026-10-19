/**
 * Le balisage que rend un modèle, transformé en structure à afficher.
 *
 * **Pourquoi écrire ça plutôt que prendre une bibliothèque.** Trois raisons, et
 * la première suffirait. La CSP de ce produit n'autorise aucun script
 * extérieur ; une bibliothèque Markdown pèse plus que tout l'assistant réuni,
 * sur des téléphones qui chargent en 3,5G ; et surtout la plupart rendent du
 * **HTML**, qu'il faudrait alors injecter dans la page.
 *
 * **Le point de sécurité, et il n'est pas théorique.** Ce texte vient d'un
 * modèle qui a lui-même lu des noms de clients et des notes saisis au comptoir.
 * Rendu comme du balisage, un `<img onerror>` glissé dans une note s'exécuterait
 * chez le gérant. Ici rien n'est interprété : tout ressort en texte, et le
 * composant l'affiche avec React, qui échappe de lui-même. Aucune injection de
 * HTML nulle part dans la chaîne.
 *
 * Volontairement incomplet : gras, listes imbriquées, titres, code court. Le
 * modèle a pour consigne de rester simple, et ce qui n'est pas reconnu
 * s'affiche tel quel — ce qui est la bonne dégradation. Jamais un écran vide.
 */

export type Fragment = { texte: string; gras?: true; code?: true };

export type ElementListe = { niveau: number; fragments: Fragment[] };

export type Bloc =
  | { type: "paragraphe"; fragments: Fragment[] }
  | { type: "titre"; fragments: Fragment[] }
  | { type: "liste"; elements: ElementListe[] };

const LIGNE_LISTE = /^(\s*)[-*•]\s+(.*)$/;
const LIGNE_TITRE = /^#{1,6}\s+(.*)$/;

/**
 * Découpe une ligne en fragments gras, code et texte simple.
 *
 * **Une marque non refermée ouvre jusqu'à la fin**, au lieu de ressortir en
 * texte. C'est ce qui rend le flux lisible : pendant qu'il arrive,
 * « Nous avons **21 » est un état normal d'une demi-seconde, et la réponse ne
 * doit ni clignoter ni afficher des étoiles qui disparaîtront.
 */
function fragmenter(ligne: string): Fragment[] {
  const fragments: Fragment[] = [];
  let reste = ligne;

  while (reste.length > 0) {
    const gras = reste.indexOf("**");
    const code = reste.indexOf("`");
    /* La marque la plus proche gagne : sinon « `a` **b** » rendrait le gras
       avant le code et mélangerait les deux. */
    const marque =
      gras === -1 ? code : code === -1 ? gras : Math.min(gras, code);

    if (marque === -1) {
      fragments.push({ texte: reste });
      break;
    }

    if (marque > 0) fragments.push({ texte: reste.slice(0, marque) });

    const estGras = reste.startsWith("**", marque);
    const ouverture = marque + (estGras ? 2 : 1);
    const fermeture = reste.indexOf(estGras ? "**" : "`", ouverture);

    if (fermeture === -1) {
      const contenu = reste.slice(ouverture);
      if (contenu) fragments.push(estGras ? { texte: contenu, gras: true } : { texte: contenu, code: true });
      break;
    }

    const contenu = reste.slice(ouverture, fermeture);
    if (contenu) fragments.push(estGras ? { texte: contenu, gras: true } : { texte: contenu, code: true });
    reste = reste.slice(fermeture + (estGras ? 2 : 1));
  }

  return fragments.filter((fragment) => fragment.texte !== "");
}

export function lireMarkdown(texte: string): Bloc[] {
  const blocs: Bloc[] = [];
  /* Les lignes d'un même paragraphe s'accumulent ici ; une ligne vide, un titre
     ou une liste les chasse. */
  let paragraphe: string[] = [];
  let liste: ElementListe[] | null = null;

  const viderParagraphe = () => {
    if (paragraphe.length === 0) return;
    blocs.push({ type: "paragraphe", fragments: fragmenter(paragraphe.join("\n")) });
    paragraphe = [];
  };
  const viderListe = () => {
    if (liste === null) return;
    blocs.push({ type: "liste", elements: liste });
    liste = null;
  };

  for (const ligne of texte.split("\n")) {
    if (ligne.trim() === "") {
      viderParagraphe();
      viderListe();
      continue;
    }

    const titre = LIGNE_TITRE.exec(ligne);
    if (titre) {
      viderParagraphe();
      viderListe();
      blocs.push({ type: "titre", fragments: fragmenter(titre[1]) });
      continue;
    }

    const element = LIGNE_LISTE.exec(ligne);
    if (element) {
      viderParagraphe();
      /* Deux espaces par niveau, ce que produisent tous les modèles. Une
         tabulation compte pour un niveau entier. */
      const indentation = element[1].replace(/\t/g, "  ").length;
      liste ??= [];
      liste.push({ niveau: Math.floor(indentation / 2), fragments: fragmenter(element[2]) });
      continue;
    }

    viderListe();
    paragraphe.push(ligne);
  }

  viderParagraphe();
  viderListe();
  return blocs;
}
