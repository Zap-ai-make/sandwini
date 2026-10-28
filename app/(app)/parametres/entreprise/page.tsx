"use client";

import { BoutonInstaller } from "@/components/BoutonInstaller";
import { GardeCapacite } from "@/components/GardeSession";
import { IdentiteEntreprise, NumerosAConfirmer } from "@/components/IdentiteEntreprise";
import { Avis } from "@/components/patrons/Avis";
import { TetePage, TitreSection } from "@/components/patrons/Page";
import { faitsDeVersion } from "@/lib/domain/version";
import { VERSION_COURANTE } from "@/lib/version/courante";
import { useMiseAJour } from "@/lib/version/mise-a-jour";

/**
 * L'identité de l'entreprise, et l'accueil des réglages depuis le 26 octobre 2026.
 *
 * **Cet écran n'est plus un formulaire d'identité.** Raison sociale, siège,
 * téléphone, IFU et RCCM sont posés dans le code (D71) : ils s'impriment sur
 * chaque reçu sans que personne ait à les saisir, et personne ne peut les
 * vider. La forme de l'écran le dit — une carte qu'on lit, sans champ ni
 * bouton. Un champ grisé aurait laissé croire qu'il existe un moyen de le
 * dégriser.
 *
 * **Le seul réglage qui l'accompagnait est parti**, à la demande du
 * commanditaire : le délai au bout duquel une vente en tranches sans versement
 * était signalée. La valeur déjà enregistrée continue de servir la liste des
 * tranches — elle n'est simplement plus modifiable depuis un écran. La
 * remettre, le jour où il la redemande, tient dans un bloc.
 *
 * **Et cet écran est devenu l'accueil des réglages** : `/parametres` y mène,
 * son sommaire ayant été retiré. D'où « Cet appareil » en bas, qui vivait sur
 * ce sommaire et n'avait nulle part ailleurs où aller.
 */
export default function PageEntreprise() {
  return (
    <GardeCapacite capacite="gerer_referentiels">
      <FicheEntreprise />
    </GardeCapacite>
  );
}

function FicheEntreprise() {
  return (
    <Cadre>
      <Identite />
      <CetAppareil />
    </Cadre>
  );
}

function Identite() {
  return (
    <section className="cadre p-4">
      <h2 className="font-semibold text-encre">Ce qui s’imprime en tête de chaque reçu</h2>

      {/* Le filet du haut et celui du bas ont sauté : les faits ne tiennent
          plus toute la largeur depuis que le monogramme est à leur gauche, et
          deux traits pleins au-dessus d’un bloc en retrait dessinaient un
          cadre qui n’existait pas. */}
      <div className="my-4">
        <IdentiteEntreprise />
      </div>

      <NumerosAConfirmer />
    </section>
  );
}

/**
 * Ce que l'appareil porte — descendu ici le 26 octobre 2026.
 *
 * **Il vivait sur l'accueil des réglages, que le commanditaire a retiré.** Le
 * supprimer avec lui aurait coûté le bouton d'installation : c'est lui qui
 * donne le plein écran et le travail hors ligne, promesse centrale du produit
 * (D40), et le navigateur range le geste au fond d'un menu que personne
 * n'ouvre. L'avis de mise à jour est dans le même cas — il n'est annoncé
 * nulle part ailleurs.
 *
 * **Rangé sous l'identité et non au-dessus.** On vient ici pour vérifier ce
 * qui s'imprime sur un reçu ; la version de la tablette est ce qu'on cherche
 * en second, le jour où quelque chose cloche.
 */
function CetAppareil() {
  return (
    <section aria-labelledby="titre-appareil" className="mt-8">
      <TitreSection id="titre-appareil">Cet appareil</TitreSection>
      <dl className="cadre cadre-liste">
        {faitsDeVersion(VERSION_COURANTE).map(({ titre, valeur }) => (
          <div key={titre} className="flex flex-wrap items-baseline gap-x-4 px-4 py-3">
            <dt className="min-w-40 text-corps text-encre-doux">{titre}</dt>
            <dd className={titre === "Empreinte" ? "font-code text-encre" : "text-encre"}>
              {valeur}
            </dd>
          </div>
        ))}
      </dl>

      <MiseAJour />

      <div className="mt-4">
        <BoutonInstaller />
      </div>

    </section>
  );
}

/**
 * L'avis de version, et pourquoi il n'y a pas de bouton pour l'appliquer.
 *
 * `skipWaiting()` ne prend pas la main tant qu'un service worker actif est
 * occupé — mesuré et expliqué en D85. Un bouton qui ne fait rien est pire que
 * pas de bouton : il apprend à ne plus croire l'écran. La phrase dit donc ce
 * qui marche vraiment, fermer l'application et la rouvrir.
 */
function MiseAJour() {
  const { enAttente } = useMiseAJour();
  if (!enAttente) return null;
  return (
    <Avis ton="transit" role="status" titre="Une version plus récente est prête" className="mt-3">
      <p>
        Elle est déjà téléchargée sur cet appareil, et aucune saisie en cours ne sera interrompue :
        elle s’installera quand vous aurez{" "}
        <strong className="font-semibold">fermé complètement l’application, puis rouverte</strong>{" "}
        — à la réouverture du magasin, par exemple.
      </p>
    </Avis>
  );
}

function Cadre({ children }: { children: React.ReactNode }) {
  return (
    <div>
      {/* Aucun retour : `/parametres` mène ici, donc le lien boucherait sur
          l'écran qu'on regarde. */}
      <TetePage titre="Identité de l’entreprise" />
      {children}
    </div>
  );
}
