"use client";

import { Check, ChevronRight, TriangleAlert } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { DernieresVentes } from "@/components/DernieresVentes";
import { PiecesEnAlerte } from "@/components/PiecesEnAlerte";
import { InvitationBoutique } from "@/components/InvitationBoutique";
import { ErreurDeLecture, EtatChargement } from "@/components/patrons/Etats";
import { TetePage } from "@/components/patrons/Page";
import { LIBELLE_METIER, reunirMetiers, type Metier } from "@/lib/domain/boutique";
import { ESPACES } from "@/lib/domain/espaces";
import { formaterMois, formaterMontant, formaterNombre } from "@/lib/domain/format";
import { CODE_ENTREPRISE, usePerimetre } from "@/lib/perimetre/perimetre";
import { useCeQuiAttend } from "@/lib/repositories/comptes";
import {
  PESEE_VIDE,
  additionnerPesees,
  usePeseeDesBoutiques,
  type PeseeBoutique,
} from "@/lib/repositories/pesee";

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

  /* Les trois chiffres de chaque carte (A2.3, `a2:93-97`), calculés sur les
     collections déjà écoutées — S24 n'ajoute aucune lecture ici, elle ajoute un
     `useMemo` sur ce qui est là. « Reste dû » est le total à ce jour de cette
     boutique, et non celui des ventes du mois : sur une carte qui sert à
     choisir où aller, c'est ce qui attend là-bas qui compte, pas ce que le mois
     a produit. L'écran des chiffres, lui, raisonne par mois. */
  /* La même garde que `PiecesEnAlerte` plus bas : le journal des mouvements se
     lit en entier (`SEUIL_MOUVEMENTS`), et le payer sur une entreprise qui ne
     vend que des motos serait une lecture sans lecteur. */
  const { pesee, chargement: peseeEnCours } = usePeseeDesBoutiques(
    toutesLesMetiers.includes("pieces"),
  );
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
        /* Plus d'`actions` ici (S54). « Voir les chiffres » et « Prix d'achat »
           menaient ailleurs depuis un écran dont le seul propos est de choisir
           où l'on travaille. Le commanditaire : « ne servent à rien, en plus
           l'espace doit être épuré. » Deux portes de sortie en tête d'un écran
           de choix dispersent le seul geste qu'on y fait. */
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
                /* Les mêmes trois faits, additionnés sur ce que la carte
                   représente. Sans eux elle était la seule à ne rien annoncer,
                   et la rangée se trouait — vu sur capture. Ce n'est pas un
                   agrégat que D63 repousse : c'est la somme de ce qui est
                   écrit juste à côté, et le lecteur peut la refaire. */
                metiers={toutesLesMetiers}
                chiffres={
                  peseeEnCours
                    ? null
                    : actives.reduce(
                        (somme, boutique) =>
                          additionnerPesees(somme, pesee.get(boutique.id) ?? PESEE_VIDE),
                        PESEE_VIDE,
                      )
                }
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
                  metiers={boutique.metiers}
                  /* `null` tant que le calcul n'est pas revenu : « aucun
                     dossier en retard » sur une base qui n'a pas répondu est
                     un mensonge rassurant, et c'est le pire des deux. */
                  retards={attentesEnCours ? null : (retardsParBoutique.get(boutique.id) ?? 0)}
                  chiffres={peseeEnCours ? null : (pesee.get(boutique.id) ?? PESEE_VIDE)}
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

      {/* « Ce qui demande une décision » a quitté cet écran (S54), à la
          demande du commanditaire, pour épurer le contenu. Il reste sur
          l'accueil du gérant, où il désigne un travail à faire aujourd'hui ;
          ici, au-dessus de trois cartes de boutiques, il redisait en liste ce
          que chaque carte annonce déjà par « Aucun dossier en retard ». Le
          composant n'est pas supprimé — un seul de ses deux usages l'est. */}

      {/* Avant ce qui vient de se passer : une rupture de stock est une
          décision à prendre, pas une nouvelle. La carte s'efface d'elle-même
          quand il n'y a rien à réapprovisionner (S21).

          **Montée seulement si une boutique tient des pièces.** Elle ouvre deux
          écoutes, dont le journal entier des mouvements ; les payer sur une
          entreprise qui ne vend que des motos, pour n'afficher jamais rien,
          serait une lecture sans lecteur. */}
      {toutesLesMetiers.includes("pieces") && <PiecesEnAlerte className="mt-8" />}

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
  metiers,
  retards,
  chiffres,
}: {
  code: string;
  nom: string;
  dessous: string;
  href: string;
  choisir: () => void;
  /** Ce que la boutique vend : c'est ce qui décide des faits qu'elle montre. */
  metiers: readonly Metier[];
  /** Dossiers en retard dans cette boutique ; `null` : le calcul n’est pas revenu. */
  retards?: number | null;
  /** Ce que la boutique pèse ; `null` tant que le calcul n’est pas revenu. */
  chiffres?: PeseeBoutique | null;
}) {
  /* Une boutique sans métier déclaré n'est pas censée exister — le modèle en
     exige au moins un. Si la donnée est pourtant vide, on retombe sur les
     motos plutôt que d'afficher une carte muette. */
  const montrePieces = metiers.includes("pieces");
  const montreMotos = metiers.includes("motos") || !montrePieces;
  const deuxMetiers = montreMotos && montrePieces;
  const dossiersLisibles = montreMotos && retards !== null && retards !== undefined;

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

      {/* Les trois faits de la maquette (`a2:93-97`), **par métier**. En `dl`
          parce que ce sont des couples intitulé/valeur, et un lecteur d'écran
          les annonce alors par paires au lieu d'égrener six fragments.

          Une boutique ne montre que les faits de ce qu'elle vend : les trois
          chiffres motos sur une boutique de pièces valaient `0 / 0 / —`, ce
          qui n'est pas un chiffre bas mais une question mal posée (S47). Celle
          qui tiendrait les deux métiers les montre tous les deux — le modèle
          porte un tableau, pas une valeur (D62), et cette règle n'a pas de cas
          particulier. Les intitulés de groupe ne paraissent alors que s'il y a
          deux groupes : au-dessus d'une liste seule, ils répéteraient le
          métier déjà écrit sous le nom. */}
      {chiffres && montreMotos && (
        <dl className="grid gap-1 text-corps">
          {deuxMetiers && <Groupe>Motos</Groupe>}
          <Fait titre="Motos en stock" valeur={formaterNombre(chiffres.motos.enStock)} />
          <Fait titre="Ventes ce mois" valeur={formaterNombre(chiffres.motos.ventesDuMois)} />
          <Fait
            titre="Reste dû"
            valeur={chiffres.motos.resteDu === 0 ? "—" : formaterMontant(chiffres.motos.resteDu)}
          />
        </dl>
      )}

      {chiffres && montrePieces && (
        <dl className="grid gap-1 text-corps">
          {deuxMetiers && <Groupe>Pièces détachées</Groupe>}
          {/* Le nombre de références, pas la somme des quantités : additionner
              200 vis et 3 moteurs donne un chiffre que personne ne sait lire. */}
          <Fait titre="Références en stock" valeur={formaterNombre(chiffres.pieces.references)} />
          <Fait titre="Ventes ce mois" valeur={formaterNombre(chiffres.pieces.ventesDuMois)} />
          {/* « Recette du mois » et non « Reste dû » : une pièce se paie au
              comptoir, il n'y a ni crédit ni versement à attendre (S21). */}
          <Fait
            titre="Recette du mois"
            valeur={
              chiffres.pieces.recetteDuMois === 0
                ? "—"
                : formaterMontant(chiffres.pieces.recetteDuMois)
            }
          />
          {/* **La marge, et pas seulement la recette.** Une recette dit que le
              commerce bouge ; la marge dit s'il gagne. Le tiret couvre deux cas
              qu'on ne cherche pas à distinguer ici : aucune vente, et des
              ventes dont aucune pièce ne portait son prix d'achat. Dans les
              deux, il n'y a rien à affirmer.

              Visible du gérant, à l'inverse de la marge d'une moto (D2) : pour
              les pièces, celui qui vend fixe le coût. */}
          <Fait
            titre="Marge du mois"
            valeur={
              chiffres.pieces.margeDuMois === null
                ? "—"
                : formaterMontant(chiffres.pieces.margeDuMois)
            }
          />
        </dl>
      )}

      {/* La ligne d'alerte de la maquette (`a2:97, 107, 117`). Elle répond à la
          question qui fait ouvrir cet écran : *laquelle je regarde d'abord*.
          Le calme s'écrit aussi — « aucun dossier en retard » est une réponse,
          et une carte muette laisse croire que la question n'a pas été posée.
          Jamais la couleur seule : les mots portent le sens (DESIGN.md §5).

          Un dossier — quittance, CMC, carte grise — n'existe que pour une
          moto. La boutique de pièces a son propre sujet d'alerte, et c'est la
          même question posée à son métier : qu'est-ce qui demande une décision
          ici ? Une rupture de stock. */}
      {/* Le filet et la marge ne se posent que s'il y a une ligne à séparer :
          pendant le chargement, les deux alertes manquent, et un cadre vide se
          lirait comme une information absente plutôt qu'en attente. */}
      {(dossiersLisibles || (montrePieces && chiffres)) && (
        <span className="mt-auto grid gap-1.5 border-t border-bord pt-3">
          {dossiersLisibles && (
            <Alerte
              nombre={retards}
              calme="Aucun dossier en retard"
              un="1 dossier en retard"
              plusieurs={`${retards} dossiers en retard`}
            />
          )}
          {montrePieces && chiffres && (
            <Alerte
              nombre={chiffres.pieces.aReapprovisionner}
              calme="Aucune pièce à réapprovisionner"
              un="1 pièce à réapprovisionner"
              plusieurs={`${chiffres.pieces.aReapprovisionner} pièces à réapprovisionner`}
            />
          )}
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
/**
 * L'intitulé d'un groupe de faits, quand la carte en porte deux.
 *
 * Seul cas où il paraît : au-dessus d'une liste unique il répéterait le métier
 * déjà écrit sous le nom de la boutique.
 */
function Groupe({ children }: { children: ReactNode }) {
  return (
    <p className="text-legende font-bold tracking-[0.07em] text-encre-doux uppercase">{children}</p>
  );
}

/**
 * Une ligne d'alerte, alarmée ou calme.
 *
 * Les trois libellés sont donnés par l'appelant plutôt que dérivés d'un nom
 * commun : « 1 dossier en retard » et « 1 pièce à réapprovisionner » ne se
 * fabriquent pas du même moule, et un gabarit qui les couvrirait toutes deux
 * coûterait plus à lire que les trois chaînes écrites.
 */
function Alerte({
  nombre,
  calme,
  un,
  plusieurs,
}: {
  nombre: number;
  calme: string;
  un: string;
  plusieurs: string;
}) {
  return (
    <span
      className={`flex items-center gap-1.5 text-legende font-semibold ${
        nombre > 0 ? "text-alerte" : "text-encre-doux"
      }`}
    >
      {nombre > 0 ? (
        <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
      ) : (
        <Check aria-hidden="true" className="size-4 shrink-0" />
      )}
      {nombre === 0 ? calme : nombre === 1 ? un : plusieurs}
    </span>
  );
}

function Fait({ titre, valeur }: { titre: string; valeur: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-encre-doux">{titre}</dt>
      <dd className="font-code tabular-nums text-encre">{valeur}</dd>
    </div>
  );
}

function destination(metiers: readonly Metier[]): string {
  return metiers.length > 0 && !metiers.includes("motos")
    ? ESPACES.pieces.href
    : ESPACES.motos.href;
}
