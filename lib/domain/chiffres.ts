import { LOCALE } from "./format";
import { LIBELLE_MODE, type ModePaiement, type Vente, type Versement } from "./vente";

/**
 * Les chiffres d'un mois, calculés à la lecture (S24).
 *
 * **Rien n'est entretenu par un déclencheur, et c'est la même raison qu'au
 * reçu** (D61) : ce qui se recalcule à l'ouverture ne peut pas diverger de ce
 * dont il est tiré, et surtout il continue de fonctionner hors ligne. Un
 * document d'agrégat serait moins cher à lire, mais il exigerait le réseau
 * pour être à jour et mentirait en silence le jour où un déclencheur échoue.
 *
 * Tout ce fichier est pur : des tableaux entrent, des nombres sortent. C'est ce
 * qui permet de figer par un test chacune des décisions du commanditaire, au
 * lieu de les vérifier à l'œil sur un écran.
 */

/** Un mois civil, sur l'horloge de l'appareil. `mois` va de 0 à 11. */
export type Mois = { annee: number; mois: number };

/**
 * Le mois d'une date, **sur l'appareil** et non sur un serveur.
 *
 * Même raison que `jourLocal` (`lib/domain/recu.ts`) : un gérant travaille des
 * journées entières sans réseau, et « ce mois-ci » doit vouloir dire ce mois-ci
 * pour lui.
 */
export function moisDe(date: Date): Mois {
  return { annee: date.getFullYear(), mois: date.getMonth() };
}

export function memeMois(a: Mois, b: Mois): boolean {
  return a.annee === b.annee && a.mois === b.mois;
}

/** `2026-09` — pour une clé de tableau, jamais pour un affichage. */
export function cleMois(mois: Mois): string {
  return `${mois.annee}-${`${mois.mois + 1}`.padStart(2, "0")}`;
}

export function moisPrecedent(mois: Mois): Mois {
  return mois.mois === 0
    ? { annee: mois.annee - 1, mois: 11 }
    : { annee: mois.annee, mois: mois.mois - 1 };
}

const moisLong = new Intl.DateTimeFormat(LOCALE, { month: "long", year: "numeric" });

/** `septembre 2026`. */
export function libelleMois(mois: Mois): string {
  return moisLong.format(new Date(mois.annee, mois.mois, 1));
}

/**
 * Les douze derniers mois, du plus récent au plus ancien.
 *
 * Douze : ils couvrent la comparaison d'une année sur l'autre et tiennent dans
 * une liste qu'on lit d'un coup. Ce choix n'a pas été arbitré par le
 * commanditaire — il se change en une constante.
 */
export const MOIS_OFFERTS = 12;

export function derniersMois(aujourdhui: Date, combien = MOIS_OFFERTS): Mois[] {
  const liste: Mois[] = [];
  let courant = moisDe(aujourdhui);
  for (let i = 0; i < combien; i += 1) {
    liste.push(courant);
    courant = moisPrecedent(courant);
  }
  return liste;
}

function dansLeMois(date: Date | null, mois: Mois): boolean {
  return date !== null && memeMois(moisDe(date), mois);
}

/** Ce que le responsable seul peut lire, joint à sa vente par l'appelant. */
export type MargeParVente = ReadonlyMap<string, number>;

export type ChiffresDuMois = {
  motosVendues: number;
  /** Le même compte le mois d'avant : la carte le montre en dessous. */
  motosVenduesAvant: number;
  encaisse: number;
  /**
   * La marge des ventes du mois, `null` quand aucune n'est connue — un compte
   * gérant n'a pas ces documents, et sur une base neuve le déclencheur n'a
   * encore rien écrit. `0` dirait « aucune marge », ce qui est autre chose.
   */
  marge: number | null;
  /**
   * Vrai dès qu'une vente à crédit ou en tranches entre dans la marge du mois.
   *
   * La décision 1 du commanditaire compte la marge **entière au mois de la
   * vente**. C'est la lecture comptable, et elle est juste — mais elle annonce
   * alors de l'argent qui n'est pas encore entré. L'écran doit le dire, sinon
   * le choix devient un mensonge tranquille. Ce drapeau est ce qui le lui
   * permet.
   */
  margePartiellementEncaissee: boolean;
  /**
   * Les crédits du mois qui restent à percevoir. Une **créance** : la moto est
   * partie, l'argent manque.
   */
  creances: number;
  /**
   * Les tranches du mois encore détenues. Un **dépôt** : la moto est au
   * magasin, l'argent est là.
   *
   * Séparé des créances sur décision du commanditaire, et la maquette se
   * contredisait elle-même là-dessus. Les additionner produit un nombre qui ne
   * désigne rien : dans un cas le magasin attend de l'argent, dans l'autre il
   * en détient.
   */
  depots: number;
  /** Aucun chiffre à montrer : l'écran écrit une phrase plutôt que des zéros. */
  vide: boolean;
};

