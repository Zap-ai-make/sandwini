import { jourLocal } from "./format";
import { dansLaPeriode, type BornesPeriode } from "./periode";
import type { MoyenPaiement } from "./vente";

/**
 * La caisse — le journal d'une journée et sa clôture (S22, `prompt.md` §5.9).
 *
 * **Rien n'est écrit ici que la caisse ait inventé.** Les mouvements existent
 * depuis S8 : chaque vente, chaque versement et chaque avance à un prestataire
 * pose son document dans `encaissements`. S22 les lit, les totalise, et ajoute
 * deux choses que personne n'écrivait — le fonds d'ouverture et le comptage du
 * soir.
 *
 * **Le tiroir et le téléphone ne se mélangent pas.** Les espèces sont dans le
 * tiroir et se comptent à la main ; l'Orange Money est chez l'opérateur et se
 * rapproche d'un relevé. « Espèces attendues en caisse » ne compte donc que les
 * espèces (`c2:151-166`). Les additionner produirait un nombre que personne ne
 * peut vérifier.
 *
 * Ce module ne contient que du calcul : ni Firestore, ni React, ni horloge. Le
 * jour lui est toujours donné, jamais lu — c'est ce qui rend ces fonctions
 * testables sans attendre minuit.
 */

/* --------------------------------------------------------------------------
   Un mouvement
   -------------------------------------------------------------------------- */

export const SENS_MOUVEMENT = ["entree", "sortie"] as const;
export type SensMouvement = (typeof SENS_MOUVEMENT)[number];

export const ORIGINES_MOUVEMENT = [
  "vente_moto",
  "versement",
  "vente_piece",
  "depense",
  "avance_prestataire",
  "autre",
] as const;
export type OrigineMouvement = (typeof ORIGINES_MOUVEMENT)[number];

/**
 * Ce que la colonne « Nature » affiche (`c2:97-140`).
 *
 * Des mots du comptoir, pas des identifiants : le gérant lit « Versement », pas
 * `versement`. `vente_piece` n'est écrit par personne avant S20 — l'entrée
 * existe parce que le modèle la prévoit, et le journal l'affichera sans qu'on y
 * revienne.
 */
export const LIBELLE_ORIGINE: Record<OrigineMouvement, string> = {
  vente_moto: "Vente",
  versement: "Versement",
  vente_piece: "Pièces",
  depense: "Sortie",
  avance_prestataire: "Avance prestataire",
  autre: "Autre",
};

export type Mouvement = {
  id: string;
  boutiqueId: string;
  date: Date | null;
  sens: SensMouvement;
  /** Toujours positif : c'est `sens` qui porte le signe, jamais le montant. */
  montant: number;
  moyenPaiement: MoyenPaiement;
  origine: OrigineMouvement;
  /** La vente, le versement ou la pièce d'où il vient. Vide pour une dépense. */
  origineRefId: string;
  libelle: string;
  /** Vrai si l'argent correspond à un engagement de tranches (§6.2). */
  categorieTranches: boolean;
  /**
   * Le poste de dépense d'une sortie, vide partout ailleurs (S55).
   *
   * Il désigne une entrée du référentiel `postesDepense`, que chaque maison
   * déclare elle-même — le commanditaire a été net : « on ne sait pas comment
   * ils gèrent leurs flux monétaires ». Vide sur toutes les sorties d'avant
   * S55, et sur les entrées, qui n'ont pas de poste par nature.
   */
  posteId: string;
  /** Qui l'a saisi, tel qu'on le lit dans le journal. */
  operateur: string;
};

/** Le montant signé : une sortie retire de la caisse. */
export function montantSigne(mouvement: Mouvement): number {
  return mouvement.sens === "sortie" ? -mouvement.montant : mouvement.montant;
}

/**
 * Les mouvements d'une journée, du plus ancien au plus récent.
 *
 * L'ordre est celui du comptoir : on relit sa journée dans le sens où elle
 * s'est passée, et non par montant décroissant. Un mouvement sans date est
 * écarté — il n'appartient à aucune journée, et le compter dans celle qu'on
 * regarde fausserait la clôture.
 */
