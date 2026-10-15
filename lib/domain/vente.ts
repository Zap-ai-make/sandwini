import { formaterMontant } from "./format";
import { dansLaPeriode, type BornesPeriode } from "./periode";

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

/* `MENTION_RECU` était ici : la même conséquence, réécrite pour le client, et
   imprimée en bas du reçu. Le commanditaire l'a retirée du document (D81). Ce
   qu'elle disait n'est pas perdu — la fiche de vente l'affiche au gérant, qui
   est celui qui parle au client. Le texte est dans l'historique si le reçu
   devait le reprendre. */

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

/**
 * Les documents du dossier, dans l'ordre où le magasin les traite (§13).
 *
 * **La plaque n'en fait plus partie (S48).** Elle y figurait comme une
 * quatrième pièce à obtenir, alors que dans ce commerce l'immatriculation *est*
 * la carte grise : la plaque se pose dans la foulée, chez le même prestataire,
 * et la suivre à part créait une ligne qui restait « à faire » sur des dossiers
 * en réalité terminés. Un dossier se ferme donc sur **trois** documents.
 *
 * Les documents `plaque` déjà écrits restent en base — on n'efface pas
 * l'historique — mais plus rien ne les lit, et plus rien n'en crée. Les règles
 * continuent d'accepter leurs mises à jour, faute de quoi un dossier ancien
 * deviendrait impossible à corriger.
 */
export const TYPES_DOCUMENT = ["quittance", "cmc", "carte_grise"] as const;
export type TypeDocument = (typeof TYPES_DOCUMENT)[number];

export const LIBELLE_DOCUMENT: Record<TypeDocument, string> = {
  quittance: "Quittance",
  cmc: "CMC",
  carte_grise: "Carte grise",
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

/**
 * Ce que le client a emporté à l'achat.
 *
 * **La carte grise n'y figure pas**, et c'est une règle du métier, pas un
 * oubli : « la carte grise n'est jamais disponible à l'achat » — elle est
 * encore chez le prestataire le jour de la vente. Lui faire une case serait
 * promettre un geste que personne ne peut faire.
 */
export type PapiersEmportes = { quittance: boolean; cmc: boolean };

export const PAPIERS_EMPORTES_VIDES: PapiersEmportes = { quittance: false, cmc: false };

/**
 * Lit le champ d'une vente, y compris quand il n'existe pas.
 *
 * Aucune vente d'avant S53 ne le porte, et elles sont la majorité : une
 * lecture qui rendrait `undefined` ferait afficher un vide là où l'écran doit
 * dire « à faire » (D82 — une absence n'est pas une inconnue).
 *
 * Une clé inconnue est ignorée plutôt que recopiée : ce lecteur est la
 * frontière du modèle, et ce qui le traverse doit avoir exactement la forme
 * attendue.
 */
export function lireEmporte(brut: unknown): PapiersEmportes {
  if (brut === null || typeof brut !== "object") return PAPIERS_EMPORTES_VIDES;
  const valeurs = brut as Record<string, unknown>;
  return { quittance: valeurs.quittance === true, cmc: valeurs.cmc === true };
}

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
  /**
   * Ce qui part avec la moto (S44). `null` pour une vente d'avant S44, qui
   * portait deux listes de texte libre au lieu de deux cases.
   */
  carteGrise: boolean | null;
  casque: boolean | null;
  /**
   * Ce que le client a emporté à l'achat (S53).
   *
   * **À ne pas confondre avec `carteGrise` ci-dessus**, qui dit si le papier
   * fait partie de ce qu'on a vendu. Celui-ci dit si le client est parti avec,
   * ce qui est une autre question : un papier peut être inclus dans l'achat et
   * rester au magasin parce qu'il n'est pas encore arrivé.
   *
   * Jamais `null` : `lireEmporte` comble les ventes d'avant cette spec.
   */
  emporte: PapiersEmportes;
  /**
   * Le scan de la carte grise, déposé au retour du prestataire.
   *
   * Chemin Storage et non URL, comme les scans de la moto : une URL de
   * téléchargement se redemande à chaque lecture et finit par expirer.
   */
  carteGriseChemin: string | null;
  /**
   * Les deux listes d'avant S44 — **lues, jamais écrites**.
   *
   * On ne les traduit pas en booléens : deviner ce qu'un gérant avait tapé
   * fabriquerait une donnée que personne n'a saisie. Elles restent telles
   * quelles, et l'écran les affiche quand les booléens manquent.
   */
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
  /** Répété sur le document : une requête de groupe de collections ne peut
      filtrer que sur les champs du document lui-même (S8). */
  boutiqueId: string;
  venteId: string;
  type: TypeDocument;
  statut: StatutDocument;
  /* Ce qui suit n'existe qu'à partir du dépôt chez un prestataire (S11). Un
     document créé par S8 est nu : ces champs y valent tous `null`. */
  prestataireId: string | null;
  /** Recopié pour que la liste des dossiers dise qui détient le document sans
      relire la fiche du prestataire à chaque ligne. */
  prestataireNom: string;
  deposeLe: Date | null;
  avance: number | null;
  /** La date annoncée. Facultative : c'est elle qui alimente « en retard ». */
  disponibleLe: Date | null;
  remisLe: Date | null;
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
  /** Ce qui part avec la moto. Coché par défaut : c'est le cas ordinaire. */
  carteGrise: boolean;
  casque: boolean;
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
  carteGrise: true,
  casque: true,
  montantEncaisse: "",
  moyenPaiement: "especes",
  reference: "",
};

