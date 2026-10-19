import { describe, expect, it } from "vitest";
import { PROJET_EMULATEUR, projetsCompiles, verdictGarde } from "./garde-emulateurs";

/**
 * Le trou que ce module ferme (constaté le 6 octobre 2026, corrigé en S53).
 *
 * `playwright.config.ts` refusait de lancer la suite hors émulateurs, et il
 * avait raison : ces tests créent puis effacent des comptes, des boutiques et
 * des ventes. Mais il ne lisait que le **texte** de `.env.local` ou `.env`.
 *
 * Or son `webServer` sert un build **déjà compilé**, et les `NEXT_PUBLIC_*` y
 * sont figées au moment du `next build`. Poser le fichier puis lancer la suite
 * sans recompiler faisait donc passer le garde pendant que le navigateur
 * parlait au vrai projet. Le fichier disait une chose, le paquet en faisait une
 * autre, et c'est le paquet qui décide.
 */

/* Le fragment tel qu'il sort du build : la configuration y est minifiée, et
   c'est `projectId` qui nomme sans ambiguïté le projet visé. */
const fragment = (projet: string) =>
  `apiKey:"x",authDomain:"${projet}.firebaseapp.com",projectId:"${projet}",appId:"1:0:web:0"`;

describe("projetsCompiles", () => {
  it("lit le projet visé par un fragment", () => {
    expect(projetsCompiles([fragment("sdi-dev")])).toEqual(["sdi-dev"]);
  });

  /* Le même projet apparaît dans plusieurs fragments — il ne compte qu'une
     fois, sinon le message d'erreur réciterait vingt lignes identiques. */
  it("ne nomme qu’une fois un projet répété", () => {
    expect(projetsCompiles([fragment("sdi-dev"), fragment("sdi-dev")])).toEqual(["sdi-dev"]);
  });

  it("ne trouve rien dans un paquet sans configuration", () => {
    expect(projetsCompiles(["self.define=1;"])).toEqual([]);
  });
});

describe("verdictGarde", () => {
  it("laisse passer un build compilé pour les émulateurs", () => {
    expect(verdictGarde([PROJET_EMULATEUR])).toBeNull();
  });

  /* **Le cas que le garde laissait passer.** Le build vise le vrai projet ;
     la suite y créerait puis détruirait des données. Le message doit nommer le
     projet trouvé, parce que « ce n'est pas le bon » n'apprend rien à qui vient
     de poser un fichier d'environnement et croit avoir tout fait. */
  it("refuse un build compilé pour un vrai projet, et le nomme", () => {
    const verdict = verdictGarde(["sandwini"]);
    expect(verdict).toContain("sandwini");
    expect(verdict).toContain("npm run build");
  });

  /* Deux projets dans un même paquet : on ne sait pas lequel le navigateur
     utilisera, donc on ne parie pas. */
  it("refuse un paquet qui désigne deux projets", () => {
    expect(verdictGarde([PROJET_EMULATEUR, "sandwini"])).toContain("sandwini");
  });

  /* Aucun projet trouvé : soit il n'y a pas de build, soit le format a changé.
     Dans les deux cas le garde ne sait plus rien, et un garde qui ne sait rien
     doit refuser — c'est exactement la faute qu'il vient réparer. */
  it("refuse quand il ne trouve aucun projet", () => {
    expect(verdictGarde([])).toContain("aucune configuration Firebase");
  });
});
