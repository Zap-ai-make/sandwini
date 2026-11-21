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

  /* **`/^Modèle/` et non « Modèle » exact.** Le champ porte « Modèle
     (facultatif) » depuis S50, où le modèle a cessé d'être exigé dans un lot.
     Ce fichier le visait encore à l'identique — et comme personne ne le
     lançait, ses quatre tests tombaient depuis des semaines sur le décor, sans
     jamais rien dire. Même famille que les deux fichiers orphelins trouvés par
     l'audit du 15 octobre : un test qu'on n'exécute pas ne protège rien tout en
     ayant l'air d'exister. */
  await modal.getByLabel("Marque", { exact: true }).selectOption({ label: terrain.marque });
  await modal.getByLabel(/^Modèle/).selectOption({ label: terrain.modele });
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
  await expect(ligne).toContainText("2 en stock");
  await expect(ligne).toContainText("0 vendues");

  await page.goto("/motos", { waitUntil: "load" });
  await expect(contenu(page).getByText(chassis1)).toBeVisible();
  await expect(contenu(page).getByText(chassis2)).toBeVisible();
});

/**
 * Le lot du commanditaire (15 novembre 2026) : plus de 115 motos, avec leur
 * prix. Le clic sur « Enregistrer » semblait ne rien faire — plafond de 80 —, et
 * au-delà de 20 prix le serveur refusait le lot entier, fenêtre déjà fermée.
 * Un refus se lirait désormais sur la page (`role="alert"`) : son absence, une
 * fois la file vidée, dit que les tranches de prix sont toutes passées.
 */
test("un lot de 120 motos avec leur prix s’enregistre en entier", async ({ page }) => {
  test.setTimeout(240_000);
  await seConnecterEtEntrer(page);
  const terrain = await preparerTerrain(page);

  const nomArrivage = nomUnique("Conteneur");
  const modal = await ouvrirLeModal(page, nomArrivage, terrain, nomUnique("HAOJUE Import"));

  await modal.getByLabel("Nombre de motos").fill("120");
  await modal.getByLabel(/^Prix d’achat commun/).fill("450000");
  const prefixe = chassisUnique("GROS");
  for (let i = 1; i <= 120; i++) {
    /* `exact` : « moto 1 » désignerait aussi les motos 10 à 19 et 100 à 120. */
    await modal
      .getByLabel(`Numéro de châssis, moto ${i}`, { exact: true })
      .fill(`${prefixe}${String(i).padStart(3, "0")}`);
  }

  await modal.getByRole("button", { name: "Enregistrer le lot" }).click();
  await expect(contenu(page).getByRole("status")).toContainText("120 motos entrées", {
    timeout: 20_000,
  });

  await attendreLaFileVide(page);
  await expect(contenu(page).getByRole("alert")).toHaveCount(0);

  await page.reload({ waitUntil: "load" });
  const ligne = contenu(page).getByRole("row").filter({ hasText: nomArrivage });
  await expect(ligne).toContainText("120 en stock");
});

/* « Quand on rentre le nombre de motos et que les lignes se créent, on doit
   pouvoir supprimer chaque ligne » (15 novembre 2026). La ligne du milieu part,
   le nombre suit, et les numéros se resserrent. */
test("une ligne du lot se retire, et le nombre suit", async ({ page }) => {
  await seConnecterEtEntrer(page);
  const terrain = await preparerTerrain(page);

  const nomArrivage = nomUnique("Arrivage");
  const modal = await ouvrirLeModal(page, nomArrivage, terrain, nomUnique("HAOJUE Import"));
  const [garde1, retiree, garde2] = [chassisUnique("RETA"), chassisUnique("RETB"), chassisUnique("RETC")];

  await modal.getByLabel("Nombre de motos").fill("3");
  await modal.getByLabel("Numéro de châssis, moto 1").fill(garde1);
  await modal.getByLabel("Numéro de châssis, moto 2").fill(retiree);
  await modal.getByLabel("Numéro de châssis, moto 3").fill(garde2);

  /* **La croix se voit sans faire défiler**, et un clic ne le prouverait pas :
     Playwright fait défiler avant de cliquer. Sur ce téléphone, châssis et
     couleur débordent la largeur ; la première version laissait la croix
     hors de l'écran, derrière la couleur. */
  const croix = modal.getByRole("button", { name: "Retirer la moto 2" });
  await expect(croix).toBeInViewport({ ratio: 1 });

  await croix.click();
  await expect(modal.getByLabel("Nombre de motos")).toHaveValue("2");
  await expect(modal.getByLabel("Numéro de châssis, moto 1")).toHaveValue(garde1);
  await expect(modal.getByLabel("Numéro de châssis, moto 2")).toHaveValue(garde2);
  await expect(modal.getByLabel("Numéro de châssis, moto 3")).toHaveCount(0);

  await modal.getByRole("button", { name: "Enregistrer le lot" }).click();
  await expect(contenu(page).getByRole("status")).toContainText("2 motos entrées", {
    timeout: 20_000,
  });

  await attendreLaFileVide(page);
  await page.reload({ waitUntil: "load" });
  await expect(contenu(page).getByRole("row").filter({ hasText: nomArrivage })).toContainText(
    "2 en stock",
  );

  await page.goto("/motos", { waitUntil: "load" });
  await expect(contenu(page).getByText(garde1)).toBeVisible();
  await expect(contenu(page).getByText(garde2)).toBeVisible();
  await expect(contenu(page).getByText(retiree)).toHaveCount(0);
});

