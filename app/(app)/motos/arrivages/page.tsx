"use client";

import { Plus } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { ArrivageModal } from "@/components/ArrivageModal";
import { ChoisirBoutique } from "@/components/ChoisirBoutique";
import { BarreEcoulement } from "@/components/BarreEcoulement";
import { BordereauLot } from "@/components/BordereauLot";
import { CartesArrivages } from "@/components/CartesArrivages";
import { InspecterLotModal } from "@/components/InspecterLotModal";
import { ModifierArrivageModal } from "@/components/ModifierArrivageModal";
import { ErreurDeLecture, EtatVide, SansBoutique } from "@/components/patrons/Etats";
import { TetePage, useSurTitre } from "@/components/patrons/Page";
import Link from "next/link";
import { Tableau, type Colonne } from "@/components/patrons/Tableau";
import { useSession } from "@/lib/auth/session";
import {
  bilanArrivages,
  chercherArrivages,
  chercherMotoParChassis,
  completudePapiers,
  ecoulement,
  filtrerArrivages,
  type Arrivage,
  type FiltreArrivage,
} from "@/lib/domain/arrivage";
import type { Fournisseur } from "@/lib/domain/fournisseur";
import { depuisQuand, formaterDateCourte, formaterNombre } from "@/lib/domain/format";
import { LIBELLE_STATUT, type Moto } from "@/lib/domain/moto";
import { peut } from "@/lib/domain/roles";
import { usePerimetre } from "@/lib/perimetre/perimetre";
import { useAbonnement } from "@/lib/repositories/abonnement";
import { useCatalogue } from "@/lib/repositories/catalogue";
import {
  annulerArrivage,
  ecouterArrivages,
  messageErreurArrivage,
  supprimerArrivage,
} from "@/lib/repositories/arrivages";
import { ecouterFournisseurs } from "@/lib/repositories/fournisseurs";
import { ecouterStock } from "@/lib/repositories/motos";
import type { Auteur } from "@/lib/repositories/referentiels";

/**
 * Les arrivages : l'espace de suivi d'un lot (S43).
 *
 * En tête, ce que le stock des lots dit d'un coup d'œil — reçues, en stock,
 * vendues, CMC manquants — puis un moyen de retrouver une moto par son cadre.
 * La liste s'ouvre sur l'inspection d'un lot ; tout se lit, rien ne se stocke.
 */

const LIBELLE_FILTRE: Record<FiltreArrivage, string> = {
  tous: "Tous",
  "cmc-incomplets": "CMC incomplets",
  ecoules: "Écoulés",
};

