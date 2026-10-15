import { expect, test } from "@playwright/test";
import {
  attendreLaFileVide,
  contenu,
  emailUnique,
  messageErreur,
  messageSucces,
  prendreLaMainEtMettreEnCache,
  RESPONSABLE,
  seConnecter,
  seConnecterEtEntrer,
} from "./aide";

/**
 * Authentification, rôles et gestion des comptes (S2).
 *
 * Ce que ces tests protègent réellement : qu’un gérant ne puisse pas atteindre
 * l’administration, et qu’une session ouverte survive à la perte du réseau. Le
 * reste — messages d’erreur, formulaires — est du confort, important mais
 * rattrapable ; ces deux-là ne le sont pas.
 */

const MOT_DE_PASSE_FAUX = "mauvais-mot-de-passe";

test.describe("le mot de passe ne traverse jamais une URL", () => {
  /* **Le formulaire non hydraté, simulé pour de vrai.** Tant que React tient la
     page, `onSubmit` intercepte et rien ne part. Mais un `<form>` sans méthode
     vaut GET, et si l'hydratation n'a pas eu lieu -- un chunk manquant, un
     service worker qui sert un cache incomplet -- le navigateur envoie le
     formulaire lui-même et recopie les champs dans la barre d'adresse.

     Un contexte sans JavaScript reproduit exactement cet état. C'est la seule
     façon honnête de le vérifier : une assertion sur l'attribut `method`
     prouverait que l'attribut est là, pas que le secret ne fuit pas.

     Vu au banc pendant S39 sur un build dont les chunks rendaient 403 : l'URL
     portait « ?email=...&mot-de-passe=... » en clair. Il y serait reste dans
     l'historique du navigateur -- un appareil de comptoir est partage --, dans
     les journaux d'acces de l'hebergeur, et dans le `Referer` de la requete
     suivante. */
  test("un formulaire non hydraté n’écrit pas le mot de passe dans la barre d’adresse", async ({
    browser,
  }) => {
    const contexte = await browser.newContext({ javaScriptEnabled: false });
    const page = await contexte.newPage();
    await page.goto("/login", { waitUntil: "load" });

    await page.getByLabel("Adresse e-mail").fill(RESPONSABLE.email);
    await page.getByLabel("Mot de passe", { exact: true }).fill(RESPONSABLE.motDePasse);
    await page.getByRole("button", { name: /Se connecter/ }).click();
    await page.waitForTimeout(2000);

    /* Le geste échoue -- il n'y a pas de route qui reçoive ce POST, et c'est
       voulu : la connexion passe par le SDK Firebase, jamais par le serveur.
       Ce qui compte est qu'il échoue sans rien écrire nulle part. */
    const url = page.url();
    expect(url).not.toContain(RESPONSABLE.motDePasse);
    expect(url).not.toContain("mot-de-passe=");
    expect(url).not.toContain("email=");

    await contexte.close();
  });
});

test.describe("accès", () => {
  test("sans session, l’application renvoie vers la connexion", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForURL("**/login");
    await expect(page.getByRole("heading", { name: "Connexion", level: 1 })).toBeVisible();
  });

  test("un mot de passe faux ne dit pas si le compte existe", async ({ page }) => {
    await seConnecter(page, RESPONSABLE.email, MOT_DE_PASSE_FAUX);
    await expect(messageErreur(page)).toContainText("Adresse e-mail ou mot de passe incorrect");
    const surCompteConnu = await messageErreur(page).textContent();

    // Exactement le même message pour une adresse inconnue : sinon le
    // formulaire devient un annuaire des comptes existants. On compare les deux
    // textes plutôt que d'en écrire un en dur — c'est l'égalité qui protège,
    // pas la formulation, et elle doit survivre à une reformulation.
    await seConnecter(page, "personne@sdi.test", MOT_DE_PASSE_FAUX);
    await expect(messageErreur(page)).toContainText("Adresse e-mail ou mot de passe incorrect");
    expect(await messageErreur(page).textContent()).toBe(surCompteConnu);
  });

  test("le responsable se connecte et arrive sur sa supervision", async ({ page }) => {
    await seConnecterEtEntrer(page);
  });

  test("la session survit à un rechargement sans réseau", async ({ page, context }) => {
    await seConnecterEtEntrer(page);
    await prendreLaMainEtMettreEnCache(page, "/supervision");

    await context.setOffline(true);
    await page.reload();

    // Toujours connecté : ni redirection vers /login, ni écran vide.
    await expect(page.getByRole("heading", { name: "Supervision", level: 1 })).toBeVisible();
    expect(page.url()).toContain("/supervision");

    await context.setOffline(false);
  });

  test("la déconnexion ramène à l’écran de connexion", async ({ page }) => {
    await seConnecterEtEntrer(page);

    await page.goto("/parametres");
    await page.getByRole("button", { name: "Se déconnecter" }).click();
    await page.waitForURL("**/login", { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "Connexion", level: 1 })).toBeVisible();
  });
});

