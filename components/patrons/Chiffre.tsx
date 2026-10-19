"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

/* Il double `--duree-apparition` de `globals.css` : c'est l'animation qui
   décide quand les deux valeurs cessent de coexister, et un écart entre les
   deux laisserait l'ancien chiffre collé dans la case ou le couperait en plein
   vol. */
const DUREE_RELEVE = 220;

/* Le retard d'un caractère sur le précédent à l'arrivée. Double le `30ms` de
   `globals.css`, pour les mêmes raisons. */
const RETARD_PAR_RANG = 30;

/**
 * Un nombre qui se relève quand il change sous les yeux.
 *
 * **Pourquoi la relève et non le défilement depuis zéro.** Le compteur qui
 * monte de 0 jusqu'à la valeur est l'animation que font tous les tableaux de
 * bord ; elle est inacceptable ici. Pendant toute sa durée, l'écran affiche des
 * montants **stables, lisibles et faux** : qui lève les yeux au mauvais moment
 * lit « 840 000 » là où le chiffre d'affaires est 1 240 000. La relève ne
 * montre jamais un nombre immobile et faux — les caractères qui changent sont
 * visiblement en mouvement, donc illisibles, donc on attend qu'ils se posent.
 * C'est la seule forme d'animation de chiffre qu'un logiciel d'argent peut se
 * permettre (arbitrage du commanditaire, S54).
 *
 * **Deux moments, deux mouvements.**
 *
 * *L'arrivée* — on atterrit sur l'écran, et le nombre se compose : les
 * caractères entrent l'un après l'autre, de la gauche vers la droite, à 30 ms
 * d'intervalle. C'est une demande expresse du commanditaire, et elle renverse
 * ce que la première version faisait : elle se taisait au premier affichage
 * pour réserver le mouvement aux changements. Le reproche est juste —
 * l'animation ne se voyait alors presque jamais, parce qu'un chiffre de carte
 * ne change pas souvent sous les yeux de celui qui le regarde.
 *
 * *Le changement* — la valeur bouge pendant qu'on est là, et seules les
 * positions qui changent se relèvent, toutes ensemble. Pas de décalage ici :
 * c'est un seul événement, pas une arrivée.
 *
 * **Au repos, ce composant ne pose rien** — ni enveloppe, ni cellule, juste le
 * texte. C'est ce qui permet de le glisser sous n'importe quel chiffre déjà
 * mis en page sans toucher ni à sa typographie ni à la sélection de texte.
 */
export function Chiffre({ valeur }: { valeur: string }) {
  /* `null` : rien ne joue. Sinon la relève est en cours, et `sortant` dit
     laquelle — `null` pour l'arrivée sur l'écran, où rien ne sort et où tout
     entre. L'état part rempli : le mouvement d'arrivée doit partir à la
     première peinture, sans attendre qu'un effet s'exécute. */
  const [jeu, setJeu] = useState<{ sortant: string | null } | null>({ sortant: null });
  const precedent = useRef(valeur);

  useEffect(() => {
    if (precedent.current !== valeur) {
      const avant = precedent.current;
      precedent.current = valeur;
      setJeu({ sortant: avant });
    }
  }, [valeur]);

  /* Le ménage est séparé du déclenchement : il court après *chaque* mise en
     mouvement, l'arrivée comprise, et se remet à zéro si une nouvelle valeur
     tombe au milieu de la précédente. */
  useEffect(() => {
    if (jeu === null) return;
    const course = jeu.sortant === null ? DUREE_RELEVE + valeur.length * RETARD_PAR_RANG : DUREE_RELEVE;
    const minuteur = setTimeout(() => setJeu(null), course);
    return () => clearTimeout(minuteur);
  }, [jeu, valeur]);

  if (jeu === null) return <>{valeur}</>;
  const { sortant } = jeu;

  /* L'arrivée : chaque caractère entre à son tour. Le nombre se compose au lieu
     de surgir, et c'est ce décalage — pas la durée — qui le rend visible. */
  if (sortant === null) {
    return (
      <>
        <span className="sr-only">{valeur}</span>
        <span aria-hidden="true">
          {Array.from(valeur, (caractere, rang) => (
            <span
              key={rang}
              className="releve releve-arrivee"
              style={{ "--rang": rang } as CSSProperties}
            >
              <span className="releve-entrant">{caractere}</span>
            </span>
          ))}
        </span>
      </>
    );
  }

  /* Deux valeurs de même longueur se relèvent **position par position** : seuls
     les caractères qui changent bougent, et « 1 240 000 » → « 1 265 000 » ne
     fait remuer que trois chiffres. C'est ce qui rend le mouvement lisible —
     l'œil voit *où* ça a changé.

     Longueurs différentes, c'est toute la valeur qui tourne d'un bloc. Aligner
     « 980 000 » sur « 1 240 000 » demanderait de combler à gauche, et le nombre
     se décalerait d'un cran avant de revenir à sa place : un sursaut de mise en
     page au moment précis où l'on regarde le chiffre. */
  const positions =
    sortant.length === valeur.length
      ? Array.from(valeur, (apres, rang) => ({ avant: sortant[rang], apres }))
      : [{ avant: sortant, apres: valeur }];

  return (
    <>
      {/* La valeur vraie, et elle seule, pour qui écoute. Les deux moitiés de
          la relève cohabitent 220 ms : lues à la suite, elles donneraient un
          nombre qui n'a jamais existé. */}
      <span className="sr-only">{valeur}</span>
      <span aria-hidden="true">
        {positions.map(({ avant, apres }, rang) =>
          avant === apres ? (
            <span key={rang}>{apres}</span>
          ) : (
            <span key={rang} className="releve">
              <span className="releve-sortant">{avant}</span>
              <span className="releve-entrant">{apres}</span>
            </span>
          ),
        )}
      </span>
    </>
  );
}