export function mouvementsDuJour(
  mouvements: readonly Mouvement[],
  jour: string,
): Mouvement[] {
  return mouvements
    .filter((mouvement) => mouvement.date !== null && jourLocal(mouvement.date) === jour)
    .sort((a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0));
}

/**
 * Les mouvements d'un intervalle — la lecture comptable (S55).
 *
 * **Une caisse se tient au jour, une comptabilité se lit au mois.** Le journal
 * répond à « qu'est-ce qui s'est passé aujourd'hui » et garde son sélecteur de
 * journée ; celle-ci répond à « combien ce mois-ci », qui est la seule échelle
 * à laquelle « combien de carburant » veut dire quelque chose.
 *
 * `null` ne borne rien et laisse tout passer, comme ailleurs dans
 * `lib/domain/periode.ts` : c'est l'état « toutes périodes », pas une absence
 * de réponse.
 *
 * **Le test d'appartenance est `dansLaPeriode`, et non une comparaison écrite
 * ici.** La borne de fin rendue par `bornesPeriode` est **exclusive** — « ce
 * mois-ci » finit au premier jour du mois suivant, à minuit. Une comparaison
 * `<= fin` recopiée de mémoire ferait donc entrer le 1er du mois d'après dans
 * le total du mois courant. C'est le genre d'écart qu'un œil ne voit pas sur
 * un écran et qu'un comptable trouve trois mois plus tard.
 *
 * Elle laisse aussi passer les mouvements **sans date**, et c'est voulu : une
 * sortie saisie hors ligne n'a pas encore l'horodatage du serveur, et la
 * cacher du total au moment précis où l'on vérifie qu'elle est passée serait
 * le contraire de ce que promet D66.
 */
export function mouvementsDeLaPeriode(
  mouvements: readonly Mouvement[],
  bornes: BornesPeriode,
): Mouvement[] {
  return (
    mouvements
      .filter((mouvement) => dansLaPeriode(mouvement.date, bornes))
      /* Une écriture sans date est la plus récente de toutes : elle n'a pas
         encore atteint le serveur. `Infinity` la range en fin de liste, là où
         le journal la montre — et non en tête, où un `?? 0` l'aurait mise. */
      .sort((a, b) => (a.date?.getTime() ?? Infinity) - (b.date?.getTime() ?? Infinity))
  );
}

/* --------------------------------------------------------------------------
   Le bilan de toutes les boutiques
   -------------------------------------------------------------------------- */

/** Une boutique du bilan, telle que l'écran la nomme. */
export type LigneBilan = {
  boutiqueId: string;
  code: string;
  nom: string;
  entrees: number;
  sorties: number;
  /** `entrees - sorties`, tous moyens confondus : ce que la boutique a gagné ce jour. */
  solde: number;
  /**
   * Le net du **tiroir** : entrées en espèces moins sorties en espèces.
   *
   * `solde` et `especes` ne disent pas la même chose, et c'est tout l'intérêt.
   * Le premier est ce que la boutique a gagné ; le second est le seul des deux
   * qu'on puisse aller compter dans un meuble. Les confondre faisait annoncer
   * au superviseur un solde dont un tiers vivait sur Orange Money.
   */
  especes: number;
};

/**
 * Ce que chaque tiroir a fait ce jour-là, une ligne par boutique.
 *
 * **La réserve que cet écran portait reste tenue.** Il refusait le périmètre
 * « Toutes les boutiques » parce qu'« un tiroir se compte là où il est », et
 * c'était juste : on ne compte pas trois tiroirs ensemble, on ne va pas
 * vérifier un solde consolidé dans un meuble. Ce bilan ne fond donc rien — il
 * **range** : une ligne par boutique, et le total n'est que la somme de lignes
 * qui restent lisibles à côté de lui.
 *
 * **Il reçoit des mouvements déjà bornés** — par journée ou par période (S55).
 * Il découpait lui-même le temps, et le même agrégat ne savait donc répondre
 * qu'à « aujourd'hui ». Séparer la tranche de temps du calcul fait servir le
 * même code aux deux lectures sans qu'aucune des deux ne se dédouble.
 *
 * **Une boutique sans mouvement n'y figure pas.** Trois zéros alignés se
 * liraient comme une journée vide alors que personne n'a seulement ouvert le
 * tiroir — c'est la faute que D63 relève sur les compteurs à zéro, transposée
 * à une ligne de tableau.
 *
 * **Une boutique inconnue du référentiel garde son argent.** Si un mouvement
 * porte un `boutiqueId` qu'aucune boutique ne réclame — supprimée, ou pas
 * encore lue —, sa ligne paraît quand même, sous son identifiant brut. La
 * faire disparaître retirerait de l'argent réel d'un total, en silence, et
 * c'est le seul défaut qu'un bilan n'a pas le droit d'avoir.
 */