/**
 * Applique un changement à la saisie de vente, le montant reçu suivant le mode.
 *
 * **Tant qu'il n'a pas été tapé à la main**, le montant reçu se déduit : au
 * comptant le prix convenu entier — que la règle exige de toute façon —, et
 * rien ailleurs, parce qu'un crédit pré-rempli au prix entier se lirait comme
 * une vente déjà soldée. Dès que le gérant y a mis quelque chose, fût-ce un
 * zéro, le champ lui appartient : c'est le même principe que le prix conseillé,
 * un point de départ et jamais un verrou.
 *
 * *Cette fonction existe parce que la règle vivait dans le composant, accrochée
 * au changement de mode — et ne jouait donc jamais.* Le comptant étant le mode
 * par défaut, le prix arrive toujours après lui, et cliquer « Comptant » quand
 * il est déjà coché n'émet aucun `change` : seul celui qui sortait du comptant
 * puis y revenait voyait le montant se poser. Le défaut a traversé un lot
 * entier sans qu'aucun test unitaire puisse l'atteindre ; il est ici pour que
 * ce ne soit plus vrai.
 */
export function appliquerSaisieVente(
  actuel: SaisieVente,
  partie: Partial<SaisieVente>,
  montantTouche: boolean,
): SaisieVente {
  const suivant = { ...actuel, ...partie };
  if (partie.montantEncaisse !== undefined || montantTouche) return suivant;
  return {
    ...suivant,
    montantEncaisse: suivant.modePaiement === "comptant" ? suivant.prixConvenu : "",
  };
}

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

  /* Les inclusions ne se valident plus : deux cases à cocher n'ont pas de
     forme fautive. C'est tout ce que S44 a retiré d'ici. */
  return null;
}

/** Les deux inclusions, dans l'ordre où elles se lisent sur un reçu. */
export const LIBELLE_INCLUSION = { carteGrise: "Carte grise", casque: "Casque" } as const;

/**
 * Ce qui part avec la moto, prêt à afficher — ou `null` pour une vente d'avant S44.
 *
 * `null` n'est pas « rien n'est inclus » : c'est « cette vente-là ne le disait
 * pas ainsi ». L'appelant retombe alors sur ses deux listes de texte, qui sont
 * ce que le gérant avait réellement écrit. Traduire les unes dans les autres
 * fabriquerait une donnée que personne n'a saisie — et un reçu réimprimé ne
 * dirait plus ce que le client a lu le jour de la vente (D61).
 */
