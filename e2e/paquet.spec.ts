import { expect, test } from "@playwright/test";
import {
  contenu,
  creerPrestataire,
  nomUnique,
  preparerTerrain,
  seConnecterEtEntrer,
  vendreDansLeTerrain,
} from "./aide";

/**
 * Le paquet de cartes grises (S53, arbitrages 2, 6 et 9).
 *
 * Ce qui se joue ici est le geste réel du comptoir : on tend dix cartes grises
 * à quelqu’un, on verse **une** avance, et on les récupère au fur et à mesure.
 * Le produit ne savait confier qu’une carte à la fois — dix dépôts, dix sorties
 * de caisse, dix fois le même nom tapé.
 *
 * Trois choses se vérifient ensemble, et c’est leur conjonction qui compte :
 * le dépôt groupé part en un geste, le retour reste **partiel** sans qu’aucune
 * case ne le dise, et la caisse ne voit qu’**une** ligne.
 *
 * **Le décor ne peut pas appeler `vendre` deux fois**, et c’est la première
 * chose qu’une rédaction naïve se prend dans les pieds : `vendre` monte son
 * propre terrain, donc sa propre boutique. Deux appels donnent deux boutiques,
 * et l’écran des dossiers — borné au périmètre courant — ne montre alors qu’une
 * des deux ventes. Un paquet appartient à **une** boutique : les deux cartes
 * doivent donc naître dans le même terrain.
 */

/* Le décor est plus lourd qu’ailleurs : un terrain, deux motos, deux clients,
   deux ventes. Chaque étape passe par l’interface, c’est le vrai chemin. */
test.beforeEach(({}, informations) => {
  informations.setTimeout(420_000);
});

test("deux cartes grises partent en un paquet, et reviennent une par une", async ({ page }) => {
  await seConnecterEtEntrer(page);
  const prestataire = nomUnique("Ouedraogo");
  await creerPrestataire(page, prestataire);

  const terrain = await preparerTerrain(page);
  const { numero: premier } = await vendreDansLeTerrain(page, terrain, "PQA");
  const { numero: second } = await vendreDansLeTerrain(page, terrain, "PQB");

  await page.goto("/motos/dossiers", { waitUntil: "load" });

  /* On coche les deux cartes grises, et la barre dit combien partent. */
  for (const numero of [premier, second]) {
    const ligne = contenu(page).locator("tbody tr").filter({ hasText: numero });
    await expect(ligne).toHaveCount(1, { timeout: 30_000 });
    /* `click` et non `check` : la case est contrôlée par un état React que
       l’écoute Firestore alimente, et `check` vérifie l’état dans l’intervalle
       où React la remet sur la valeur reçue. */
    await ligne.getByRole("checkbox", { name: /Confier la carte grise/ }).click();
  }

  const bouton = contenu(page).getByRole("button", { name: /Confier 2 cartes grises/ });
  await expect(bouton).toBeVisible({ timeout: 30_000 });
  await bouton.click();

  const modal = page.getByRole("dialog");
  await modal.getByLabel("Prestataire").selectOption({ label: prestataire });
  await modal.getByLabel("Avance versée").fill("150000");

  /* Ce qui part est relu avant de valider : dix cartes confiées à la mauvaise
     personne ne se rattrapent qu’en allant la voir. */
  await expect(modal).toContainText(premier);
  await expect(modal).toContainText(second);

  await modal.getByRole("button", { name: "Confier le paquet" }).click();

  /* Le paquet se voit en une ligne, avec le nom et ce qui reste dehors. */
  await expect(contenu(page)).toContainText(prestataire, { timeout: 60_000 });
  await expect(contenu(page)).toContainText("2 dehors sur 2", { timeout: 60_000 });

  /* **Arbitrage 9 : le retour est partiel.** Une seule revient, et le paquet
     reste ouvert sans qu’aucun geste ne le dise. */
  const ligne = contenu(page).locator("tbody tr").filter({ hasText: premier });
  await ligne.getByRole("button", { name: new RegExp(`Carte grise de ${premier}`) }).click();
  const relais = contenu(page).locator("section").filter({ hasText: "Carte grise de" });
  await relais.getByRole("button", { name: "Arrivé au magasin" }).click();

  await expect(contenu(page)).toContainText("1 dehors sur 2", { timeout: 60_000 });

  /* **Une seule sortie de caisse, pas deux.** C’est le critère que le journal
     doit refléter : un geste, une ligne. */
  await page.goto("/caisse", { waitUntil: "load" });
  await expect(contenu(page).getByText(/2 cartes grises/).first()).toBeVisible({
    timeout: 60_000,
  });
});
