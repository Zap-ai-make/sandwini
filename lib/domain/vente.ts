import { formaterMontant } from "./format";
import { lireLignes, ligneTropLongue, LIGNES_MAX, LONGUEUR_LIGNE_MAX } from "./saisie";

/**
 * Une vente de moto (`prompt.md` §5.4, §6.1, §6.2).
 *
 * Le document que le gérant lit pour travailler. Ce qu'il ne contient pas est
 * aussi important que ce qu'il contient : le coût de la moto et la marge vivent
 * dans `ventesMotos/{id}/prive/marge`, réservé au responsable (`DECISIONS.md`
 * D2). Firestore ne masque pas un champ — un document lisible est lisible en
 * entier — donc la seule façon de tenir le §8 du cahier des charges est de
 * couper le document en deux.
 *
 * **Les deux mots à ne jamais confondre**, ici comme dans l'interface :
 * *crédit* = la moto est partie chez le client, qui doit de l'argent au
 * magasin ; *tranches* = la moto est restée au magasin, qui détient l'argent du
 * client. Les intervertir fausse le stock et la caisse à la fois.
 *
 * Ce module ne contient que du calcul : ni Firestore, ni React, ni horloge.
 */

export const MODES_PAIEMENT = ["comptant", "credit", "tranches"] as const;
export type ModePaiement = (typeof MODES_PAIEMENT)[number];

export const LIBELLE_MODE: Record<ModePaiement, string> = {
  comptant: "Comptant",
  credit: "Crédit",
  tranches: "Tranches",
};

/** Ce que le mode change réellement, dit au gérant avant qu'il valide. */
export const EFFET_MODE: Record<ModePaiement, string> = {
  comptant: "Payée en entier maintenant. La moto part avec le client.",
  credit: "La moto part avec le client, qui devra le reste. Elle entrera dans les dettes.",
  tranches: "La moto reste au magasin jusqu’au dernier versement. L’argent reçu est un engagement.",
};

export const STATUTS_PAIEMENT = ["impaye", "partiel", "solde"] as const;
export type StatutPaiement = (typeof STATUTS_PAIEMENT)[number];

export const LIBELLE_STATUT_PAIEMENT: Record<StatutPaiement, string> = {
  impaye: "Impayée",
  partiel: "Partiellement payée",
  solde: "Soldée",
};

export const MOYENS_PAIEMENT = ["especes", "orange_money", "moov_money", "wave"] as const;
export type MoyenPaiement = (typeof MOYENS_PAIEMENT)[number];

export const LIBELLE_MOYEN: Record<MoyenPaiement, string> = {
  especes: "Espèces",
  orange_money: "Orange Money",
  moov_money: "Moov Money",
  wave: "Wave",
};

/** Les quatre documents du dossier, dans l'ordre où le magasin les traite (§13). */
export const TYPES_DOCUMENT = ["quittance", "cmc", "carte_grise", "plaque"] as const;
export type TypeDocument = (typeof TYPES_DOCUMENT)[number];

export const LIBELLE_DOCUMENT: Record<TypeDocument, string> = {
  quittance: "Quittance",
  cmc: "CMC",
  carte_grise: "Carte grise",
  plaque: "Plaque",
};

export const STATUTS_DOCUMENT = [
  "a_faire",
  "chez_prestataire",
  "revenu_magasin",
  "remis_client",
  "non_applicable",
] as const;
export type StatutDocument = (typeof STATUTS_DOCUMENT)[number];

export const LIBELLE_STATUT_DOCUMENT: Record<StatutDocument, string> = {
  a_faire: "À faire",
  chez_prestataire: "Chez le prestataire",
  revenu_magasin: "Revenu au magasin",
  remis_client: "Remis au client",
  non_applicable: "Sans objet",
};

export const STATUTS_DOSSIER = ["ouvert", "clos"] as const;
export type StatutDossier = (typeof STATUTS_DOSSIER)[number];

