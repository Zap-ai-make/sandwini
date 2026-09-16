import { expect, test } from "@playwright/test";
import {
  attendreLaFileVide,
  chassisUnique,
  contenu,
  nomUnique,
  preparerTerrain,
  seConnecterEtEntrer,
} from "./aide";

/**
 * Captures de l'espace arrivages (S43), en clair et en sombre — la « règle 5 »,
 * regarder le rendu. Ce n'est pas une garantie, c'est un œil : on crée un lot,
 * on ouvre son inspection, et on photographie la liste enrichie et le panneau
 * dans les deux thèmes. Lancé à la demande, viewport bureau.
 */
test("captures clair et sombre de l'espace arrivages", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await seConnecterEtEntrer(page);
  const terrain = await preparerTerrain(page);

  const fournisseur = nomUnique("Capture Import");
  const nomArrivage = nomUnique("Arrivage");
  const chassis1 = chassisUnique("CAPA");
  const chassis2 = chassisUnique("CAPB");

  await page.goto("/motos/arrivages", { waitUntil: "load" });
  await page.getByRole("button", { name: "Nouveau" }).click();
  const modal = page.getByRole("dialog").filter({ hasText: "Enregistrer un arrivage" });
  await modal.getByLabel("Nom de l’arrivage").fill(nomArrivage);
  await modal.getByRole("button", { name: "Nouveau" }).click();
  const modalFournisseur = page.getByRole("dialog").filter({ hasText: "Nouveau fournisseur" });
  await modalFournisseur.getByLabel("Nom", { exact: true }).fill(fournisseur);
  await modalFournisseur.getByRole("button", { name: "Ajouter le fournisseur" }).click();
  await expect(modal.locator("#fournisseur")).not.toHaveValue("");
  await modal.getByLabel("Marque", { exact: true }).selectOption({ label: terrain.marque });
  await modal.getByLabel("Modèle", { exact: true }).selectOption({ label: terrain.modele });
  await modal.getByLabel("Nombre de motos").fill("2");
  await modal.getByLabel("Numéro de châssis, moto 1").fill(chassis1);
  await modal.getByLabel("Numéro de châssis, moto 2").fill(chassis2);
  await modal.getByRole("button", { name: "Enregistrer le lot" }).click();
  await expect(contenu(page).getByRole("status")).toContainText("2 motos entrées", {
    timeout: 20_000,
  });
  await attendreLaFileVide(page);
  await page.reload({ waitUntil: "load" });

  // Les valeurs du produit : « clair » / « sombre » sur `dataset.theme` (BasculeTheme).
  const forcerTheme = (theme: "clair" | "sombre") =>
    page.evaluate((t) => {
      document.documentElement.dataset.theme = t;
    }, theme);

  // La liste enrichie : cartes, filtres, écoulement, complétude CMC.
  await expect(contenu(page).getByRole("button", { name: new RegExp(nomArrivage) })).toBeVisible();
  await forcerTheme("clair");
  await page.screenshot({ path: "captures/s43/arrivages-liste-clair.png", fullPage: true });
  await forcerTheme("sombre");
  await page.screenshot({ path: "captures/s43/arrivages-liste-sombre.png", fullPage: true });

  // L'inspection d'un lot, avec un CMC coché pour montrer les deux pastilles.
  await forcerTheme("clair");
  await contenu(page).getByRole("button", { name: new RegExp(nomArrivage) }).click();
  const inspect = page.getByRole("dialog").filter({ hasText: nomArrivage });
  await expect(inspect.getByText(chassis1)).toBeVisible();
  await inspect.getByLabel(`CMC reçu, moto ${chassis1}`).click();
  await expect(inspect.getByText("CMC reçu").first()).toBeVisible();
  await inspect.screenshot({ path: "captures/s43/arrivages-inspect-clair.png" });
  await forcerTheme("sombre");
  await inspect.screenshot({ path: "captures/s43/arrivages-inspect-sombre.png" });
});