export function bilanParBoutique(
  mouvements: readonly Mouvement[],
  boutiques: readonly { id: string; code: string; nom: string }[],
): LigneBilan[] {
  const lignes = new Map<string, LigneBilan>();

  for (const mouvement of mouvements) {
    const connue = boutiques.find((boutique) => boutique.id === mouvement.boutiqueId);
    const ligne = lignes.get(mouvement.boutiqueId) ?? {
      boutiqueId: mouvement.boutiqueId,
      code: connue?.code ?? mouvement.boutiqueId,
      nom: connue?.nom ?? "Boutique inconnue",
      entrees: 0,
      sorties: 0,
      solde: 0,
      especes: 0,
    };

    if (mouvement.sens === "sortie") ligne.sorties += mouvement.montant;
    else ligne.entrees += mouvement.montant;
    ligne.solde = ligne.entrees - ligne.sorties;
    /* La condition porte sur le moyen, pas sur le sens : une sortie est
       toujours en espèces aujourd'hui, mais l'écrire ainsi garderait la ligne
       juste le jour où un remboursement partirait par mobile. */
    if (mouvement.moyenPaiement === "especes") {
      ligne.especes += mouvement.sens === "sortie" ? -mouvement.montant : mouvement.montant;
    }

    lignes.set(mouvement.boutiqueId, ligne);
  }

  return [...lignes.values()];
}

/** La somme des lignes du bilan — rien de plus, et surtout rien d'autre. */
export function totalDuBilan(lignes: readonly LigneBilan[]): {
  entrees: number;
  sorties: number;
  solde: number;
  especes: number;
} {
  return lignes.reduce(
    (total, ligne) => ({
      entrees: total.entrees + ligne.entrees,
      sorties: total.sorties + ligne.sorties,
      solde: total.solde + ligne.solde,
      especes: total.especes + ligne.especes,
    }),
    { entrees: 0, sorties: 0, solde: 0, especes: 0 },
  );
}

/** Ce qu'un poste de dépense a coûté sur la période regardée. */
export type DepenseParPoste = { posteId: string; libelle: string; montant: number };

/**
 * Le nom sous lequel ranger une sortie, par ordre de précision décroissante.
 *
 * **Trois cas, et aucun ne jette d'argent.** Un poste déclaré donne son nom.
 * Sans poste, une sortie qui porte déjà sa nature — l'avance prestataire d'un
 * dossier — est rangée sous cette nature : elle est structurelle, et la forcer
 * dans un référentiel que la maison déclare serait lui inventer un sens.
 * Restent les sorties libres d'avant S55, sans rien : « Sans poste » les
 * nomme. Les écarter retirerait de l'argent réel d'un total, en silence — le
 * seul défaut qu'un livre de caisse n'a pas le droit d'avoir.
 */
/**
 * Exporté pour que le tableau de l'historique et le bloc « Où l'argent est
 * parti » nomment un même mouvement de la même façon.
 *
 * Ils divergeaient : le tableau affichait « Sans poste » pour une avance
 * prestataire, que le bloc juste au-dessus appelait « Avance prestataire ». Le
 * lecteur avait deux noms pour une ligne, sur un même écran, à trois
 * centimètres d'écart.
 */
export function libelleDuPoste(
  posteId: string,
  origine: OrigineMouvement,
  nomDuPoste: (id: string) => string,
): string {
  if (posteId) return nomDuPoste(posteId);
  if (origine !== "depense") return LIBELLE_ORIGINE[origine];
  return "Sans poste";
}