export type Vente = {
  id: string;
  /** Le numéro qu'on imprime. Le serveur peut le corriger en cas de collision (D44). */
  numero: string;
  /** Celui que l'appareil a attribué. Personne ne le réécrit jamais : c'est la clé de rapprochement. */
  numeroInitial: string;
  boutiqueId: string;
  motoId: string;
  clientId: string;
  date: Date | null;
  prixConvenu: number;
  modePaiement: ModePaiement;
  inclus: string[];
  nonInclus: string[];
  totalPaye: number;
  resteDu: number;
  statutPaiement: StatutPaiement;
  dernierVersementAt: Date | null;
  motoRemise: boolean;
  dateRemiseMoto: Date | null;
  tokenSuivi: string;
  lienSuiviEnvoyeAt: Date | null;
  statutDossier: StatutDossier;
  dateClotureDossier: Date | null;
  /**
   * Le nom de qui a enregistré la vente, tel qu'il s'imprime sur le reçu (§10).
   *
   * Recopié depuis la trace d'audit `createdByName` : le reçu doit nommer une
   * personne, et `createdBy` n'est qu'un identifiant de compte. Ce champ ne se
   * relit jamais pour décider quoi que ce soit — c'est une mention, pas un
   * droit.
   */
  operateur: string;
};

export type Versement = {
  id: string;
  /** Répété sur le document : une sous-collection ne connaît pas son grand-parent. */
  venteId: string;
  numeroRecu: string;
  date: Date | null;
  montant: number;
  moyenPaiement: MoyenPaiement;
  reference: string;
  encaissementId: string;
  /** Le nom de qui a encaissé, imprimé sur le reçu (§10). Cf. `Vente.operateur`. */
  operateur: string;
};

export type DocumentDossier = {
  id: string;
  venteId: string;
  type: TypeDocument;
  statut: StatutDocument;
};

/** Ce que le responsable seul peut lire : le coût figé et la marge (D2, D51). */
export type MargeVente = {
  coutMotoSnapshot: number;
  marge: number;
};

export const MONTANT_MAX = 1_000_000_000;
export const LONGUEUR_REFERENCE_MAX = 60;

export type SaisieVente = {
  motoId: string;
  clientId: string;
  prixConvenu: string;
  modePaiement: ModePaiement;
  inclus: string;
  nonInclus: string;
  /** Ce que le client dépose au moment de la vente. Vide vaut zéro. */
  montantEncaisse: string;
  moyenPaiement: MoyenPaiement;
  reference: string;
};

export const SAISIE_VENTE_VIDE: SaisieVente = {
  motoId: "",
  clientId: "",
  prixConvenu: "",
  modePaiement: "comptant",
  inclus: "",
  nonInclus: "",
  montantEncaisse: "",
  moyenPaiement: "especes",
  reference: "",
};

/**
 * Le nombre saisi, ou `null` si le champ ne contient pas un entier utilisable.
 *
 * Le FCFA ne se divise pas : un montant à virgule est une erreur de saisie, pas
 * une valeur à arrondir. Même lecture qu'en S5 pour les coûts d'entrée.
 */
export function lireMontant(brut: string): number | null {
  const propre = brut.replace(/[\s ]/g, "");
  if (!/^[0-9]+$/.test(propre)) return null;
  const valeur = Number(propre);
  return Number.isSafeInteger(valeur) ? valeur : null;
}

/** Vide vaut zéro : le client peut repartir sans avoir rien déposé. */
export function lireMontantEncaisse(brut: string): number | null {
  return brut.trim() === "" ? 0 : lireMontant(brut);
}

/**
 * Les agrégats de paiement d'une vente.
 *
 * Dénormalisés sur le document parce que le cahier des charges les y met (§5.4),
 * mais **les versements restent la source de vérité** : cette fonction les
 * recalcule toujours depuis la liste, jamais depuis l'agrégat précédent. C'est
 * ce qui permet à S9 de la rejouer après coup sans hériter d'une erreur.
 */
