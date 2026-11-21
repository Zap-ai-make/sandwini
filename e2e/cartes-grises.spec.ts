import { expect, test } from "@playwright/test";
import { attendreLaFileVide, contenu, seConnecterEtEntrer, vendre } from "./aide";

/**
 * L'espace des cartes grises, détaché des ventes (20 novembre 2026).
 *
 * « Une vente ne doit pas envoyer directement le dossier dans cartes grises,
 * ça doit être manuel. » La vente écrit son dossier « à envoyer » : il n'est
 * dans aucune liste de l'espace, et quelqu'un l'y fait entrer à la main,
 * depuis « Ajouter une moto vendue », en le cherchant par son châssis.
 */
test("une moto vendue n’entre dans les cartes grises qu’ajoutée à la main", async ({ page }) => {
  await seConnecterEtEntrer(page);
  const { chassis } = await vendre(page, { mode: "Crédit", prix: "1200000", encaisse: "400000" });
  await attendreLaFileVide(page);

  await page.goto("/cartes-grises", { waitUntil: "load" });
  const ajouter = contenu(page).getByRole("button", { name: "Ajouter une moto vendue" });
  /* Le bouton s'ouvre une fois la liste lue : avant, son absence ne
     prouverait rien. */
  await expect(ajouter).toBeEnabled();
  await expect(contenu(page).getByText(chassis)).toHaveCount(0);

  await ajouter.click();
  const modale = page.getByRole("dialog", { name: "Ajouter une moto vendue" });
  /* La fin du châssis suffit : c'est ce qu'on relève sur le cadre. */
  await modale.getByLabel("Châssis ou client").fill(chassis.slice(-6));
  await modale.getByRole("checkbox", { name: new RegExp(chassis) }).check();
  await modale.getByRole("button", { name: "Ajouter aux cartes grises" }).click();
  await expect(modale).toBeHidden();

  await expect(contenu(page).getByText(chassis)).toBeVisible();

  /* Et il y reste : l'envoi est parvenu au serveur, pas seulement au cache. */
  await attendreLaFileVide(page);
  await page.reload({ waitUntil: "load" });
  await expect(contenu(page).getByText(chassis)).toBeVisible({ timeout: 20_000 });
});
