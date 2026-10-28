"use client";

import { Chiffre } from "@/components/patrons/Chiffre";
import { TitreSection } from "@/components/patrons/Page";
import { compter, formaterMontant, formaterNombre } from "@/lib/domain/format";
import { type ChiffresDuMois as Chiffres, type Part } from "@/lib/domain/chiffres";

/**
 * Les quatre chiffres du mois, et les deux répartitions (S24, `c3:89-172`).
 *
 * Le composant ne lit rien : il reçoit tout. Ce qui s’écoute vit dans l’écran,
 * ce qui se calcule vit dans `lib/domain/chiffres.ts`, et ce qui se dessine est
 * ici. Trois endroits, trois questions différentes.
 */
export function CartesDuMois({
  chiffres,
  avecMarge,
}: {
  chiffres: Chiffres;
  /** Un gérant n’a pas la marge : elle n’est pas masquée, elle est absente (D2). */
  avecMarge: boolean;
}) {

  return (
    <section aria-labelledby="titre-mois">
      <TitreSection id="titre-mois">Le mois</TitreSection>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Carte
          nom="Motos vendues"
          valeur={formaterNombre(chiffres.motosVendues)}
        />
        <Carte
          nom="Encaissé"
          valeur={formaterNombre(chiffres.encaisse)}
        />
        {avecMarge && (
          <Carte
            nom="Marge brute"
            /* « — » et non « 0 » quand rien n'est connu : zéro affirmerait une
               marge nulle, le tiret dit qu'on ne sait pas. */
            valeur={chiffres.marge === null ? "—" : formaterNombre(chiffres.marge)}
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
            <Deux terme="Créances" valeur={formaterNombre(chiffres.creances)} />
            <Deux terme="Dépôts" valeur={formaterNombre(chiffres.depots)} />
          </dl>
        </div>
      </div>

    </section>
  );
}

function Carte({ nom, valeur }: { nom: string; valeur: string }) {
  return (
    <div className="cadre p-4 sm:p-5">
      <p className="text-legende font-bold tracking-[0.07em] text-encre-doux uppercase">{nom}</p>
      {/* En Plex Mono et tabulaire : deux mois se comparent chiffre à chiffre,
          et des colonnes qui ne s'alignent pas obligent à relire (`socle.css:1125`). */}
      <p className="mt-1 font-code text-chiffre leading-tight tabular-nums text-encre">
        <Chiffre valeur={valeur} />
      </p>
    </div>
  );
}

function Deux({ terme, valeur }: { terme: string; valeur: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
      <dt className="text-corps text-encre">{terme}</dt>
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
 *
 * **À une seule part, la barre disparaît (S55).** Rapportée à la plus grande
 * part, une barre est pleine par construction quand elle est seule : elle
 * occupe toute la piste pour n'annoncer que « cette part est la plus grande des
 * parts ». Le commanditaire l'a dit à sa façon — « je ne comprends rien » —
 * devant deux sections n'ayant qu'une boutique et qu'un seul mode de paiement.
 * Une barre sert à comparer ; sans rien à comparer, elle occupe la place d'une
 * information qu'elle ne porte pas. On écrit alors la phrase que la barre
 * essayait de dessiner.
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
  /** Ce que compte la seconde valeur, **au singulier** : « moto », « vente ». */
  unite: string;
  /** Ce qu'on dit à la place des barres quand il n'y a qu'une part. */
  children?: React.ReactNode;
}) {
  if (parts.length === 0) return null;

  if (parts.length === 1) {
    const part = parts[0];
    return (
      <section aria-labelledby={id}>
        <h2 id={id} className="mb-3 text-bloc font-bold tracking-tight text-encre">
          {titre}
        </h2>
        <div className="cadre p-4 sm:p-5">
          <p className="font-medium text-encre">{part.libelle}</p>
          <p className="mt-1 font-code text-bloc tabular-nums text-encre">
            {formaterMontant(part.montant)}{" "}
            <span className="text-encre-doux">· {compter(part.compte, unite)}</span>
          </p>
          {children}
        </div>
      </section>
    );
  }

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
                {compter(part.compte, unite)}
              </span>
            </li>
          ))}
        </ul>
        {children}
      </div>
    </section>
  );
}