/* « Dans arrivage, ajouter le prix lors de modification pour que, quand on
   oublie de renseigner le prix à l'enregistrement, on puisse se rattraper »
   (20 novembre 2026). Le prix commun remplit les motos sans prix ; une ligne
   se corrige à part. Rouvrir le lot montre ce qui a été écrit. */
test("un prix oublié à l’enregistrement se rattrape en modifiant le lot", async ({ page }) => {
  await seConnecterEtEntrer(page);
  const terrain = await preparerTerrain(page);

  const nomArrivage = nomUnique("Sans prix");
  const modal = await ouvrirLeModal(page, nomArrivage, terrain, nomUnique("HAOJUE Import"));
  await modal.getByLabel("Nombre de motos").fill("2");
  await modal.getByLabel("Numéro de châssis, moto 1").fill(chassisUnique("PRXA"));
  await modal.getByLabel("Numéro de châssis, moto 2").fill(chassisUnique("PRXB"));
  await modal.getByRole("button", { name: "Enregistrer le lot" }).click();
  await expect(contenu(page).getByRole("status")).toContainText("2 motos entrées", {
    timeout: 20_000,
  });
  await attendreLaFileVide(page);
  await page.reload({ waitUntil: "load" });

  const ouvrirLaModification = async () => {
    await contenu(page).getByRole("button", { name: new RegExp(`^${nomArrivage}`) }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Modifier", exact: true }).click();
    return page.getByRole("dialog", { name: "Modifier l’arrivage" });
  };
  const prixDeLaLigne = (dialogue: ReturnType<typeof page.getByRole>, rang: number) =>
    dialogue.getByLabel(`Prix d’achat, ligne ${rang}`, { exact: true });

  let modification = await ouvrirLaModification();
  /* La case s'ouvre une fois le prix lu — ici, lu absent. */
  await expect(prixDeLaLigne(modification, 1)).toBeEnabled();
  await modification.getByLabel(/^Prix d’achat commun/).fill("400000");
  await expect(prixDeLaLigne(modification, 1)).toHaveValue("400000");
  await expect(prixDeLaLigne(modification, 2)).toHaveValue("400000");
  await prixDeLaLigne(modification, 2).fill("450000");
  await modification.getByRole("button", { name: "Enregistrer les modifications" }).click();
  await expect(modification).toBeHidden();

  await attendreLaFileVide(page);
  await expect(contenu(page).getByRole("alert")).toHaveCount(0);

  await page.reload({ waitUntil: "load" });
  modification = await ouvrirLaModification();
  await expect(prixDeLaLigne(modification, 1)).toHaveValue("400000");
  await expect(prixDeLaLigne(modification, 2)).toHaveValue("450000");
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
  await groupe2.getByLabel(/^Modèle/).selectOption({ label: modele2 });
  await modal.getByLabel("Numéro de châssis, moto 2").fill(chassisB);

  await modal.getByRole("button", { name: "Enregistrer le lot" }).click();
  await expect(contenu(page).getByRole("status")).toContainText("2 motos entrées", {
    timeout: 20_000,
  });

  await attendreLaFileVide(page);
  await page.reload({ waitUntil: "load" });

  const ligne = contenu(page).getByRole("row").filter({ hasText: nomArrivage });
  await expect(ligne).toContainText("2 en stock");
  await expect(ligne).toContainText("0 vendues");

  // Les deux motos des deux groupes sont bien entrées en stock.
  await page.goto("/motos", { waitUntil: "load" });
  await expect(contenu(page).getByText(chassisA)).toBeVisible();
  await expect(contenu(page).getByText(chassisB)).toBeVisible();
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
  // Un simple click, pas .check() : la case est contrôlée par cmcRecu, qui ne
  // bascule qu'au retour de l'écriture — .check() la verrait encore décochée.
  await expect(inspect.getByText("CMC manquant").first()).toBeVisible();
  await inspect.getByLabel(`CMC reçu, moto ${chassis1}`).click();
  await expect(inspect.getByText("CMC reçu").first()).toBeVisible();
  // Deux affordances « Fermer » (la croix et le pied) : la croix porte l'aria-label.
  await inspect.getByLabel("Fermer").click();

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