/**
 * Les chiffres d'un mois.
 *
 * **Deux dates différentes, et ce n'est pas une incohérence.** « Motos
 * vendues » suit la date de vente ; « encaissé » suit la date du versement. Une
 * vente d'août payée en septembre compte donc dans les deux mois, à deux cartes
 * différentes — c'est ce que les deux chiffres mesurent, et l'écran l'écrit une
 * fois sous les cartes.
 *
 * **Créances et dépôts portent sur les ventes du mois**, comme les deux autres
 * cartes : le bloc s'intitule « le mois », et un total à ce jour y ferait un
 * chiffre d'une autre nature. Ce qui est dû *en tout*, toutes dates confondues,
 * est ce que l'écran des paiements montre déjà, ligne par ligne.
 */
export function chiffresDuMois(
  mois: Mois,
  ventes: readonly Vente[],
  versements: readonly Versement[],
  marges: MargeParVente,
): ChiffresDuMois {
  const duMois = ventes.filter((vente) => dansLeMois(vente.date, mois));
  const avant = moisPrecedent(mois);

  const encaisse = versements
    .filter((versement) => dansLeMois(versement.date, mois))
    .reduce((somme, versement) => somme + versement.montant, 0);

  const connues = duMois.filter((vente) => marges.has(vente.id));
  const marge = connues.length === 0
    ? null
    : connues.reduce((somme, vente) => somme + (marges.get(vente.id) ?? 0), 0);

  const creances = duMois
    .filter((vente) => vente.modePaiement === "credit")
    .reduce((somme, vente) => somme + vente.resteDu, 0);

  /* Une tranche remise au client n'est plus un dépôt : la moto est partie, ce
     qui reste dû est devenu une créance ordinaire. Le cas est rare — la remise
     n'a lieu qu'au dernier franc — mais il existe, et il ne doit pas gonfler
     les dépôts. */
  const depots = duMois
    .filter((vente) => vente.modePaiement === "tranches" && !vente.motoRemise)
    .reduce((somme, vente) => somme + vente.totalPaye, 0);

  return {
    motosVendues: duMois.length,
    motosVenduesAvant: ventes.filter((vente) => dansLeMois(vente.date, avant)).length,
    encaisse,
    marge,
    margePartiellementEncaissee: connues.some((vente) => vente.modePaiement !== "comptant"),
    creances,
    depots,
    vide: duMois.length === 0 && encaisse === 0,
  };
}

/** Une part d'un ensemble, prête à dessiner en barre. */
export type Part = {
  cle: string;
  libelle: string;
  montant: number;
  /** Ce que la part compte : « 22 motos », « 12 ventes ». */
  compte: number;
  /** 0 à 100, rapporté à la plus grande part — jamais au total. */
  pourcentage: number;
};

/**
 * Les barres sont rapportées à la plus grande part, pas au total.
 *
 * Rapportées au total, trois boutiques équilibrées donnent trois barres à 33 %
 * qui n'occupent qu'un tiers de la place et ne se comparent plus entre elles.
 * La question posée ici est « laquelle pèse le plus », pas « quelle fraction du
 * tout » — la valeur chiffrée, elle, est écrite à côté.
 */
function enParts(entrees: Map<string, { libelle: string; montant: number; compte: number }>): Part[] {
  const liste = [...entrees.entries()].map(([cle, valeur]) => ({ cle, ...valeur, pourcentage: 0 }));
  const maximum = Math.max(0, ...liste.map((part) => part.montant));
  return liste
    .map((part) => ({
      ...part,
      pourcentage: maximum > 0 ? Math.round((part.montant / maximum) * 100) : 0,
    }))
    .sort((a, b) => b.montant - a.montant);
}

/** Le chiffre d'affaires du mois, boutique par boutique. */
export function partsParBoutique(
  mois: Mois,
  ventes: readonly Vente[],
  nomDeLaBoutique: (id: string) => string,
): Part[] {
  const parBoutique = new Map<string, { libelle: string; montant: number; compte: number }>();
  for (const vente of ventes) {
    if (!dansLeMois(vente.date, mois)) continue;
    const actuel = parBoutique.get(vente.boutiqueId) ?? {
      libelle: nomDeLaBoutique(vente.boutiqueId),
      montant: 0,
      compte: 0,
    };
    parBoutique.set(vente.boutiqueId, {
      ...actuel,
      montant: actuel.montant + vente.prixConvenu,
      compte: actuel.compte + 1,
    });
  }
  return enParts(parBoutique);
}

/** Le même mois, réparti par mode de paiement. */
export function partsParMode(mois: Mois, ventes: readonly Vente[]): Part[] {
  const parMode = new Map<string, { libelle: string; montant: number; compte: number }>();
  for (const vente of ventes) {
    if (!dansLeMois(vente.date, mois)) continue;
    const mode: ModePaiement = vente.modePaiement;
    const actuel = parMode.get(mode) ?? { libelle: LIBELLE_MODE[mode], montant: 0, compte: 0 };
    parMode.set(mode, {
      ...actuel,
      montant: actuel.montant + vente.prixConvenu,
      compte: actuel.compte + 1,
    });
  }
  return enParts(parMode);
}
