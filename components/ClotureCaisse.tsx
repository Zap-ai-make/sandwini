"use client";

import { Check, TriangleAlert } from "lucide-react";
import { useState, type FormEvent } from "react";
import { EtatErreurSaisie } from "@/components/patrons/Etats";
import {
  lireMontantCaisse,
  motifRequis,
  validerCloture,
  SAISIE_CLOTURE_VIDE,
  SEUIL_MOTIF_DEFAUT,
  type Cloture,
  type FondsOuverture,
  type ResumeJournee,
  type SaisieCloture,
} from "@/lib/domain/caisse";
import { formaterDate, formaterMontant, formaterNombre } from "@/lib/domain/format";
import { LIBELLE_MOYEN } from "@/lib/domain/vente";

/**
 * La colonne de droite : ce qui devrait être dans le tiroir, et ce qu’on y a
 * trouvé (`c2:151-172`).
 *
 * **Le tiroir et le téléphone ne se mélangent pas.** « Espèces attendues en
 * caisse » ne compte que les espèces ; les moyens mobiles sont listés au-dessus
 * du filet parce qu’ils se rapprochent d’un relevé d’opérateur, pas d’un
 * comptage à la main. Les additionner ferait chercher au gérant un argent qui
 * n’a jamais été dans le tiroir.
 *
 * **Le comptage se saisit avant de clôturer, et ne se corrige plus après.** La
 * phrase est dans la maquette et elle n’est pas décorative : une clôture est
 * une affirmation datée, et les règles Firestore refusent de la réécrire.
 */
export function ClotureCaisse({
  resume,
  fonds,
  jour,
  cloture,
  peutCloturer,
  enregistrer,
}: {
  resume: ResumeJournee;
  fonds: FondsOuverture;
  jour: string;
  /** La clôture déjà faite, s’il y en a une : on relit au lieu de saisir. */
  cloture: Cloture | null;
  /** Le gérant de la boutique clôture, et lui seul (arbitrage 3). */
  peutCloturer: boolean;
  enregistrer: (comptees: number, motif: string) => Promise<void>;
}) {
  if (cloture) return <ClotureFaite cloture={cloture} />;

  return (
    <div className="cadre p-4 sm:p-5">
      <h2 className="text-bloc font-bold tracking-tight text-encre">La clôture</h2>

      <Comptes resume={resume} fonds={fonds} />

      {peutCloturer ? (
        <FormulaireCloture attendues={resume.especesAttendues} enregistrer={enregistrer} />
      ) : (
        /* Le responsable lit les clôtures sans en faire (arbitrage 3). Lui
           montrer un bouton refusé par les règles serait promettre un geste
           qu’on lui reprendrait. */
        <p className="mt-5 border-t border-bord pt-4 text-corps text-encre-doux">
          C’est le gérant de la boutique qui compte le tiroir et clôture la journée du{" "}
          {formaterDate(new Date(`${jour}T12:00:00`))}. Vous en verrez le résultat ici.
        </p>
      )}
    </div>
  );
}

/** Les quatre faits, puis le total qui s’en déduit. */
function Comptes({ resume, fonds }: { resume: ResumeJournee; fonds: FondsOuverture }) {
  return (
    <>
      <dl className="mt-4 grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-corps">
        <Ligne terme="Fonds d’ouverture" valeur={resume.fondsOuverture} />
        <Ligne terme="Espèces encaissées" valeur={resume.especesEncaissees} />
        <Ligne terme="Sorties d’espèces" valeur={-resume.sortiesEspeces} />
        {resume.parMoyenMobile.map((part) => (
          <Ligne key={part.moyen} terme={LIBELLE_MOYEN[part.moyen]} valeur={part.montant} />
        ))}
      </dl>

      {/* Le fonds reporté d’une journée que personne n’a comptée : la chaîne
          des journées se tient toujours, mais elle porte un maillon non
          vérifié. C’est ce que les réponses 1 et 4 produisent ensemble, et
          l’écrire est la seule chose qui empêche le report d’affirmer plus
          qu’il ne sait. */}
      {fonds.source === "attendue" && (
        <p className="mt-3 flex gap-2 text-legende text-encre-doux">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-alerte" />
          <span>
            Le fonds d’ouverture vient d’une journée fermée sans comptage : c’est un montant
            attendu, que personne n’a vérifié.
          </span>
        </p>
      )}
      {fonds.source === "premiere" && (
        <p className="mt-3 text-legende text-encre-doux">
          Première journée de cette caisse : le fonds d’ouverture part de zéro.
        </p>
      )}

      <p className="mt-4 flex items-baseline justify-between gap-3 border-t-2 border-encre pt-3 font-bold">
        <span>Espèces attendues en caisse</span>
        <span className="font-code tabular-nums">{formaterMontant(resume.especesAttendues)}</span>
      </p>
    </>
  );
}

function Ligne({ terme, valeur }: { terme: string; valeur: number }) {
  return (
    <>
      <dt className="text-encre-doux">{terme}</dt>
      <dd className="text-right font-code tabular-nums text-encre">
        {valeur < 0 ? "−" : ""}
        {formaterNombre(Math.abs(valeur))}
      </dd>
    </>
  );
}

/**
 * Le comptage et le geste.
 *
 * Le motif n’apparaît qu’une fois l’écart connu et au-delà du seuil : demander
 * une explication avant de savoir s’il y en a une à donner ferait remplir un
 * champ vide neuf fois sur dix.
 */
