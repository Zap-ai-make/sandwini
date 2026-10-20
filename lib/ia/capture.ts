"use client";

import {
  COTE_MAX_PHOTO,
  dimensionsReduites,
  enteteWav,
  POIDS_MAX,
  QUALITE_PHOTO,
  versEntiers16,
  VOIX_HZ,
  type PieceJointe,
} from "./media";

/**
 * Prendre une photo, enregistrer une voix — et les rendre envoyables.
 *
 * **Tout ce qui a besoin du navigateur vit ici**, et rien d'autre : les règles
 * (jusqu'où réduire, à quelle fréquence, comment s'écrit un WAV) sont dans
 * `media.ts`, où elles se testent. Ce fichier n'est que de la plomberie —
 * canevas, micro, `AudioContext` — et c'est pour ça qu'il est court.
 */

/** Base64 sans le préfixe `data:…;base64,`, qui ferait doublon avec `mimeType`. */
function sansPrefixe(dataUrl: string): string {
  return dataUrl.slice(dataUrl.indexOf(",") + 1);
}

/**
 * Une photo réduite, prête à partir.
 *
 * **Le passage par un canevas n'est pas qu'une compression.** Il retire aussi
 * les métadonnées EXIF — dont la position GPS, que les téléphones inscrivent
 * par défaut. Envoyer la cour de la boutique en coordonnées à chaque photo de
 * châssis n'a jamais fait partie du marché.
 */
export async function reduirePhoto(fichier: File): Promise<PieceJointe> {
  const image = await chargerImage(fichier);
  const taille = dimensionsReduites(image.width, image.height, COTE_MAX_PHOTO);

  const canevas = document.createElement("canvas");
  canevas.width = taille.largeur;
  canevas.height = taille.hauteur;
  const pinceau = canevas.getContext("2d");
  if (!pinceau) throw new Error("Cet appareil ne sait pas préparer la photo.");
  pinceau.drawImage(image, 0, 0, taille.largeur, taille.hauteur);
  /* L'objet-URL se révoque tout de suite : gardé, il retient l'image entière
     en mémoire tant que l'onglet vit, et on en prend des dizaines par jour. */
  URL.revokeObjectURL(image.src);

  const donnees = sansPrefixe(canevas.toDataURL("image/jpeg", QUALITE_PHOTO));
  if (donnees.length > POIDS_MAX) {
    throw new Error("Cette photo est trop lourde. Reprenez-la de moins près.");
  }
  return { quoi: "photo", donnees, type: "image/jpeg" };
}

function chargerImage(fichier: File): Promise<HTMLImageElement> {
  return new Promise((resoudre, rejeter) => {
    const image = new Image();
    image.onload = () => resoudre(image);
    image.onerror = () => rejeter(new Error("Cette photo n’a pas pu être lue."));
    image.src = URL.createObjectURL(fichier);
  });
}

/** Ce qu'on tient pendant qu'on parle. */
export type Enregistrement = {
  /** Arrête le micro et rend la voix en WAV. */
  arreter: () => Promise<PieceJointe>;
  /** Arrête le micro et jette : le bouton « annuler ». */
  abandonner: () => void;
};

/**
 * Ouvre le micro et commence à enregistrer.
 *
 * Lève si l'autorisation est refusée — l'appelant doit le dire, pas l'avaler :
 * un micro qui ne s'allume pas sans explication se lit comme une panne de
 * l'application.
 */
export async function enregistrerLaVoix(): Promise<Enregistrement> {
  const flux = await navigator.mediaDevices.getUserMedia({ audio: true });
  const enregistreur = new MediaRecorder(flux);
  const morceaux: Blob[] = [];
  enregistreur.ondataavailable = (evenement) => {
    if (evenement.data.size > 0) morceaux.push(evenement.data);
  };
  enregistreur.start();

  /* Le flux se coupe toujours, quelle que soit la sortie : laissé ouvert, le
     voyant du micro reste allumé sur l'appareil — et on ne le pardonne pas à
     une application de gestion. */
  const couper = () => {
    for (const piste of flux.getTracks()) piste.stop();
  };

  return {
    arreter: () =>
      new Promise<PieceJointe>((resoudre, rejeter) => {
        enregistreur.onstop = () => {
          couper();
          versWav(new Blob(morceaux, { type: enregistreur.mimeType }))
            .then(resoudre)
            .catch(rejeter);
        };
        enregistreur.stop();
      }),
    abandonner: () => {
      enregistreur.onstop = couper;
      if (enregistreur.state !== "inactive") enregistreur.stop();
      else couper();
    },
  };
}

/**
 * Le son du navigateur, converti en WAV mono 16 kHz.
 *
 * **Pourquoi convertir plutôt qu'envoyer tel quel.** Chrome enregistre en
 * `webm/opus`, Safari en `mp4/aac` : Gemini ne reconnaît pas les deux, et un
 * refus de format se présenterait comme une réponse vide — impossible de dire
 * lequel des deux navigateurs a échoué. On fabrique donc le même fichier des
 * deux côtés.
 *
 * Le rééchantillonnage passe par un `OfflineAudioContext` déclaré à 16 kHz :
 * c'est le navigateur qui fait le filtrage, mieux qu'une décimation naïve qui
 * replierait les aigus sur la voix.
 */
async function versWav(son: Blob): Promise<PieceJointe> {
  const brut = await son.arrayBuffer();
  const contexte = new AudioContext();
  let decode: AudioBuffer;
  try {
    decode = await contexte.decodeAudioData(brut);
  } finally {
    void contexte.close();
  }

  const horsEcran = new OfflineAudioContext(1, Math.ceil(decode.duration * VOIX_HZ), VOIX_HZ);
  const source = horsEcran.createBufferSource();
  source.buffer = decode;
  source.connect(horsEcran.destination);
  source.start();
  const reduit = await horsEcran.startRendering();

  const entiers = versEntiers16(reduit.getChannelData(0));
  const entete = enteteWav(entiers.length, VOIX_HZ);
  const fichier = new Uint8Array(entete.length + entiers.byteLength);
  fichier.set(entete, 0);
  fichier.set(new Uint8Array(entiers.buffer), entete.length);

  if (fichier.length > POIDS_MAX) {
    throw new Error("Ce message est trop long. Dites-le en plus court.");
  }
  return { quoi: "voix", donnees: enBase64(fichier), type: "audio/wav" };
}

/**
 * Base64 par tranches.
 *
 * `String.fromCharCode(...octets)` d'un coup dépasse la taille de pile sur un
 * enregistrement de quelques secondes — et l'échec se présente comme un
 * plantage, pas comme un message.
 */
function enBase64(octets: Uint8Array): string {
  const TRANCHE = 0x80_00;
  let texte = "";
  for (let debut = 0; debut < octets.length; debut += TRANCHE) {
    texte += String.fromCharCode(...octets.subarray(debut, debut + TRANCHE));
  }
  return btoa(texte);
}
