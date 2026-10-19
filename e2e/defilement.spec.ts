import { expect, test } from "@playwright/test";
import { preparerTerrain, seConnecterEtEntrer } from "./aide";

/**
 * Une seule barre de défilement à la fois.
 *
 * **Le défaut, et pourquoi il a tenu si longtemps.** La coquille est bâtie sur
 * une promesse simple : la navigation ne bouge pas, et c'est la zone de travail
 * qui défile. Le commanditaire a pourtant compté **deux** ascenseurs à l'écran.
 * Deux causes, sans rapport l'une avec l'autre, chacune invisible à la lecture
 * du CSS :
 *
 * 1. `Tableau` pose un `<caption class="sr-only">`, et `sr-only` veut dire
 *    `position: absolute`. Aucun ancêtre jusqu'à `<html>` n'étant positionné,
 *    son bloc conteneur était **le document** : son débordement était compté
 *    par la fenêtre, qui se mettait à défiler par-dessus `main`. Mesuré :
 *    `html.scrollHeight` figé à 944 px quelle que soit la hauteur de la
 *    fenêtre. C'est le piège de `sr-only` que le dépôt a déjà payé une fois
 *    (D102), à un autre endroit.
 * 2. `.cadre-tableau` se plafonnait à `calc(100dvh - 14rem)`. Ces `14rem`
 *    devinaient la hauteur de ce qui surmonte le tableau — titre d'écran et
 *    rien d'autre. Dès qu'une barre de filtres s'ajoutait, le tableau était
 *    bridé pendant que la page débordait : les deux défilaient.
 *
 * **Pourquoi ce fichier fixe sa propre fenêtre.** La suite ne tourne que sur un
 * profil Pixel 7 (`playwright.config.ts`). Les deux défauts ci-dessus sont des
 * défauts de bureau : le plafond du tableau ne s'applique qu'au-dessus de
 * 1024 px, et il faut une fenêtre assez basse pour que la page déborde. Sur un
 * téléphone, aucun des deux ne se voit — la suite serait restée verte pendant
 * que l'écran avait tort.
 *
 * La hauteur de 860 px n'est pas arbitraire : c'est l'ordre de grandeur de ce
 * qu'un Chrome maximisé laisse d'un écran 1080p une fois ses barres d'onglets
 * et d'adresse déduites. C'est la fenêtre du commanditaire.
 */
test.use({
  viewport: { width: 1920, height: 860 },
  isMobile: false,
  hasTouch: false,
});

/** Les écrans qui portent un tableau, donc ceux qui peuvent en fabriquer deux. */
const ECRANS = [
  { chemin: "/supervision", titre: "Supervision" },
  { chemin: "/motos/ventes", titre: "Ventes" },
  { chemin: "/motos", titre: "Stock motos" },
  { chemin: "/motos/paiements", titre: "Paiements" },
  /* « Le bilan consolidé » depuis S55 : la caisse se lit sur une période, plus
     sur la seule journée, et le responsable y arrive en périmètre entreprise.
     Dans une boutique, le même écran s'intitule « Journal de caisse ». */
  { chemin: "/caisse", titre: "Le bilan consolidé" },
];

/**
 * Recense les zones qui débordent vraiment, dans le navigateur.
 *
 * On ne regarde pas la gouttière peinte : en mode sans affichage, Chromium
 * dessine des barres en recouvrement, qui n'occupent aucune largeur. Ce qui
 * décide, c'est `scrollHeight > clientHeight` sur une zone défilable — là où le
 * Chrome du comptoir peindra un ascenseur.
 */
async function barresDeDefilement(page: import("@playwright/test").Page): Promise<string[]> {
  return page.evaluate(() => {
    const noms: string[] = [];
    const doc = document.scrollingElement;
    if (doc && doc.scrollHeight - doc.clientHeight > 1) noms.push("la fenêtre");

    for (const element of document.querySelectorAll("*")) {
      const style = getComputedStyle(element);
      if (!/^(auto|scroll)$/.test(style.overflowY)) continue;
      if (element.scrollHeight - element.clientHeight <= 1) continue;
      const classes = element.className.toString().trim().split(/\s+/).slice(0, 2).join(".");
      noms.push(`${element.tagName.toLowerCase()}${classes ? `.${classes}` : ""}`);
    }
    return noms;
  });
}

