"use client";

import { Store } from "lucide-react";
import { Modale } from "@/components/patrons/Modale";
import { usePerimetre } from "@/lib/perimetre/perimetre";

/**
 * « Dans quelle boutique ? » — la question posée au moment du geste (S54).
 *
 * **Pourquoi ce composant existe, et ce qu'il corrige.** Trois actions — faire
 * entrer une moto, enregistrer un arrivage, saisir une vente — écrivent dans
 * une boutique précise, et S54 avait tranché : hors d'une boutique, le bouton
 * n'est pas grisé, il **n'existe pas**, et une phrase en dessous dit où aller.
 * La règle était défendable ; l'épreuve du terrain l'a démentie. Le
 * commanditaire lui-même, travaillant en « toutes les boutiques », a signalé
 * trois fonctions comme cassées : elles marchaient, mais leur bouton avait
 * disparu et la phrase ne l'a pas atteint. Une phrase que le commanditaire ne
 * voit pas ne sera vue par personne.
 *
 * **Le bouton existe donc toujours, et c'est lui qui réclame ce qui manque.**
 * Ce n'est pas un retour au bouton grisé — un bouton grisé invite à chercher ce
 * qui le débloquerait. Celui-ci fonctionne : il pose la seule question qui
 * reste, et le geste continue. Le périmètre n'est pas deviné, il est choisi,
 * donc la plaque du bandeau dit ensuite où l'on écrit — exactement comme si le
 * choix avait été fait là-haut.
 *
 * **Les boutiques fermées n'y sont pas** : les règles refusent d'y écrire, et
 * proposer un geste qui échouerait serait pire que de ne rien proposer.
 */
export function ChoisirBoutique({
  ouvert,
  onFermer,
  titre,
  onChoisie,
}: {
  ouvert: boolean;
  onFermer: () => void;
  /** Ce qu'on s'apprête à faire : « Faire entrer une moto ». */
  titre: string;
  /** Appelé après que le périmètre a changé, pour reprendre le geste. */
  onChoisie: (boutiqueId: string) => void;
}) {
  const { boutiques, choisir } = usePerimetre();
  const ouvertes = boutiques.filter((boutique) => boutique.actif);

  return (
    <Modale ouvert={ouvert} onFermer={onFermer} titre={titre} taille="etroite">
      {ouvertes.length === 0 ? (
        <p className="text-corps text-encre-doux">
          Aucune boutique ouverte. Déclarez-en une dans les réglages avant de continuer.
        </p>
      ) : (
        <ul className="grid gap-2">
          {ouvertes.map((boutique) => (
            <li key={boutique.id}>
              <button
                type="button"
                onClick={() => {
                  /* Choisir ici vaut choisir dans la plaque : même fonction,
                     même effet sur tout l'écran. Le geste qui suit écrira donc
                     là où le bandeau l'annonce, et non dans une boutique que
                     seul ce bouton connaîtrait. */
                  choisir(boutique.id);
                  onChoisie(boutique.id);
                }}
                className="flex w-full items-center gap-3 rounded-plaque border border-bord px-3 py-3 text-left hover:bg-survol"
              >
                <Store aria-hidden="true" className="size-4 shrink-0 text-encre-doux" />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-encre">{boutique.nom}</span>
                  {boutique.adresse && (
                    <span className="block text-legende text-encre-doux">{boutique.adresse}</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modale>
  );
}
