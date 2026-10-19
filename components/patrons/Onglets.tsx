"use client";

import { type ReactNode } from "react";
import { Segmente } from "@/components/patrons/Segmente";

/**
 * Deux ou trois panneaux dont un seul s'affiche à la fois.
 *
 * **Pourquoi des onglets ici.** « Marques et modèles » empilait ses deux
 * listes : pour atteindre les modèles il fallait dépasser les trente marques,
 * et l'écran s'ouvrait sur une ligne d'ajout suivie d'un défilement. Les deux
 * listes ne se consultent pas ensemble — on vient poser une marque, ou poser
 * un modèle. Un seul panneau à la fois rend le second atteignable d'un clic au
 * lieu d'un défilement (demande du commanditaire, S54).
 *
 * **Ce n'est pas `role="tab"`, et c'est voulu.** D72 a refusé d'écrire à la
 * main les composants que les bibliothèques font bien — pièges de focus, ARIA,
 * flèches du clavier. Le motif ARIA des onglets en fait partie : il demande un
 * `tabindex` mobile et une gestion des flèches qu'on écrirait mal une fois sur
 * deux. Or le dépôt a déjà la réponse à « un choix exclusif » : `Segmente`, un
 * vrai groupe de boutons radio. Les flèches y circulent toutes seules, le
 * lecteur d'écran annonce « 2 sur 2 », et le groupe porte un nom — sans une
 * ligne d'ARIA de notre fabrication.
 *
 * Le panneau est une `region` nommée par l'onglet actif : sans ce nom, la
 * partie de l'écran qui vient de changer ne s'annonce pas, et le panneau ne se
 * retrouve pas dans la liste des repères.
 */
export function Onglets<T extends string>({
  libelle,
  valeur,
  changer,
  onglets,
  className = "",
}: {
  /**
   * Le nom du groupe. Il n'est pas affiché — les deux libellés disent déjà
   * tout — mais il est annoncé avant eux, sinon le groupe s'ouvre sur « 1 sur
   * 2 » sans dire de quoi.
   */
  libelle: string;
  valeur: T;
  changer: (valeur: T) => void;
  onglets: readonly { valeur: T; libelle: string; contenu: ReactNode }[];
  className?: string;
}) {
  const actif = onglets.find((onglet) => onglet.valeur === valeur) ?? onglets[0];

  return (
    <div className={className}>
      <Segmente
        libelle={libelle}
        libelleMasque
        valeur={actif.valeur}
        changer={changer}
        options={onglets.map(({ valeur: cle, libelle: nom }) => ({ valeur: cle, libelle: nom }))}
        /* Deux segments sur toute la largeur d'un écran de bureau feraient
           deux pavés de 600 px pour deux mots. Ils s'arrêtent à la largeur
           d'une colonne de formulaire, et s'étirent en dessous. */
        className="max-w-[28rem]"
      />

      {/* Le panneau inactif est démonté, pas caché : une liste masquée reste
          dans l'ordre de tabulation et dans la recherche du navigateur, et on
          tombe dessus sans la voir. Les écoutes Firestore, elles, vivent dans
          la page au-dessus — changer d'onglet ne les rouvre pas.

          La clé est ce qui fait rejouer le mouvement. Sans elle React garde la
          même `<section>` d'un onglet à l'autre — il n'en remplace que le
          contenu —, et une animation CSS ne rejoue pas sur un élément qui n'a
          pas été remonté. Elle ne change rien d'autre : le contenu des deux
          onglets diffère de toute façon, et il était déjà remonté. */}
      <section
        key={actif.valeur}
        aria-label={actif.libelle}
        className="panneau-onglet mt-6"
      >
        {actif.contenu}
      </section>
    </div>
  );
}
