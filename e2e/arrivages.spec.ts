import { expect, test, type Page } from "@playwright/test";
import {
  ajouterMarqueEtModele,
  attendreLaFileVide,
  chassisUnique,
  contenu,
  nomUnique,
  preparerTerrain,
  seConnecterEtEntrer,
  type Terrain,
} from "./aide";

/**
 * L'arrivage — faire entrer un lot de motos d'un même fournisseur (S42).
 *
 * D'un seul modal, depuis la liste : on ajoute un fournisseur, on fixe les
 * valeurs communes (marque, modèle, prix) et le nombre de motos, puis on saisit
 * les châssis. Le lot entre en une fois, et la liste montre son écoulement —
 * « 0 vendues sur 2 » — que personne n'a écrit : il se lit du statut des motos.
 */

async function ouvrirLeModal(page: Page, nom: string, terrain: Terrain, fournisseur: string) {
  await page.goto("/motos/arrivages", { waitUntil: "load" });
  await page.getByRole("button", { name: "Nouveau" }).click();
  const modal = page.getByRole("dialog").filter({ hasText: "Enregistrer un arrivage" });

  await modal.getByLabel("Nom de l’arrivage").fill(nom);

  await modal.getByRole("button", { name: "Nouveau" }).click();
  const modalFournisseur = page.getByRole("dialog").filter({ hasText: "Nouveau fournisseur" });
  await modalFournisseur.getByLabel("Nom", { exact: true }).fill(fournisseur);
  await modalFournisseur.getByRole("button", { name: "Ajouter le fournisseur" }).click();
  await expect(modal.locator("#fournisseur")).not.toHaveValue("");

  await modal.getByLabel("Marque", { exact: true }).selectOption({ label: terrain.marque });
  await modal.getByLabel("Modèle", { exact: true }).selectOption({ label: terrain.modele });
  return modal;
}

test("un lot de deux motos entre en une fois, et l'écoulement se lit", async ({ page }) => {
  await seConnecterEtEntrer(page);
  const terrain = await preparerTerrain(page);

  const fournisseur = nomUnique("HAOJUE Import");
  const nomArrivage = nomUnique("Arrivage");
  const chassis1 = chassisUnique("LOT1");
  const chassis2 = chassisUnique("LOT2");

  const modal = await ouvrirLeModal(page, nomArrivage, terrain, fournisseur);

  // Le nombre pilote la troisième partie : deux lignes apparaissent.
  await modal.getByLabel("Nombre de motos").fill("2");
  await modal.getByLabel("Numéro de châssis, moto 1").fill(chassis1);
  await modal.getByLabel("Numéro de châssis, moto 2").fill(chassis2);

  await modal.getByRole("button", { name: "Enregistrer le lot" }).click();
  await expect(contenu(page).getByRole("status")).toContainText("2 motos entrées", {
    timeout: 20_000,
  });

  await attendreLaFileVide(page);
  await page.reload({ waitUntil: "load" });

  const ligne = contenu(page).getByRole("row").filter({ hasText: nomArrivage });
  await expect(ligne).toContainText(fournisseur);
  await expect(ligne).toContainText("0 vendues sur 2");

  await page.goto("/motos", { waitUntil: "load" });
  await expect(contenu(page).getByText(chassis1)).toBeVisible();
  await expect(contenu(page).getByText(chassis2)).toBeVisible();
});

