import { describe, expect, it } from "vitest";

import {
  COTE_MAX_PHOTO,
  dimensionsReduites,
  dureeLisible,
  enteteWav,
  VOIX_HZ,
  versEntiers16,
} from "./media";

describe("réduire une photo avant de l’envoyer", () => {
  it("ramène le grand côté à la limite, en gardant les proportions", () => {
    /* Un téléphone rend du 4000 × 3000. Envoyé tel quel, c'est plusieurs
       mégaoctets sur une connexion de comptoir — et le modèle n'en lit pas
       mieux un numéro de châssis pour autant. */
    expect(dimensionsReduites(4000, 3000, 1000)).toEqual({ largeur: 1000, hauteur: 750 });
    expect(dimensionsReduites(3000, 4000, 1000)).toEqual({ largeur: 750, hauteur: 1000 });
  });

  it("n’agrandit jamais une petite photo", () => {
    /* Agrandir n'ajoute aucun détail et multiplie le poids : une photo déjà
       petite part telle quelle. */
    expect(dimensionsReduites(640, 480, 1280)).toEqual({ largeur: 640, hauteur: 480 });
  });

  it("ne rend jamais une dimension nulle", () => {
    /* Une bande très allongée arrondirait à zéro, et le canevas refuserait de
       dessiner — une photo perdue sans message d'erreur. */
    const petite = dimensionsReduites(4000, 3, 1000);
    expect(petite.hauteur).toBeGreaterThanOrEqual(1);
  });

  it("garde un grand côté assez large pour lire dix-sept caractères gravés", () => {
    expect(COTE_MAX_PHOTO).toBeGreaterThanOrEqual(1024);
  });
});

describe("l’en-tête d’un fichier audio", () => {
  const ENTETE = 44;

  it("annonce un WAV, en mono, à la fréquence de la parole", () => {
    /* Gemini accepte le WAV sans discuter. Les conteneurs que rendent les
       navigateurs — `webm` chez l'un, `mp4` chez l'autre — ne figurent pas
       tous dans sa liste, et on ne saurait lequel a été refusé. */
    const entete = enteteWav(16_000, VOIX_HZ);
    const lire = (debut: number, fin: number) =>
      String.fromCharCode(...entete.slice(debut, fin));
    expect(lire(0, 4)).toBe("RIFF");
    expect(lire(8, 12)).toBe("WAVE");
    expect(lire(12, 16)).toBe("fmt ");
    expect(lire(36, 40)).toBe("data");

    const vue = new DataView(entete.buffer);
    expect(vue.getUint16(22, true)).toBe(1); // un seul canal
    expect(vue.getUint32(24, true)).toBe(VOIX_HZ);
    expect(vue.getUint16(34, true)).toBe(16); // bits par échantillon
  });

  it("déclare les deux tailles que les lecteurs croient sur parole", () => {
    /* Un en-tête qui ment sur la taille donne un fichier tronqué ou du bruit
       en fin de bande, selon le lecteur. */
    const echantillons = 1_000;
    const vue = new DataView(enteteWav(echantillons, VOIX_HZ).buffer);
    expect(vue.getUint32(40, true)).toBe(echantillons * 2);
    expect(vue.getUint32(4, true)).toBe(ENTETE - 8 + echantillons * 2);
  });

  it("fait exactement quarante-quatre octets", () => {
    expect(enteteWav(0, VOIX_HZ).length).toBe(ENTETE);
  });

  it("retient seize mille hertz : c’est la fréquence de la parole", () => {
    /* Plus haut ne transcrit pas mieux et alourdit l'envoi ; plus bas hache
       les consonnes. */
    expect(VOIX_HZ).toBe(16_000);
  });
});

describe("convertir le son en entiers", () => {
  it("place le silence au milieu et les extrêmes aux bornes", () => {
    const entiers = versEntiers16(Float32Array.from([0, 1, -1]));
    expect(entiers[0]).toBe(0);
    expect(entiers[1]).toBe(32_767);
    expect(entiers[2]).toBe(-32_768);
  });

  it("borne ce qui dépasse au lieu de le faire tourner", () => {
    /* Un micro saturé rend des valeurs au-delà de 1. Sans bornage, l'entier
       repasse par le bas : un craquement violent à chaque crête, et une voix
       que le modèle ne reconnaît plus. */
    const entiers = versEntiers16(Float32Array.from([2.5, -3]));
    expect(entiers[0]).toBe(32_767);
    expect(entiers[1]).toBe(-32_768);
  });
});

describe("dire la durée d’un enregistrement", () => {
  it("s’écrit comme sur un lecteur", () => {
    expect(dureeLisible(0)).toBe("0:00");
    expect(dureeLisible(7)).toBe("0:07");
    expect(dureeLisible(65)).toBe("1:05");
    expect(dureeLisible(600)).toBe("10:00");
  });
});