export function agregatsPaiement(
  prixConvenu: number,
  versements: readonly { montant: number }[],
): { totalPaye: number; resteDu: number; statutPaiement: StatutPaiement } {
  const totalPaye = versements.reduce((somme, versement) => somme + versement.montant, 0);
  /* Jamais de reste négatif : un trop-perçu est une erreur de saisie, et
     l'afficher en négatif ferait croire que le magasin doit de l'argent. Le
     refus a lieu en amont — un versement ne peut pas dépasser le reste dû. */
  const resteDu = Math.max(prixConvenu - totalPaye, 0);
  return { totalPaye, resteDu, statutPaiement: statutPaiementDe(totalPaye, resteDu) };
}

export function statutPaiementDe(totalPaye: number, resteDu: number): StatutPaiement {
  if (resteDu <= 0) return "solde";
  return totalPaye > 0 ? "partiel" : "impaye";
}

/**
 * Le statut de la moto après la vente (§6.2).
 *
 * Comptant et crédit livrent la moto ; les tranches la retiennent au magasin.
 * C'est la seule différence de stock entre les trois modes, et elle est le
 * cœur de la distinction crédit / tranches.
 */
export function statutMotoApresVente(mode: ModePaiement): "vendue" | "reservee" {
  return mode === "tranches" ? "reservee" : "vendue";
}

export function motoRemiseA(mode: ModePaiement): boolean {
  return mode !== "tranches";
}

/**
 * L'argent d'une vente en tranches est un engagement, pas une recette (§6.2).
 *
 * Tant que la moto dort au magasin, ce que le client a versé peut lui revenir.
 * Le marquer dès l'encaissement évite d'avoir à le retrouver plus tard, quand
 * la caisse s'ouvrira (S22).
 */
export function estEngagement(mode: ModePaiement, motoRemise: boolean): boolean {
  return mode === "tranches" && !motoRemise;
}

/** Une vente que le serveur a renumérotée : les deux champs ont divergé (D44). */
export function estRenumerotee(vente: Pick<Vente, "numero" | "numeroInitial">): boolean {
  return vente.numeroInitial !== "" && vente.numero !== vente.numeroInitial;
}

/**
 * Le montant maximal qu'un versement peut porter (§6.2).
 *
 * Séparé de la validation pour que l'écran puisse l'afficher — dire « au plus
 * 350 000 FCFA » vaut mieux que refuser sans donner le chiffre.
 */
export function versementMaximal(prixConvenu: number, totalDejaPaye: number): number {
  return Math.max(prixConvenu - totalDejaPaye, 0);
}

/**
 * Valide une saisie de vente. Rend la phrase à afficher, ou `null` si tout va bien.
 *
 * Les règles Firestore revalident tout ceci de leur côté (`SECURITY.md` §5) :
 * ce qui suit sert à expliquer, pas à protéger.
 */
