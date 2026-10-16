/**
 * Le jeton qui ouvre le portail d'un prestataire (S56).
 *
 * **Ce jeton EST le mot de passe**, et la spec l'assume en connaissance de
 * cause : qui l'a entre. Le commanditaire a tranché « un lien secret, sans
 * compte » parce qu'on ne fait pas retenir un mot de passe à quelqu'un qui
 * n'est pas de la maison. La contrepartie, c'est que la longueur du jeton est
 * la seule protection réelle du portail — d'où un test qui la fige, et non une
 * constante qu'on ajuste.
 *
 * **Il n'est pas haché en base, et c'est délibéré.** Il vit dans l'URL, donc
 * dans l'historique du navigateur du prestataire et dans tout message où le
 * lien aura été recopié. Le hacher en base donnerait l'illusion d'une
 * protection que le canal n'offre pas.
 *
 * **Ce module ne FABRIQUE aucun jeton.** Un secret ne se fabrique pas dans un
 * navigateur (`SECURITY.md` §4) : la fabrication vit côté serveur, dans
 * `functions/src/index.ts`, avec `randomBytes`. Ici on sait seulement
 * reconnaître un jeton bien formé et en faire un lien — c'est-à-dire les deux
 * choses dont le client a besoin.
 */

/** La taille de l'aléa tiré par le serveur. C'est elle que la spec exige, pas la longueur du texte. */
export const OCTETS_JETON = 32;

/**
 * La longueur du jeton écrit : 32 octets en base64url, sans remplissage.
 *
 * `ceil(32 × 4 / 3)` vaut 43. La valeur est calculée plutôt que recopiée pour
 * que changer `OCTETS_JETON` ne laisse pas derrière lui un contrôle de longueur
 * qui refuserait tous les jetons neufs.
 */
export const LONGUEUR_JETON = Math.ceil((OCTETS_JETON * 4) / 3);

/* base64url, et rien d'autre : les trois caractères de base64 ordinaire — `+`,
   `/`, `=` — ne survivent pas à un segment d'URL. Les accepter laisserait
   entrer un jeton qui casserait son propre lien. */
const FORME = new RegExp(`^[A-Za-z0-9_-]{${LONGUEUR_JETON}}$`);

/**
 * Ce jeton peut-il être un jeton ?
 *
 * **Le filtre sert d'abord à ne pas interroger la base.** Sans lui, n'importe
 * quelle chaîne trouvée dans une URL partirait en
 * `where('jetonSuivi', '==', …)` — une requête offerte par essai à qui tape au
 * hasard. Reconnaître la forme avant de lire coûte une expression régulière et
 * ferme ce robinet.
 *
 * **Et il refuse l'absence autant que la faute.** Une fiche jamais émise n'a
 * pas de `jetonSuivi` : une recherche lancée avec `null` rendrait *toutes* ces
 * fiches, et le portail deviendrait un annuaire par un appel sans argument.
 */
export function estJetonPlausible(valeur: unknown): valeur is string {
  return typeof valeur === "string" && FORME.test(valeur);
}

/**
 * Le lien à donner au prestataire.
 *
 * L'origine vient de l'appelant : ce module ne devine pas le domaine du
 * produit, qui diffère entre la préversion, la production et un port local.
 *
 * Les barres finales sont retirées parce que `window.location.origin` en rend
 * parfois une : un lien à double barre s'envoie par WhatsApp, ne marche pas, et
 * se lit comme un faux lien donné par le magasin.
 */
export function lienDeSuivi(origine: string, jeton: string): string {
  return `${origine.replace(/\/+$/, "")}/suivi/${jeton}`;
}