/**
 * Où l'argent est parti, poste par poste — le livre de caisse analytique (S55).
 *
 * **C'est le pas qui sépare un journal d'une comptabilité.** Un journal dit
 * « sortie 15 000, carburant » ligne à ligne ; une comptabilité répond à
 * « combien de carburant ce mois-ci ». Un livre de caisse tenu correctement a
 * une colonne par poste, et c'est ce que cette fonction fabrique.
 *
 * **Elle reçoit des mouvements déjà bornés**, par journée ou par période : le
 * découpage du temps appartient à l'appelant, et le même calcul sert aux deux
 * écrans sans se dédoubler.
 *
 * Le plus lourd en tête — on regarde ce bloc pour savoir ce qui coûte, et la
 * réponse doit être la première ligne.
 */
export function depensesParPoste(
  mouvements: readonly Mouvement[],
  nomDuPoste: (id: string) => string,
): DepenseParPoste[] {
  const parPoste = new Map<string, number>();
  for (const mouvement of mouvements) {
    if (mouvement.sens !== "sortie") continue;
    /* La clé porte les deux, parce que le repli sur l'origine en dépend : deux
       sorties sans poste mais d'origines différentes ne se confondent pas. */
    const cle = `${mouvement.posteId || ""}\u0000${mouvement.origine}`;
    parPoste.set(cle, (parPoste.get(cle) ?? 0) + mouvement.montant);
  }

  return [...parPoste.entries()]
    .map(([cle, montant]) => {
      const [posteId, origine] = cle.split("\u0000") as [string, OrigineMouvement];
      return { posteId, libelle: libelleDuPoste(posteId, origine, nomDuPoste), montant };
    })
    .sort((a, b) => b.montant - a.montant || a.libelle.localeCompare(b.libelle, "fr"));
}

/* --------------------------------------------------------------------------
   Le résumé d'une journée
   -------------------------------------------------------------------------- */

/** Un moyen de paiement qui n'est pas dans le tiroir, et son net du jour. */
export type PartMoyen = { moyen: MoyenPaiement; montant: number };

export type ResumeJournee = {
  fondsOuverture: number;
  /** Entrées en espèces, positif. */
  especesEncaissees: number;
  /** Sorties en espèces, positif — l'écran l'affiche précédé d'un moins. */
  sortiesEspeces: number;
  /** Ce qui doit se trouver dans le tiroir : fonds + entrées − sorties. */
  especesAttendues: number;
  /** Les autres moyens, nets, et seulement ceux qui ont bougé. */
  parMoyenMobile: PartMoyen[];
  nombreMouvements: number;
};

/** L'ordre d'affichage des moyens mobiles : celui de `MOYENS_PAIEMENT`, sans les espèces. */
const MOYENS_MOBILES: readonly MoyenPaiement[] = ["orange_money", "moov_money", "wave"];

/**
 * Ce que la colonne de droite affiche (`c2:151-166`).
 *
 * Les moyens mobiles qui n'ont pas bougé ne sont pas listés à zéro : une ligne
 * « Wave 0 » dans une boutique qui n'accepte pas Wave est du bruit, et D63 vaut
 * ici comme ailleurs — aucune carte à zéro.
 */
export function resumerJournee(
  fondsOuverture: number,
  mouvements: readonly Mouvement[],
): ResumeJournee {
  const especes = mouvements.filter((mouvement) => mouvement.moyenPaiement === "especes");
  const especesEncaissees = especes
    .filter((mouvement) => mouvement.sens === "entree")
    .reduce((somme, mouvement) => somme + mouvement.montant, 0);
  const sortiesEspeces = especes
    .filter((mouvement) => mouvement.sens === "sortie")
    .reduce((somme, mouvement) => somme + mouvement.montant, 0);

  const parMoyenMobile = MOYENS_MOBILES.map((moyen) => ({
    moyen,
    montant: mouvements
      .filter((mouvement) => mouvement.moyenPaiement === moyen)
      .reduce((somme, mouvement) => somme + montantSigne(mouvement), 0),
  })).filter((part) => part.montant !== 0);

  return {
    fondsOuverture,
    especesEncaissees,
    sortiesEspeces,
    especesAttendues: fondsOuverture + especesEncaissees - sortiesEspeces,
    parMoyenMobile,
    nombreMouvements: mouvements.length,
  };
}

