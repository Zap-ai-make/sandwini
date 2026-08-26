import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import {
  ENTREPRISE_VIDE,
  LOGO_LARGEUR_MAX,
  normaliserEntreprise,
  type Entreprise,
} from "@/lib/domain/entreprise";
import { suivreEcriture } from "@/lib/reseau/file-ecritures";
import { signalerSourceDonnees } from "@/lib/reseau/source-donnees";
import { traceModification, type Auteur } from "./referentiels";

/**
 * L'identité de l'entreprise — un seul document, `entreprise/profil`.
 *
 * Une collection pour un document unique peut surprendre ; c'est ce que
 * Firestore impose (pas de document à la racine) et c'est aussi ce qui rend la
 * règle simple à écrire : tout le monde lit, seul le responsable écrit.
 */

const CHEMIN = ["entreprise", "profil"] as const;

export function ecouterEntreprise(
  auChangement: (entreprise: Entreprise) => void,
  enErreur: (cause: unknown) => void,
): () => void {
  return onSnapshot(
    doc(db(), ...CHEMIN),
    { includeMetadataChanges: true },
    (instantane) => {
      signalerSourceDonnees(instantane.metadata.fromCache);
      const donnees = instantane.data();
      auChangement(
        donnees
          ? {
              nom: donnees.nom ?? "",
              adresse: donnees.adresse ?? "",
              telephone: donnees.telephone ?? "",
              telephone2: donnees.telephone2 ?? "",
              identifiant: donnees.identifiant ?? "",
              logo: typeof donnees.logo === "string" && donnees.logo ? donnees.logo : null,
            }
          : ENTREPRISE_VIDE,
      );
    },
    enErreur,
  );
}

export function enregistrerEntreprise(entreprise: Entreprise, auteur: Auteur): Promise<void> {
  const propre = normaliserEntreprise(entreprise);
  return suivreEcriture(
    setDoc(
      doc(db(), ...CHEMIN),
      {
        ...propre,
        /* `null` plutôt qu'un champ absent : les règles vérifient le contrat
           champ par champ, et une clé qui disparaît est plus difficile à
           raisonner qu'une clé vide. */
        logo: propre.logo ?? null,
        ...traceModification(auteur),
      },
      { merge: true },
    ),
  );
}

/**
 * Réduit une image choisie sur l'appareil et l'encode pour Firestore.
 *
 * Le logo part dans le document parce que les reçus s'impriment hors ligne
 * (cf. `lib/domain/entreprise.ts`). Il faut donc qu'il soit petit — d'où la
 * réduction ici, sur l'appareil, avant tout enregistrement. Un responsable qui
 * choisit la photo brute de son enseigne ne doit pas avoir à s'en occuper.
 *
 * Le format de sortie est PNG : les logos ont des aplats et souvent de la
 * transparence, que le JPEG rendrait mal.
 */
export async function reduireLogo(fichier: File): Promise<string> {
  const image = await chargerImage(fichier);
  const echelle = Math.min(1, LOGO_LARGEUR_MAX / Math.max(image.width, image.height));
  const largeur = Math.max(1, Math.round(image.width * echelle));
  const hauteur = Math.max(1, Math.round(image.height * echelle));

  const toile = document.createElement("canvas");
  toile.width = largeur;
  toile.height = hauteur;
  const contexte = toile.getContext("2d");
  if (!contexte) throw new Error("Le navigateur n’a pas pu préparer l’image.");
  contexte.drawImage(image, 0, 0, largeur, hauteur);

  return toile.toDataURL("image/png");
}

function chargerImage(fichier: File): Promise<HTMLImageElement> {
  return new Promise((resoudre, rejeter) => {
    const url = URL.createObjectURL(fichier);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resoudre(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      rejeter(new Error("Ce fichier n’est pas une image lisible."));
    };
    image.src = url;
  });
}
