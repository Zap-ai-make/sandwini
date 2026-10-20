/**
 * Où l'assistant sait emmener quelqu'un.
 *
 * **Un catalogue nommé, et non une adresse libre.** Laisser le modèle composer
 * un chemin l'enverrait un jour sur `/motos/ventes/nouvelle-vente` — une page
 * qui n'existe pas, et un écran d'erreur à la place de ce qu'on demandait. Il
 * choisit donc dans cette liste, ou il ne va nulle part.
 *
 * Les clés sont les mots que le modèle lit ; les chemins sont ceux de la
 * navigation. Un test vérifie que chacun correspond à une page réellement
 * présente dans `app/` — c'est la seule défense contre une route renommée un
 * jour sans que personne ne pense à ce fichier.
 */

export type Destination = {
  /** Le nom que le modèle emploie. */
  cle: string;
  chemin: string;
  /** Ce qu'on dit à l'utilisateur : « J'ouvre le journal de caisse. » */
  libelle: string;
  /**
   * Vrai quand l'écran n'a aucun sens sur « toutes les boutiques ».
   *
   * Une saisie a besoin d'une destination : ouvrir la nouvelle vente depuis le
   * périmètre de l'entreprise entière poserait un formulaire sans boutique, et
   * l'erreur ne se verrait qu'au moment d'enregistrer.
   */
  exigeBoutique?: boolean;
};

export const DESTINATIONS: readonly Destination[] = [
  { cle: "accueil", chemin: "/dashboard", libelle: "l’accueil" },
  { cle: "supervision", chemin: "/supervision", libelle: "la supervision" },

  { cle: "stock_motos", chemin: "/motos", libelle: "le stock de motos" },
  { cle: "ventes_motos", chemin: "/motos/ventes", libelle: "le registre des ventes" },
  {
    cle: "nouvelle_vente",
    chemin: "/motos/ventes?nouvelle=1",
    libelle: "la saisie d’une nouvelle vente",
    exigeBoutique: true,
  },
  {
    cle: "faire_entrer_une_moto",
    chemin: "/motos/nouvelle",
    libelle: "la saisie d’une moto qui entre",
    exigeBoutique: true,
  },
  { cle: "paiements", chemin: "/motos/paiements", libelle: "les paiements et les tranches" },
  { cle: "dossiers", chemin: "/motos/dossiers", libelle: "les dossiers de cartes grises" },
  { cle: "arrivages", chemin: "/motos/arrivages", libelle: "les arrivages" },
  { cle: "inventaire", chemin: "/motos/inventaire", libelle: "l’inventaire des motos" },

  { cle: "catalogue_pieces", chemin: "/pieces", libelle: "le catalogue des pièces" },
  {
    cle: "nouvelle_piece",
    chemin: "/pieces/nouvelle",
    libelle: "la création d’une pièce",
    exigeBoutique: true,
  },
  {
    cle: "vendre_des_pieces",
    chemin: "/pieces/vendre",
    libelle: "la vente de pièces",
    exigeBoutique: true,
  },

  { cle: "caisse", chemin: "/caisse", libelle: "le journal de caisse" },
  { cle: "clients", chemin: "/clients", libelle: "le fichier des clients" },
  { cle: "prestataires", chemin: "/prestataires", libelle: "les prestataires" },
  { cle: "reglages", chemin: "/parametres", libelle: "les paramètres" },
];

export function trouverDestination(cle: string): Destination | null {
  const cherchee = cle.trim().toLowerCase();
  return DESTINATIONS.find((destination) => destination.cle === cherchee) ?? null;
}

/** La liste que le modèle lit dans la description de l'outil. */
export function clesDisponibles(): string {
  return DESTINATIONS.map((destination) => destination.cle).join(", ");
}
