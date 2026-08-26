"use client";

import { ArrowLeft, CircleAlert, Plus, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";
import { useSession } from "@/lib/auth/session";
import { formaterMontant } from "@/lib/domain/format";
import {
  ETATS,
  LIBELLE_ETAT,
  LONGUEUR_CHASSIS_MAX,
  LONGUEUR_NOTE_MAX,
  LONGUEUR_TEXTE_MAX,
  SAISIE_VIDE,
  chassisDejaPris,
  coutTotalSaisie,
  normaliserChassis,
  validerMoto,
  type EtatMoto,
  type Moto,
  type SaisieMoto,
} from "@/lib/domain/moto";
import { usePerimetre } from "@/lib/perimetre/perimetre";
import { useAbonnement } from "@/lib/repositories/abonnement";
import { useCatalogue } from "@/lib/repositories/catalogue";
import { ecouterStock, entrerEnStock, messageErreurMoto } from "@/lib/repositories/motos";

/**
 * L'entrée en stock.
 *
 * C'est l'écran que le gérant utilise debout, une main sur la moto. Il doit
 * marcher sans réseau et se remplir vite : d'abord ce qu'on lit sur le cadre
 * (état, marque, modèle, châssis), ensuite ce qu'on sait de l'achat.
 *
 * Le coût total s'affiche pendant la frappe. C'est le seul moment où le gérant
 * le verra : dès l'enregistrement, il passe hors de sa portée (D2).
 */
export default function PageNouvelleMoto() {
  const { perimetre } = usePerimetre();
  const session = useSession();
  const catalogue = useCatalogue();

  const boutiqueId = perimetre.boutiqueId;
  const souscrire = useCallback(
    (auChangement: (motos: Moto[]) => void, enErreur: (cause: unknown) => void) =>
      ecouterStock(boutiqueId, auChangement, enErreur),
    [boutiqueId],
  );
  const { valeur: stock } = useAbonnement(souscrire, "Le stock n’a pas pu être chargé.");

  const [saisie, setSaisie] = useState<SaisieMoto>(SAISIE_VIDE);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enregistree, setEnregistree] = useState<{ id: string; chassis: string } | null>(null);

  const changer = (partie: Partial<SaisieMoto>) =>
    setSaisie((actuel) => ({ ...actuel, ...partie }));

  const modelesDeLaMarque = catalogue.modeles.filter(
    (modele) => modele.marqueId === saisie.marqueId && modele.actif,
  );
  const total = coutTotalSaisie(saisie);

  function soumettre(evenement: React.FormEvent) {
    evenement.preventDefault();
    if (session.statut !== "connecte" || !boutiqueId) return;
    setEnregistree(null);

    const probleme = validerMoto(saisie);
    if (probleme) {
      setErreur(probleme);
      return;
    }

    const doublon = chassisDejaPris(saisie.numeroChassis, stock ?? []);
    if (doublon) {
      setErreur(
        `Ce châssis est déjà en stock : ${catalogue.nomMarque(doublon.marqueId)} ${catalogue.nomModele(doublon.modeleId)}.`,
      );
      return;
    }

    setErreur(null);
    const { id, enregistre } = entrerEnStock(saisie, boutiqueId, {
      uid: session.utilisateur.uid,
      nom: session.utilisateur.nom,
    });
    enregistre.catch((cause) => setErreur(messageErreurMoto(cause)));

    setEnregistree({ id, chassis: normaliserChassis(saisie.numeroChassis) });
    setSaisie(SAISIE_VIDE);
  }

  if (perimetre.type !== "boutique") {
    return (
      <Cadre>
        <p className="max-w-prose text-encre-doux">
          Une moto entre dans une boutique précise. Choisissez-en une dans le bandeau, en haut de
          l’écran, avant de la saisir.
        </p>
      </Cadre>
    );
  }

  const referentielsManquants =
    !catalogue.chargement &&
    (catalogue.marques.filter((m) => m.actif).length === 0 ||
      catalogue.provenances.filter((p) => p.actif).length === 0);

  if (referentielsManquants) {
    return (
      <Cadre>
        <p className="max-w-prose text-encre-doux">
          Il manque une marque ou une provenance. Une moto se rattache toujours à ces listes — sinon
          la même marque finit écrite de trois façons.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Link
            href="/parametres/catalogue"
            className="inline-flex h-12 items-center rounded-plaque border border-plaque-bord bg-plaque px-4 font-semibold text-encre-fixe"
          >
            Déclarer une marque
          </Link>
          <Link
            href="/parametres/referentiels"
            className="inline-flex h-12 items-center rounded-plaque border border-bord px-4 font-medium text-encre hover:bg-papier"
          >
            Déclarer une provenance
          </Link>
        </div>
      </Cadre>
    );
  }

  return (
    <Cadre>
      {enregistree && (
        <div role="status" className="mb-6 rounded-plaque border border-plaque-bord bg-papier p-4">
          <p className="font-medium text-encre">
            Moto enregistrée dans {perimetre.nom}
            {" — "}
            <span className="plaque-code">{enregistree.chassis}</span>
          </p>
          <p className="mt-1 text-sm text-encre-doux">
            Elle est déjà dans le stock de cet appareil. Si le réseau manque, elle partira seule.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={`/motos?moto=${enregistree.id}`}
              className="inline-flex h-11 items-center rounded-plaque border border-bord px-3 text-sm font-medium text-encre hover:bg-fond"
            >
              Voir la fiche
            </Link>
            <Link
              href="/motos"
              className="inline-flex h-11 items-center rounded-plaque border border-bord px-3 text-sm font-medium text-encre hover:bg-fond"
            >
              Voir le stock
            </Link>
          </div>
        </div>
      )}

      <form onSubmit={soumettre} noValidate>
        <fieldset className="rounded-plaque border border-bord bg-papier p-4">
          <legend className="px-1 font-semibold text-encre">La moto</legend>

          <div className="mt-2">
            <span className="block text-sm font-medium text-encre">État</span>
            <div className="mt-1.5 flex gap-2">
              {ETATS.map((etat) => (
                <label
                  key={etat}
                  className={[
                    "flex h-12 flex-1 cursor-pointer items-center justify-center rounded-plaque border font-medium",
                    saisie.etat === etat
                      ? "border-plaque-bord bg-plaque text-encre-fixe"
                      : "border-bord bg-papier text-encre hover:bg-fond",
                  ].join(" ")}
                >
                  <input
                    type="radio"
                    name="etat"
                    value={etat}
                    checked={saisie.etat === etat}
                    onChange={() => changer({ etat: etat as EtatMoto })}
                    className="sr-only"
                  />
                  {LIBELLE_ETAT[etat]}
                </label>
              ))}
            </div>
          </div>

          <Selection
            id="marque"
            libelle="Marque"
            valeur={saisie.marqueId}
            changer={(marqueId) => changer({ marqueId, modeleId: "" })}
            options={catalogue.marques.filter((m) => m.actif)}
            invite="Choisir une marque"
          />

          <Selection
            id="modele"
            libelle="Modèle"
            valeur={saisie.modeleId}
            changer={(modeleId) => changer({ modeleId })}
            options={modelesDeLaMarque}
            invite={saisie.marqueId ? "Choisir un modèle" : "Choisissez d’abord une marque"}
            desactive={!saisie.marqueId}
          />

          <div className="mt-4">
            <label htmlFor="chassis" className="block text-sm font-medium text-encre">
              Numéro de châssis
            </label>
            <input
              id="chassis"
              value={saisie.numeroChassis}
              maxLength={LONGUEUR_CHASSIS_MAX + 8}
              autoCapitalize="characters"
              autoComplete="off"
              onChange={(evenement) => changer({ numeroChassis: evenement.target.value })}
              className="plaque-code mt-1.5 h-12 w-full rounded-plaque border border-bord bg-papier px-3 text-encre"
            />
            <p className="mt-1 text-sm text-encre-doux">
              Relevé sur le cadre. Les espaces et la casse n’ont pas d’importance.
            </p>
          </div>

          <div className="mt-4">
            <label htmlFor="moteur" className="block text-sm font-medium text-encre">
              Numéro de moteur <span className="font-normal text-encre-doux">(facultatif)</span>
            </label>
            <input
              id="moteur"
              value={saisie.numeroMoteur}
              maxLength={LONGUEUR_CHASSIS_MAX + 8}
              autoCapitalize="characters"
              autoComplete="off"
              onChange={(evenement) => changer({ numeroMoteur: evenement.target.value })}
              className="plaque-code mt-1.5 h-12 w-full rounded-plaque border border-bord bg-papier px-3 text-encre"
            />
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="couleur" className="block text-sm font-medium text-encre">
                Couleur <span className="font-normal text-encre-doux">(facultatif)</span>
              </label>
              <input
                id="couleur"
                value={saisie.couleur}
                maxLength={LONGUEUR_TEXTE_MAX}
                onChange={(evenement) => changer({ couleur: evenement.target.value })}
                className="mt-1.5 h-12 w-full rounded-plaque border border-bord bg-papier px-3 text-encre"
              />
            </div>
            <div>
              <label htmlFor="annee" className="block text-sm font-medium text-encre">
                Année <span className="font-normal text-encre-doux">(facultatif)</span>
              </label>
              <input
                id="annee"
                inputMode="numeric"
                value={saisie.annee}
                maxLength={4}
                onChange={(evenement) => changer({ annee: evenement.target.value })}
                className="mt-1.5 h-12 w-full rounded-plaque border border-bord bg-papier px-3 text-encre"
              />
            </div>
          </div>

          {saisie.etat === "occasion" && (
            <div className="mt-4">
              <label htmlFor="papiers" className="block text-sm font-medium text-encre">
                Papiers fournis
              </label>
              <textarea
                id="papiers"
                rows={3}
                value={saisie.papiersFournis}
                onChange={(evenement) => changer({ papiersFournis: evenement.target.value })}
                className="mt-1.5 w-full rounded-plaque border border-bord bg-papier px-3 py-2 text-encre"
              />
              <p className="mt-1 text-sm text-encre-doux">
                Un par ligne : ce qui accompagne la moto au moment où elle entre.
              </p>
            </div>
          )}
        </fieldset>

        <fieldset className="mt-6 rounded-plaque border border-bord bg-papier p-4">
          <legend className="px-1 font-semibold text-encre">Ce qu’elle a coûté</legend>
          <p className="mt-1 flex gap-2 text-sm text-encre-doux">
            <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>Ces montants sont réservés au responsable : ils ne se relisent pas ici.</span>
          </p>

          <Selection
            id="provenance"
            libelle="Provenance"
            valeur={saisie.provenanceId}
            changer={(provenanceId) => changer({ provenanceId })}
            options={catalogue.provenances.filter((p) => p.actif)}
            invite="Choisir une provenance"
          />

          <div className="mt-4">
            <label htmlFor="prix-achat" className="block text-sm font-medium text-encre">
              Prix d’achat
            </label>
            <input
              id="prix-achat"
              inputMode="numeric"
              value={saisie.prixAchat}
              onChange={(evenement) => changer({ prixAchat: evenement.target.value })}
              className="mt-1.5 h-12 w-full rounded-plaque border border-bord bg-papier px-3 text-encre"
            />
          </div>

          <Frais
            lignes={saisie.fraisEntree}
            changer={(fraisEntree) => changer({ fraisEntree })}
            types={catalogue.typesFrais.filter((t) => t.actif)}
          />

          <p className="mt-4 flex items-baseline justify-between gap-4 border-t border-bord pt-3">
            <span className="text-sm font-medium text-encre">Coût total d’entrée</span>
            <span className="text-lg font-semibold text-encre">{formaterMontant(total)}</span>
          </p>

          <div className="mt-4">
            <label htmlFor="prix-conseille" className="block text-sm font-medium text-encre">
              Prix de vente conseillé{" "}
              <span className="font-normal text-encre-doux">(facultatif)</span>
            </label>
            <input
              id="prix-conseille"
              inputMode="numeric"
              value={saisie.prixVenteConseille}
              onChange={(evenement) => changer({ prixVenteConseille: evenement.target.value })}
              className="mt-1.5 h-12 w-full rounded-plaque border border-bord bg-papier px-3 text-encre"
            />
            <p className="mt-1 text-sm text-encre-doux">
              Celui-ci reste visible du gérant : c’est un repère de vente, pas un coût.
            </p>
          </div>
        </fieldset>

        <p role="alert" aria-live="assertive" className="mt-3 min-h-5 text-sm text-alerte">
          {erreur ?? ""}
        </p>

        <button
          type="submit"
          className="mt-3 inline-flex h-12 items-center rounded-plaque border border-plaque-bord bg-plaque px-5 font-semibold text-encre-fixe"
        >
          Faire entrer en stock
        </button>
      </form>
    </Cadre>
  );
}

