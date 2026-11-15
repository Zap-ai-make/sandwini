/**
 * Changer son propre mot de passe (15 novembre 2026).
 *
 * « Permets au superviseur de changer son mot de passe » : le compte du
 * responsable avait été créé dans la console, et son mot de passe ne se
 * changeait nulle part. Le commanditaire l'a ouvert à chaque compte — chacun
 * change le sien ; le responsable garde la main pour réinitialiser un gérant
 * (`ModifierGerantModal`).
 */

/**
 * La longueur qu'exige la création d'un gérant (`functions/src/gerants.ts`,
 * `LONGUEUR_MOT_DE_PASSE`). Un compte ne doit pas pouvoir se donner un mot de
 * passe plus faible que celui qu'on lui a remis.
 */
export const LONGUEUR_MOT_DE_PASSE_MIN = 10;
const LONGUEUR_MOT_DE_PASSE_MAX = 128;

export type ChangementMotDePasse = {
  actuel: string;
  nouveau: string;
  confirmation: string;
};

/**
 * Le refus à afficher, ou `null` si la saisie peut partir.
 *
 * Tout se vérifie avant l'envoi : le changement exige le réseau, et un refus
 * du serveur pour une confirmation mal tapée coûterait un aller-retour.
 */
export function validerChangementMotDePasse({
  actuel,
  nouveau,
  confirmation,
}: ChangementMotDePasse): string | null {
  if (actuel === "") return "Saisissez votre mot de passe actuel.";
  if (nouveau.length < LONGUEUR_MOT_DE_PASSE_MIN) {
    return `Le nouveau mot de passe doit faire au moins ${LONGUEUR_MOT_DE_PASSE_MIN} caractères.`;
  }
  if (nouveau.length > LONGUEUR_MOT_DE_PASSE_MAX) {
    return `Le nouveau mot de passe ne doit pas dépasser ${LONGUEUR_MOT_DE_PASSE_MAX} caractères.`;
  }
  if (nouveau !== confirmation) {
    return "Les deux saisies du nouveau mot de passe ne correspondent pas.";
  }
  if (nouveau === actuel) return "Le nouveau mot de passe doit différer de l’actuel.";
  return null;
}

/** Ce que l'écran dit d'un refus de Firebase Auth. */
export function messageErreurMotDePasse(cause: unknown): string {
  const code = (cause as { code?: unknown } | null | undefined)?.code;
  switch (code) {
    /* Les versions récentes rendent `invalid-credential` là où les anciennes
       rendaient `wrong-password`. */
    case "auth/wrong-password":
    case "auth/invalid-credential":
    case "auth/invalid-login-credentials":
      return "Le mot de passe actuel est incorrect.";
    case "auth/too-many-requests":
      return "Trop de tentatives. Patientez quelques minutes avant de réessayer.";
    case "auth/network-request-failed":
      return "Changer de mot de passe demande du réseau, et la demande n’a pas atteint le serveur.";
    case "auth/weak-password":
      return "Ce mot de passe est trop faible. Choisissez-en un plus long.";
    /* Ne devrait pas arriver : on réauthentifie juste avant. Mais si la
       session a vieilli entre-temps, se reconnecter est le seul recours. */
    case "auth/requires-recent-login":
    case "auth/user-mismatch":
      return "Déconnectez-vous et reconnectez-vous, puis recommencez.";
    default:
      return "Le mot de passe n’a pas pu être changé.";
  }
}
