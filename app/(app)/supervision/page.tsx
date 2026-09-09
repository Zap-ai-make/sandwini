"use client";

import { Check, ChevronRight, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { CeQuiDemandeUneDecision } from "@/components/CeQuiDemandeUneDecision";
import { DernieresVentes } from "@/components/DernieresVentes";
import { InvitationBoutique } from "@/components/InvitationBoutique";
import { ErreurDeLecture, EtatChargement } from "@/components/patrons/Etats";
import { TetePage } from "@/components/patrons/Page";
import { LIBELLE_METIER, reunirMetiers, type Metier } from "@/lib/domain/boutique";
import { ESPACES } from "@/lib/domain/espaces";
import { formaterMois } from "@/lib/domain/format";
import { CODE_ENTREPRISE, usePerimetre } from "@/lib/perimetre/perimetre";
import { useCeQuiAttend } from "@/lib/repositories/comptes";

/**
 * L’entrée de la supervision — le troisième espace (`prompt.md` §1).
 *
 * Le responsable pilote plusieurs boutiques qu’il ne peut pas toutes avoir sous
 * les yeux : sa première question n’est pas « combien ai-je vendu », c’est
 * « laquelle je regarde ». L’écran répond à celle-là, et ouvre la boutique
 * choisie sur son propre espace.
 *
 * **Le choix d’abord, l’état ensuite.** Les boutiques sont des cartes qu’on
 * balaie d’un regard, et non plus une liste à lire ligne à ligne : à trois
 * boutiques la différence est mince, à dix elle ne l’est plus. Vient ensuite
 * « ce qui demande une décision » — des dossiers et des tranches nommés, pas
 * des compteurs.
 *
 * Les chiffres — ventes du jour, encaissements, totaux — restent le sujet de
 * S24. Les afficher maintenant produirait des cartes à zéro, c’est-à-dire un
 * tableau de bord qui ment (D63).
 */
export default function Supervision() {
  const { perimetre, boutiques, chargement, erreur, choisir } = usePerimetre();
  const actives = boutiques.filter((boutique) => boutique.actif);
  const fermees = boutiques.length - actives.length;
  const toutesLesMetiers = reunirMetiers(actives);

  /* Le même calcul que le tableau du dessous, réparti par boutique (D73). Les
     lignes sont déjà celles des dossiers *en retard* — la carte n'invente
     aucun agrégat : elle compte des dossiers nommés, ouvrables, que le tableau
     de la section suivante liste un par un. C'est ce qui la sépare de la carte
     de tableau de bord que D63 repousse jusqu'à S24. */
  const { lignes, chargement: attentesEnCours } = useCeQuiAttend();
  const retardsParBoutique = new Map<string, number>();
  for (const ligne of lignes) {
    if (ligne.sorte !== "dossier") continue;
    retardsParBoutique.set(ligne.boutiqueId, (retardsParBoutique.get(ligne.boutiqueId) ?? 0) + 1);
  }

  return (
    <div>
      <TetePage
        surTitre={`${perimetre.type === "boutique" ? perimetre.nom : "Toutes les boutiques"} · ${formaterMois(new Date())}`}
        titre="Supervision"
        /* Une phrase, celle de la maquette (`a2:81`). La seconde — « ce que
           vous ouvrez s'inscrit dans le bandeau… » — expliquait un mécanisme
           que le bandeau montre lui-même, deux centimètres plus haut, et
           poussait la tête d'écran à trois lignes. C'est l'accessoire qu'on
           retire avant de sortir (`DESIGN.md` §14). */
        sousTitre="Choisissez une boutique pour y travailler, ou restez ici pour voir l’ensemble."
      />

      <InvitationBoutique />

      {erreur && (
        <ErreurDeLecture
          titre="La liste des boutiques n’a pas pu être lue"
          sortie={{ href: "/parametres/boutiques", libelle: "Gérer les boutiques" }}
        >
          {erreur} Sans elle, la supervision ne sait pas quoi comparer. Les écrans d’une boutique
          déjà ouverte restent accessibles.
        </ErreurDeLecture>
      )}

      {chargement ? (
        <EtatChargement className="mt-6">Chargement des boutiques…</EtatChargement>
      ) : actives.length > 0 ? (
        <nav aria-label="Boutiques" className="mt-6">
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {/* L’entreprise entière vient en premier : c’est la vue par défaut du
                responsable, et choisir une boutique est le geste qui rétrécit. La
                plaque porte le code de l’entreprise, comme dans le bandeau. */}
            <li>
              <CarteBoutique
                code={CODE_ENTREPRISE}
                nom="Toutes les boutiques"
                dessous={
                  actives.length === 1
                    ? "Une seule boutique pour l’instant"
                    : `Stock, ventes et paiements des ${actives.length} boutiques réunis`
                }
                href={destination(toutesLesMetiers)}
                choisir={() => choisir(null)}
              />
            </li>
            {actives.map((boutique) => (
              <li key={boutique.id}>
                <CarteBoutique
                  code={boutique.code}
                  nom={boutique.nom}
                  /* Le métier est écrit, jamais porté par la seule couleur de
                     la plaque (DESIGN.md §5). */
                  dessous={boutique.metiers.map((metier) => LIBELLE_METIER[metier]).join(" et ")}
                  href={destination(boutique.metiers)}
                  choisir={() => choisir(boutique.id)}
                  /* `null` tant que le calcul n'est pas revenu : « aucun
                     dossier en retard » sur une base qui n'a pas répondu est
                     un mensonge rassurant, et c'est le pire des deux. */
                  retards={attentesEnCours ? null : (retardsParBoutique.get(boutique.id) ?? 0)}
                />
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      {fermees > 0 && (
        <p className="mt-3 text-sm text-encre-doux">
          {fermees === 1
            ? "Une boutique fermée n’apparaît pas ici ; elle reste lisible dans les réglages."
            : `${fermees} boutiques fermées n’apparaissent pas ici ; elles restent lisibles dans les réglages.`}
        </p>
      )}

      <CeQuiDemandeUneDecision className="mt-8" />

      {/* Ce qui attend d'abord, ce qui vient de se passer ensuite (`a2:184`).
          L'ordre est celui de la maquette et il n'est pas indifférent : on
          ouvre la supervision pour décider, pas pour se féliciter. */}
      <DernieresVentes className="mt-8" />
    </div>
  );
}

/**
 * Une boutique, telle qu’on la choisit.
 *
 * Toute la carte est le lien, pas seulement son titre : c’est une cible de la
 * taille du doigt, et personne n’a à viser trois mots.
 */
function CarteBoutique({
  code,
  nom,
  dessous,
  href,
  choisir,
  retards,
}: {
  code: string;
  nom: string;
  dessous: string;
  href: string;
  choisir: () => void;
  /** Dossiers en retard dans cette boutique ; `null` : le calcul n’est pas revenu. */
  retards?: number | null;
}) {
  return (
    <Link
      href={href}
      onClick={choisir}
      className="cadre flex h-full flex-col gap-3 p-4 hover:border-bord-fort hover:bg-survol focus-visible:bg-survol"
    >
      <span className="flex items-start gap-3">
        <span className="plaque-code flex h-8 shrink-0 items-center rounded-plaque border border-plaque-bord bg-plaque px-2 text-sm leading-none text-encre-fixe">
          {code}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-encre">{nom}</span>
          <span className="block text-corps text-encre-doux">{dessous}</span>
        </span>
        <ChevronRight aria-hidden="true" className="mt-1 size-4 shrink-0 text-encre-doux" />
      </span>

      {/* La ligne d'alerte de la maquette (`a2:97, 107, 117`). Elle répond à la
          question qui fait ouvrir cet écran : *laquelle je regarde d'abord*.
          Le calme s'écrit aussi — « aucun dossier en retard » est une réponse,
          et une carte muette laisse croire que la question n'a pas été posée.
          Jamais la couleur seule : les mots portent le sens (DESIGN.md §5). */}
      {retards !== null && retards !== undefined && (
        <span
          className={`mt-auto flex items-center gap-1.5 border-t border-bord pt-3 text-legende font-semibold ${
            retards > 0 ? "text-alerte" : "text-encre-doux"
          }`}
        >
          {retards > 0 ? (
            <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
          ) : (
            <Check aria-hidden="true" className="size-4 shrink-0" />
          )}
          {retards === 0
            ? "Aucun dossier en retard"
            : retards === 1
              ? "1 dossier en retard"
              : `${retards} dossiers en retard`}
        </span>
      )}
    </Link>
  );
}

/**
 * L’espace sur lequel s’ouvre un périmètre : celui de son métier.
 *
 * Une boutique de pièces ouvre sur les pièces, tout le reste sur les motos.
 * Vaut aussi pour l’entreprise entière, dont les métiers sont la réunion des
 * siens : la garde d’espace refuserait `/motos` à une entreprise qui ne
 * vendrait que des pièces.
 */
function destination(metiers: readonly Metier[]): string {
  return metiers.length > 0 && !metiers.includes("motos")
    ? ESPACES.pieces.href
    : ESPACES.motos.href;
}
