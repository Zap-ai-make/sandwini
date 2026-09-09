"use client";

import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";
import { ErreurDeLecture, EtatChargement } from "@/components/patrons/Etats";
import { Tableau, type Colonne } from "@/components/patrons/Tableau";
import { formaterMontant } from "@/lib/domain/format";
import { useCeQuiAttend, type Attente } from "@/lib/repositories/comptes";

/**
 * Ce qui demande une décision, toutes boutiques réunies — le tableau d’A2.
 *
 * La supervision répond d’abord à « laquelle je regarde ». Une fois ce choix
 * fait, la deuxième question du responsable n’est pas « combien ai-je vendu »
 * — c’est « qu’est-ce qui traîne ». Cette section-là y répond avec des lignes
 * réelles, sur lesquelles on clique, et non avec des compteurs.
 *
 * **Un tableau, et non une liste.** C’est un arbitrage : il se compare d’une
 * ligne à l’autre — quelle boutique, depuis combien de jours, pour combien.
 * Une liste de phrases oblige à relire chaque ligne en entier pour répondre à
 * « laquelle est la pire », ce qui est exactement la question posée ici. La
 * maquette `a2:126` range donc en six colonnes, et l’accueil du gérant, qui ne
 * pose pas la même question, garde sa file de phrases (`JourneeDuGerant` et
 * `AFaireAujourdhui`).
 *
 * **La colonne « Boutique » reste ici.** La décision du 9 septembre l’a retirée
 * d’A6, A7 et A8, où les trois premières lettres du numéro de pièce la disent
 * déjà sur chaque ligne. A2 est le seul écran où l’on compare les boutiques
 * *entre elles* — c’est même son sujet —, et sa maquette la porte (`a2:131`).
 *
 * **Pourquoi ce n’est pas le tableau de bord que D63 repousse.** D63 refuse les
 * cartes de chiffres agrégés tant que S24 n’existe pas, parce qu’un indicateur
 * à zéro ment sur l’état du commerce. Ici il n’y a aucun agrégat : ce sont des
 * dossiers et des ventes nommés, chacun ouvrable, et quand il n’y en a aucun
 * l’écran l’écrit en toutes lettres au lieu d’afficher « 0 ».
 *
 * **Deux sortes de retard, et pas une troisième.** Le dossier en retard : un
 * prestataire a annoncé une date, elle est passée. La tranche inactive : aucun
 * versement depuis le seuil réglé. Les deux sont des notions définies, testées,
 * et réglées ailleurs dans le produit. La maquette montrait une troisième
 * ligne, « crédit échu » : elle n’existe pas — une vente à crédit n’a pas de
 * date d’échéance dans ce produit, et en fixer une au bout de N jours serait
 * inventer une règle de gestion qui revient au responsable.
 */
const MAX_LIGNES = 6;

export function CeQuiDemandeUneDecision({ className }: { className?: string } = {}) {
  const { lignes, chargement, erreur } = useCeQuiAttend();

  const colonnes: Colonne<Attente>[] = [
    {
      cle: "numero",
      titre: "Pièce",
      principal: true,
      rendu: (ligne) => (
        <Link href={ligne.href} className="plaque-code text-encre underline-offset-2 hover:underline">
          {ligne.numero}
        </Link>
      ),
    },
    {
      /* Le seul écran où l'on compare les boutiques entre elles — c'est son
         sujet. La décision qui l'a retirée d'A6, A7 et A8 ne visait pas A2,
         dont la maquette la porte. */
      cle: "boutique",
      titre: "Boutique",
      rendu: (ligne) => (
        <span className="plaque-code rounded-plaque border border-plaque-bord bg-plaque px-1.5 py-0.5 text-legende leading-none text-encre-fixe">
          {ligne.boutiqueId}
        </span>
      ),
    },
    { cle: "client", titre: "Client", principal: true, rendu: (ligne) => ligne.client },
    {
      cle: "quoi",
      titre: "Ce qui bloque",
      rendu: (ligne) => (
        <>
          <span className="pastille pastille-retard">{ligne.quoi}</span>
          {ligne.precision && (
            <span className="ml-2 text-corps text-encre-doux">{ligne.precision}</span>
          )}
        </>
      ),
    },
    {
      /* En jours, comme la maquette : « annoncée pour le 12/07/26 » demande de
         soustraire deux dates de tête pour savoir si c'est grave. */
      cle: "depuis",
      titre: "Depuis",
      chiffre: true,
      rendu: (ligne) =>
        ligne.depuis === null ? "—" : ligne.depuis <= 1 ? "1 jour" : `${ligne.depuis} jours`,
    },
    {
      cle: "montant",
      titre: "Montant",
      chiffre: true,
      rendu: (ligne) => (ligne.montant === null ? "—" : formaterMontant(ligne.montant)),
    },
  ];

  return (
    <section className={className ?? ""}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-bloc font-bold tracking-tight text-encre">Ce qui demande une décision</h2>
        <Link href="/motos/dossiers" className="bouton bouton-discret">
          Tous les dossiers
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </div>

      {erreur ? (
        <ErreurDeLecture titre="Ce qui attend n’a pas pu être lu">
          {erreur} Les dossiers se traitent quand même depuis leur propre écran.
        </ErreurDeLecture>
      ) : chargement ? (
        <EtatChargement>Lecture des dossiers et des tranches…</EtatChargement>
      ) : lignes.length === 0 ? (
        /* Pas un compteur à zéro : une phrase vraie. « Rien n'attend » est une
           information utile au responsable ; « 0 » ne l'est pas (D63). */
        <p className="flex items-center gap-3 text-encre-doux">
          <Check aria-hidden="true" className="size-4 shrink-0 text-solde" />
          Rien n’attend de décision&nbsp;: aucun document en retard, aucune tranche inactive.
        </p>
      ) : (
        <>
          <div className="cadre cadre-tableau">
            <Tableau
              legende="Dossiers et tranches qui dépassent le délai, toutes boutiques"
              colonnes={colonnes}
              lignes={lignes.slice(0, MAX_LIGNES)}
              cleDe={(ligne) => ligne.cle}
              enRetard={() => true}
            />
          </div>
          {lignes.length > MAX_LIGNES && (
            <p className="mt-2 text-corps text-encre-doux">
              {lignes.length - MAX_LIGNES} autres attendent aussi. Les dossiers se traitent dans{" "}
              <Link href="/motos/dossiers" className="underline">
                Dossiers en attente
              </Link>
              , les tranches dans{" "}
              <Link href="/motos/paiements" className="underline">
                Paiements
              </Link>
              .
            </p>
          )}
        </>
      )}
    </section>
  );
}

