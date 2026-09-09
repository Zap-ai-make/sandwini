import { TriangleAlert } from "lucide-react";
import { Monogramme } from "@/components/Monogramme";
import { formaterTelephone } from "@/lib/domain/client";
import { IDENTITE, IDENTITE_A_CONFIRMER, LIBELLE_IDENTITE } from "@/lib/domain/entreprise";

/**
 * L’identité de l’entreprise : ce qui s’imprime en tête de chaque reçu.
 *
 * **Une carte qu’on lit, sans champ ni bouton** (D71). Raison sociale, siège,
 * téléphone, IFU et RCCM sont posés dans le code : ils ne changent pas d’une
 * année sur l’autre, et un champ modifiable ne servirait qu’à les casser. La
 * forme le dit d’elle-même — un champ grisé aurait laissé croire qu’il existe
 * un moyen de le dégriser.
 *
 * Elle est ici, et non dans l’écran qui la portait seul, parce que deux écrans
 * la montrent désormais : le hub des réglages, où elle se lit d’un coup d’œil,
 * et la fiche de l’entreprise, où elle accompagne le seul réglage qui change.
 * Une seule écriture, deux emplacements — l’inverse aurait fini par diverger.
 *
 * **Le monogramme fait partie de la carte** (`a9:94`). Il n’y est pas en
 * décoration : cette carte montre ce qui s’imprime en tête du reçu, et le
 * monogramme en fait partie. L’en montrer amputée aurait fait mentir la phrase
 * qui l’accompagne. Les faits restent bornés à 560 px comme dans la maquette
 * (`socle.css:996`) — sur une carte large, l’œil ne doit pas traverser la page
 * pour rejoindre une valeur à son intitulé.
 */
/**
 * Ce qui se recopie à la main, et qui se lit donc en chiffres tabulaires.
 *
 * La maquette met ces trois-là en `code` (`a9:99-104`), et pas les autres :
 * « Sandwidi et Frères » se lit, « BFTNK2016A495 » se relit caractère par
 * caractère — sur un formulaire fiscal, contre un écran. Le défaut n’était pas
 * dans l’audit, il s’est vu sur la capture une fois le monogramme posé à côté.
 */
const EN_CHIFFRES = new Set<keyof typeof IDENTITE>(["telephones", "ifu", "rccm"]);

export function IdentiteEntreprise() {
  const aConfirmer = new Set<string>(IDENTITE_A_CONFIRMER);

  return (
    <div className="flex items-start gap-4 sm:gap-6">
      {/* Réduit sur un téléphone : à 88 px, il prenait le quart de la largeur
          et poussait « BF-OUA-01-2016-A12-00847 » sur trois lignes. */}
      <Monogramme className="mt-2 w-14 shrink-0 sm:w-[88px]" />
      <dl className="min-w-0 flex-1 divide-y divide-bord sm:max-w-[560px]">
      {(Object.keys(IDENTITE) as (keyof typeof IDENTITE)[]).map((champ) => (
        <div key={champ} className="flex flex-wrap items-baseline justify-between gap-x-4 py-2">
          <dt className="text-corps text-encre-doux">{LIBELLE_IDENTITE[champ]}</dt>
          <dd className="text-right text-encre">
            <span className={EN_CHIFFRES.has(champ) ? "plaque-code" : undefined}>
              {champ === "telephones"
                ? IDENTITE.telephones.map((numero) => formaterTelephone(numero)).join(" · ")
                : IDENTITE[champ]}
            </span>
            {/* Jamais la couleur seule : « à confirmer » est écrit. */}
            {aConfirmer.has(champ) && (
              <span className="pastille pastille-retard ml-2">à confirmer</span>
            )}
          </dd>
        </div>
      ))}
      </dl>
    </div>
  );
}

/**
 * L’avertissement des numéros non confirmés.
 *
 * Tant que l’IFU et le RCCM n’ont pas été communiqués, ils sont au bon format
 * et faux. Le dire à l’écran, plutôt que dans un commentaire de code que
 * personne n’ouvrira avant le premier contrôle fiscal.
 *
 * `note` et non `alert` : ce message est là en permanence, il ne survient pas.
 * Un `alert` permanent est réannoncé à chaque ouverture de l’écran et entre en
 * concurrence avec la vraie erreur de validation du formulaire voisin — c’est
 * un test bout en bout qui l’a montré, en trouvant celui-ci quand il cherchait
 * celle-là.
 */
export function NumerosAConfirmer() {
  if (IDENTITE_A_CONFIRMER.length === 0) return null;

  return (
    <p
      role="note"
      className="flex max-w-prose gap-3 rounded-plaque border border-alerte bg-alerte-surface p-3 text-corps text-encre"
    >
      <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-alerte" />
      <span>
        <strong className="font-semibold">
          {IDENTITE_A_CONFIRMER.length === 1
            ? "Un numéro n’a pas été confirmé"
            : "Deux numéros n’ont pas été confirmés"}
          .
        </strong>{" "}
        Ils s’impriment sur un document commercial. Communiquez les vrais numéros à qui maintient le
        logiciel avant de remettre un reçu à un client.
      </span>
    </p>
  );
}
