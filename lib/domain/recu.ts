import { numeroRecuVersement, type MoyenPaiement, type Vente, type Versement } from "./vente";

/**
 * Les reçus (`prompt.md` §10).
 *
 * **Un reçu n'est pas un document stocké : c'est une lecture de la vente et de
 * ses versements.** Rien n'est écrit au moment d'imprimer, et c'est un choix,
 * pas une économie (`DECISIONS.md` D61). Les deux chiffres qu'un reçu affirme —
 * le total payé et le reste dû au jour où il a été remis — se recalculent
 * exactement, parce que les deux données dont ils dérivent sont immuables : le
 * prix convenu ne bouge plus après la vente, et un versement ne se modifie ni
 * ne se supprime, pour personne (D58). Les figer dans un champ produirait une
 * seconde copie de la vérité, qui ne peut que finir par la contredire.
 *
 * Ce module ne contient que du calcul : ni Firestore, ni React, ni horloge.
 */

export const TYPES_RECU = ["vente", "versement"] as const;
export type TypeRecu = (typeof TYPES_RECU)[number];

export const LIBELLE_TYPE_RECU: Record<TypeRecu, string> = {
  vente: "Reçu de vente",
  versement: "Reçu de versement",
};

/**
 * Le séparateur de l'identifiant d'URL.
 *
 * `~` est un caractère non réservé (RFC 3986) : ni le navigateur ni
 * `URLSearchParams` ne l'encodent, et les identifiants tirés par Firestore
 * n'utilisent que des lettres et des chiffres. L'identifiant reste donc lisible
 * dans la barre d'adresse.
 */
const SEPARATEUR = "~";

/**
 * L'identifiant d'un reçu dans l'URL — `?recu=<venteId>` pour un reçu de vente,
 * `?recu=<venteId>~<versementId>` pour un reçu de versement.
 *
 * Un reçu n'a pas d'identifiant à lui puisqu'il n'est pas un document : il est
 * désigné par ce dont il rend compte. C'est aussi ce qui le rend consultable
 * hors ligne — les deux identifiants sont connus de l'appareil qui a saisi.
 */
export function identifiantRecu(venteId: string, versementId: string | null): string {
  return versementId ? `${venteId}${SEPARATEUR}${versementId}` : venteId;
}

export function lireIdentifiantRecu(brut: string): {
  venteId: string;
  versementId: string | null;
} | null {
  const [venteId, versementId, ...reste] = brut.split(SEPARATEUR);
  if (!venteId || reste.length > 0) return null;
  return { venteId, versementId: versementId || null };
}

/**
 * Le rang inscrit dans un numéro de reçu de versement — `PTG-2608-0042/V2` → 2.
 *
 * `null` désigne l'acompte du jour de la vente : il porte le numéro nu de la
 * vente parce qu'il **est** le reçu de vente (D52), et non un reçu de plus.
 * C'est le seul discriminant fiable — l'ordre ne suffit pas, puisqu'une vente
 * sans acompte fait porter `/V1` à son premier versement ultérieur.
 */
export function rangInscrit(numeroRecu: string): number | null {
  const trouve = /\/V(\d+)$/.exec(numeroRecu);
  return trouve ? Number(trouve[1]) : null;
}

/**
 * Le numéro que porte le reçu réimprimé aujourd'hui.
 *
 * Il est **reconstruit sur `vente.numero`**, jamais recopié depuis le
 * versement : une vente renumérotée par la réconciliation du serveur (D44) doit
 * se réimprimer avec son numéro définitif. Le rang, lui, ne change pas — c'est
 * le rang de l'encaissement, pas celui du numéro.
 */
export function numeroDefinitif(
  vente: Pick<Vente, "numero">,
  versement: Pick<Versement, "numeroRecu"> | null,
): string {
  if (!versement) return vente.numero;
  const rang = rangInscrit(versement.numeroRecu);
  return rang === null ? vente.numero : numeroRecuVersement(vente.numero, rang);
}

