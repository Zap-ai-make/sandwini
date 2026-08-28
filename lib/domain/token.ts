/**
 * Les tokens d'accès public (`prompt.md` §4, `DECISIONS.md` D6).
 *
 * Un token de suivi ouvre une page sans compte : c'est un secret, et un secret
 * se tire au hasard cryptographique, jamais avec `Math.random()`. 32 octets,
 * encodés en base64url — 43 caractères, au-delà des 32 exigés, et sans `+`,
 * `/` ni `=` qui se font échapper en traversant une URL, un QR code ou un
 * message WhatsApp.
 *
 * Le tirage a lieu **sur l'appareil**, au moment de la vente. Il ne peut pas en
 * être autrement : une vente s'enregistre sans réseau, donc aucun serveur n'est
 * là pour fournir le secret. `crypto.getRandomValues` est présent dans tout
 * navigateur qui sait faire tourner cette application, et il est aussi solide
 * qu'un tirage serveur.
 */

/** 32 octets : la longueur exigée par le cahier des charges, en entropie réelle. */
export const OCTETS_TOKEN = 32;

/** 43 caractères — la taille exacte de 32 octets en base64url sans remplissage. */
export const LONGUEUR_TOKEN = 43;

export function engendrerToken(): string {
  const octets = new Uint8Array(OCTETS_TOKEN);
  crypto.getRandomValues(octets);
  return base64url(octets);
}

/**
 * Vérifie la forme d'un token. Sert au domaine et aux tests ; les règles
 * Firestore font la même vérification de leur côté, parce qu'une validation
 * côté navigateur ne protège rien (`SECURITY.md` §5).
 */
export function estTokenValide(brut: string): boolean {
  return brut.length === LONGUEUR_TOKEN && /^[A-Za-z0-9_-]+$/.test(brut);
}

function base64url(octets: Uint8Array): string {
  let binaire = "";
  for (const octet of octets) binaire += String.fromCharCode(octet);
  return btoa(binaire).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