/* --------------------------------------------------------------------------
   La clôture
   -------------------------------------------------------------------------- */

export const CLOTURE_PAR = ["gerant", "automatique"] as const;
export type ClotureQui = (typeof CLOTURE_PAR)[number];

export type Cloture = {
  /** `${boutiqueId}_${jour}` — cf. `identifiantCloture`. */
  id: string;
  boutiqueId: string;
  /** `AAAA-MM-JJ`, jour local de l'appareil. */
  jour: string;
  fondsOuverture: number;
  especesAttendues: number;
  /**
   * Ce que quelqu'un a compté. `null` quand la journée s'est fermée seule.
   *
   * **C'est le cœur de la réponse 4 du commanditaire.** Il a tranché qu'une
   * journée oubliée se ferme d'elle-même, pour que rien ne bloque le comptoir
   * le lendemain matin. Une journée fermée ainsi n'a pas un écart de zéro :
   * elle n'a pas d'écart du tout.
   */
  especesComptees: number | null;
  /** `comptées − attendues`, ou `null` si rien n'a été compté. */
  ecart: number | null;
  /** Obligatoire au-delà du seuil (réponse 5). Vide sinon. */
  motif: string;
  cloturePar: ClotureQui;
  clotureLe: Date | null;
  clotureParNom: string;
};

/**
 * L'identifiant d'une clôture : la boutique et le jour, collés.
 *
 * Composé, comme `boutiques/{code}` (D30) : deux clôtures du même jour dans la
 * même boutique sont **structurellement impossibles**, sans qu'aucune règle ait
 * à le vérifier. C'est aussi ce qui fait entrer en collision deux appareils qui
 * clôtureraient la même journée hors ligne — comportement voulu.
 */
export function identifiantCloture(boutiqueId: string, jour: string): string {
  return `${boutiqueId}_${jour}`;
}

/**
 * Au-delà de combien d'écart il faut écrire une phrase (réponse 5).
 *
 * Mille francs : en dessous, on n'ennuie personne pour un billet mal compté ;
 * au-delà, un écart qu'on peut valider sans rien dire cesse d'être une
 * information au bout de trois semaines. Réglable comme le seuil d'inactivité
 * des tranches.
 */
export const SEUIL_MOTIF_DEFAUT = 1000;

/** Un écart au-delà du seuil, dans un sens comme dans l'autre, demande un motif. */
export function motifRequis(ecart: number | null, seuil = SEUIL_MOTIF_DEFAUT): boolean {
  return ecart !== null && Math.abs(ecart) > seuil;
}

export type SaisieCloture = {
  /** Ce que le gérant a compté dans le tiroir, en toutes lettres de chiffres. */
  especesComptees: string;
  motif: string;
};

export const SAISIE_CLOTURE_VIDE: SaisieCloture = { especesComptees: "", motif: "" };

export const LONGUEUR_MOTIF_MAX = 300;

/**
 * Ce qui empêche de clôturer, dit en une phrase — ou `null` si rien.
 *
 * Le comptage est **obligatoire** quand c'est un humain qui clôture : une
 * clôture sans comptage est une clôture automatique, et elle ne passe pas par
 * ce chemin. C'est la seule chose qui distingue les deux, et c'est ce qui
 * empêche la réponse 4 de contaminer le geste volontaire.
 */
export function validerCloture(
  saisie: SaisieCloture,
  attendues: number,
  seuil = SEUIL_MOTIF_DEFAUT,
): string | null {
  const comptees = lireMontantCaisse(saisie.especesComptees);
  if (comptees === null) {
    return "Comptez les espèces du tiroir avant de clôturer : le montant est obligatoire.";
  }
  if (comptees < 0) {
    return "Un comptage ne peut pas être négatif.";
  }

  const motif = saisie.motif.trim();
  if (motifRequis(comptees - attendues, seuil) && motif.length === 0) {
    return `L’écart dépasse ${seuil} FCFA : dites en une phrase d’où il vient.`;
  }
  if (motif.length > LONGUEUR_MOTIF_MAX) {
    return `Le motif dépasse ${LONGUEUR_MOTIF_MAX} caractères.`;
  }
  return null;
}

