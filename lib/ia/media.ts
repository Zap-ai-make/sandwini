/**
 * Ce qu'on envoie à l'assistant en plus des mots : une photo, une voix.
 *
 * **Pur, et séparé de la capture.** Ce fichier ne touche ni au micro ni au
 * canevas — il tient les règles : jusqu'où réduire une photo, à quelle
 * fréquence échantillonner la parole, comment s'écrit un en-tête WAV. La
 * capture elle-même vit dans `capture.ts`, qui a besoin du navigateur et ne
 * peut pas se tester ici.
 */

/**
 * Le grand côté d'une photo envoyée au modèle.
 *
 * **Un arbitrage entre lisibilité et connexion.** Un téléphone rend du
 * 4000 × 3000, soit plusieurs mégaoctets : sur la connexion d'un comptoir de
 * Pouytenga, c'est une minute d'attente pour une photo que le modèle ne lira
 * pas mieux. 1280 laisse largement de quoi déchiffrer dix-sept caractères
 * gravés sur un cadre, et tient en quelques centaines de kilooctets.
 */
export const COTE_MAX_PHOTO = 1280;

/** La qualité JPEG retenue : au-delà, le poids monte sans que l'œil suive. */
export const QUALITE_PHOTO = 0.72;

/**
 * La fréquence d'échantillonnage de la voix.
 *
 * Seize mille hertz est la fréquence de la parole : plus haut ne transcrit pas
 * mieux et alourdit l'envoi, plus bas hache les consonnes — et un châssis se
 * dicte lettre par lettre.
 */
export const VOIX_HZ = 16_000;

/**
 * Ce qu'on refuse d'envoyer, en octets.
 *
 * Une pièce jointe part en base64 dans le corps de la requête, et chaque
 * octet est facturé. Le plafond protège autant la facture que la patience.
 */
export const POIDS_MAX = 4 * 1024 * 1024;

/** Une pièce jointe prête à partir : des octets, et ce qu'ils sont. */
export type PieceJointe = {
  quoi: "photo" | "voix";
  /** Le contenu en base64, sans le préfixe `data:`. */
  donnees: string;
  /** Le type MIME exact annoncé au modèle. */
  type: string;
};

/**
 * Les dimensions après réduction, proportions gardées.
 *
 * N'agrandit jamais : agrandir n'ajoute aucun détail et multiplie le poids.
 */
export function dimensionsReduites(
  largeur: number,
  hauteur: number,
  max: number,
): { largeur: number; hauteur: number } {
  const facteur = Math.min(1, max / Math.max(largeur, hauteur));
  return {
    /* Au moins un pixel : une bande très allongée arrondirait à zéro, et le
       canevas refuserait de dessiner — une photo perdue, sans message. */
    largeur: Math.max(1, Math.round(largeur * facteur)),
    hauteur: Math.max(1, Math.round(hauteur * facteur)),
  };
}

/**
 * L'en-tête d'un fichier WAV mono, 16 bits.
 *
 * **Pourquoi fabriquer un WAV plutôt qu'envoyer ce que rend le navigateur.**
 * `MediaRecorder` donne du `webm/opus` sur Chrome et du `mp4/aac` sur Safari.
 * Gemini ne reconnaît pas tous ces conteneurs, et un refus de format se
 * présenterait comme une réponse vide — sans dire lequel des deux navigateurs
 * a échoué. Le WAV, lui, est accepté partout, et on le fabrique à l'identique
 * des deux côtés.
 */
export function enteteWav(nombreEchantillons: number, frequence: number): Uint8Array {
  const octetsDonnees = nombreEchantillons * 2;
  const entete = new Uint8Array(44);
  const vue = new DataView(entete.buffer);

  const ecrireTexte = (position: number, texte: string) => {
    for (let rang = 0; rang < texte.length; rang += 1) {
      entete[position + rang] = texte.charCodeAt(rang);
    }
  };

  ecrireTexte(0, "RIFF");
  /* La taille du fichier **moins les huit premiers octets** : c'est la
     convention du format, et s'en écarter donne un fichier que certains
     lecteurs tronquent en silence. */
  vue.setUint32(4, 36 + octetsDonnees, true);
  ecrireTexte(8, "WAVE");

  ecrireTexte(12, "fmt ");
  vue.setUint32(16, 16, true); // longueur du bloc de format
  vue.setUint16(20, 1, true); // PCM non compressé
  vue.setUint16(22, 1, true); // mono
  vue.setUint32(24, frequence, true);
  vue.setUint32(28, frequence * 2, true); // octets par seconde
  vue.setUint16(32, 2, true); // octets par échantillon
  vue.setUint16(34, 16, true); // bits par échantillon

  ecrireTexte(36, "data");
  vue.setUint32(40, octetsDonnees, true);
  return entete;
}

/**
 * Du son flottant vers des entiers 16 bits.
 *
 * **Le bornage n'est pas une précaution d'école.** Un micro saturé rend des
 * valeurs au-delà de 1 ; sans bornage, l'entier repasse par le bas et produit
 * un craquement violent à chaque crête — une voix que le modèle ne reconnaît
 * plus, sur un enregistrement qui paraissait correct.
 */
export function versEntiers16(echantillons: Float32Array): Int16Array {
  const entiers = new Int16Array(echantillons.length);
  for (let rang = 0; rang < echantillons.length; rang += 1) {
    const borne = Math.max(-1, Math.min(1, echantillons[rang]));
    entiers[rang] = borne < 0 ? borne * 0x80_00 : borne * 0x7f_ff;
  }
  return entiers;
}

/** « 1:05 », comme sur un lecteur. */
export function dureeLisible(secondes: number): string {
  const minutes = Math.floor(secondes / 60);
  const reste = Math.floor(secondes % 60);
  return `${minutes}:${String(reste).padStart(2, "0")}`;
}
