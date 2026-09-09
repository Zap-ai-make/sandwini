"use client";

import { TitreSection } from "@/components/patrons/Page";
import { formaterNombre } from "@/lib/domain/format";
import { libelleMois, type ChiffresDuMois as Chiffres, type Mois, type Part } from "@/lib/domain/chiffres";

/**
 * Les quatre chiffres du mois, et les deux répartitions (S24, `c3:89-172`).
 *
 * Le composant ne lit rien : il reçoit tout. Ce qui s’écoute vit dans l’écran,
 * ce qui se calcule vit dans `lib/domain/chiffres.ts`, et ce qui se dessine est
 * ici. Trois endroits, trois questions différentes.
 */
export function CartesDuMois({
  chiffres,
  mois,
  avecMarge,
}: {
  chiffres: Chiffres;
  mois: Mois;
  /** Un gérant n’a pas la marge : elle n’est pas masquée, elle est absente (D2). */
  avecMarge: boolean;
}) {
  const avant = libelleMois({
    annee: mois.mois === 0 ? mois.annee - 1 : mois.annee,
    mois: mois.mois === 0 ? 11 : mois.mois - 1,
  });

  return (
    <section aria-labelledby="titre-mois">
      <TitreSection id="titre-mois">Le mois</TitreSection>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Carte
          nom="Motos vendues"
          valeur={formaterNombre(chiffres.motosVendues)}
          detail={`${formaterNombre(chiffres.motosVenduesAvant)} en ${avant.replace(/ \d{4}$/, "")}`}
        />
        <Carte
          nom="Encaissé"
          valeur={formaterNombre(chiffres.encaisse)}
          detail="FCFA · tous moyens confondus"
        />
        {avecMarge && (
          <Carte
            nom="Marge brute"
            /* « — » et non « 0 » quand rien n'est connu : zéro affirmerait une
               marge nulle, le tiret dit qu'on ne sait pas. */
            valeur={chiffres.marge === null ? "—" : formaterNombre(chiffres.marge)}
            detail={
              chiffres.marge === null
                ? "Pas encore calculée pour ce mois"
                : chiffres.margePartiellementEncaissee
                  ? "FCFA · acquise à la vente, pas encore encaissée en totalité"
                  : "FCFA · hors frais de dossier"
            }
          />
        )}
        {/* Une carte, deux lignes. Les additionner produirait un nombre qui ne
            désigne rien : dans un cas le magasin attend de l'argent, dans
            l'autre il en détient. La maquette se contredisait sur ce point ;
            c'est sa seconde version qui fait foi (`c3:166`). */}
        <div className="cadre p-4 sm:p-5">
          <p className="text-legende font-bold tracking-[0.07em] text-encre-doux uppercase">
            Reste à percevoir
          </p>
          <dl className="mt-2 grid gap-2">
            <Deux
              terme="Créances"
              aide="crédits — la moto est partie"
              valeur={formaterNombre(chiffres.creances)}
            />
            <Deux
              terme="Dépôts"
              aide="tranches — la moto est au magasin"
              valeur={formaterNombre(chiffres.depots)}
            />
          </dl>
        </div>
      </div>

      {/* Écrit une fois, sous les cartes : deux dates différentes se lisent
          au-dessus, et sans cette phrase on croit à une incohérence. */}
      <p className="mt-3 max-w-prose text-corps text-encre-doux">
        « Motos vendues » compte les ventes du mois&nbsp;; « encaissé » compte l’argent entré ce
        mois-là, quelle que soit la date de la vente. Une vente du mois dernier payée ce mois-ci
        apparaît donc dans les deux, à deux endroits différents.
      </p>
    </section>
  );
}

function Carte({ nom, valeur, detail }: { nom: string; valeur: string; detail: string }) {
  return (
    <div className="cadre p-4 sm:p-5">
      <p className="text-legende font-bold tracking-[0.07em] text-encre-doux uppercase">{nom}</p>
      {/* En Plex Mono et tabulaire : deux mois se comparent chiffre à chiffre,
          et des colonnes qui ne s'alignent pas obligent à relire (`socle.css:1125`). */}
      <p className="mt-1 font-code text-chiffre leading-tight tabular-nums text-encre">{valeur}</p>
      <p className="text-legende text-encre-doux">{detail}</p>
    </div>
  );
}

function Deux({ terme, aide, valeur }: { terme: string; aide: string; valeur: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
      <dt className="text-corps text-encre">
        {terme} <span className="text-legende text-encre-doux">{aide}</span>
      </dt>
      <dd className="font-code text-bloc tabular-nums text-encre">{valeur}</dd>
    </div>
  );
}

/**
 * Une répartition en barres (`c3:118-172`).
 *
 * **Les barres se rapportent à la plus grande part, pas au total** — la raison
 * est dans `lib/domain/chiffres.ts`. La valeur chiffrée est écrite à côté :
 * une longueur ne se lit pas, elle se compare.
 */
export function Repartition({
  titre,
  id,
  parts,
  unite,
  children,
}: {
  titre: string;
  id: string;
  parts: Part[];
  /** Ce que compte la seconde valeur : « motos », « ventes ». */
  unite: string;
  children?: React.ReactNode;
}) {
  if (parts.length === 0) return null;

  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="mb-3 text-bloc font-bold tracking-tight text-encre">
        {titre}
      </h2>
      <div className="cadre p-4 sm:p-5">
        <ul className="grid gap-3">
          {parts.map((part) => (
            <li
              key={part.cle}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[8rem_minmax(0,1fr)_7.5rem_5.5rem]"
            >
              <span className="font-medium text-encre">{part.libelle}</span>
              {/* La piste garde sa place même vide : sans elle, les lignes se
                  décalent d'une part à l'autre et la comparaison est perdue. */}
              <span className="order-last col-span-2 h-2.5 overflow-hidden rounded-full bg-fond sm:order-none sm:col-span-1">
                <span
                  aria-hidden="true"
                  className="block h-full bg-goutte"
                  style={{ width: `${part.pourcentage}%` }}
                />
              </span>
              <span className="text-right font-code tabular-nums text-encre">
                {formaterNombre(part.montant)}
              </span>
              <span className="text-right text-legende text-encre-doux sm:text-left">
                {formaterNombre(part.compte)} {unite}
              </span>
            </li>
          ))}
        </ul>
        {children}
      </div>
    </section>
  );
}
