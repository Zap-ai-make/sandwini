import { expect, type Page } from "@playwright/test";

/**
 * Outils partagés par les tests bout en bout.
 *
 * Deux régions vivantes coexistent dans l'application : le bandeau d'état, qui
 * annonce le réseau en permanence, et les messages des formulaires. Toutes deux
 * portent légitimement `role="status"` ou `role="alert"` — un lecteur d'écran
 * doit entendre les deux. Les tests visent donc la zone de contenu plutôt que
 * la page entière, sans quoi ils lisent le bandeau à la place du formulaire.
 * Next ajoute par-dessus son propre annonceur de route, également `role=alert`.
 */

export const RESPONSABLE = {
  email: "responsable@sdi.test",
  motDePasse: "responsable-sdi-2026",
};

/** Le contenu de l'écran, à l'exclusion du bandeau et de la navigation. */
export function contenu(page: Page) {
  return page.getByRole("main");
}

/** Le message d'erreur du formulaire affiché à l'écran. */
export function messageErreur(page: Page) {
  return contenu(page).getByRole("alert");
}

/** Le message de confirmation du formulaire affiché à l'écran. */
export function messageSucces(page: Page) {
  return contenu(page).getByRole("status");
}

/** L'indicateur réseau du bandeau, qui vit hors de la zone de contenu. */
export function bandeauEtat(page: Page) {
  return page.getByRole("banner").getByRole("status");
}

export async function seConnecter(
  page: Page,
  email: string = RESPONSABLE.email,
  motDePasse: string = RESPONSABLE.motDePasse,
) {
  await page.goto("/login");
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(motDePasse);
  await page.getByRole("button", { name: /Se connecter/ }).click();
}

/** Connexion suivie de l'arrivée effective sur l'accueil. */
export async function seConnecterEtEntrer(page: Page) {
  await seConnecter(page);
  await page.waitForURL("**/dashboard");
  await expect(page.getByRole("heading", { name: "Accueil", level: 1 })).toBeVisible();
}

/** L'indicateur de périmètre du bandeau : sélecteur pour le responsable, texte pour le gérant. */
export function selecteurPerimetre(page: Page) {
  return page.getByRole("banner").getByRole("combobox", { name: "Boutique affichée" });
}

/**
 * Un code de boutique neuf par exécution.
 *
 * Les boutiques ne se suppriment pas — leur code vit dans des numéros de reçus —
 * et les émulateurs gardent leurs données d'un test à l'autre. Réutiliser un
 * code ferait échouer la deuxième exécution pour une raison qui n'est pas celle
 * qu'on teste.
 */
export function codeUnique(): string {
  const lettres = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return Array.from({ length: 3 }, () => lettres[Math.floor(Math.random() * 26)]).join("");
}

/** Un e-mail neuf par exécution : les comptes ne se suppriment jamais. */
export function emailUnique(prefixe: string) {
  return `${prefixe}-${Date.now()}-${Math.floor(Math.random() * 1000)}@sdi.test`;
}

/**
 * Un libellé neuf par exécution.
 *
 * Les référentiels ne se suppriment pas — ils sont cités par des motos et des
 * dossiers — et les émulateurs gardent leurs données d'un test à l'autre.
 * Réutiliser un nom ferait échouer la deuxième exécution sur le contrôle de
 * doublon, c'est-à-dire pour une raison qui n'est pas celle qu'on teste.
 */
export function nomUnique(prefixe: string): string {
  return `${prefixe} ${Date.now().toString(36)}${Math.floor(Math.random() * 100)}`;
}

/**
 * Attend que le service worker **contrôle** la page — actif ne suffit pas — puis
 * recharge une fois en ligne.
 *
 * La toute première visite passe à côté du service worker, qui n'existait pas
 * encore quand le document a été demandé. Ce second passage est celui qui met
 * la page en cache. C'est aussi le trajet réel d'un gérant : il ouvre
 * l'application au magasin, puis perd le réseau.
 */
export async function prendreLaMainEtMettreEnCache(page: Page, chemin: string) {
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller), null, {
    timeout: 30_000,
  });
  await page.reload({ waitUntil: "load" });
  await page.waitForURL(`**${chemin}`);
}