test.describe("Le défilement de la coquille", () => {
  for (const { chemin, titre } of ECRANS) {
    test(`${chemin} ne montre qu'un seul ascenseur`, async ({ page }) => {
      await seConnecterEtEntrer(page);

      /* Un `goto` franc, même pour l'écran où la connexion dépose déjà. Le
         défaut du `caption` absolu ne se voit qu'au **chargement** de la page :
         après une navigation interne, la hauteur du document a déjà été
         recalculée et la fenêtre ne défile plus. C'est le chargement direct que
         fait le comptoir — une adresse tapée, une touche F5. Mesuré : le même
         écran rend « fenêtre qui défile » en `goto` et « rien » en navigation
         interne. */
      await page.goto(chemin);
      await expect(page.getByRole("heading", { name: titre, level: 1 })).toBeVisible();

      /* On attend le tableau lui-même, pas un délai. Les deux défauts naissent
         de lui : le `caption` absolu et le plafond du cadre. Mesuré en
         construisant ce test — à 1,5 s, les ventes de la supervision n'étaient
         pas encore arrivées, l'écran n'avait pas de tableau, et le test rendait
         un « rien à signaler » qui ne portait sur rien. Un écran sans tableau
         passe tout de même : il n'a aucun des deux défauts à montrer. */
      await expect(page.getByRole("main")).toBeVisible();
      await page
        .locator("table")
        .first()
        .waitFor({ state: "visible", timeout: 20_000 })
        .catch(() => undefined);
      await page.waitForTimeout(1_500);

      const barres = await barresDeDefilement(page);
      expect(
        barres,
        `${chemin} : la coquille promet un seul ascenseur, celui de la zone de travail. ` +
          `Trouvé ${barres.length} — ${barres.join(", ") || "aucun"}.`,
      ).not.toContain("la fenêtre");
      expect(barres.length, `${chemin} : ascenseurs trouvés — ${barres.join(", ")}`).toBeLessThanOrEqual(1);
    });
  }
});

/**
 * **Les groupes de la colonne ne se peignent pas par-dessus son pied.**
 *
 * Le commanditaire l'a vu dans l'espace Motos : « regarde le bas, ça se
 * chevauche ». « Réservé au responsable » et ses deux écrans passaient sur
 * l'adresse du compte, illisibles tous les deux.
 *
 * La cause tenait à une classe : le bloc des groupes gardait un `min-h-0`
 * laissé par le défilement interne retiré en S54. Un élément flex ainsi marqué
 * a le droit de rétrécir **sous** la hauteur de son contenu — le contenu, lui,
 * continue de se peindre, mais hors de la boîte, et la colonne ne sait même pas
 * qu'elle déborde. Aucun ascenseur n'apparaît : c'est un chevauchement muet,
 * que seule la géométrie dénonce.
 *
 * **La fenêtre est basse exprès.** À 860 px la colonne tient, et le défaut
 * dort. Il ne se réveille que lorsque les quatre groupes du responsable
 * dépassent la hauteur disponible — soit l'ordinateur portable du comptoir.
 */
test.describe("La colonne de navigation", () => {
  test.use({ viewport: { width: 1280, height: 620 } });

  test("l’espace Motos ne fait pas chevaucher ses groupes et le pied de colonne", async ({
    page,
  }) => {
    await seConnecterEtEntrer(page);
    /* **Ce témoin fabrique son décor.** Sans boutique déclarée, il n'existe pas
       d'espace Motos du tout : la colonne reste celle de la supervision, et le
       test mesurerait un écran qui n'est pas celui du défaut. Le reste de ce
       fichier hérite encore du décor des autres suites — fragilité ancienne,
       qui le fait échouer lancé seul. */
    await preparerTerrain(page);
    await page.goto("/motos");
    await expect(page.getByRole("heading", { name: "Stock motos", level: 1 })).toBeVisible();

    const colonne = page.getByRole("navigation", { name: /Écrans de l’espace/ });
    const pied = colonne.getByRole("link", { name: /Responsable/ });
    const dernier = colonne.getByRole("link", { name: /Provenances et frais/ });

    await expect(pied).toBeVisible();
    await expect(dernier).toBeVisible();

    const boitePied = await pied.boundingBox();
    const boiteDernier = await dernier.boundingBox();
    /* Une boîte absente n'est pas un chevauchement : c'est un élément qui n'est
       pas rendu, et l'assertion suivante n'aurait rien à mesurer. */
    if (!boitePied || !boiteDernier) {
      throw new Error("La colonne n’a pas de géométrie : il n’y a rien à mesurer.");
    }

    /* Le bas du dernier écran doit s'arrêter avant le haut du pied. Un pixel de
       tolérance : les bordures se rendent en sous-pixels selon le zoom. */
    expect(
      boiteDernier.y + boiteDernier.height,
      "« Provenances et frais » se peint par-dessus le pied de colonne",
    ).toBeLessThanOrEqual(boitePied.y + 1);
  });
});
