/**
 * La charge utile du portail du prestataire, fabriquée (S56).
 *
 * **La moitié SERVEUR d'une frontière nommée.** La moitié cliente — le type et
 * son relecteur — vit dans `lib/domain/suivi-prestataire.ts`, et ce fichier ne
 * peut pas l'importer : `functions/tsconfig.json` a `rootDir: "src"`, donc le
 * paquet déployé ne compile rien d'extérieur. Les deux ne partagent donc aucun
 * code, exactement comme `lib/domain/numerotation.ts` et
 * `functions/src/numerotation.ts` — le serveur fabrique, le client relit, et
 * c'est `suivi.test.ts` qui les noue par un aller-retour. Ce test est le contrat
 * réel entre les deux : tout ce qui sort d'ici doit se relire là-bas, en entier.
 *
 * **Ce fichier est du calcul pur** — pas de Firestore, pas d'Admin SDK. La
 * lecture vit dans `index.ts`, qui l'appelle. La séparation n'est pas
 * décorative : c'est elle qui permet de vérifier en millisecondes que rien ne
 * fuit, sans émulateur et sans décor.
 *
 * **Ce qui ne traverse jamais, et pourquoi ça se vérifie ici.** Pas de prix de
 * vente, pas de coût, pas de marge, pas de téléphone du client, aucun
 * identifiant Firestore. Le mur de D2 ne tient pas par vigilance mais par
 * construction : `CarteDuSuivi` n'a pas de champ pour un coût, donc l'appelant
 * n'a rien à oublier de filtrer.
 */

/**
 * Une carte grise telle que la lecture la présente au calcul.
 *
 * Les dates sont des **millisecondes** et non des `Timestamp` : ce type est la
 * couture entre l'Admin SDK et du calcul pur, et y laisser entrer un type
 * Firestore ferait de ce fichier un module qui dépend de la base.
 */
export type CarteDuSuivi = {
  venteId: string;
  statut: string;
  deposeLe: number | null;
  remisLe: number | null;
  avance: number | null;
  numeroVente: string;
  client: string;
  moto: string;
  chassis: string;
};

export type LigneDuSuivi = {
  numeroVente: string;
  client: string;
  moto: string;
  chassis: string;
  deposeLe: string;
  revenuLe: string | null;
  joursDehors: number;
};

export type SuiviFabrique = {
  prestataire: { nom: string };
  enCours: LigneDuSuivi[];
  historique: LigneDuSuivi[];
  argent: { avances: number };
};

/** Dehors, chez le prestataire. Le seul statut qui met une carte « en cours ». */
const DEHORS = "chez_prestataire";

/* `remis_client` ne s'écrit plus, mais la préversion en porte. L'ignorer
   laisserait des cartes rendues dans la colonne « en cours », et le prestataire
   croirait qu'on lui en réclame une qu'il a déjà rapportée. */
const RENTREES = ["revenu_magasin", "remis_client"];

/**
 * Le début de la journée d'un instant, en millisecondes.
 *
 * **Les jours se comptent en dates, pas en tranches de vingt-quatre heures.**
 * Une carte déposée à 17 h et consultée le lendemain à 9 h est dehors depuis
 * **un** jour — c'est ce que dirait la personne au comptoir, et c'est ce que
 * `joursEcoules` calcule déjà côté client (`lib/domain/dossier.ts`). Compter en
 * heures rendrait zéro, et le prestataire lirait « déposée aujourd'hui » sur une
 * carte partie la veille.
 */
function debutDeJournee(instant: number): number {
  const date = new Date(instant);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function joursDehors(depose: number | null, maintenant: number): number {
  if (depose === null) return 0;
  const jours = Math.round((debutDeJournee(maintenant) - debutDeJournee(depose)) / 86_400_000);
  /* Une horloge de téléphone en avance produirait un dépôt « dans le futur ».
     « Depuis -2 jours » est pire qu'un zéro — et le relecteur du client refuse
     de toute façon un nombre négatif, donc la page entière tomberait. */
  return jours < 0 ? 0 : jours;
}

/**
 * Les replis de libellé.
 *
 * Une vente, une moto ou un client devenu illisible ne doit pas faire tomber le
 * portail entier : la ligne se construit et **dit ce qu'elle ne sait pas**. Le
 * châssis, lui, n'a pas de repli — inventer « Châssis inconnu » laisserait
 * croire à une donnée, alors que cette ligne se lit par son numéro.
 */
function ouSinon(valeur: string, defaut: string): string {
  return valeur.trim().length > 0 ? valeur : defaut;
}

function ligne(carte: CarteDuSuivi, maintenant: number): LigneDuSuivi {
  return {
    numeroVente: ouSinon(carte.numeroVente, "Sans numéro"),
    client: ouSinon(carte.client, "Client inconnu"),
    moto: ouSinon(carte.moto, "Moto inconnue"),
    chassis: carte.chassis,
    /* Chaîne vide et non `null` : le type de la frontière promet une chaîne, et
       une date absente se lit comme une date qu'on ne connaît pas. */
    deposeLe: carte.deposeLe === null ? "" : new Date(carte.deposeLe).toISOString(),
    revenuLe: carte.remisLe === null ? null : new Date(carte.remisLe).toISOString(),
    joursDehors: joursDehors(carte.deposeLe, maintenant),
  };
}

/**
 * Ce que le prestataire voit.
 *
 * **Une carte `a_faire` ne figure nulle part**, et son avance ne compte pas :
 * elle n'est jamais partie. Son document peut porter le nom d'un prestataire —
 * un dépôt annulé laisse ces champs derrière lui —, et l'afficher lui
 * réclamerait un travail qu'on ne lui a pas confié.
 *
 * Les avances s'additionnent sur les **documents**, jamais sur les paquets : un
 * paquet répartit son avance entre ses cartes, la part de chacune et le reste à
 * la première, précisément pour que cette somme retombe juste. Additionner les
 * paquets raterait les dépôts unitaires d'avant S53.
 */
export function construireSuivi(
  nom: string,
  cartes: readonly CarteDuSuivi[],
  maintenant: number,
): SuiviFabrique {
  const dehors = cartes.filter((carte) => carte.statut === DEHORS);
  const rentrees = cartes.filter((carte) => RENTREES.includes(carte.statut));

  /* La plus vieille d'abord : c'est celle qui inquiète, et c'est pour elle qu'on
     ouvre le lien. L'historique, lui, se lit à l'envers — le dernier retour est
     celui dont on veut la preuve. */
  const parDepotCroissant = [...dehors].sort((a, b) => (a.deposeLe ?? 0) - (b.deposeLe ?? 0));
  const parRetourDecroissant = [...rentrees].sort((a, b) => (b.remisLe ?? 0) - (a.remisLe ?? 0));

  const avances = [...dehors, ...rentrees].reduce((total, carte) => total + (carte.avance ?? 0), 0);

  return {
    prestataire: { nom },
    enCours: parDepotCroissant.map((carte) => ligne(carte, maintenant)),
    historique: parRetourDecroissant.map((carte) => ligne(carte, maintenant)),
    argent: { avances },
  };
}
