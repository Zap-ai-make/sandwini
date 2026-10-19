import { describe, expect, it } from "vitest";

import { estTraficFirebase } from "./trafic-firebase";

/**
 * **Ce que ce test protège, et pourquoi il existe.**
 *
 * `app/sw.ts` annonce depuis toujours : « rien de ce qui part vers
 * googleapis.com n'est mis en cache ». Le code disait le contraire.
 * `defaultCache` de Serwist se termine par une règle attrape-tout
 * — `matcher: ({ sameOrigin }) => !sameOrigin` — qui range **tout** GET
 * cross-origin en `NetworkFirst`, réseau abandonné au bout de 10 secondes et
 * cache d'une heure.
 *
 * Firestore délivre ses écoutes par un GET long-poll qui reste ouvert exprès.
 * Une stratégie qui coupe le réseau à 10 secondes le tue, sert ce qu'elle a en
 * cache, et le canal se rouvre en boucle : un document déjà publié n'arrive
 * jamais chez un second lecteur qui vient de recharger. C'est la famille de
 * D82 — un échec de lecture n'est pas une réponse — mais un cran plus bas que
 * le produit, dans le service worker.
 *
 * Le piège est que `*.googleapis.com` n'est pas un bon critère : les polices
 * Google vivent sur `fonts.googleapis.com`, et elles **doivent** rester en
 * cache. D'où une liste d'hôtes explicite, et non un suffixe.
 */
describe("ce qui doit partir droit au réseau, sans jamais toucher au cache", () => {
  it.each([
    [
      "le canal d'écoute de Firestore, celui qui porte les mises à jour en direct",
      "https://firestore.googleapis.com/google.firestore.v1.Firestore/Listen/channel?gsessionid=A1&VER=8&database=projects%2Fsandwini%2Fdatabases%2F(default)&RID=rpc&TYPE=xmlhttp",
    ],
    [
      "le canal d'écriture de Firestore",
      "https://firestore.googleapis.com/google.firestore.v1.Firestore/Write/channel?VER=8&RID=12345",
    ],
    [
      "la connexion d'un compte",
      "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=AIza",
    ],
    [
      "le renouvellement du jeton — mis en cache, il rendrait un jeton périmé",
      "https://securetoken.googleapis.com/v1/token?key=AIza",
    ],
    [
      "un fichier envoyé ou relu dans Storage",
      "https://firebasestorage.googleapis.com/v0/b/sandwini.appspot.com/o/photos%2F1.jpg",
    ],
    [
      "une fonction déployée, dont le portail du prestataire dépend",
      "https://europe-west1-sandwini.cloudfunctions.net/suiviPrestataire",
    ],
    [
      "l'émulateur Firestore, que la suite bout en bout interroge",
      "http://localhost:8181/google.firestore.v1.Firestore/Listen/channel?VER=8",
    ],
    [
      "l'émulateur Auth",
      "http://127.0.0.1:9399/identitytoolkit.googleapis.com/v1/accounts:lookup?key=fake",
    ],
    ["l'émulateur Functions", "http://localhost:5301/sdi-dev/europe-west1/suiviPrestataire"],
  ])("%s", (_quoi, adresse) => {
    expect(estTraficFirebase(new URL(adresse), false)).toBe(true);
  });
});

describe("ce qui doit rester en cache, sous peine de casser le hors-ligne", () => {
  /**
   * **Le danger de cette correction, nommé.** La coquille hors ligne vit dans
   * le cache du service worker. Envoyer droit au réseau un seul de ses
   * fragments, et le produit ne s'ouvre plus sans réseau — en silence, comme
   * `npm run verifier:sw` l'a déjà appris à ce dépôt.
   *
   * En développement et en bout en bout, l'application **et** les émulateurs
   * sont tous sur `localhost` : seul le port les sépare. Un critère qui
   * regarderait le nom d'hôte seul enverrait donc la coquille au réseau. C'est
   * `memeOrigine` qui tranche, et ces deux témoins le prouvent.
   */
  it.each([
    ["un fragment de l'application servie en production", "https://sandwini-vr9q.vercel.app/_next/static/chunks/main.js"],
    ["la même chose en bout en bout, où les émulateurs partagent le nom d'hôte", "http://localhost:3200/_next/static/chunks/main.js"],
    ["un document de l'application", "http://localhost:3200/caisse"],
  ])("%s reste au cache parce qu'il est de la même origine", (_quoi, adresse) => {
    expect(estTraficFirebase(new URL(adresse), true)).toBe(false);
  });

  it.each([
    ["la feuille de style des polices Google", "https://fonts.googleapis.com/css2?family=Inter"],
    ["le fichier de police lui-même", "https://fonts.gstatic.com/s/inter/v13/abc.woff2"],
  ])("%s reste en cache, bien qu'il soit cross-origin", (_quoi, adresse) => {
    expect(estTraficFirebase(new URL(adresse), false)).toBe(false);
  });
});
