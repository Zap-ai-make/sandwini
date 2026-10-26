/**
 * Le registre des CMC retirés (26 octobre 2026, demande du commanditaire).
 *
 * « Ajoute un nouveau sous-onglet CMC, pour enregistrer ceux qui viennent
 * récupérer les CMC : nom, prénom, numéro, numéro de la moto. »
 *
 * **Ce n'est pas le suivi des papiers, et c'est volontaire.** Le produit sait
 * déjà si le CMC d'une moto est en main (`cmcRecu`, coché à l'inspection du
 * lot) et s'il a été emporté par l'acheteur (`emporte.cmc`, sur la vente).
 * Ce registre-ci répond à une autre question : **qui est venu le chercher**.
 * Celui qui se présente au comptoir n'est pas toujours l'acheteur — c'est un
 * frère, un employé, un acheteur d'occasion — et la moto n'est pas toujours
 * une moto vendue par la maison. Le rattacher à une vente aurait donc écarté
 * la moitié des cas.
 *
 * **Du texte libre, et c'est la forme juste.** On note ce que la personne
 * déclare et ce qu'elle présente, pas ce que la base sait déjà. Un champ qui
 * exigerait de retrouver la moto au stock bloquerait le geste quand la moto
 * vient d'ailleurs, et transformerait une signature de registre en enquête.
 */

import { normaliserTelephone } from "./client";
import { normaliserChassis } from "./moto";

export type RetraitCmc = {
  id: string;
  boutiqueId: string;
  nom: string;
  prenom: string;
  telephone: string;
  /** Le numéro relevé sur la moto : cadre complet, ou ce que la personne donne. */
  numeroMoto: string;
  /** `null` tant que l'horodatage serveur n'est pas résolu — saisie hors ligne. */
  date: Date | null;
  /** Qui a tenu le registre, recopié pour rester lisible. */
  auteur: string;
};

export type SaisieRetraitCmc = {
  nom: string;
  prenom: string;
  telephone: string;
  numeroMoto: string;
};

export const RETRAIT_CMC_VIDE: SaisieRetraitCmc = {
  nom: "",
  prenom: "",
  telephone: "",
  numeroMoto: "",
};

export const LONGUEUR_NOM_MAX = 80;
export const LONGUEUR_TELEPHONE_MAX = 40;
export const LONGUEUR_NUMERO_MOTO_MAX = 40;

/**
 * Ce qui manque à une ligne de registre, ou `null`.
 *
 * **Deux champs seulement sont exigés** : le nom de qui emporte, et le numéro
 * de la moto. Sans eux, la ligne ne désigne personne et ne désigne rien — elle
 * ne prouverait pas que le papier est sorti. Le prénom et le téléphone sont
 * facultatifs parce qu'ils le sont au comptoir : on ne refuse pas de remettre
 * un CMC à quelqu'un qui n'a pas de téléphone.
 */
export function validerRetraitCmc(saisie: SaisieRetraitCmc): string | null {
  const nom = saisie.nom.trim();
  if (!nom) return "Le nom de la personne qui emporte le CMC est obligatoire.";
  if (nom.length > LONGUEUR_NOM_MAX) return `Le nom dépasse ${LONGUEUR_NOM_MAX} caractères.`;

  if (saisie.prenom.trim().length > LONGUEUR_NOM_MAX) {
    return `Le prénom dépasse ${LONGUEUR_NOM_MAX} caractères.`;
  }
  if (saisie.telephone.trim().length > LONGUEUR_TELEPHONE_MAX) {
    return `Le téléphone dépasse ${LONGUEUR_TELEPHONE_MAX} caractères.`;
  }

  const numero = saisie.numeroMoto.trim();
  if (!numero) return "Le numéro de la moto est obligatoire : c’est lui qui dit quel CMC est sorti.";
  if (numero.length > LONGUEUR_NUMERO_MOTO_MAX) {
    return `Le numéro de la moto dépasse ${LONGUEUR_NUMERO_MOTO_MAX} caractères.`;
  }
  return null;
}

/** La saisie sous la forme exacte qui part en base. */
export function normaliserRetraitCmc(saisie: SaisieRetraitCmc): SaisieRetraitCmc {
  return {
    nom: saisie.nom.trim(),
    prenom: saisie.prenom.trim(),
    telephone: normaliserTelephone(saisie.telephone),
    /* Le numéro de moto suit la même forme que partout ailleurs : sans espaces
       ni tirets, en capitales. C'est ce qui permet de retrouver la ligne en
       tapant le numéro comme on l'a sous les yeux, quelle que soit la façon
       dont il a été noté. */
    numeroMoto: normaliserChassis(saisie.numeroMoto),
  };
}

/**
 * Cherche dans le registre : un nom, un prénom, un numéro.
 *
 * Chaque mot doit se retrouver quelque part dans la ligne — c'est la même
 * règle que la recherche des dossiers et celle des arrivages, et une règle
 * qu'on n'a pas à réapprendre d'un écran à l'autre.
 */
export function chercherRetraitsCmc(
  retraits: readonly RetraitCmc[],
  requete: string,
  normaliser: (brut: string) => string,
): RetraitCmc[] {
  const mots = normaliser(requete).split(" ").filter(Boolean);
  if (mots.length === 0) return [...retraits];
  return retraits.filter((retrait) => {
    const foin = normaliser(
      `${retrait.nom} ${retrait.prenom} ${retrait.telephone} ${retrait.numeroMoto}`,
    );
    /* Le numéro se cherche aussi par fragment, collé : on relève souvent les
       derniers caractères du cadre plutôt que la suite entière. */
    const serre = foin.replace(/[\s-]+/g, "");
    return mots.every((mot) => foin.includes(mot) || serre.includes(mot.replace(/[\s-]+/g, "")));
  });
}
