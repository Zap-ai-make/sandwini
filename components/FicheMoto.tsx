"use client";

import { ArrowLeft, Lock, LoaderCircle, Truck, Wallet } from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";
import { DeplacerMotoModal } from "@/components/DeplacerMotoModal";
import { PapiersEnMain } from "@/components/PapiersEnMain";
import { PapiersMoto } from "@/components/PapiersMoto";
import { PoserCoutModal } from "@/components/PoserCoutModal";
import { EtatChargement, EtatErreur } from "@/components/patrons/Etats";
import { useSession } from "@/lib/auth/session";
import { formaterDate, formaterMontant } from "@/lib/domain/format";
import { LIBELLE_ETAT, LIBELLE_STATUT, type Moto } from "@/lib/domain/moto";
import { destinationsPossibles, raisonDeNePasPartir, type Transfert } from "@/lib/domain/transfert";
import type { Boutique } from "@/lib/domain/boutique";
import { useAbonnement } from "@/lib/repositories/abonnement";
import { ecouterBoutiques } from "@/lib/repositories/boutiques";
import { useCatalogue, type Catalogue } from "@/lib/repositories/catalogue";
import { ABSENT, ecouterCoutMoto, ecouterMoto, type LectureCout } from "@/lib/repositories/motos";
import { ecouterArriveeDeLaMoto } from "@/lib/repositories/transferts";

/**
 * La fiche d'une moto.
 *
 * Deux lectures pour un même objet, et c'est le cœur du modèle : la moto, que
 * le gérant lit pour la vendre, et son coût, que seul le responsable peut lire.
 * L'écran ne cache pas cette coupure — il la nomme, pour qu'un gérant qui ne
 * voit pas les montants comprenne que ce n'est pas une panne (D2).
 *
 * Ce n'est pas une route à part mais un panneau de `/motos`, ouvert par le
 * paramètre `?moto=`. Une route `/motos/[id]` obligeait le navigateur à
 * demander un document que le service worker n'avait jamais vu : hors ligne,
 * la fiche d'une moto qu'on venait de saisir tombait sur la page de repli
 * (D39).
 */
