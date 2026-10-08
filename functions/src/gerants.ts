/**
 * Ce qu'une demande de modification de compte contient, et ce qu'elle coupe (S52).
 *
 * Ce fichier est du calcul pur — pas de Firestore, pas d'Admin SDK, pas même
 * `HttpsError` — pour que la règle qui décide se vérifie en millisecondes
 * plutôt que sur émulateur. Même grain que `numerotation.ts`. L'appelant
 * traduit un refus en `invalid-argument` ; c'est la seule chose qu'il ajoute.
 *
 * **La distinction qui porte tout : absent n'est pas vide.** Un champ que la
 * requête ne mentionne pas veut dire « n'y touche pas ». Un champ vidé voudrait
 * dire « efface-le », ce qu'aucun des trois ne permet : un gérant sans nom,
 * sans adresse de connexion ou sans mot de passe n'est pas un compte. Si l'un
 * passait pour l'autre, le formulaire annoncerait un enregistrement réussi sans
 * avoir rien fait. Même grain que D101 et D105.
 */

export type ModificationGerant = {
  /** Le nom affiché, rogné. `null` quand la demande n'y touche pas. */
  nom: string | null;
  /** L'adresse de connexion, en minuscules. `null` quand la demande n'y touche pas. */
  email: string | null;
  /** Le nouveau mot de passe, **tel quel**. `null` quand la demande n'y touche pas. */
  motDePasse: string | null;
};

/** Le plus court mot de passe acceptable — le même qu'à la création. */
export const LONGUEUR_MOT_DE_PASSE = 10;

/** Le plus long que Firebase accepte. Au-delà, l'appel échouerait côté serveur. */
const MOT_DE_PASSE_MAXIMUM = 128;

const NOM_MAXIMUM = 200;

/* La même expression qu'à la création : on ne valide pas une adresse plus
   sévèrement ici que là, sinon une adresse acceptée un jour deviendrait
   incorrigible le lendemain. */
const ADRESSE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type LectureModification =
  | { modification: ModificationGerant }
  /** La phrase à renvoyer à la personne. L'appelant lui donne son code. */
  | { invalide: string };

/** Le champ est-il mentionné par la demande ? `undefined` et `null` disent non. */
function absent(valeur: unknown): boolean {
  return valeur === undefined || valeur === null;
}

export function lireModification(data: unknown): LectureModification {
  if (typeof data !== "object" || data === null) {
    return { invalide: "Aucune modification demandée." };
  }

  const brut = data as Record<string, unknown>;
  const demandes = ["nom", "email", "motDePasse"].filter((champ) => !absent(brut[champ]));
  if (demandes.length === 0) {
    return { invalide: "Aucune modification demandée." };
  }

  let nom: string | null = null;
  if (!absent(brut.nom)) {
    if (typeof brut.nom !== "string" || brut.nom.trim().length === 0) {
      return { invalide: "Le nom ne peut pas être vide." };
    }
    nom = brut.nom.trim();
    if (nom.length > NOM_MAXIMUM) {
      return { invalide: "Le nom est trop long." };
    }
  }

  let email: string | null = null;
  if (!absent(brut.email)) {
    if (typeof brut.email !== "string") {
      return { invalide: "Adresse e-mail invalide." };
    }
    email = brut.email.trim().toLowerCase();
    if (!ADRESSE.test(email)) {
      return { invalide: "Adresse e-mail invalide." };
    }
  }

  let motDePasse: string | null = null;
  if (!absent(brut.motDePasse)) {
    /* Pas de `trim` : une espace de tête ou de fin fait partie du secret, et la
       retirer donnerait un mot de passe introuvable en le retapant. */
    if (typeof brut.motDePasse !== "string" || brut.motDePasse.length < LONGUEUR_MOT_DE_PASSE) {
      return {
        invalide: `Le mot de passe doit faire au moins ${LONGUEUR_MOT_DE_PASSE} caractères.`,
      };
    }
    motDePasse = brut.motDePasse;
    if (motDePasse.length > MOT_DE_PASSE_MAXIMUM) {
      return { invalide: "Le mot de passe est trop long." };
    }
  }

  return { modification: { nom, email, motDePasse } };
}

/**
 * Cette modification ferme-t-elle les sessions ouvertes du gérant ?
 *
 * **Oui pour l'adresse et le mot de passe.** L'adresse est l'identifiant de
 * connexion, le mot de passe en est la clé : sans révocation, les sessions déjà
 * ouvertes continuent jusqu'à l'expiration du jeton, soit jusqu'à une heure —
 * c'est le raisonnement déjà écrit dans `attribuerBoutique`.
 *
 * **Non pour le nom affiché.** Il ne change aucun droit, et déconnecter
 * quelqu'un pour une faute de frappe dans son nom serait une punition sans
 * motif.
 */
export function fermeLesSessions(modification: ModificationGerant): boolean {
  return modification.email !== null || modification.motDePasse !== null;
}