export function validerVente(saisie: SaisieVente): string | null {
  if (!saisie.motoId) return "Choisissez la moto vendue.";
  if (!saisie.clientId) return "Choisissez le client, ou créez sa fiche.";

  const prixConvenu = lireMontant(saisie.prixConvenu);
  if (prixConvenu === null) return "Le prix convenu est obligatoire, en chiffres entiers.";
  if (prixConvenu <= 0) return "Le prix convenu doit être supérieur à zéro.";
  if (prixConvenu > MONTANT_MAX) return "Le prix convenu dépasse le maximum admis.";

  const encaisse = lireMontantEncaisse(saisie.montantEncaisse);
  if (encaisse === null) return "Le montant encaissé doit être un nombre entier, ou rester vide.";
  if (encaisse > prixConvenu) {
    return "Le montant encaissé ne peut pas dépasser le prix convenu.";
  }
  if (saisie.modePaiement === "comptant" && encaisse !== prixConvenu) {
    return "Une vente au comptant est payée en entier. Encaissez le prix convenu, ou choisissez crédit ou tranches.";
  }

  if (saisie.reference.trim().length > LONGUEUR_REFERENCE_MAX) {
    return `La référence dépasse ${LONGUEUR_REFERENCE_MAX} caractères.`;
  }

  for (const [champ, brut] of [
    ["inclus", saisie.inclus],
    ["non inclus", saisie.nonInclus],
  ] as const) {
    const lignes = lireLignes(brut);
    const trop = ligneTropLongue(lignes);
    if (trop) return `Une ligne « ${champ} » dépasse ${LONGUEUR_LIGNE_MAX} caractères.`;
    if (brut.split("\n").filter((ligne) => ligne.trim()).length > LIGNES_MAX) {
      return `La liste « ${champ} » ne peut pas dépasser ${LIGNES_MAX} lignes.`;
    }
  }

  return null;
}

/**
 * Cherche une vente par le client, comme le demande le §6.4 : un champ unique,
 * un nom ou un numéro de téléphone. Le numéro de la vente est accepté en plus —
 * c'est ce que le client tend quand il revient avec son reçu.
 *
 * La recherche porte sur des libellés déjà résolus (nom du client, son
 * téléphone, la moto) parce que la vente ne les porte pas : elle porte des
 * identifiants. L'appelant les fournit ; c'est lui qui a le fichier clients et
 * le stock en mémoire, tous deux chargés entiers et donc disponibles hors ligne.
 */
export type VenteCherchable = {
  vente: Vente;
  /** Nom du client, déjà normalisé (sans casse ni accents). */
  nomNormalise: string;
  /** Tous les numéros connus du client, réduits à leurs chiffres. */
  telephones: readonly string[];
  /** Le châssis de la moto, en majuscules sans séparateur. */
  chassis: string;
};

export function chercherVentes<T extends VenteCherchable>(
  cherchables: readonly T[],
  recherche: string,
  normaliserNom: (brut: string) => string,
): T[] {
  const texte = recherche.trim();
  if (!texte) return [...cherchables];

  const chiffres = texte.replace(/[^0-9]/g, "");
  const nom = normaliserNom(texte);
  const brut = texte.toUpperCase().replace(/[\s-]+/g, "");

  return cherchables.filter((ligne) => {
    if (chiffres.length >= 2 && ligne.telephones.some((numero) => numero.includes(chiffres))) {
      return true;
    }
    if (nom.length > 0 && ligne.nomNormalise.includes(nom)) return true;
    if (brut.length >= 3 && ligne.chassis.includes(brut)) return true;
    /* Le numéro de vente se compare sans ses tirets : on le lit sur un reçu
       froissé, et personne ne les retape à l'identique. */
    return brut.length >= 3 && ligne.vente.numero.replace(/-/g, "").includes(brut);
  });
}

/** De la plus récente à la plus ancienne : au comptoir, on cherche celle de tout à l'heure. */
export function comparerVentes(a: Vente, b: Vente): number {
  return (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0);
}

/** Le résumé du dossier affiché en liste : « 4 à faire », « 2 remis, 2 à faire »… */
export function resumerDossier(documents: readonly DocumentDossier[]): string {
  if (documents.length === 0) return "Dossier non chargé";
  const parStatut = new Map<StatutDocument, number>();
  for (const document of documents) {
    parStatut.set(document.statut, (parStatut.get(document.statut) ?? 0) + 1);
  }
  return STATUTS_DOCUMENT.filter((statut) => parStatut.has(statut))
    .map((statut) => `${parStatut.get(statut)} ${LIBELLE_STATUT_DOCUMENT[statut].toLowerCase()}`)
    .join(" · ");
}