/**
 * Le total payé et le reste dû **au jour du reçu**, versements comptés jusqu'à
 * `index` inclus. `-1` veut dire « aucun encaissement à cette date ».
 *
 * On somme plutôt que de lire un agrégat : celui de la vente porte le total
 * d'aujourd'hui, qui n'est pas celui qu'un client a lu sur un reçu remis il y a
 * trois mois. La liste reçue est celle de la fiche, déjà triée par date.
 */
export function situationAu(
  prixConvenu: number,
  versements: readonly Pick<Versement, "montant">[],
  index: number,
): { totalPaye: number; resteDu: number } {
  const totalPaye = versements
    .slice(0, index + 1)
    .reduce((somme, versement) => somme + versement.montant, 0);
  return { totalPaye, resteDu: Math.max(prixConvenu - totalPaye, 0) };
}

export type ContenuRecu = {
  /** Ce que porte `?recu=` — cf. `identifiantRecu`. */
  cle: string;
  type: TypeRecu;
  vente: Vente;
  /** L'encaissement dont ce reçu rend compte, s'il y en a un. */
  versement: Versement | null;
  /** Le numéro qui fait foi aujourd'hui. */
  numero: string;
  /** Le numéro imprimé sur le papier déjà remis, s'il a divergé depuis (D44). */
  numeroRemis: string | null;
  date: Date | null;
  montantEncaisse: number;
  moyenPaiement: MoyenPaiement | null;
  reference: string;
  totalPaye: number;
  resteDu: number;
  /** Qui a encaissé — le §10 l'exige sur le document. */
  operateur: string;
};

function construire(
  vente: Vente,
  versements: readonly Versement[],
  index: number,
  type: TypeRecu,
): ContenuRecu {
  const versement = index >= 0 ? (versements[index] ?? null) : null;
  const numero = numeroDefinitif(vente, type === "vente" ? null : versement);
  /* Le papier déjà remis porte, pour une vente, le numéro attribué par
     l'appareil — `numeroInitial` ne bouge jamais (D44) — et, pour un versement,
     le numéro tel qu'il a été écrit. On ne le montre que s'il a divergé. */
  const remis = type === "vente" ? vente.numeroInitial : (versement?.numeroRecu ?? "");

  return {
    cle: identifiantRecu(vente.id, type === "vente" ? null : (versement?.id ?? null)),
    type,
    vente,
    versement,
    numero,
    numeroRemis: remis && remis !== numero ? remis : null,
    /* Un reçu de vente porte la date de la vente, même quand l'acompte a été
       saisi dans le même lot : c'est la date de l'opération. */
    date: type === "vente" ? vente.date : (versement?.date ?? null),
    montantEncaisse: versement?.montant ?? 0,
    moyenPaiement: versement?.moyenPaiement ?? null,
    reference: versement?.reference ?? "",
    ...situationAu(vente.prixConvenu, versements, index),
    operateur: (type === "vente" ? vente.operateur : versement?.operateur) || "",
  };
}

/**
 * Les reçus d'une vente : celui de la vente, puis un par versement ultérieur.
 *
 * L'acompte du jour de la vente n'en fait pas un de plus — il est déjà porté
 * par le reçu de vente, avec lequel il a été remis au client (D52).
 *
 * `versements` doit être trié par date croissante, comme le rend
 * `ecouterVersements` : c'est cet ordre qui donne le cumul de chaque reçu.
 */
export function composerRecus(vente: Vente, versements: readonly Versement[]): ContenuRecu[] {
  const indexAcompte = versements.findIndex(
    (versement) => rangInscrit(versement.numeroRecu) === null,
  );

  return [
    construire(vente, versements, indexAcompte, "vente"),
    ...versements.flatMap((versement, index) =>
      rangInscrit(versement.numeroRecu) === null
        ? []
        : [construire(vente, versements, index, "versement")],
    ),
  ];
}