test("un lot mêle deux marques : chaque groupe entre avec la sienne", async ({ page }) => {
  await seConnecterEtEntrer(page);
  const terrain = await preparerTerrain(page);

  // Une seconde marque au catalogue, pour le deuxième groupe du lot.
  const marque2 = nomUnique("Sanya");
  const modele2 = nomUnique("SY110");
  await ajouterMarqueEtModele(page, marque2, modele2);
  await attendreLaFileVide(page);

  const fournisseur = nomUnique("Multi Import");
  const nomArrivage = nomUnique("Arrivage");
  const chassisA = chassisUnique("MRQA");
  const chassisB = chassisUnique("MRQB");

  // Premier groupe : la marque du terrain, une moto.
  const modal = await ouvrirLeModal(page, nomArrivage, terrain, fournisseur);
  await modal.getByLabel("Numéro de châssis, moto 1").fill(chassisA);

  // On ajoute un groupe pour une autre marque, sa propre moto.
  await modal.getByRole("button", { name: "Ajouter une marque" }).click();
  const groupe2 = modal.locator("fieldset").filter({ hasText: "Groupe 2" });
  await groupe2.getByLabel("Marque", { exact: true }).selectOption({ label: marque2 });
  await groupe2.getByLabel("Modèle", { exact: true }).selectOption({ label: modele2 });
  await modal.getByLabel("Numéro de châssis, moto 2").fill(chassisB);

  await modal.getByRole("button", { name: "Enregistrer le lot" }).click();
  await expect(contenu(page).getByRole("status")).toContainText("2 motos entrées", {
    timeout: 20_000,
  });

  await attendreLaFileVide(page);
  await page.reload({ waitUntil: "load" });

  const ligne = contenu(page).getByRole("row").filter({ hasText: nomArrivage });
  await expect(ligne).toContainText("0 vendues sur 2");

  // Les deux motos sont en stock, chacune sous sa marque.
  await page.goto("/motos", { waitUntil: "load" });
  await expect(contenu(page).getByText(chassisA)).toBeVisible();
  await expect(contenu(page).getByText(chassisB)).toBeVisible();
  await expect(contenu(page).getByText(terrain.marque, { exact: false }).first()).toBeVisible();
  await expect(contenu(page).getByText(marque2, { exact: false }).first()).toBeVisible();
});

test("le suivi d'un lot : inspecter, cocher un CMC reçu, retrouver une moto (S43)", async ({
  page,
}) => {
  await seConnecterEtEntrer(page);
  const terrain = await preparerTerrain(page);

  const fournisseur = nomUnique("Suivi Import");
  const nomArrivage = nomUnique("Arrivage");
  const chassis1 = chassisUnique("SUIVA");
  const chassis2 = chassisUnique("SUIVB");

  const modal = await ouvrirLeModal(page, nomArrivage, terrain, fournisseur);
  await modal.getByLabel("Nombre de motos").fill("2");
  await modal.getByLabel("Numéro de châssis, moto 1").fill(chassis1);
  await modal.getByLabel("Numéro de châssis, moto 2").fill(chassis2);
  await modal.getByRole("button", { name: "Enregistrer le lot" }).click();
  await expect(contenu(page).getByRole("status")).toContainText("2 motos entrées", {
    timeout: 20_000,
  });
  await attendreLaFileVide(page);
  await page.reload({ waitUntil: "load" });

  // Ouvrir l'inspection du lot depuis la liste.
  await contenu(page).getByRole("button", { name: new RegExp(nomArrivage) }).click();
  const inspect = page.getByRole("dialog").filter({ hasText: nomArrivage });
  await expect(inspect.getByText(chassis1)).toBeVisible();

  // Cocher le CMC de la première moto : sa pastille passe de manquant à reçu.
  await expect(inspect.getByText("CMC manquant").first()).toBeVisible();
  await inspect.getByLabel(`CMC reçu, moto ${chassis1}`).check();
  await expect(inspect.getByText("CMC reçu").first()).toBeVisible();
  await inspect.getByRole("button", { name: "Fermer" }).click();

  // Retrouver une moto par les derniers caractères de son châssis.
  await contenu(page).getByLabel("Retrouver une moto").fill(chassis2.slice(-5));
  await expect(
    contenu(page).getByRole("button", { name: new RegExp(chassis2) }),
  ).toBeVisible();
});

test("deux motos au même châssis dans le lot sont refusées", async ({ page }) => {
  await seConnecterEtEntrer(page);
  const terrain = await preparerTerrain(page);

  const chassis = chassisUnique("DUP");
  const modal = await ouvrirLeModal(page, nomUnique("Arrivage"), terrain, nomUnique("HAOJUE"));

  await modal.getByLabel("Nombre de motos").fill("2");
  await modal.getByLabel("Numéro de châssis, moto 1").fill(chassis);
  await modal.getByLabel("Numéro de châssis, moto 2").fill(chassis);

  await modal.getByRole("button", { name: "Enregistrer le lot" }).click();
  await expect(modal.getByText(/apparaît deux fois dans le lot/)).toBeVisible();
});