test.describe("gestion des comptes", () => {
  test("le responsable crée un gérant, qui apparaît dans la liste", async ({ page }) => {
    await seConnecterEtEntrer(page);
    await page.goto("/parametres/utilisateurs");
    /* La création est passée en modale (S54) : l'écran s'ouvre sur la liste
       des comptes, et le formulaire attend derrière un bouton. */
    await page.getByRole("button", { name: "Créer un compte" }).click();

    const email = emailUnique("gerant");
    await page.getByLabel("Nom", { exact: true }).fill("Ouédraogo");
    await page.getByLabel("Adresse e-mail").fill(email);
    await page.getByLabel("Mot de passe provisoire").fill("motdepasse-provisoire");
    await page.getByRole("button", { name: /Créer le compte/ }).click();

    await expect(messageSucces(page)).toContainText("Compte créé pour Ouédraogo", {
      timeout: 20_000,
    });
    await expect(page.getByRole("listitem").filter({ hasText: email })).toBeVisible();
  });

  test("un mot de passe trop court est refusé par le serveur", async ({ page }) => {
    await seConnecterEtEntrer(page);
    await page.goto("/parametres/utilisateurs");
    /* La création est passée en modale (S54) : l'écran s'ouvre sur la liste
       des comptes, et le formulaire attend derrière un bouton. */
    await page.getByRole("button", { name: "Créer un compte" }).click();

    await page.getByLabel("Nom", { exact: true }).fill("Trop court");
    await page.getByLabel("Adresse e-mail").fill(emailUnique("court"));
    await page.getByLabel("Mot de passe provisoire").fill("court");
    await page.getByRole("button", { name: /Créer le compte/ }).click();

    await expect(messageErreur(page)).toContainText("10 caractères", { timeout: 20_000 });
  });

  test("un gérant n’atteint pas l’administration des comptes", async ({ page, browser }) => {
    await seConnecterEtEntrer(page);
    await page.goto("/parametres/utilisateurs");
    /* La création est passée en modale (S54) : l'écran s'ouvre sur la liste
       des comptes, et le formulaire attend derrière un bouton. */
    await page.getByRole("button", { name: "Créer un compte" }).click();

    const email = emailUnique("restreint");
    const motDePasse = "gerant-restreint-01";
    await page.getByLabel("Nom", { exact: true }).fill("Gérant restreint");
    await page.getByLabel("Adresse e-mail").fill(email);
    await page.getByLabel("Mot de passe provisoire").fill(motDePasse);
    await page.getByRole("button", { name: /Créer le compte/ }).click();
    await expect(messageSucces(page)).toContainText("Compte créé", { timeout: 20_000 });

    /* Le second navigateur lit le **serveur**, pas le cache du premier : tant
       que la file d'écritures n'est pas vide, il ne verra rien de ce que le
       décor vient de fabriquer, et l'échec accusera les droits (D97). */
    await attendreLaFileVide(page);

    const contexteGerant = await browser.newContext();
    const pageGerant = await contexteGerant.newPage();
    await seConnecter(pageGerant, email, motDePasse);
    await pageGerant.waitForURL("**/dashboard");

    // L’entrée n’apparaît pas dans ses réglages…
    await pageGerant.goto("/parametres");
    await expect(pageGerant.getByRole("link", { name: /Utilisateurs/ })).toHaveCount(0);
    /* Le bandeau le dit aussi, en haut de chaque écran : on vise donc le contenu,
       sinon les deux régions se disputent le même texte. */
    await expect(contenu(pageGerant).getByText("Aucune boutique attribuée")).toBeVisible();

    // …et l’adresse tapée à la main est refusée avec une explication.
    await pageGerant.goto("/parametres/utilisateurs");
    await expect(
      pageGerant.getByRole("heading", { name: /Réservé au responsable/, level: 1 }),
    ).toBeVisible();
    await expect(pageGerant.getByRole("button", { name: /Créer le compte/ })).toHaveCount(0);

    await contexteGerant.close();
  });
});