/** Le reçu désigné par `?recu=`, ou `null` s'il ne correspond à rien de connu. */
export function trouverRecu(
  vente: Vente,
  versements: readonly Versement[],
  cle: string,
): ContenuRecu | null {
  return composerRecus(vente, versements).find((recu) => recu.cle === cle) ?? null;
}

export type RecuCherchable = {
  recu: ContenuRecu;
  /** Nom du client, déjà réduit par l'appelant (sans casse ni accents). */
  nomNormalise: string;
};

function sansSeparateur(valeur: string): string {
  return valeur.toUpperCase().replace(/[\s\-/]+/g, "");
}

/**
 * Cherche un reçu par son numéro ou par le nom du client (§10).
 *
 * Le numéro se compare sans ses séparateurs : il se lit sur un papier froissé,
 * et personne ne retape les tirets à l'identique — même lecture qu'en S8 pour
 * la recherche de ventes. Le nom arrive déjà normalisé par l'appelant, qui
 * détient le fichier clients.
 */
export function chercherRecus<T extends RecuCherchable>(
  cherchables: readonly T[],
  recherche: string,
  normaliserNom: (brut: string) => string,
): T[] {
  const texte = recherche.trim();
  if (!texte) return [...cherchables];

  const nom = normaliserNom(texte);
  const brut = sansSeparateur(texte);

  return cherchables.filter((ligne) => {
    if (nom.length > 0 && ligne.nomNormalise.includes(nom)) return true;
    return brut.length >= 2 && sansSeparateur(ligne.recu.numero).includes(brut);
  });
}

/** Le jour d'une date, dans le fuseau de l'appareil, au format de `<input type="date">`. */
export function jourLocal(date: Date): string {
  const mois = `${date.getMonth() + 1}`.padStart(2, "0");
  const jour = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${mois}-${jour}`;
}

/**
 * Ne garde que les reçus d'une plage de dates, bornes comprises.
 *
 * Les bornes sont des jours, pas des instants : `<input type="date">` rend
 * `2026-08-31`, et un reçu établi à 17 h ce jour-là doit entrer dans une plage
 * qui s'arrête le 31. D'où la comparaison sur le jour local plutôt que sur
 * l'horodatage, qui escamoterait la dernière journée.
 */
export function filtrerParDates<T extends RecuCherchable>(
  cherchables: readonly T[],
  du: string,
  au: string,
): T[] {
  if (!du && !au) return [...cherchables];
  return cherchables.filter(({ recu }) => {
    if (!recu.date) return false;
    const jour = jourLocal(recu.date);
    return (!du || jour >= du) && (!au || jour <= au);
  });
}

/** Du plus récent au plus ancien : au comptoir, on réimprime celui de tout à l'heure. */
export function comparerRecus(a: ContenuRecu, b: ContenuRecu): number {
  return (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0);
}

/**
 * Le texte partagé avec le client — `prompt.md` §11, message type 3.
 *
 * C'est la seule chose qu'un reçu envoie hors de l'appareil, et elle tient dans
 * un message : numéro, montant, reste dû. Aucune pièce jointe à fabriquer, donc
 * rien à générer qui pourrait manquer hors ligne (D60).
 */
export function textePartage(
  recu: ContenuRecu,
  nomEntreprise: string,
  formaterMontant: (montant: number) => string,
  formaterDate: (date: Date) => string,
): string {
  return [
    `${LIBELLE_TYPE_RECU[recu.type]} ${recu.numero}`,
    nomEntreprise,
    recu.date ? formaterDate(recu.date) : null,
    recu.montantEncaisse > 0 ? `Reçu : ${formaterMontant(recu.montantEncaisse)}` : null,
    `Total payé : ${formaterMontant(recu.totalPaye)}`,
    `Reste dû : ${formaterMontant(recu.resteDu)}`,
  ]
    .filter((ligne): ligne is string => Boolean(ligne))
    .join("\n");
}