/* ---------------------------------------------------------------------------
   S9 — versements ultérieurs, suivi des dettes et des tranches
   ------------------------------------------------------------------------ */

export type SaisieVersement = {
  montant: string;
  moyenPaiement: MoyenPaiement;
  reference: string;
};

export const SAISIE_VERSEMENT_VIDE: SaisieVersement = {
  montant: "",
  moyenPaiement: "especes",
  reference: "",
};

/**
 * Valide un versement contre ce qui reste réellement dû.
 *
 * `resteDu` est recalculé depuis les versements chargés, jamais lu sur
 * l'agrégat de la vente : c'est la sous-collection qui fait foi (D56).
 */
export function validerVersement(saisie: SaisieVersement, resteDu: number): string | null {
  const montant = lireMontant(saisie.montant);
  if (montant === null) return "Le montant est obligatoire, en chiffres entiers.";
  if (montant <= 0) return "Le montant doit être supérieur à zéro.";
  if (resteDu <= 0) return "Cette vente est déjà soldée : il n’y a plus rien à encaisser.";
  if (montant > resteDu) {
    return `Un versement ne peut pas dépasser le reste dû, soit ${formaterMontant(resteDu)}.`;
  }
  if (saisie.reference.trim().length > LONGUEUR_REFERENCE_MAX) {
    return `La référence dépasse ${LONGUEUR_REFERENCE_MAX} caractères.`;
  }
  return null;
}

/**
 * Le numéro du reçu d'un versement : celui de la vente, suivi de son rang.
 *
 * Ex. `PTG-2608-0042/V2` pour le deuxième encaissement de la vente
 * `PTG-2608-0042`. Le premier versement, écrit dans le lot de la vente (D52),
 * porte le numéro nu — il est le rang 1.
 *
 * Ce n'est pas une seconde série de compteurs, et c'est délibéré (D57) : le
 * compteur de l'appareil s'amorce sur les numéros lus dans `ventesMotos`, donc
 * des numéros consommés ailleurs seraient invisibles à un appareil neuf, qui
 * fabriquerait exactement les doublons que le mécanisme existe pour éviter.
 * Dérivé du numéro de la vente, ce reçu ne consomme rien : `analyserNumero` ne
 * le reconnaît pas, il ne peut donc pas perturber la série.
 */
export function numeroRecuVersement(numeroVente: string, rang: number): string {
  return `${numeroVente}/V${rang}`;
}

/** Le nombre de jours entiers écoulés depuis une date. `null` si la date manque. */
export function joursDepuis(date: Date | null, maintenant: Date): number | null {
  if (!date || Number.isNaN(date.getTime())) return null;
  const jours = Math.floor((maintenant.getTime() - date.getTime()) / 86_400_000);
  return jours >= 0 ? jours : 0;
}

/**
 * Une vente vue sous l'angle de l'argent, avec ses totaux recalculés.
 *
 * `totalPaye` et `resteDu` viennent **des versements**, pas des champs de la
 * vente. Les seconds sont un cache d'affichage que deux appareils hors ligne
 * peuvent se marcher dessus ; les sous-documents, eux, survivent tous (D56).
 */
export type LignePaiement = {
  vente: Vente;
  totalPaye: number;
  resteDu: number;
  statutPaiement: StatutPaiement;
  dernierVersementAt: Date | null;
  /** Jours écoulés depuis la vente — l'ancienneté d'une dette (§6.3). */
  anciennete: number | null;
  /** Jours depuis le dernier versement, ou depuis la vente s'il n'y en a aucun. */
  joursSansVersement: number | null;
};