export default function PageArrivages() {
  const { perimetre } = usePerimetre();
  const session = useSession();
  const catalogue = useCatalogue();
  const surTitre = useSurTitre("Motos");
  const boutiqueId = perimetre.boutiqueId;

  const souscrireArrivages = useCallback(
    (auChangement: (arrivages: Arrivage[]) => void, enErreur: (cause: unknown) => void) =>
      ecouterArrivages(boutiqueId, auChangement, enErreur),
    [boutiqueId],
  );
  const { valeur: arrivages, erreur } = useAbonnement(
    souscrireArrivages,
    "Les arrivages n’ont pas pu être chargés.",
  );

  const souscrireFournisseurs = useCallback(
    (auChangement: (fournisseurs: Fournisseur[]) => void, enErreur: (cause: unknown) => void) =>
      ecouterFournisseurs(auChangement, enErreur),
    [],
  );
  const { valeur: fournisseurs } = useAbonnement(
    souscrireFournisseurs,
    "Les fournisseurs n’ont pas pu être chargés.",
  );

  const souscrireStock = useCallback(
    (auChangement: (motos: Moto[]) => void, enErreur: (cause: unknown) => void) =>
      ecouterStock(boutiqueId, auChangement, enErreur),
    [boutiqueId],
  );
  const { valeur: stock } = useAbonnement(souscrireStock, "Le stock n’a pas pu être chargé.");

  const [modaleOuverte, setModaleOuverte] = useState(false);
  const [dernierLot, setDernierLot] = useState<{ nombre: number } | null>(null);
  const [filtre, setFiltre] = useState<FiltreArrivage>("tous");
  const [voirAnnules, setVoirAnnules] = useState(false);
  const [recherche, setRecherche] = useState("");
  const [inspectId, setInspectId] = useState<string | null>(null);
  const [modifierArr, setModifierArr] = useState<Arrivage | null>(null);
  const [erreurAction, setErreurAction] = useState<string | null>(null);

  const role = session.statut === "connecte" ? session.utilisateur.role : null;
  const voitLesCouts = role !== null && peut(role, "voir_marges");
  const auteur: Auteur | null =
    session.statut === "connecte"
      ? { uid: session.utilisateur.uid, nom: session.utilisateur.nom }
      : null;
  const dansUneBoutique = perimetre.type === "boutique";
  const [choixBoutique, setChoixBoutique] = useState(false);

  const nomFournisseur = useMemo(() => {
    const table = new Map<string, string>();
    for (const fournisseur of fournisseurs ?? []) table.set(fournisseur.id, fournisseur.nom);
    return (id: string) => table.get(id) ?? "—";
  }, [fournisseurs]);

  const nomMarque = useMemo(() => {
    const table = new Map<string, string>();
    for (const marque of catalogue.lues.marques ?? []) table.set(marque.id, marque.nom);
    return (id: string) => table.get(id) ?? "—";
  }, [catalogue.lues.marques]);

  const nomModele = useMemo(() => {
    const table = new Map<string, string>();
    for (const modele of catalogue.lues.modeles ?? []) table.set(modele.id, modele.nom);
    return (id: string) => table.get(id) ?? "";
  }, [catalogue.lues.modeles]);

  const arrivagesParId = useMemo(() => {
    const table = new Map<string, Arrivage>();
    for (const arrivage of arrivages ?? []) table.set(arrivage.id, arrivage);
    return table;
  }, [arrivages]);

  const bilan = useMemo(() => bilanArrivages(arrivages ?? [], stock ?? []), [arrivages, stock]);
  const liste = useMemo(
    () => filtrerArrivages(arrivages ?? [], stock ?? [], filtre),
    [arrivages, stock, filtre],
  );
  const annules = useMemo(() => (arrivages ?? []).filter((a) => a.annule), [arrivages]);
  const resultats = useMemo(
    () => (recherche.trim() ? chercherMotoParChassis(stock ?? [], recherche).slice(0, 8) : []),
    [recherche, stock],
  );
  const lotsTrouves = useMemo(
    () => chercherArrivages(arrivages ?? [], recherche, nomFournisseur).slice(0, 8),
    [arrivages, recherche, nomFournisseur],
  );

  const arrivageInspecte = inspectId ? (arrivagesParId.get(inspectId) ?? null) : null;
  const motosDuLot = useMemo(
    () => (arrivageInspecte ? (stock ?? []).filter((m) => m.arrivageId === arrivageInspecte.id) : []),
    [arrivageInspecte, stock],
  );

  function agir(action: { enregistre: Promise<void> }) {
    setErreurAction(null);
    action.enregistre.catch((cause) => setErreurAction(messageErreurArrivage(cause)));
  }

  const colonnes: Colonne<Arrivage>[] = useMemo(
    () => [
      {
        cle: "nom",
        titre: "Arrivage",
        principal: true,
        rendu: (arrivage) => (
          <button
            type="button"
            onClick={() => setInspectId(arrivage.id)}
            className="text-left font-medium text-encre hover:underline"
          >
            {arrivage.nom}
            {arrivage.date && (
              <span className="block text-corps text-encre-doux">
                {formaterDateCourte(arrivage.date)} · {depuisQuand(arrivage.date)}
              </span>
            )}
          </button>
        ),
      },
      {
        cle: "fournisseur",
        titre: "Fournisseur",
        /* Le nom mène à son historique (S50) : « quand on clique sur un
           fournisseur on atterrit sur tous les lots pris avec lui ». Un lien et
           non un bouton — c'est une adresse, elle s'ouvre dans un onglet, elle
           se copie, et le clavier la connaît déjà. */
        rendu: (arrivage) => (
          <Link
            href={`/motos/fournisseurs/${arrivage.fournisseurId}`}
            className="font-medium text-encre hover:underline"
          >
            {nomFournisseur(arrivage.fournisseurId)}
          </Link>
        ),
      },
      {
        cle: "motos",
        titre: "Motos",
        chiffre: true,
        rendu: (arrivage) => formaterNombre(ecoulement(stock ?? [], arrivage.id).total),
      },
      {
        cle: "ecoulement",
        titre: "Écoulement",
        rendu: (arrivage) => <BarreEcoulement compte={ecoulement(stock ?? [], arrivage.id)} />,
      },
      {
        /* La clé reste « cmc » — elle sert d'identifiant de colonne, pas de
           libellé — mais la colonne compte les DEUX papiers depuis S53. Un lot
           dont les quittances manquaient s'affichait « Complet ». */
        cle: "cmc",
        titre: "Papiers",
        rendu: (arrivage) => {
          const p = completudePapiers(stock ?? [], arrivage.id);
          if (p.total === 0) return <span className="text-encre-doux">—</span>;
          const manquants = p.quittancesManquantes + p.cmcManquants;
          return (
            <div>
              {manquants === 0 ? (
                <span className="pastille pastille-solde">Complet</span>
              ) : (
                <span className="pastille pastille-retard">{manquants} manquants</span>
              )}
              {/* Le détail par papier : « 2 manquants » ne dit pas lequel aller
                  chercher, et les deux ne se réclament pas au même endroit. */}
              <span className="mt-1 block text-legende text-encre-doux">
                {p.quittancesManquantes > 0 && `${p.quittancesManquantes} quittance(s)`}
                {p.quittancesManquantes > 0 && p.cmcManquants > 0 && " · "}
                {p.cmcManquants > 0 && `${p.cmcManquants} CMC`}
                {manquants === 0 && `${p.total} / ${p.total}`}
              </span>
            </div>
          );
        },
      },
    ],
    [nomFournisseur, stock],
  );

  if (perimetre.type === "aucune")
    return (
      <SansBoutique
        titre="Arrivages"
        sansBoutiqueDeclaree="Aucune boutique n’est déclarée : il n’y a encore aucun arrivage à suivre."
      />
    );

  return (
    <div>
      <div className="print:hidden">
      <TetePage
        surTitre={surTitre}
        titre="Arrivages"
        /* Absent et non grisé (S54). Le bouton était désactivé avec une
           infobulle ; or la maison dit l'inverse — « un bouton qui n'a pas de
           sens n'est pas grisé, il n'existe pas » (`DESIGN.md`, et
           `GestesDocument` l'applique déjà). Un bouton grisé invite à chercher
           ce qui le débloquerait, et son infobulle ne se lit pas au doigt sur
           un téléphone. La phrase en dessous, elle, reste : c'est elle qui dit
           où aller. Trois écrans faisaient trois choses différentes de la même
           règle — stock, ventes et arrivages la disent désormais pareil. */
        actions={
          <button
            type="button"
            onClick={() => {
              setDernierLot(null);
              /* Hors d'une boutique, le bouton ne disparaît plus : il demande
                 laquelle, puis reprend le geste (S54, `ChoisirBoutique`). */
              if (dansUneBoutique) setModaleOuverte(true);
              else setChoixBoutique(true);
            }}
            className="bouton bouton-principal"
          >
            <Plus aria-hidden="true" className="size-4" />
            Nouveau
          </button>
        }
      />

      {!dansUneBoutique && (
        <p className="mb-4 text-corps text-encre-doux">
          Vous voyez les arrivages de toutes les boutiques. « Nouveau » vous demandera dans laquelle
          enregistrer celui-ci.
        </p>
      )}

      {dernierLot && (
        <div role="status" className="mb-4 cadre p-4">
          <p className="font-medium text-encre">
            Arrivage enregistré — {dernierLot.nombre}{" "}
            {dernierLot.nombre > 1 ? "motos entrées" : "moto entrée"} en stock.
          </p>
          <p className="mt-1 text-sm text-encre-doux">
            Elles sont déjà dans le stock de cet appareil. Si le réseau manque, le lot partira seul.
          </p>
        </div>
      )}

      {erreurAction && (
        <div role="alert" className="mb-4 cadre border-l-4 p-4 text-corps text-alerte" style={{ borderLeftColor: "var(--color-alerte)" }}>
          {erreurAction}
        </div>
      )}

      {erreur ? (
        <ErreurDeLecture
          titre="Les arrivages n’ont pas pu être lus"
          sortie={{ href: "/motos", libelle: "Aller au stock" }}
        >
          {erreur}
        </ErreurDeLecture>
      ) : arrivages !== null && arrivages.length === 0 ? (
        <EtatVide titre="Aucun arrivage pour l’instant.">
          Un arrivage regroupe les motos reçues d’un même fournisseur, saisies en une fois.
          {dansUneBoutique ? " Utilisez le bouton « Nouveau »." : ""}
        </EtatVide>
      ) : (
        <>
          <CartesArrivages bilan={bilan} />

          {/* **Une seule barre pour les deux questions** (26 octobre 2026).
              Elle ne retrouvait qu'une moto par son châssis ; le commanditaire
              cherche aussi un lot — « par nom d'arrivage, nom du fournisseur ».
              Deux champs côte à côte auraient obligé à savoir, avant de taper,
              lequel des deux répond. */}
          <div className="mb-5 cadre p-4">
            <label htmlFor="rech-moto" className="block font-medium text-encre">
              Retrouver un lot ou une moto
            </label>
            <p className="text-corps text-encre-doux">
              Le nom d’un arrivage, celui d’un fournisseur, ou un numéro de cadre — complet ou par
              ses derniers caractères.
            </p>
            <input
              id="rech-moto"
              value={recherche}
              autoComplete="off"
              placeholder="Ex. Bohary, ou les 5 derniers chiffres"
              onChange={(evenement) => setRecherche(evenement.target.value)}
              className="saisie mt-2"
            />
            {recherche.trim() && (
              <div className="mt-3">
                {lotsTrouves.length === 0 && resultats.length === 0 ? (
                  <p className="text-corps text-encre-doux">Aucun lot ni aucune moto ne correspond.</p>
                ) : (
                  <div className="grid gap-4">
                    {lotsTrouves.length > 0 && (
                      /* Les lots d'abord : une recherche par nom vise le lot,
                         et le faire descendre sous dix motos le ferait manquer. */
                      <section aria-label="Lots trouvés">
                        <h3 className="text-legende font-bold tracking-[0.07em] text-encre-doux uppercase">
                          Lots
                        </h3>
                        <ul className="mt-2 grid gap-2">
                          {lotsTrouves.map((lot) => (
                            <li key={lot.id}>
                              <button
                                type="button"
                                onClick={() => setInspectId(lot.id)}
                                className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-plaque border border-bord px-3 py-2 text-left hover:bg-survol"
                              >
                                <span className="font-medium text-encre">{lot.nom}</span>
                                <span className="text-corps text-encre-doux">
                                  {nomFournisseur(lot.fournisseurId)}
                                </span>
                                <span className="ml-auto text-legende text-encre-doux">
                                  {formaterNombre(ecoulement(stock ?? [], lot.id).total)} moto(s)
                                  {lot.date ? ` · ${formaterDateCourte(lot.date)}` : ""}
                                  {lot.annule ? " · annulé" : ""}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </section>
                    )}

                    {resultats.length > 0 && (
                      <section aria-label="Motos trouvées">
                        <h3 className="text-legende font-bold tracking-[0.07em] text-encre-doux uppercase">
                          Motos
                        </h3>
                        <ul className="mt-2 grid gap-2">
                          {resultats.map((moto) => (
                            <li key={moto.id}>
                              <button
                                type="button"
                                disabled={!moto.arrivageId}
                                onClick={() => moto.arrivageId && setInspectId(moto.arrivageId)}
                                className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-plaque border border-bord px-3 py-2 text-left hover:bg-survol disabled:opacity-70"
                              >
                                <span className="font-code break-all text-encre">
                                  {moto.numeroChassis}
                                </span>
                                <span className="text-corps text-encre-doux">
                                  {nomMarque(moto.marqueId)}
                                </span>
                                <span className="ml-auto text-legende text-encre-doux">
                                  {moto.arrivageId
                                    ? (arrivagesParId.get(moto.arrivageId)?.nom ?? "lot inconnu")
                                    : "hors lot"}{" "}
                                  · {LIBELLE_STATUT[moto.statut]}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </section>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-2">
            {(Object.keys(LIBELLE_FILTRE) as FiltreArrivage[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFiltre(f)}
                aria-pressed={filtre === f}
                className={`bouton ${filtre === f ? "bouton-principal" : "bouton-discret"}`}
              >
                {LIBELLE_FILTRE[f]}
              </button>
            ))}
            {annules.length > 0 && (
              <button
                type="button"
                onClick={() => setVoirAnnules((v) => !v)}
                aria-pressed={voirAnnules}
                className="bouton bouton-discret ml-auto"
              >
                {voirAnnules ? "Masquer les annulés" : `Voir les annulés (${annules.length})`}
              </button>
            )}
          </div>

          <Tableau
            legende="Arrivages de la boutique, du plus récent au plus ancien, avec l’écoulement et la complétude CMC de chaque lot."
            colonnes={colonnes}
            lignes={liste}
            cleDe={(arrivage) => arrivage.id}
            cleActive={inspectId}
            chargement={arrivages === null}
          />

          {voirAnnules && annules.length > 0 && (
            <div className="mt-6">
              <h2 className="mb-2 text-bloc font-bold text-encre">Lots annulés</h2>
              <ul className="cadre cadre-liste">
                {annules.map((arrivage) => (
                  <li
                    key={arrivage.id}
                    className="flex flex-wrap items-center gap-3 px-4 py-3"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="font-medium text-encre">{arrivage.nom}</span>
                      <span className="block text-legende text-encre-doux">
                        {nomFournisseur(arrivage.fournisseurId)} ·{" "}
                        {formaterNombre(ecoulement(stock ?? [], arrivage.id).total)} motos
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => auteur && agir(annulerArrivage(arrivage.id, false, auteur))}
                      className="bouton bouton-discret shrink-0"
                    >
                      Rétablir
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      <ChoisirBoutique
        ouvert={choixBoutique}
        onFermer={() => setChoixBoutique(false)}
        titre="Enregistrer un arrivage"
        pourquoi="Un lot entre dans une boutique précise. Laquelle reçoit celui-ci ?"
        onChoisie={() => {
          setChoixBoutique(false);
          setModaleOuverte(true);
        }}
      />

      {dansUneBoutique && boutiqueId && (
        <ArrivageModal
          ouvert={modaleOuverte}
          onFermer={() => setModaleOuverte(false)}
          onEnregistre={(info) => setDernierLot(info)}
          fournisseurs={fournisseurs}
          marques={catalogue.lues.marques}
          modeles={catalogue.lues.modeles}
          stock={stock}
          arrivages={arrivages}
          auteur={auteur}
          boutiqueId={boutiqueId}
          voitLesCouts={voitLesCouts}
        />
      )}

      {arrivageInspecte && (
        <InspecterLotModal
          arrivage={arrivageInspecte}
          motosDuLot={motosDuLot}
          nomFournisseur={nomFournisseur(arrivageInspecte.fournisseurId)}
          nomMarque={nomMarque}
          nomModele={nomModele}
          auteur={auteur}
          onFermer={() => setInspectId(null)}
          onModifier={() => {
            setModifierArr(arrivageInspecte);
            setInspectId(null);
          }}
          onExporterPdf={() => window.print()}
          onAnnuler={() => auteur && agir(annulerArrivage(arrivageInspecte.id, true, auteur))}
          onRetablir={() => auteur && agir(annulerArrivage(arrivageInspecte.id, false, auteur))}
          onSupprimer={() => {
            if (typeof window !== "undefined" && !window.confirm("Supprimer ce lot vide ?")) return;
            agir(supprimerArrivage(arrivageInspecte.id));
            setInspectId(null);
          }}
        />
      )}

      {modifierArr && (
        <ModifierArrivageModal
          /* **La clé remonte la modale quand le stock arrive.** Elle sème sa
             grille à l'ouverture, depuis les motos du lot ; ouverte avant que
             le stock soit lu — démarrage hors ligne, où les arrivages sortent
             du cache avant les motos — elle resterait vide pour toujours. */
          key={stock === null ? "attente-stock" : "stock-lu"}
          arrivage={modifierArr}
          stock={stock}
          fournisseurs={fournisseurs}
          marques={catalogue.lues.marques}
          modeles={catalogue.lues.modeles}
          auteur={auteur}
          onFermer={() => setModifierArr(null)}
          onModifie={() => undefined}
          onEchec={setErreurAction}
        />
      )}
      </div>

      {/* Le bordereau ne s'affiche qu'à l'impression ; l'écran, lui, est masqué
          (`print:hidden` ci-dessus). « Exporter en PDF » n'est qu'un window.print(). */}
      <div className="hidden print:block">
        {arrivageInspecte && (
          <BordereauLot
            arrivage={arrivageInspecte}
            motos={motosDuLot}
            nomFournisseur={nomFournisseur(arrivageInspecte.fournisseurId)}
            nomMarque={nomMarque}
            nomModele={nomModele}
          />
        )}
      </div>
    </div>
  );
}