export function FicheMoto({ id }: { id: string }) {
  const session = useSession();
  const catalogue = useCatalogue();

  const souscrire = useCallback(
    (auChangement: (moto: Moto | null) => void, enErreur: (cause: unknown) => void) =>
      ecouterMoto(id, auChangement, enErreur),
    [id],
  );
  const { valeur: moto, erreur } = useAbonnement(souscrire, "Cette moto n’a pas pu être chargée.");

  const estResponsable = session.statut === "connecte" && session.utilisateur.role === "responsable";

  return (
    <div>
      <Link
        href="/motos"
        className="inline-flex items-center gap-2 text-sm text-encre-doux hover:text-encre"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Stock
      </Link>

      {erreur ? (
        <EtatErreur message={erreur} className="mt-6" />
      ) : moto === null ? (
        <EtatChargement className="mt-6">Chargement de la fiche…</EtatChargement>
      ) : (
        <>
          {/* Le chassis n'est pas un code boutique : il perd le fond jaune,
              comme il l'avait perdu dans le tableau du stock en S29 (D70). Ici
              « plaque » désigne la palette, pas l'immatriculation — c'est le
              septième emploi du mot que D107 nomme, et il vit juste à côté du
              vrai.

              **`block` et non `inline-block`** : inline, il se collait au lien
              « Stock » juste au-dessus et l'écran affichait « StockLC6TRA… ».
              Le `mt-3` disait pourtant qu'il était censé occuper sa ligne. Vu à
              l'écran en regardant S17, corrigé au passage. */}
          <span className="plaque-code mt-3 block text-sm text-encre-doux">
            {moto.numeroChassis}
            {/* **La plaque à côté du châssis, et non à sa place.** Les deux
                servent : la plaque désigne la moto de loin, le châssis se lit
                accroupi devant le cadre. C'est déjà le traitement de
                l'inventaire. Elle a quitté le bloc « Papiers en main » le
                16 octobre 2026 : celui-ci ne paraît plus que sur les motos sans
                lot, alors qu'une plaque se lit sur toutes.

                Elle n'apparaît qu'une fois connue : sur chaque moto neuve du
                parc, une mention vide ferait croire à un renseignement oublié,
                alors qu'elle n'arrive qu'au retour de la carte grise. */}
            {moto.plaque !== null && (
              <span className="ml-3 text-encre">{moto.plaque}</span>
            )}
          </span>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-encre">
            {catalogue.nomMarque(moto.marqueId)} {catalogue.nomModele(moto.modeleId)}
          </h1>

          <dl className="mt-6 cadre cadre-liste">
            <Ligne titre="État" valeur={LIBELLE_ETAT[moto.etat]} />
            <Ligne titre="Statut" valeur={LIBELLE_STATUT[moto.statut]} />
            <Ligne titre="Boutique" valeur={moto.boutiqueId} code />
            <Ligne titre="Provenance" valeur={catalogue.nomProvenance(moto.provenanceId)} />
            {moto.couleur && <Ligne titre="Couleur" valeur={moto.couleur} />}
            {moto.annee !== null && <Ligne titre="Année" valeur={String(moto.annee)} />}
            {moto.numeroMoteur && <Ligne titre="Numéro de moteur" valeur={moto.numeroMoteur} code />}
            <Ligne
              titre="Entrée en stock"
              valeur={moto.dateEntree ? formaterDate(moto.dateEntree) : "—"}
            />
            {moto.prixVenteConseille !== null && (
              <Ligne
                titre="Prix de vente conseillé"
                valeur={formaterMontant(moto.prixVenteConseille)}
              />
            )}
          </dl>

          {/* **« Notes du vendeur » et non « Papiers fournis »** (S53). Le mot
              « papiers » nu le faisait confondre avec les documents du dossier,
              qui sont juste au-dessus et n'ont rien à voir : ceux-ci se suivent
              et se remettent, celui-là est du texte libre tapé à l'entrée d'une
              occasion. Un même mot pour deux choses était l'une des sept
              confusions relevées par la spec. */}
          {moto.papiersFournis.length > 0 && (
            <section className="mt-6">
              <h2 className="text-sm font-semibold tracking-wide text-encre-doux uppercase">
                Notes du vendeur
              </h2>
              <ul className="mt-2 cadre cadre-liste">
                {moto.papiersFournis.map((papier) => (
                  <li key={papier} className="px-4 py-2.5 text-encre">
                    {papier}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* **Seulement si la moto n'a pas de lot** (16 octobre 2026). La
              quittance et le CMC se cochent sur l'inspection du lot, qui est le
              geste réel. Une moto entrée à l'unité n'apparaît dans aucune
              inspection : sans ce bloc, ses papiers n'auraient plus aucun
              endroit où se cocher, et son reçu ne pourrait jamais dire que le
              client les a emportés. */}
          {moto.arrivageId === null && <PapiersEnMain moto={moto} />}

          <PapiersMoto moto={moto} />

          <Deplacement moto={moto} estResponsable={estResponsable} />

          {estResponsable ? <Cout moto={moto} catalogue={catalogue} /> : <CoutMasque />}
        </>
      )}
    </div>
  );
}

/**
 * Le déplacement entre boutiques, et d'où la moto vient (S17).
 *
 * **Deux choses dans un seul bloc, et c'est volontaire** : « d'où elle vient »
 * et « où elle peut aller » sont la même question posée dans les deux sens, et
 * les séparer aurait mis deux encadrés sur une fiche qui en a déjà quatre.
 *
 * Le geste n'est jamais éteint en silence : quand il est impossible, la raison
 * est écrite (`DESIGN.md` §10). Elle vient du domaine, pas d'une condition
 * recopiée ici.
 */
function Deplacement({ moto, estResponsable }: { moto: Moto; estResponsable: boolean }) {
  const session = useSession();
  const [ouvert, setOuvert] = useState(false);

  /* **La liste vient d'ici, pas du périmètre.** `usePerimetre` ne donne au
     gérant que sa propre boutique, et c'est juste : le périmètre dit ce qu'il
     peut regarder. Les destinations disent où il peut envoyer — deux questions
     différentes, et S17 n'a ouvert que la seconde. */
  const souscrireBoutiques = useCallback(
    (auChangement: (liste: Boutique[]) => void, enErreur: (cause: unknown) => void) =>
      ecouterBoutiques(auChangement, enErreur),
    [],
  );
  const { valeur: toutesBoutiques } = useAbonnement(
    souscrireBoutiques,
    "La liste des boutiques n’a pas pu être lue.",
  );
  const chargementBoutiques = toutesBoutiques === null;
  const boutiques = toutesBoutiques ?? [];

  const souscrire = useCallback(
    (auChangement: (arrivee: Transfert | null) => void, enErreur: (cause: unknown) => void) =>
      ecouterArriveeDeLaMoto(moto.id, moto.boutiqueId, auChangement, enErreur),
    [moto.id, moto.boutiqueId],
  );
  /* L'erreur est nommée mais pas affichée : une provenance qu'on n'a pas pu
     lire ne vaut pas un encadré rouge sur une fiche qui, elle, s'est chargée.
     La moto reste lisible et déplaçable sans cette ligne. */
  const { valeur: arrivee } = useAbonnement(
    souscrire,
    "La provenance de cette moto n’a pas pu être lue.",
  );

  const destinations = destinationsPossibles(boutiques, moto.boutiqueId);
  const empechement = raisonDeNePasPartir(moto, destinations);

  if (session.statut !== "connecte") return null;
  const auteur = { uid: session.utilisateur.uid, nom: session.utilisateur.nom };

  return (
    <section className="mt-6">
      <h2 className="text-sm font-semibold tracking-wide text-encre-doux uppercase">
        Déplacement entre boutiques
      </h2>

      <div className="mt-2 cadre p-4 sm:p-5">
        {arrivee && (
          <p className="text-corps text-encre">
            Venue de <span className="plaque-code">{arrivee.deBoutiqueId}</span>
            {arrivee.date ? ` le ${formaterDate(arrivee.date)}` : " à l’instant"}
            {arrivee.auteur && `, par ${arrivee.auteur}`}.
            {arrivee.motif && <span className="text-encre-doux"> {arrivee.motif}</span>}
          </p>
        )}

        {/* **Trois états, jamais deux.** Tant que la liste des boutiques n'est pas
            lue, elle est vide — et `raisonDeNePasPartir` dirait alors « aucune
            autre boutique ouverte », ce qui est faux et envoie en déclarer une.
            Le même piège a déjà coûté deux fois dans ce dépôt : un écran qui
            affirme pendant qu'il lit. */}
        {chargementBoutiques ? (
          <EtatChargement className={arrivee ? "mt-2" : ""}>
            Lecture des boutiques…
          </EtatChargement>
        ) : empechement ? (
          <p className={`text-corps text-encre-doux ${arrivee ? "mt-2" : ""}`}>{empechement}</p>
        ) : (
          <button
            type="button"
            onClick={() => setOuvert(true)}
            className={`bouton bouton-neutre ${arrivee ? "mt-3" : ""}`}
          >
            <Truck aria-hidden="true" className="size-4" />
            Déplacer vers une autre boutique
          </button>
        )}
      </div>

      {ouvert && (
        <DeplacerMotoModal
          moto={moto}
          boutiques={boutiques}
          auteur={auteur}
          voitLesCouts={estResponsable}
          ouvert
          onFermer={() => setOuvert(false)}
        />
      )}
    </section>
  );
}

function Ligne({ titre, valeur, code = false }: { titre: string; valeur: string; code?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-3">
      <dt className="text-sm text-encre-doux">{titre}</dt>
      <dd className={["text-right text-encre", code ? "plaque-code" : ""].join(" ")}>{valeur}</dd>
    </div>
  );
}

/**
 * Ce que le responsable voit, et lui seul.
 *
 * Le catalogue lui est passé plutôt que rappelé : `useCatalogue()` ouvre
 * quatre écoutes Firestore, et les rouvrir ici les doublait sur un écran qui
 * affiche pourtant les mêmes listes.
 */
/**
 * Le coût d'entrée — et, depuis S54, sa **saisie**.
 *
 * Ce bloc ne faisait qu'afficher ; poser un prix d'achat n'existait que sur
 * `/supervision/couts`, retiré à la demande du commanditaire. Sans ce geste
 * ici, plus aucune moto n'aurait pu recevoir son prix.
 *
 * **Trois états, et le troisième manquait.** « Absent » et « pas encore lu »
 * rendaient tous deux `null` : une moto sans prix d'achat affichait
 * « Chargement… » indéfiniment — sur celle-là même où il y avait à faire.
 * `ecouterCoutMoto` distingue désormais les deux (D82 : une absence n'est pas
 * un zéro, et pas davantage une attente).
 */
function Cout({ moto, catalogue }: { moto: Moto; catalogue: Catalogue }) {
  const id = moto.id;
  const [ouvert, setOuvert] = useState(false);
  const souscrire = useCallback(
    (auChangement: (cout: LectureCout) => void, enErreur: (cause: unknown) => void) =>
      ecouterCoutMoto(id, auChangement, enErreur),
    [id],
  );
  const { valeur: lecture, erreur } = useAbonnement(souscrire, "Le coût n’a pas pu être chargé.");
  const cout = lecture === null || lecture === ABSENT ? null : lecture;

  return (
    <section className="mt-6">
      <h2 className="text-sm font-semibold tracking-wide text-encre-doux uppercase">
        Coût d’entrée
      </h2>

      {erreur ? (
        <EtatErreur message={erreur} className="mt-2" />
      ) : lecture === null ? (
        <p className="mt-2 flex items-center gap-3 text-sm text-encre-doux">
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          Chargement…
        </p>
      ) : lecture === ABSENT ? (
        /* Pas un encadré d'alerte : une moto sans prix d'achat n'est pas une
           anomalie, c'est une entrée faite par un gérant, qui ne le saisit
           plus (S39). La phrase dit ce que l'absence empêche — la marge —
           parce que c'est la seule conséquence visible. */
        <div className="mt-2 cadre p-4 sm:p-5">
          <p className="text-corps text-encre-doux">
            Aucun prix d’achat n’est enregistré : la marge de cette moto restera muette tant qu’il
            manquera.
          </p>
          <button
            type="button"
            onClick={() => setOuvert(true)}
            className="bouton bouton-principal mt-3"
          >
            <Wallet aria-hidden="true" className="size-4" />
            Renseigner le prix d’achat
          </button>
        </div>
      ) : (
        <dl className="mt-2 cadre cadre-liste">
          <Ligne titre="Prix d’achat" valeur={formaterMontant(lecture.prixAchat)} />
          {lecture.fraisEntree.map((frais, index) => (
            <Ligne
              key={index}
              titre={`${catalogue.nomTypeFrais(frais.typeFraisId)}${frais.note ? ` — ${frais.note}` : ""}`}
              valeur={formaterMontant(frais.montant)}
            />
          ))}
          <div className="flex items-baseline justify-between gap-4 bg-fond px-4 py-3">
            <dt className="text-sm font-medium text-encre">Coût total</dt>
            <dd className="text-right text-lg font-semibold text-encre">
              {formaterMontant(lecture.coutTotal)}
            </dd>
          </div>
        </dl>
      )}

      {/* Corriger reste possible, et discrètement : une erreur de saisie sur
          un prix d'achat fausse la marge sans que rien ne le signale. */}
      {lecture !== null && lecture !== ABSENT && (
        <button
          type="button"
          onClick={() => setOuvert(true)}
          className="bouton bouton-neutre mt-3"
        >
          <Wallet aria-hidden="true" className="size-4" />
          Corriger le prix d’achat
        </button>
      )}

      {ouvert && (
        <PoserCoutModal
          moto={moto}
          coutActuel={cout}
          catalogue={catalogue}
          onFermer={() => setOuvert(false)}
        />
      )}
    </section>
  );
}

/**
 * Ce que le gérant voit à la place.
 *
 * Dire « réservé au responsable » vaut mieux que ne rien afficher : un blanc se
 * lit comme une panne, une explication se lit comme une règle (DESIGN.md §10).
 */
function CoutMasque() {
  return (
    <section className="mt-6">
      <h2 className="text-sm font-semibold tracking-wide text-encre-doux uppercase">
        Coût d’entrée
      </h2>
      <p className="mt-2 flex gap-3 rounded-plaque border border-dashed border-bord p-4 text-sm text-encre-doux">
        <Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <span>
          Le prix d’achat et les frais sont réservés au responsable. Vous les avez saisis à l’entrée
          de la moto&nbsp;; ils ne se relisent pas ici.
        </span>
      </p>
    </section>
  );
}