export function lignePaiement(
  vente: Vente,
  versements: readonly Versement[],
  maintenant: Date,
): LignePaiement {
  const { totalPaye, resteDu, statutPaiement } = agregatsPaiement(vente.prixConvenu, versements);
  const dernier = versements.reduce<Date | null>(
    (plusRecent, versement) =>
      versement.date && (!plusRecent || versement.date > plusRecent) ? versement.date : plusRecent,
    null,
  );
  return {
    vente,
    totalPaye,
    resteDu,
    statutPaiement,
    dernierVersementAt: dernier,
    anciennete: joursDepuis(vente.date, maintenant),
    /* Sans versement, l'inactivité se compte depuis la vente : un client qui
       n'a jamais rien déposé est le plus inactif de tous. */
    joursSansVersement: joursDepuis(dernier ?? vente.date, maintenant),
  };
}

/** Les lignes de paiement du périmètre, versements regroupés par vente. */
export function suivrePaiements(
  ventes: readonly Vente[],
  versements: readonly Versement[],
  maintenant: Date,
): LignePaiement[] {
  const parVente = new Map<string, Versement[]>();
  for (const versement of versements) {
    const liste = parVente.get(versement.venteId);
    if (liste) liste.push(versement);
    else parVente.set(versement.venteId, [versement]);
  }
  return ventes.map((vente) => lignePaiement(vente, parVente.get(vente.id) ?? [], maintenant));
}

/** De la plus ancienne à la plus récente : on relance d'abord celui qui doit depuis le plus longtemps. */
function comparerParAnciennete(a: LignePaiement, b: LignePaiement): number {
  return (a.vente.date?.getTime() ?? 0) - (b.vente.date?.getTime() ?? 0);
}

/**
 * Les dettes : moto partie chez le client, argent encore dû (§6.3).
 *
 * Le mode `comptant` n'y figure jamais — il est soldé par définition — et les
 * `tranches` non plus : là, c'est le magasin qui détient l'argent, pas le
 * client qui le doit. Confondre les deux ferait compter deux fois la même
 * somme, une fois en créance et une fois en engagement.
 */
export function dettes(lignes: readonly LignePaiement[]): LignePaiement[] {
  return lignes
    .filter((ligne) => ligne.vente.modePaiement === "credit" && ligne.resteDu > 0)
    .sort(comparerParAnciennete);
}

/** Les tranches en cours : moto retenue au magasin, argent détenu pour le client (§6.3). */
export function tranchesEnCours(lignes: readonly LignePaiement[]): LignePaiement[] {
  return lignes
    .filter((ligne) => ligne.vente.modePaiement === "tranches" && !ligne.vente.motoRemise)
    .sort(comparerParAnciennete);
}

/**
 * Une tranche sans versement depuis `seuil` jours (§6.3).
 *
 * Signalée, jamais traitée : aucune action automatique ne se déclenche ici. Le
 * cahier des charges est explicite, et il a raison — un client peut avoir prévenu
 * de vive voix, et une application qui annulerait toute seule une vente en
 * tranches détruirait de l'argent réel.
 */
export function estInactive(ligne: LignePaiement, seuil: number): boolean {
  return ligne.joursSansVersement !== null && ligne.joursSansVersement >= seuil;
}

/** Le total dû par les clients — l'en-tête de la liste des dettes. */
export function totalDu(lignes: readonly LignePaiement[]): number {
  return lignes.reduce((somme, ligne) => somme + ligne.resteDu, 0);
}

/** Le total détenu pour le compte des clients — l'en-tête des tranches. */
export function totalDetenu(lignes: readonly LignePaiement[]): number {
  return lignes.reduce((somme, ligne) => somme + ligne.totalPaye, 0);
}

/**
 * La moto d'une vente en tranches peut-elle être remise au client ?
 *
 * Trois conditions, et la troisième est celle qui compte : le reste dû doit
 * être nul. C'est le seul moment où l'argent des tranches cesse d'être un
 * engagement pour devenir une recette (§6.2), et il ne s'atteint pas à moitié.
 */
export function peutRemettreMoto(vente: Vente, resteDu: number): boolean {
  return vente.modePaiement === "tranches" && !vente.motoRemise && resteDu === 0;
}