export function inclusionsDeVente(
  vente: Pick<Vente, "carteGrise" | "casque">,
): { libelle: string; inclus: boolean }[] | null {
  if (vente.carteGrise === null || vente.casque === null) return null;
  return [
    { libelle: LIBELLE_INCLUSION.carteGrise, inclus: vente.carteGrise },
    { libelle: LIBELLE_INCLUSION.casque, inclus: vente.casque },
  ];
}

/**
 * Ce que le client a emporté, nommé une fois pour tous les écrans (S53).
 *
 * **Le reçu et la fiche de vente lisent cette fonction, et rien d'autre.** La
 * spec l'exige — « le reçu dit la même chose que la fiche » — et une seule
 * lecture est la seule façon de le garantir : deux parcours de `vente.emporte`
 * écrits à deux endroits finiraient par nommer les papiers différemment, et un
 * reçu qui contredit l'écran est un reçu qu'on ne peut pas opposer à un client.
 *
 * Dans l'ordre du cahier, celui de `TYPES_DOCUMENT` : la quittance accompagne
 * la moto, le CMC s'obtient avec elle. La carte grise n'en est jamais — elle
 * n'est pas disponible à l'achat.
 */
export function papiersEmportesDeVente(vente: Pick<Vente, "emporte">): string[] {
  const noms: string[] = [];
  if (vente.emporte.quittance) noms.push(LIBELLE_DOCUMENT.quittance);
  if (vente.emporte.cmc) noms.push(LIBELLE_DOCUMENT.cmc);
  return noms;
}

export type BilanVentes = {
  ventes: number;
  chiffreAffaires: number;
  encaisse: number;
  resteAPercevoir: number;
};

/**
 * Les quatre chiffres de tête du registre des ventes (S44).
 *
 * **Lus, jamais stockés** (D61) : ils se somment des documents que l'écran
 * écoute déjà, donc ils ne peuvent pas diverger de ce dont ils sont tirés, et
 * l'écran continue de les afficher réseau coupé. Un agrégat entretenu par
 * déclencheur coûterait moins à lire et mentirait en silence le jour où le
 * déclencheur échoue.
 *
 * **Aucune marge ici, et c'est une frontière, pas un oubli.** Les trois
 * montants se lisent sur le document de vente, que le gérant a le droit de
 * lire. Le coût et la marge vivent dans `prive/marge`, hors de sa portée (D2) —
 * une carte de plus les ferait entrer par la fenêtre.
 */
