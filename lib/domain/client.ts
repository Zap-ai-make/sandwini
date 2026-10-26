/**
 * Un client.
 *
 * C'est la seule donnée que toutes les boutiques partagent (`DECISIONS.md`
 * D16) : un client n'est pas une opération, c'est une personne. Connu à
 * Pouytenga, il est retrouvé à Koudougou sans ressaisie, et son historique
 * d'achats reste entier.
 */

export type Client = {
  id: string;
  /**
   * Le nom de famille.
   *
   * **Une fiche d'avant S44 porte ici le nom entier**, prénom compris, et
   * `prenom` y vaut `""`. Les deux formes cohabitent sans migration parce que
   * `nomComplet` rend exactement la même chaîne dans les deux cas — et une
   * migration, c'est une fenêtre pendant laquelle deux formes coexistent mal.
   */
  nom: string;
  prenom: string;
  /* **Le numéro de la pièce d'identité est parti** (26 octobre 2026) :
     « supprime le numéro NIP pour la CNIB, finalement on en a pas besoin ».
     Il était facultatif, et il ne servait qu'à rapprocher deux fiches — le
     téléphone le fait, et c'est lui qu'on demande au comptoir. Les fiches
     déjà saisies gardent le leur en base : rien ne le lit plus. */
  /** Tel que la personne l'a saisi — c'est ce qui s'affiche et s'imprime. */
  telephone: string;
  /** Forme internationale, celle sur laquelle on cherche. */
  telephoneNormalise: string;
  telephone2: string;
  adresse: string;
  note: string;
  /** Le nom et le prénom sans casse ni accents, pour chercher dedans. */
  nomNormalise: string;
};

export type SaisieClient = {
  nom: string;
  prenom: string;
  telephone: string;
  telephone2: string;
  adresse: string;
  note: string;
};

export const SAISIE_CLIENT_VIDE: SaisieClient = {
  nom: "",
  prenom: "",
  telephone: "",
  telephone2: "",
  adresse: "",
  note: "",
};

export const LONGUEUR_NOM_MAX = 80;
export const LONGUEUR_ADRESSE_MAX = 200;
export const LONGUEUR_NOTE_MAX = 300;
export const LONGUEUR_TELEPHONE_MAX = 32;

/**
 * L'indicatif ajouté aux numéros locaux.
 *
 * La maison vend au Burkina Faso ; un numéro tapé en huit chiffres est un
 * numéro burkinabè. Un client étranger se saisit avec son indicatif, et il est
 * conservé tel quel. C'est la seule hypothèse de pays du code — elle se change
 * ici, en une ligne.
 */
export const INDICATIF_PAYS = "+226";
export const LONGUEUR_NUMERO_LOCAL = 8;

/**
 * Met un numéro sous sa forme internationale.
 *
 * Le même client est enregistré tantôt « 70 12 34 56 », tantôt « +226 70 12 34
 * 56 », tantôt « 0022670123456 ». Sans forme commune, on ne le retrouve pas et
 * on le crée une seconde fois. On garde le texte saisi pour l'affichage, et on
 * cherche sur cette forme-ci.
 */
export function normaliserTelephone(brut: string): string {
  const chiffresEtPlus = brut.replace(/[^\d+]/g, "");
  if (!chiffresEtPlus) return "";

  if (chiffresEtPlus.startsWith("+")) {
    return `+${chiffresEtPlus.slice(1).replace(/\D/g, "")}`;
  }
  if (chiffresEtPlus.startsWith("00")) {
    return `+${chiffresEtPlus.slice(2)}`;
  }
  if (chiffresEtPlus.length === LONGUEUR_NUMERO_LOCAL) {
    return `${INDICATIF_PAYS}${chiffresEtPlus}`;
  }
  /* Ni indicatif, ni longueur locale : on ne devine pas. Le numéro est gardé
     en chiffres, et la recherche par fragment le retrouvera quand même. */
  return chiffresEtPlus;
}