/**
 * À faire aujourd’hui — la file du gérant.
 *
 * Même calcul, autre forme, et c’est la maquette `a3:105` qui l’impose. Le
 * gérant ne compare pas ses dossiers entre eux : il les vide. Une file se lit
 * donc en phrases — l’état, ce qu’il y a à faire, et le bouton qui l’ouvre —
 * là où le responsable a besoin de colonnes pour arbitrer.
 *
 * Le comptage en tête dit combien il en reste, ce qui est l’information qu’on
 * cherche en ouvrant le rideau.
 */
export function AFaireAujourdhui({ className }: { className?: string } = {}) {
  const { lignes, chargement, erreur } = useCeQuiAttend();

  return (
    <section className={className ?? ""}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-bloc font-bold tracking-tight text-encre">À faire aujourd’hui</h2>
        {!chargement && !erreur && lignes.length > 0 && (
          <span className="text-corps text-encre-doux">
            {lignes.length === 1 ? "1 point" : `${lignes.length} points`}
          </span>
        )}
      </div>

      {erreur ? (
        <ErreurDeLecture titre="Ce qui attend n’a pas pu être lu">
          {erreur} Les dossiers se traitent quand même depuis leur propre écran.
        </ErreurDeLecture>
      ) : chargement ? (
        <EtatChargement>Lecture des dossiers et des tranches…</EtatChargement>
      ) : lignes.length === 0 ? (
        <p className="flex items-center gap-3 text-encre-doux">
          <Check aria-hidden="true" className="size-4 shrink-0 text-solde" />
          Rien n’attend&nbsp;: aucun document en retard, aucune tranche inactive.
        </p>
      ) : (
        <ul className="cadre cadre-liste">
          {lignes.map((ligne) => (
            <li key={ligne.cle} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="pastille pastille-retard shrink-0">{ligne.quoi}</span>
              {/* Deux lignes plutôt qu'une phrase qui s'enroule : le nom et
                  la pièce d'abord — ce qu'on cherche du regard —, le détail
                  en dessous. Vu sur capture : à trois colonnes de 250 px, la
                  phrase unique se cassait en trois morceaux enchevêtrés. */}
              <span className="min-w-0 flex-1 text-encre">
                <span className="block">
                  <span className="font-medium">{ligne.client}</span>{" "}
                  {/* Insécable : « FMZ-2609-0042 » se cassait après « FMZ- », et un
                      numéro coupé ne se dicte plus au téléphone. Même correctif
                      qu'en A6, A7 et A8 (S29). */}
                  <span className="plaque-code whitespace-nowrap text-encre-doux">
                    {ligne.numero}
                  </span>
                </span>
                <span className="block text-corps text-encre-doux">
                  {[
                    ligne.precision,
                    ligne.depuis === null
                      ? null
                      : `depuis ${ligne.depuis <= 1 ? "1 jour" : `${ligne.depuis} jours`}`,
                    ligne.montant === null ? null : `reste ${formaterMontant(ligne.montant)}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              <Link href={ligne.href} className="bouton bouton-discret shrink-0">
                Ouvrir
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