function FormulaireCloture({
  attendues,
  enregistrer,
}: {
  attendues: number;
  enregistrer: (comptees: number, motif: string) => Promise<void>;
}) {
  const [saisie, setSaisie] = useState<SaisieCloture>(SAISIE_CLOTURE_VIDE);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const comptees = lireMontantCaisse(saisie.especesComptees);
  const ecart = comptees === null ? null : comptees - attendues;
  const motifAttendu = motifRequis(ecart);

  async function soumettre(evenement: FormEvent) {
    evenement.preventDefault();
    const refus = validerCloture(saisie, attendues);
    setErreur(refus);
    if (refus !== null || comptees === null) return;

    setEnCours(true);
    try {
      /* Pas d’attente de l’accusé de réception : le geste rend la main sur
         l’écriture locale (D76). Le bandeau dit ce qui reste à envoyer. */
      await enregistrer(comptees, saisie.motif.trim());
    } catch (cause) {
      setErreur(cause instanceof Error ? cause.message : "La clôture n’a pas pu être enregistrée.");
      setEnCours(false);
    }
  }

  return (
    <form onSubmit={soumettre} className="mt-5 border-t border-bord pt-4">
      <div className="champ">
        <label htmlFor="especes-comptees">Espèces comptées</label>
        <input
          id="especes-comptees"
          className="saisie"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={saisie.especesComptees}
          onChange={(evenement) =>
            setSaisie((actuelle) => ({ ...actuelle, especesComptees: evenement.target.value }))
          }
        />
        <p className="champ-aide">
          Comptez avant de clôturer : l’écart est enregistré avec la clôture et ne se corrige plus
          après.
        </p>
      </div>

      {/* L’écart se montre pendant la saisie, pas après coup : c’est le moment
          où le gérant peut encore recompter. */}
      {ecart !== null && (
        <p
          className={`mt-3 flex items-center gap-2 text-corps font-semibold ${
            ecart === 0 ? "text-solde" : "text-alerte"
          }`}
        >
          {ecart === 0 ? (
            <Check aria-hidden="true" className="size-4 shrink-0" />
          ) : (
            <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
          )}
          {ecart === 0
            ? "Le compte y est."
            : `${ecart > 0 ? "Excédent" : "Manque"} de ${formaterMontant(Math.abs(ecart))}.`}
        </p>
      )}

      {motifAttendu && (
        <div className="champ mt-3">
          <label htmlFor="motif-ecart">D’où vient cet écart ?</label>
          <input
            id="motif-ecart"
            className="saisie"
            type="text"
            maxLength={300}
            value={saisie.motif}
            onChange={(evenement) =>
              setSaisie((actuelle) => ({ ...actuelle, motif: evenement.target.value }))
            }
          />
          <p className="champ-aide">
            Au-delà de {formaterNombre(SEUIL_MOTIF_DEFAUT)} FCFA, une phrase est demandée — un écart
            qu’on valide sans rien dire cesse d’être une information.
          </p>
        </div>
      )}

      {erreur && <EtatErreurSaisie message={erreur} className="mt-3" />}

      <button type="submit" className="bouton bouton-principal mt-5 w-full" disabled={enCours}>
        Clôturer la journée
      </button>
    </form>
  );
}

/** Une journée déjà close : on la relit, on ne la refait pas. */
function ClotureFaite({ cloture }: { cloture: Cloture }) {
  const automatique = cloture.cloturePar === "automatique";

  return (
    <div className="cadre p-4 sm:p-5">
      <h2 className="text-bloc font-bold tracking-tight text-encre">La clôture</h2>

      <dl className="mt-4 grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-corps">
        <Ligne terme="Fonds d’ouverture" valeur={cloture.fondsOuverture} />
        <Ligne terme="Espèces attendues" valeur={cloture.especesAttendues} />
        {cloture.especesComptees !== null && (
          <Ligne terme="Espèces comptées" valeur={cloture.especesComptees} />
        )}
      </dl>

      {automatique ? (
        /* La réponse 4 du commanditaire, dite au lecteur et non cachée. Sans
           cette phrase, la journée aurait l’air vérifiée alors qu’elle ne l’est
           pas — et c’est exactement ce qu’un écart affiché à zéro aurait fait
           croire. */
        <p className="mt-4 flex gap-2 border-t border-bord pt-4 text-corps text-encre-doux">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-alerte" />
          <span>
            Journée fermée automatiquement : personne ne l’a clôturée le soir même, et le tiroir
            n’a pas été compté. Il n’y a donc pas d’écart connu pour ce jour-là.
          </span>
        </p>
      ) : (
        <>
          <p
            className={`mt-4 flex items-baseline justify-between gap-3 border-t-2 border-encre pt-3 font-bold ${
              cloture.ecart === 0 ? "" : "text-alerte"
            }`}
          >
            <span>Écart</span>
            <span className="font-code tabular-nums">
              {cloture.ecart === 0 ? "Aucun" : formaterMontant(cloture.ecart ?? 0)}
            </span>
          </p>
          {cloture.motif && <p className="mt-2 text-corps text-encre-doux">{cloture.motif}</p>}
          <p className="mt-4 text-legende text-encre-doux">
            Clôturée par {cloture.clotureParNom || "un compte sans nom"}.
          </p>
        </>
      )}
    </div>
  );
}