function Cadre({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <Link
        href="/motos"
        className="inline-flex items-center gap-2 text-sm text-encre-doux hover:text-encre"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Stock
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-semibold tracking-tight text-encre">
        Faire entrer une moto
      </h1>
      {children}
    </div>
  );
}

function Selection({
  id,
  libelle,
  valeur,
  changer,
  options,
  invite,
  desactive = false,
}: {
  id: string;
  libelle: string;
  valeur: string;
  changer: (valeur: string) => void;
  options: { id: string; nom: string }[];
  invite: string;
  desactive?: boolean;
}) {
  return (
    <div className="mt-4">
      <label htmlFor={id} className="block text-sm font-medium text-encre">
        {libelle}
      </label>
      <select
        id={id}
        value={valeur}
        disabled={desactive}
        onChange={(evenement) => changer(evenement.target.value)}
        className="mt-1.5 h-12 w-full rounded-plaque border border-bord bg-papier px-3 text-encre disabled:opacity-60"
      >
        <option value="">{invite}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.nom}
          </option>
        ))}
      </select>
    </div>
  );
}

function Frais({
  lignes,
  changer,
  types,
}: {
  lignes: SaisieMoto["fraisEntree"];
  changer: (lignes: SaisieMoto["fraisEntree"]) => void;
  types: { id: string; nom: string }[];
}) {
  return (
    <div className="mt-4">
      <span className="block text-sm font-medium text-encre">Frais d’entrée</span>

      {types.length === 0 ? (
        <p className="mt-1.5 text-sm text-encre-doux">
          Aucun type de frais déclaré. Le prix d’achat suffit ; les types se déclarent dans les
          réglages.
        </p>
      ) : (
        <>
          {lignes.map((ligne, index) => (
            <div key={index} className="mt-2 rounded-plaque border border-bord bg-fond p-3">
              <div className="flex flex-wrap gap-2">
                <label className="sr-only" htmlFor={`frais-type-${index}`}>
                  Type du frais {index + 1}
                </label>
                <select
                  id={`frais-type-${index}`}
                  value={ligne.typeFraisId}
                  onChange={(evenement) =>
                    changer(
                      lignes.map((autre, position) =>
                        position === index
                          ? { ...autre, typeFraisId: evenement.target.value }
                          : autre,
                      ),
                    )
                  }
                  className="h-11 min-w-0 flex-1 rounded-plaque border border-bord bg-papier px-2 text-sm text-encre"
                >
                  <option value="">Type</option>
                  {types.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.nom}
                    </option>
                  ))}
                </select>

                <label className="sr-only" htmlFor={`frais-montant-${index}`}>
                  Montant du frais {index + 1}
                </label>
                <input
                  id={`frais-montant-${index}`}
                  inputMode="numeric"
                  placeholder="Montant"
                  value={ligne.montant}
                  onChange={(evenement) =>
                    changer(
                      lignes.map((autre, position) =>
                        position === index ? { ...autre, montant: evenement.target.value } : autre,
                      ),
                    )
                  }
                  className="h-11 w-32 rounded-plaque border border-bord bg-papier px-2 text-sm text-encre"
                />

                <button
                  type="button"
                  onClick={() => changer(lignes.filter((_, position) => position !== index))}
                  className="inline-flex size-11 shrink-0 items-center justify-center rounded-plaque border border-bord text-encre hover:bg-papier"
                >
                  <X aria-hidden="true" className="size-4" />
                  <span className="sr-only">Retirer le frais {index + 1}</span>
                </button>
              </div>

              <label className="sr-only" htmlFor={`frais-note-${index}`}>
                Note du frais {index + 1}
              </label>
              <input
                id={`frais-note-${index}`}
                placeholder="Note (facultatif)"
                maxLength={LONGUEUR_NOTE_MAX}
                value={ligne.note}
                onChange={(evenement) =>
                  changer(
                    lignes.map((autre, position) =>
                      position === index ? { ...autre, note: evenement.target.value } : autre,
                    ),
                  )
                }
                className="mt-2 h-11 w-full rounded-plaque border border-bord bg-papier px-2 text-sm text-encre"
              />
            </div>
          ))}

          <button
            type="button"
            onClick={() => changer([...lignes, { typeFraisId: "", montant: "", note: "" }])}
            className="mt-2 inline-flex h-11 items-center gap-2 rounded-plaque border border-bord px-3 text-sm font-medium text-encre hover:bg-fond"
          >
            <Plus aria-hidden="true" className="size-4" />
            Ajouter un frais
          </button>
        </>
      )}
    </div>
  );
}
