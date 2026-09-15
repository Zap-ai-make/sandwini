"use client";

import { Plus } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { ArrivageModal } from "@/components/ArrivageModal";
import { BarreEcoulement } from "@/components/BarreEcoulement";
import { BordereauLot } from "@/components/BordereauLot";
import { CartesArrivages } from "@/components/CartesArrivages";
import { InspecterLotModal } from "@/components/InspecterLotModal";
import { ModifierArrivageModal } from "@/components/ModifierArrivageModal";
import { ErreurDeLecture, EtatVide, SansBoutique } from "@/components/patrons/Etats";
import { TetePage, useSurTitre } from "@/components/patrons/Page";
import { Tableau, type Colonne } from "@/components/patrons/Tableau";
import { useSession } from "@/lib/auth/session";
import {
  bilanArrivages,
  chercherMotoParChassis,
  completudeCmc,
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
        rendu: (arrivage) => nomFournisseur(arrivage.fournisseurId),
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
        cle: "cmc",
        titre: "Documents CMC",
        rendu: (arrivage) => {
          const c = completudeCmc(stock ?? [], arrivage.id);
          if (c.total === 0) return <span className="text-encre-doux">—</span>;
          return (
            <div>
              {c.manquants === 0 ? (
                <span className="pastille pastille-solde">Complet</span>
              ) : (
                <span className="pastille pastille-retard">{c.manquants} manquants</span>
              )}
              <span className="mt-1 block text-legende text-encre-doux">
                {c.recus} / {c.total}
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
        actions={
          <button
            type="button"
            onClick={() => {
              setDernierLot(null);
              setModaleOuverte(true);
            }}
            disabled={!dansUneBoutique}
            className="bouton bouton-principal"
            title={dansUneBoutique ? undefined : "Choisissez une boutique pour enregistrer un arrivage."}
          >
            <Plus aria-hidden="true" className="size-4" />
            Nouveau
          </button>
        }
      />

      {!dansUneBoutique && (
        <p className="mb-4 text-corps text-encre-doux">
          Vous voyez les arrivages de toutes les boutiques. Choisissez-en une, en haut de l’écran,
          pour en enregistrer un nouveau.
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

          <div className="mb-5 cadre p-4">
            <label htmlFor="rech-moto" className="block font-medium text-encre">
              Retrouver une moto
            </label>
            <p className="text-corps text-encre-doux">Par numéro de cadre complet ou par ses derniers caractères.</p>
            <input
              id="rech-moto"
              value={recherche}
              autoComplete="off"
              placeholder="Ex. les 5 derniers chiffres"
              onChange={(evenement) => setRecherche(evenement.target.value)}
              className="saisie mt-2"
            />
            {recherche.trim() && (
              <div className="mt-3">
                {resultats.length === 0 ? (
                  <p className="text-corps text-encre-doux">Aucune moto ne correspond.</p>
                ) : (
                  <ul className="grid gap-2">
                    {resultats.map((moto) => (
                      <li key={moto.id}>
                        <button
                          type="button"
                          disabled={!moto.arrivageId}
                          onClick={() => moto.arrivageId && setInspectId(moto.arrivageId)}
                          className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-plaque border border-bord px-3 py-2 text-left hover:bg-survol disabled:opacity-70"
                        >
                          <span className="font-code break-all text-encre">{moto.numeroChassis}</span>
                          <span className="text-corps text-encre-doux">{nomMarque(moto.marqueId)}</span>
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
          arrivage={modifierArr}
          fournisseurs={fournisseurs}
          auteur={auteur}
          onFermer={() => setModifierArr(null)}
          onModifie={() => undefined}
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