/** Le nom sans casse ni accents, pour chercher sur son début. */
export function normaliserNom(brut: string): string {
  return brut
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * Le nom tel qu'on le lit et qu'on l'imprime : le nom, puis le prénom.
 *
 * L'ordre n'est pas neutre — c'est celui sous lequel la maison connaît ses
 * clients, et celui dans lequel les fiches d'avant S44 ont été saisies. Le
 * choisir autrement ferait diverger l'affichage d'une fiche ancienne et d'une
 * fiche neuve pour la même personne.
 */
export function nomComplet(client: Pick<Client, "nom" | "prenom">): string {
  return [client.nom, client.prenom]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
}

/**
 * Le nom d'un client qu'on n'a peut-être pas retrouvé.
 *
 * Écrit une fois plutôt que onze : chaque écran qui affiche un client avait sa
 * propre façon de dire « absent », et la onzième copie est celle qui aurait
 * oublié le prénom.
 */
export function nomDuClient(
  client: Pick<Client, "nom" | "prenom"> | null | undefined,
  absent = "Client inconnu",
): string {
  return client ? nomComplet(client) : absent;
}

/**
 * La forme sur laquelle on cherche une personne : nom et prénom réunis.
 *
 * Séparer les deux champs sans réunir la forme cherchée ferait disparaître le
 * prénom de la recherche — au comptoir, on tape aussi bien l'un que l'autre.
 * Une fiche d'avant S44, qui a tout dans `nom`, rend la même chaîne qu'avant.
 */
export function nomPourRecherche(client: Pick<Client, "nom" | "prenom">): string {
  return normaliserNom(nomComplet(client));
}

export function validerClient(saisie: SaisieClient): string | null {
  const nom = saisie.nom.trim();
  if (!nom) return "Le nom du client est obligatoire.";
  if (nom.length > LONGUEUR_NOM_MAX) return `Le nom dépasse ${LONGUEUR_NOM_MAX} caractères.`;

  if (saisie.prenom.trim().length > LONGUEUR_NOM_MAX) {
    return `Le prénom dépasse ${LONGUEUR_NOM_MAX} caractères.`;
  }

  const telephone = saisie.telephone.trim();
  if (!telephone) return "Le téléphone est obligatoire : c’est par lui qu’on retrouve un client.";
  if (telephone.length > LONGUEUR_TELEPHONE_MAX) {
    return `Le téléphone dépasse ${LONGUEUR_TELEPHONE_MAX} caractères.`;
  }
  const normalise = normaliserTelephone(telephone);
  if (normalise.replace(/\D/g, "").length < 6) {
    return "Ce numéro de téléphone est trop court pour être joignable.";
  }

  if (saisie.telephone2.trim().length > LONGUEUR_TELEPHONE_MAX) {
    return `Le second téléphone dépasse ${LONGUEUR_TELEPHONE_MAX} caractères.`;
  }
  if (saisie.adresse.trim().length > LONGUEUR_ADRESSE_MAX) {
    return `L’adresse dépasse ${LONGUEUR_ADRESSE_MAX} caractères.`;
  }
  if (saisie.note.trim().length > LONGUEUR_NOTE_MAX) {
    return `La note dépasse ${LONGUEUR_NOTE_MAX} caractères.`;
  }
  return null;
}

/**
 * Cherche un client par numéro ou par début de nom.
 *
 * Les deux à la fois, sans que l'utilisateur ait à dire lequel : il tape ce
 * qu'il a — des chiffres relevés sur un carnet ou les premières lettres d'un
 * nom — et la liste se réduit. Sur un numéro, on accepte un **fragment**,
 * parce qu'on se souvient souvent de la fin plutôt que du début.
 *
 * **Sur un nom, on cherche le début d'un mot, pas un fragment.** La recherche
 * acceptait n'importe quelle sous-chaîne, ce qui faisait répondre « Sawadogo »
 * à « Awa » — au milieu du mot. Le défaut était invisible tant que le nom
 * n'était qu'un champ ; il devient franc quand on tape un prénom, qui est
 * court et donc d'autant plus souvent contenu ailleurs. Chercher par début de
 * mot fait les deux à la fois : le prénom se trouve, et le hasard ne répond
 * plus.
 */
export function chercherClients(clients: Client[], recherche: string): Client[] {
  const texte = recherche.trim();
  if (!texte) return clients;

  const chiffres = texte.replace(/\D/g, "");
  const nom = normaliserNom(texte);

  return clients.filter((client) => {
    if (chiffres.length >= 2) {
      const numeros = [client.telephoneNormalise, client.telephone, client.telephone2]
        .map((valeur) => valeur.replace(/\D/g, ""))
        .filter(Boolean);
      if (numeros.some((numero) => numero.includes(chiffres))) return true;
    }
    return nom.length > 0 && commenceUnMot(client.nomNormalise, nom);
  });
}

/** Vrai si `cherche` ouvre le nom entier, ou l'un de ses mots. */
function commenceUnMot(nomNormalise: string, cherche: string): boolean {
  if (nomNormalise.startsWith(cherche)) return true;
  return nomNormalise.split(" ").some((mot) => mot.startsWith(cherche));
}

/* **`nipDejaPris` est parti avec le NIP** (26 octobre 2026). Il rapprochait
   deux fiches par le numéro de pièce ; le rapprochement par téléphone, juste
   en dessous, reste — et c'est le numéro qu'on demande au comptoir. Le
   contrôle d'unicité du produit n'en est donc pas réduit à rien (D96). */

/** Le client qui porte déjà ce numéro, s'il y en a un. */
export function telephoneDejaPris(
  telephone: string,
  clients: Client[],
  sauf?: string,
): Client | undefined {
  const cible = normaliserTelephone(telephone);
  if (!cible) return undefined;
  return clients.find((client) => client.id !== sauf && client.telephoneNormalise === cible);
}

export function comparerClients(a: Client, b: Client): number {
  return a.nom.localeCompare(b.nom, "fr");
}

/**
 * Le numéro tel qu'on le lit à voix haute : par groupes de deux.
 *
 * Un numéro burkinabè se dicte « 70 12 34 56 ». Collé, il se relit mal et se
 * recopie faux — sur un reçu comme à l'écran.
 */
export function formaterTelephone(telephone: string): string {
  const normalise = normaliserTelephone(telephone);
  if (!normalise.startsWith(INDICATIF_PAYS)) return telephone.trim();

  const local = normalise.slice(INDICATIF_PAYS.length);
  if (local.length !== LONGUEUR_NUMERO_LOCAL) return telephone.trim();
  return local.replace(/(\d{2})(?=\d)/g, "$1 ");
}