/**
 * Un montant saisi au comptoir : espaces et séparateurs tolérés, décimales non.
 *
 * Le FCFA ne se divise pas (`prompt.md` §0). On accepte « 742 000 » et
 * « 742000 », on refuse « 742,50 » — et on refuse le vide, qui doit rester
 * distinguable de zéro : un tiroir compté à zéro est une information, un tiroir
 * non compté n'en est pas une.
 */
export function lireMontantCaisse(brut: string): number | null {
  const nettoye = brut.replace(/[\s  ]/g, "");
  if (nettoye === "") return null;
  if (!/^-?\d+$/.test(nettoye)) return null;
  return Number(nettoye);
}

/* --------------------------------------------------------------------------
   La chaîne des journées
   -------------------------------------------------------------------------- */

/**
 * D'où vient le fonds d'ouverture d'une journée, et sur quoi il repose.
 *
 * `source` n'est pas décoratif : le commanditaire a choisi le report de la
 * veille (réponse 1) **et** la fermeture automatique (réponse 4), et ces deux
 * réponses ensemble produisent un cas que ni l'une ni l'autre ne montrait — un
 * fonds reporté d'une journée que personne n'a comptée. La chaîne continue de
 * se tenir, mais elle porte un maillon non vérifié, et l'écran doit pouvoir le
 * dire.
 */
export type FondsOuverture = {
  montant: number;
  /** `comptee` : quelqu'un a compté hier. `attendue` : la veille s'est fermée seule. `premiere` : rien avant. */
  source: "comptee" | "attendue" | "premiere";
};

export function fondsOuverturePour(
  jour: string,
  clotures: readonly Cloture[],
): FondsOuverture {
  const precedentes = clotures
    .filter((cloture) => cloture.jour < jour)
    .sort((a, b) => (a.jour < b.jour ? 1 : -1));
  const veille = precedentes[0];

  if (!veille) return { montant: 0, source: "premiere" };
  if (veille.especesComptees !== null) {
    return { montant: veille.especesComptees, source: "comptee" };
  }
  return { montant: veille.especesAttendues, source: "attendue" };
}

/**
 * Les journées passées qui ont vécu et que personne n'a fermées.
 *
 * C'est la liste que la réponse 4 fait fermer toute seule à l'ouverture de
 * l'écran. Deux bornes, et chacune compte :
 *
 * - **antérieures au jour courant** — la journée d'aujourd'hui n'est pas
 *   oubliée, elle est en cours ;
 * - **qui portent des mouvements** — une boutique fermée le dimanche n'a pas de
 *   journée à clôturer, et lui en fabriquer une remplirait l'historique de
 *   clôtures à zéro qui ne disent rien.
 *
 * Rendues du plus ancien au plus récent : elles se ferment dans l'ordre, chacune
 * donnant son fonds d'ouverture à la suivante.
 */
export function journeesAFermer(
  mouvements: readonly Mouvement[],
  clotures: readonly Cloture[],
  aujourdhui: string,
): string[] {
  const fermees = new Set(clotures.map((cloture) => cloture.jour));
  const vecues = new Set<string>();
  for (const mouvement of mouvements) {
    if (mouvement.date === null) continue;
    const jour = jourLocal(mouvement.date);
    if (jour < aujourdhui && !fermees.has(jour)) vecues.add(jour);
  }
  return [...vecues].sort();
}

/**
 * Les journées déjà closes, de la plus récente à la plus ancienne.
 *
 * L'ordre de l'historique : on cherche avant-hier plus souvent que le mois
 * dernier.
 */
export function historiqueDesClotures(clotures: readonly Cloture[]): Cloture[] {
  return [...clotures].sort((a, b) => (a.jour < b.jour ? 1 : -1));
}

/** Une journée déjà close ne se reclôture pas : la trouver, c'est refuser le geste. */
export function clotureDuJour(clotures: readonly Cloture[], jour: string): Cloture | null {
  return clotures.find((cloture) => cloture.jour === jour) ?? null;
}
