"use client";

import { ArrowRight, Coins, Plus, Store, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { CeQuiDemandeUneDecision } from "@/components/CeQuiDemandeUneDecision";
import { InvitationBoutique } from "@/components/InvitationBoutique";
import { JourneeDuGerant } from "@/components/JourneeDuGerant";
import { TetePage } from "@/components/patrons/Page";
import { useSession } from "@/lib/auth/session";
import { accueilDuRole } from "@/lib/domain/espaces";
import { formaterDate } from "@/lib/domain/format";
import { usePerimetre } from "@/lib/perimetre/perimetre";

/**
 * L’accueil du gérant : ce qu’il fait aujourd’hui.
 *
 * **Ce que cet écran a cessé d’être.** Il listait les espaces de la boutique —
 * Motos, Clients, Caisse, Réglages — c’est-à-dire exactement ce que la colonne
 * de gauche porte depuis la refonte de la coquille. Un écran d’accueil qui
 * répète la navigation ne fait rien : on le traverse sans le lire. Il répond
 * désormais à la seule question qui se pose en ouvrant le rideau — *qu’est-ce
 * que je fais maintenant* (`CAHIER-UI.md` §6.2).
 *
 * **Un seul geste en grand.** La vente est le geste quotidien ; tout le reste
 * est l’exception. Trois boutons de même taille auraient obligé à lire les
 * trois. Celui-là se vise sans lire.
 *
 * Le responsable, lui, n’a rien à faire ici : son accueil est la supervision
 * (D63). On l’y renvoie plutôt que d’entretenir deux pages d’accueil qui
 * diraient presque la même chose.
 *
 * Les chiffres du jour restent le sujet de S24. Ce que cet écran montre ne sont
 * pas des agrégats mais des lignes réelles : des tâches ouvrables, et les
 * écritures de la journée.
 */
export default function Accueil() {
  const session = useSession();
  const { perimetre } = usePerimetre();
  const router = useRouter();

  const role = session.statut === "connecte" ? session.utilisateur.role : null;
  const versSupervision = role !== null && accueilDuRole(role) !== "/dashboard";

  useEffect(() => {
    if (versSupervision) router.replace("/supervision");
  }, [versSupervision, router]);

  if (role === null) return null;
  if (versSupervision) {
    // Le temps que la redirection parte. Pas d’écran vide entre les deux.
    return <p className="text-encre-doux">Ouverture de la supervision…</p>;
  }

  /* « Toutes les boutiques » serait faux ici : un gérant sans attribution n'en
     voit aucune, il n'en voit pas toutes. Le sous-titre dit ce qui est. */
  const ou =
    perimetre.type === "boutique"
      ? perimetre.nom
      : perimetre.type === "aucune"
        ? "Aucune boutique attribuée"
        : "Toutes les boutiques";
  /* Sans boutique attribuée, il n'y a rien à lire — et surtout rien qu'on ait
     le droit de lire : une écoute sans périmètre est une lecture de toutes les
     boutiques, que les règles refusent à un gérant (D7). Elle poserait une
     erreur rouge sur son accueil pour toute réponse. `InvitationBoutique`
     explique déjà ce qui manque, et c'est le responsable qui peut y remédier. */
  const sansBoutique = perimetre.type === "aucune";

  return (
    <div>
      {/* Le sous-titre porte le lieu et le jour. C’est la seule chose qu’un
          gérant a besoin de vérifier d’un coup d’œil avant de saisir : où
          part ce que j’écris, et à quelle date il sera compté. */}
      <TetePage titre="Aujourd’hui" sousTitre={`${ou} · ${formaterDate(new Date())}`} />

      <InvitationBoutique />

      {!sansBoutique && (
        <>
          <GesteDuJour />

          {/* Deux colonnes sur un écran de comptoir, l’une sous l’autre sur un
              téléphone : ce qui reste à faire d’abord, ce qui est fait ensuite. */}
          <div className="mt-8 grid gap-8 lg:grid-cols-2">
            <CeQuiDemandeUneDecision titre="À faire aujourd’hui" />
            <JourneeDuGerant />
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Le geste du jour, et les trois qui l’accompagnent.
 *
 * Aucun de ces liens n’est réservé : un gérant les a tous. Ils ne sont donc pas
 * filtrés par capacité — ce qui l’est, ce sont les espaces, et la colonne de
 * gauche s’en charge déjà (D62).
 */
function GesteDuJour() {
  return (
    <div className="mt-6">
      {/* Le nuit, et non la plaque. C'était le plus grand aplat jaune du
          produit, sur l'écran que le gérant ouvre le premier — et le jaune ne
          dit que deux choses (D70). La maquette le pose sur le nuit
          (`socle.css:839`), ce qui fait du geste du jour un morceau de la
          coquille descendu dans la page : il se vise sans se lire.

          L'anneau de focus s'inverse avec le fond, comme partout où la
          coquille descend dans le travail (cf. l'écran de connexion). */}
      <Link
        href="/motos/ventes/nouvelle"
        className="flex items-center gap-4 rounded-carte bg-nuit px-6 py-5 text-coquille-encre hover:bg-nuit-3 [--color-focus-halo:var(--color-nuit)] [--color-focus-trait:#ffffff]"
      >
        {/* La tuile de 44 px des maquettes : elle donne à l'icône le poids que
            « le geste du jour » réclame, là où une icône nue flottait. */}
        <span
          aria-hidden="true"
          className="grid size-11 shrink-0 place-items-center rounded-champ bg-nuit-3"
        >
          <Plus className="size-6" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-ecran font-bold tracking-tight">
            Nouvelle vente
          </span>
          <span className="block text-corps text-coquille-doux">
            Client, moto, prix, mode de paiement, premier versement.
          </span>
        </span>
        <ArrowRight aria-hidden="true" className="ml-auto size-6 shrink-0" />
      </Link>

      <div className="mt-3 flex flex-wrap gap-2">
        <Link href="/motos/nouvelle" className="bouton bouton-neutre">
          <Store aria-hidden="true" className="size-4" />
          Faire entrer une moto
        </Link>
        <Link href="/motos/paiements" className="bouton bouton-neutre">
          <Coins aria-hidden="true" className="size-4" />
          Enregistrer un versement
        </Link>
        <Link href="/clients" className="bouton bouton-neutre">
          <UserPlus aria-hidden="true" className="size-4" />
          Nouveau client
        </Link>
      </div>
    </div>
  );
}
