"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";
import { ChoixOuNouveau } from "@/components/ChoixOuNouveau";
import { FraisEntree } from "@/components/FraisEntree";
import { EtatErreurSaisie } from "@/components/patrons/Etats";
import { useSession } from "@/lib/auth/session";
import { formaterMontant } from "@/lib/domain/format";
import {
  ETATS,
  LIBELLE_ETAT,
  LONGUEUR_CHASSIS_MAX,
  LONGUEUR_TEXTE_MAX,
  SAISIE_VIDE,
  chassisDejaPris,
  coutRenseigne,
  coutTotalSaisie,
  normaliserChassis,
  validerMoto,
  type EtatMoto,
  type Moto,
  type SaisieMoto,
} from "@/lib/domain/moto";
import { peut } from "@/lib/domain/roles";
import { usePerimetre } from "@/lib/perimetre/perimetre";
import { useAbonnement } from "@/lib/repositories/abonnement";
import { useCatalogue } from "@/lib/repositories/catalogue";
import { ecouterStock, entrerEnStock, messageErreurMoto } from "@/lib/repositories/motos";
import { creerEntree, creerModele, type Auteur } from "@/lib/repositories/referentiels";

/**
 * L'entrée en stock.
 *
 * C'est l'écran que le gérant utilise debout, une main sur la moto. Il doit
 * marcher sans réseau et se remplir vite : d'abord ce qu'on lit sur le cadre
 * (état, marque, modèle, châssis), puis le prix auquel on compte la vendre.
 *
 * **Deux choses en sont sorties avec S39.**
 *
 * Le prix d'achat et les frais d'entrée : le gérant les saisissait sans jamais
 * pouvoir les relire (D4), et le bloc s'en excusait à l'écran. Le commanditaire
 * a tranché — il fait entrer la moto, la supervision pose ce qu'elle a coûté.
 * Le bloc ne s'affiche donc plus qu'au responsable, et la moto entre sans coût
 * quand c'est un gérant qui la saisit.
 *
 * Et le panneau qui barrait l'écran tant qu'aucune marque n'était déclarée. Les
 * listes restent — sans elles la même marque finit écrite de trois façons —
 * mais elles se remplissent **d'ici**, sur place, sans quitter la saisie en
 * cours. Un référentiel vide ne bloque plus un comptoir.
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

  /* Ce qui décide de l'affichage des coûts. La même capacité que partout
     ailleurs (`voir_marges`), pour qu'il n'existe qu'une seule réponse à
     « a-t-il le droit ». Elle ne protège rien à elle seule : les règles
     Firestore refusent l'écriture du coût à quiconque n'est pas responsable,
     et c'est cela qui protège. */
  const role = session.statut === "connecte" ? session.utilisateur.role : null;
  const voitLesCouts = role !== null && peut(role, "voir_marges");

  const auteur: Auteur | null =
    session.statut === "connecte"
      ? { uid: session.utilisateur.uid, nom: session.utilisateur.nom }
      : null;

  /* Les modèles de la marque choisie, désactivés compris : c'est
     `ChoixOuNouveau` qui décide lesquels proposer, et il a besoin de tous pour
     reconnaître un nom déjà employé — d'où `lues`, qui garde « pas encore
     lu » distinct de « aucun modèle chez cette marque » (S40). */
  const modelesDeLaMarque =
    catalogue.lues.modeles === null
      ? null
      : catalogue.lues.modeles.filter((modele) => modele.marqueId === saisie.marqueId);
  const total = coutTotalSaisie(saisie);

  function soumettre(evenement: React.FormEvent) {
    evenement.preventDefault();
    if (!auteur || !boutiqueId) return;
    setEnregistree(null);

    const probleme = validerMoto(saisie);
    if (probleme) {
      setErreur(probleme);
      return;
    }

    /* **Un stock pas encore lu n'est pas un stock vide.** `stock` vaut `null`
       tant que la première réponse de l'écoute n'est pas arrivée ; le remplacer
       ici par une liste vide ferait répondre « aucun doublon » à une question
       qu'on n'a pas posée, et **deux motos porteraient le même numéro de
       châssis**. Une référence de pièce en double se répare ; deux châssis
       identiques se découvrent à la préfecture, sur un dossier de carte grise,
       des semaines plus tard (D95). */
    if (stock === null) {
      setErreur("Le stock n’a pas fini d’arriver. Réessayez dans un instant.");
      return;
    }

    const doublon = chassisDejaPris(saisie.numeroChassis, stock);
    if (doublon) {
      setErreur(
        `Ce châssis est déjà en stock : ${catalogue.nomMarque(doublon.marqueId)} ${catalogue.nomModele(doublon.modeleId)}.`,
      );
      return;
    }

    setErreur(null);
    const { id, enregistre } = entrerEnStock(saisie, boutiqueId, auteur);
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

  return (
    <Cadre>
      {enregistree && (
        <div role="status" className="mb-6 cadre p-4">
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

      {/* La colonne est ici, sur la mise en page, et non sur le champ : c'est
          l'écran qui sait de quelle largeur il dispose. `.saisie` portait une
          borne de 32 rem pour protéger cet écran-là et quatre autres ; elle
          contraignait du même coup tous les champs du produit, y compris ceux
          d'une colonne qui en tenait déjà la largeur. */}
      <form onSubmit={soumettre} className="colonne-formulaire max-w-[40rem]" noValidate>
        <fieldset className="cadre p-4">
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
                      ? "border-2 border-encre bg-papier font-semibold text-encre"
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

          {/* Marque et modèle sont une seule étape, et se lisent comme telle.
              Le modèle paraissait verrouillé : il était `disabled` tant
              qu'aucune marque n'était choisie, et le gris s'interprétait comme
              un refus plutôt que comme une attente. Il a désormais l'aspect et
              le comportement de la marque ; ce qui reste vrai — un modèle
              appartient à une marque (S40) — est dit par l'invite, avant le
              geste, et non par un champ éteint. */}
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <ChoixOuNouveau
              id="marque"
              libelle="Marque"
              singulier="marque"
              determinant="cette"
              valeur={saisie.marqueId}
              changer={(marqueId) => {
                changer({ marqueId, modeleId: "" });
                /* Le focus enchaîne sur le modèle : c'est la question
                   suivante, et l'attente que l'invite annonçait vient de se
                   lever. Après la peinture, sinon le champ visé n'a pas
                   encore repris sa forme de `<select>` quand la marque
                   vient d'être créée à la volée. */
                if (marqueId) {
                  requestAnimationFrame(() => document.getElementById("modele")?.focus());
                }
              }}
              toutes={catalogue.lues.marques}
              invite="Choisir une marque"
              creer={(nom, auteur) => creerEntree("marques", nom, auteur)}
            />

            <ChoixOuNouveau
              id="modele"
              libelle="Modèle"
              singulier="modèle"
              determinant="ce"
              valeur={saisie.modeleId}
              changer={(modeleId) => changer({ modeleId })}
              toutes={modelesDeLaMarque}
              invite={saisie.marqueId ? "Choisir un modèle" : "Choisissez d’abord une marque"}
              enAttente={!saisie.marqueId}
              creer={(nom, auteur) => creerModele(saisie.marqueId, nom, auteur)}
            />
          </div>

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
              className="plaque-code saisie mt-1.5"
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
              className="plaque-code saisie mt-1.5"
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
                className="saisie mt-1.5"
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
                className="saisie mt-1.5"
              />
            </div>
          </div>

          {/* La provenance n'est pas un montant : c'est d'où vient la moto, et
              le gérant le sait mieux que personne. Elle vivait dans le bloc des
              coûts alors qu'elle est stockée sur le document public — S39 la
              remet là où elle appartient. */}
          <div className="mt-4">
            <ChoixOuNouveau
              id="provenance"
              libelle="Provenance"
              singulier="provenance"
              determinant="cette"
              valeur={saisie.provenanceId}
              changer={(provenanceId) => changer({ provenanceId })}
              toutes={catalogue.lues.provenances}
              invite="Choisir une provenance"
              creer={(nom, auteur) => creerEntree("provenances", nom, auteur)}
            />
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
                className="saisie mt-1.5"
              />
              <p className="mt-1 text-sm text-encre-doux">
                Un par ligne : ce qui accompagne la moto au moment où elle entre.
              </p>
            </div>
          )}
        </fieldset>

        <fieldset className="mt-6 cadre p-4">
          <legend className="px-1 font-semibold text-encre">Le prix de vente</legend>

          <div className="mt-2">
            <label htmlFor="prix-conseille" className="block text-sm font-medium text-encre">
              Prix de vente conseillé{" "}
              <span className="font-normal text-encre-doux">(facultatif)</span>
            </label>
            <input
              id="prix-conseille"
              inputMode="numeric"
              value={saisie.prixVenteConseille}
              onChange={(evenement) => changer({ prixVenteConseille: evenement.target.value })}
              className="saisie mt-1.5"
            />
            <p className="mt-1 text-sm text-encre-doux">
              Un repère pour le comptoir, pas un prix imposé : la vente se négocie.
            </p>
          </div>
        </fieldset>

        {voitLesCouts && (
          <fieldset className="mt-6 cadre p-4">
            <legend className="px-1 font-semibold text-encre">Ce qu’elle a coûté</legend>
            <p className="mt-1 text-sm text-encre-doux">
              Réservé au responsable. Vous pouvez le laisser vide et le poser plus tard depuis{" "}
              <Link href="/supervision/couts" className="underline">
                Prix d’achat
              </Link>
              .
            </p>

            <div className="mt-4">
              <label htmlFor="prix-achat" className="block text-sm font-medium text-encre">
                Prix d’achat <span className="font-normal text-encre-doux">(facultatif)</span>
              </label>
              <input
                id="prix-achat"
                inputMode="numeric"
                value={saisie.prixAchat}
                onChange={(evenement) => changer({ prixAchat: evenement.target.value })}
                className="saisie mt-1.5"
              />
            </div>

            <FraisEntree
              lignes={saisie.fraisEntree}
              changer={(fraisEntree) => changer({ fraisEntree })}
              types={catalogue.typesFrais.filter((t) => t.actif)}
            />

            {/* **Pas de total tant qu'il n'y a rien à totaliser** (S39).
                Le bloc affichait « 0 FCFA » sur un formulaire vide : tant que
                le prix d'achat était obligatoire, ce zéro était un compteur qui
                attendait. Devenu facultatif, il dit « cette moto a coûté
                zéro » — c'est-à-dire acquise gratuitement — là où la réponse
                est « on ne sait pas encore » (D82). Vu à la capture, pas à la
                relecture. */}
            {coutRenseigne(saisie) && (
              <p className="mt-4 flex items-baseline justify-between gap-4 border-t border-bord pt-3">
                <span className="text-sm font-medium text-encre">Coût total d’entrée</span>
                <span className="text-lg font-semibold text-encre">{formaterMontant(total)}</span>
              </p>
            )}
          </fieldset>
        )}

        <EtatErreurSaisie message={erreur} className="mt-3" />

        {/* La seconde moitié du remède, et elle n'est pas décorative : le garde
            ci-dessus empêche le doublon, ce bouton fait **disparaître** la
            course au lieu de la rattraper. Sans lui, le garde est un mur sans
            panneau — on clique, on se fait refuser, on ne sait pas pourquoi. */}
        <button type="submit" disabled={stock === null} className="mt-3 bouton bouton-principal">
          {stock === null ? "Lecture du stock…" : "Faire entrer en stock"}
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