export function bilanVentes(
  ventes: readonly Pick<Vente, "prixConvenu" | "totalPaye" | "resteDu">[],
): BilanVentes {
  return ventes.reduce<BilanVentes>(
    (bilan, vente) => ({
      ventes: bilan.ventes + 1,
      chiffreAffaires: bilan.chiffreAffaires + vente.prixConvenu,
      encaisse: bilan.encaisse + vente.totalPaye,
      resteAPercevoir: bilan.resteAPercevoir + vente.resteDu,
    }),
    { ventes: 0, chiffreAffaires: 0, encaisse: 0, resteAPercevoir: 0 },
  );
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

/** Le résumé du dossier affiché en liste : « 3 à faire », « 2 remis · 1 à faire »… */
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
  /**
   * Les versements de cette vente, tels qu'ils ont servi aux totaux.
   *
   * Portés par la ligne plutôt que relus à côté : c'est ce qui permet de la
   * borner dans le temps sans redonner la collection entière à qui filtre
   * (S46). `dernierVersementAt` ne suffisait pas — un mois se juge sur tous
   * les versements qu'il contient, pas sur le plus récent de la vente.
   */
  versements: readonly Versement[];
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
    versements,
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

/**
 * Les lignes qui ont reçu de l'argent pendant la période (S46).
 *
 * **La règle est celle du versement, pas celle de la vente.** « Les paiements
 * de septembre », ce sont les ventes sur lesquelles quelqu'un a versé quelque
 * chose en septembre — qu'elles aient été conclues en septembre ou en mars.
 * L'acompte encaissé au comptoir étant lui-même un versement daté du jour de la
 * vente (`enregistrerVente`), une vente de septembre entre d'elle-même dans
 * septembre : il n'y a pas deux règles à tenir, il y en a une.
 *
 * **Ce qui sort du filtre, et c'est assumé** : un crédit conclu sans le moindre
 * acompte ne porte aucun versement, donc aucune période ne le montre — sauf
 * « Tout », qui ne borne rien. C'est la lecture littérale d'un écran de
 * paiements : personne n'a payé, il n'y a pas de paiement à dater. La dette,
 * elle, reste entière dans le total de « Tout ».
 *
 * Les montants affichés ne sont pas recoupés par la période : un reste dû est
 * un état, pas un flux. On choisit **quelles lignes** paraissent, jamais ce
 * qu'elles valent.
 */
export function paiementsDeLaPeriode(
  lignes: readonly LignePaiement[],
  bornes: BornesPeriode,
): LignePaiement[] {
  if (bornes === null) return [...lignes];
  return lignes.filter((ligne) =>
    ligne.versements.some((versement) => dansLaPeriode(versement.date, bornes)),
  );
}

/**
 * Tout ce que l'écran des paiements suit, en une liste (S48).
 *
 * L'union des dettes et des tranches en cours, de la plus ancienne à la plus
 * récente : on relance d'abord celui qui attend depuis le plus longtemps. Ce
 * qui n'y figure pas n'y figurait pas non plus avant — un comptant est soldé
 * par définition, un crédit payé n'attend rien, une moto remise a fini son
 * parcours.
 *
 * **Les deux notions restent nommées sur chaque ligne, et c'est la condition
 * pour qu'elles puissent partager un tableau.** Une *dette* est de l'argent qui
 * manque au magasin ; une *tranche* est de l'argent que le magasin détient. Les
 * additionner donnerait un chiffre qui ne veut rien dire — c'est la confusion
 * métier la plus coûteuse du projet (`AGENTS.md`, `prompt.md` §13). D'où la
 * colonne « Mode » sur l'écran, et **deux totaux distincts** en tête, jamais
 * une somme.
 */
export function paiementsASuivre(lignes: readonly LignePaiement[]): LignePaiement[] {
  return [...dettes(lignes), ...tranchesEnCours(lignes)].sort(comparerParAnciennete);
}

/**
 * Tout le paiement échelonné, soldé compris — ce que l'écran des paiements
 * montre désormais.
 *
 * `paiementsASuivre` ne retient que ce qui attend encore : une dette ouverte,
 * une tranche dont la moto n'est pas partie. C'était le bon périmètre pour une
 * file de relance, et c'est pourquoi « Soldées » n'était pas proposé en
 * pastille — elle n'aurait jamais rien rendu. Cet écran répond maintenant à une
 * question plus large, « où en est chaque vente à paiement échelonné », donc il
 * garde les ventes terminées plutôt que de les faire disparaître le jour où
 * elles se soldent.
 *
 * **Le comptant reste dehors**, et ce n'est pas un oubli : il est soldé à
 * l'instant de la saisie, il n'a jamais rien attendu, et l'inscrire ici
 * noierait ce qu'on vient y chercher sous toutes les ventes du magasin.
 *
 * **Ce que l'élargissement n'a pas le droit de fausser.** Les deux totaux de
 * l'en-tête ne portent que sur l'engagement en cours : `totalDu(dettes(...))`
 * et `totalDetenu(tranchesEnCours(...))`. Une tranche soldée dont la moto est
 * partie n'est plus de l'argent détenu — la compter ferait croire que le
 * magasin tient une somme qu'il a déjà rendue en moto. Les deux fonctions
 * écartent ces cas d'elles-mêmes ; c'est la raison pour laquelle on les garde
 * plutôt que de sommer la liste affichée.
 */
export function paiementsEchelonnes(lignes: readonly LignePaiement[]): LignePaiement[] {
  return lignes
    .filter((ligne) => ligne.vente.modePaiement !== "comptant")
    .sort(comparerParAnciennete);
}

export const FILTRES_PAIEMENT = ["tout", "credit", "partiel", "solde"] as const;
export type FiltrePaiement = (typeof FILTRES_PAIEMENT)[number];

export const LIBELLE_FILTRE_PAIEMENT: Record<FiltrePaiement, string> = {
  tout: "Tout",
  credit: "Crédit",
  partiel: "Partiellement payées",
  solde: "Soldées",
};

/**
 * Le filtre d'une seule rangée, sur deux axes qui ne se recouvrent pas.
 *
 * « Crédit » dit **où est la moto** ; « Partiellement payées » et « Soldées »
 * disent **où en est l'argent**. On aurait pu en faire deux rangées
 * combinables ; une seule suffit, parce que la question qu'on pose à cet écran
 * est toujours l'une *ou* l'autre, et deux rangées de pastilles au-dessus d'un
 * tableau se lisent comme un formulaire à remplir avant de voir quoi que ce
 * soit.
 *
 * **Deux pastilles ont été retirées, chacune pour la même raison : la ligne le
 * disait déjà.** « Tranches » doublait la colonne « Mode », « Impayées »
 * doublait la colonne « État ». Un filtre qui ne fait que répéter une colonne
 * visible n'est pas un tri, c'est du bruit au-dessus du tableau. Une vente
 * impayée reste donc atteignable — sous « Tout » et sous « Crédit » —, elle n'a
 * simplement plus de pastille à elle.
 *
 * **Ce que le retrait de « Tranches » n'a pas le droit de coûter.** Une *dette*
 * est de l'argent qui manque au magasin, une *tranche* de l'argent qu'il
 * détient pour le client ; les additionner donnerait un chiffre qui ne veut
 * rien dire (`AGENTS.md` §13). La distinction ne vivait pas dans cette
 * pastille : elle vit dans la colonne « Mode » de chaque ligne et dans les
 * **deux totaux distincts** de l'en-tête, qui ne sont jamais sommés. C'est à
 * cette condition que la pastille pouvait partir.
 *
 * « Soldées » rend enfin quelque chose depuis que la liste porte tout le
 * paiement échelonné (`paiementsEchelonnes`) et non plus les seules ventes en
 * attente.
 */
export function filtrerPaiements(
  lignes: readonly LignePaiement[],
  filtre: FiltrePaiement,
): LignePaiement[] {
  switch (filtre) {
    case "tout":
      return [...lignes];
    case "credit":
      return lignes.filter((ligne) => ligne.vente.modePaiement === "credit");
    case "partiel":
    case "solde":
      return lignes.filter((ligne) => ligne.statutPaiement === filtre);
  }
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

/**
 * Les achats d'un client, du plus récent au plus ancien.
 *
 * **Ce que la liste reçue contient décide de ce que la fiche montre, et c'est
 * voulu.** L'écran n'interroge pas « les ventes du client X » : il écoute les
 * ventes de son périmètre — celles que les règles laissent déjà lire, sa
 * boutique pour un gérant, toutes pour le responsable — et trie en mémoire.
 * Aucune règle Firestore n'est donc ouverte pour afficher une fiche, et aucun
 * index composite n'est ajouté. C'est exactement le montage de
 * `lotsDuFournisseur` (S50), et pour la même raison : l'écran doit répondre
 * coupure faite (D66).
 *
 * La conséquence est à dire à l'écran, pas à cacher : un gérant voit les achats
 * faits *dans sa boutique*, et la fiche l'écrit. Ouvrir les règles pour qu'il
 * voie les autres serait élargir une lecture d'argent pour un confort
 * d'affichage.
 *
 * Du plus récent d'abord : on ouvre une fiche pour « qu'est-ce qu'il a pris
 * cette fois-ci », rarement pour remonter à son premier achat.
 */
export function ventesDuClient(ventes: readonly Vente[], clientId: string): Vente[] {
  if (!clientId) return [];
  return ventes
    .filter((vente) => vente.clientId === clientId)
    .sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0));
}
