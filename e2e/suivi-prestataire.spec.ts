import { expect, test } from "@playwright/test";
import {
  attendreLaFileVide,
  contenu,
  creerPrestataire,
  nomUnique,
  seConnecterEtEntrer,
} from "./aide";

/**
 * Le portail du prestataire, de bout en bout (S56).
 *
 * **Le seul endroit où les sept tâches se touchent**, et le seul qui prouve la
 * chose que ni les règles, ni les déclencheurs, ni le domaine ne peuvent
 * prouver : qu'un navigateur **jamais connecté** ouvre cette page et la lit.
 *
 * Le second contexte n'est pas une commodité de rédaction. Rouvrir l'URL dans
 * l'onglet du responsable ne dirait rien — la session y est, le service worker
 * aussi. Il faut un `browser.newContext()` : cookies vides, stockage vide,
 * aucune session. C'est le navigateur du prestataire, chez lui.
 *
 * Un seul fichier et un seul parcours, c'est une contrainte du commanditaire :
 * une passe complète dure plus d'une heure et rend des verdicts d'outillage.
 */
test("un navigateur jamais connecté lit le suivi, et le lien régénéré se ferme", async ({
  page,
  browser,
}) => {
  const nom = nomUnique("Prestataire suivi");

  await seConnecterEtEntrer(page);
  await creerPrestataire(page, nom);

  const fiche = page.getByRole("listitem").filter({ hasText: nom });

  /* **Avant toute émission, il n'y a pas de lien**, et l'écran propose de le
     créer. Sans cette assertion, un test qui trouverait un lien déjà là
     passerait sans rien prouver. */
  /* Le titre par son rôle, et non par son texte : « Lien de suivi » est aussi
     un morceau de « Créer le lien de suivi », et viser le texte attrape les
     deux. */
  await expect(fiche.getByRole("heading", { name: "Lien de suivi" })).toBeVisible();
  const creer = fiche.getByRole("button", { name: "Créer le lien de suivi" });
  await expect(creer).toBeVisible();

  await creer.click();

  /* L'émission passe par une Cloud Function : il faut lui laisser le temps du
     réveil à froid, que l'émulateur paie à la première invocation (D43). */
  const lien = fiche.locator("p.select-all");
  await expect(lien).toBeVisible({ timeout: 60_000 });

  const premier = (await lien.textContent())?.trim() ?? "";
  expect(premier).toMatch(/\/suivi\/[A-Za-z0-9_-]{43}$/);

  await attendreLaFileVide(page, 30_000);

  // ── Le navigateur du prestataire : aucune session, aucun cookie ───────────
  const dehors = await browser.newContext();
  const pagePrestataire = await dehors.newPage();

  await pagePrestataire.goto(premier, { waitUntil: "load" });
  await expect(pagePrestataire.getByRole("heading", { name: nom, level: 1 })).toBeVisible({
    timeout: 30_000,
  });
  await expect(pagePrestataire.getByText("Chez vous en ce moment")).toBeVisible();
  await expect(pagePrestataire.getByText("Avances reçues")).toBeVisible();

  /* **Rien à écrire depuis ici** : le portail est en lecture seule, par
     l'arbitrage 1 de la spec. Un bouton qui serait apparu un jour se verrait
     ici, et nulle part ailleurs. */
  await expect(pagePrestataire.getByRole("button")).toHaveCount(0);

  /* La page ne doit pas être indexable : c'est la seule protection d'un lien
     secret qui finira dans un groupe de discussion. */
  await expect(pagePrestataire.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/,
  );

  // ── Régénérer révoque, et le prestataire le voit ──────────────────────────
  await fiche.getByRole("button", { name: "Régénérer" }).click();
  const confirmation = page.getByRole("dialog");
  await expect(confirmation).toBeVisible();
  /* La confirmation dit ce qu'elle fait : l'ancien lien meurt chez quelqu'un
     qui n'est pas dans la pièce. */
  await expect(confirmation).toContainText("cessera de fonctionner");
  await confirmation.getByRole("button", { name: "Régénérer" }).click();

  await expect(lien).not.toHaveText(premier, { timeout: 60_000 });
  const second = (await lien.textContent())?.trim() ?? "";
  expect(second).not.toBe(premier);

  await pagePrestataire.goto(premier, { waitUntil: "load" });
  await expect(pagePrestataire.getByText("Ce lien n’est plus valide")).toBeVisible({
    timeout: 30_000,
  });
  /* Le refus ne nomme personne : dire « le lien de X a été remplacé »
     renseignerait qui essaie des liens au hasard. */
  await expect(contenu(pagePrestataire)).not.toContainText(nom);

  await pagePrestataire.goto(second, { waitUntil: "load" });
  await expect(pagePrestataire.getByRole("heading", { name: nom, level: 1 })).toBeVisible({
    timeout: 30_000,
  });

  await dehors.close();
});
