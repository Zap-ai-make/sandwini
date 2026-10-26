import { formaterTelephone, nomDuClient, type Client } from "@/lib/domain/client";
import { IDENTITE } from "@/lib/domain/entreprise";
import { formaterMontant, formaterNombre } from "@/lib/domain/format";
import { montantEnLettres } from "@/lib/domain/lettres";
import type { Boutique } from "@/lib/domain/boutique";
import type { Moto } from "@/lib/domain/moto";
import { LIBELLE_TYPE_RECU, type ContenuRecu } from "@/lib/domain/recu";
import {
  LIBELLE_MODE,
  LIBELLE_MOYEN,
  inclusionsDeVente,
  papiersEmportesDeVente,
  type Vente,
} from "@/lib/domain/vente";
import { Monogramme } from "@/components/Monogramme";

/**
 * Le reçu tel qu'il sort de l'imprimante (`prompt.md` §10).
 *
 * **C'est la facture du commanditaire, reproduite** (26 octobre 2026). « Le
 * reçu doit être exactement pareil », suivait une photographie de son carnet à
 * souches : cadre bleu, cases JOUR/MOIS/AN, champs du client sur des traits,
 * tableau QTÉ / DÉSIGNATION / PRIX D'ACHAT / MONTANT avec ses rangées laissées
 * libres, totaux en pastilles, somme arrêtée en toutes lettres, mention
 * ACQUITTÉ. C'est le document que ses clients reconnaissent et que son
 * comptable classe depuis des années — un reçu mieux dessiné mais étranger
 * leur ferait douter de sa provenance. Le dessin d'avant, pensé en A5 et en
 * noir, est remplacé en entier.
 *
 * **Ce que la reproduction n'a pas repris, et pourquoi.** Le numéro reste
 * celui du produit (`PTG-2610-0042`, D5/D44) et non un compteur à cinq
 * chiffres : il porte le code de la boutique, et c'est lui qui circule déjà
 * dans les dossiers et les versements. La souche crantée, elle, disparaît —
 * elle ne figure pas sur son carnet, et c'est son carnet qu'on reproduit.
 * Le nom du gérant reste imprimé en pied : le §10 l'exige, et la photographie
 * n'en portait pas parce qu'un carnet manuscrit est signé.
 *
 * **C'est le seul rendu du reçu : celui de l'écran et celui du papier sont le
 * même arbre.** Le PDF, quand le gérant en veut un, sort de la boîte
 * d'impression du navigateur, qui compose depuis ce même HTML — d'où l'absence
 * de bibliothèque PDF, et d'où l'impossibilité que le papier et le fichier
 * divergent (`DECISIONS.md` D60).
 *
 * **Une seule chose ici demande le réseau, et elle est bornée** : le logo est
 * désormais une photographie (choix du commanditaire), là où le monogramme
 * était un tracé écrit dans le code. Le fichier est servi depuis notre
 * domaine et préchargé par le service worker, donc présent hors ligne dès la
 * deuxième visite ; voir `LogoEntreprise`. Tout le reste — identité, chiffres,
 * polices — est sur place.
 *
 * Le composant ne lit rien et n'écoute rien : il reçoit tout. Ce qui se charge
 * vit dans `PanneauRecu`.
 */
export function Recu({
  contenu,
  boutique,
  client,
  moto,
  modele,
}: {
  contenu: ContenuRecu;
  boutique: Boutique | null;
  client: Client | null;
  moto: Moto | null;
  /** « Yamaha Crux », déjà résolu par le catalogue. */
  modele: string;
}) {
  const { vente } = contenu;

  /* La boutique passe devant le siège : le client revient au comptoir où il a
     acheté, pas au siège social. C'est l'adresse et le téléphone de ce
     comptoir-là qu'il doit trouver sur son papier. */
  const adresse = boutique?.adresse || IDENTITE.siege;
  /* Les cinq numéros de l'entreprise, plus celui du comptoir s'il en a un qui
     lui est propre. Le doublon est écarté : un même numéro imprimé deux fois
     ferait douter le client qu'il a bien lu. */
  const telephones = [
    ...IDENTITE.telephones,
    ...(boutique?.telephone && !IDENTITE.telephones.includes(boutique.telephone.replace(/\s/g, ""))
      ? [boutique.telephone]
      : []),
  ].map((numero) => formaterTelephone(numero));

  /* Le modèle, la couleur et l'année sur une seule ligne. C'est par là qu'on
     reconnaît une moto dans une cour, avant même de lire le châssis. */
  const designation = [modele, moto?.couleur, moto?.annee].filter(Boolean).join(" · ");
  const acquitte = contenu.resteDu === 0;

  return (
    <article
      aria-label={`${LIBELLE_TYPE_RECU[contenu.type]} ${contenu.numero}`}
      className="facture mx-auto max-w-[170mm]"
    >
      <header className="facture-entete">
        <Monogramme className="facture-logo" />
        <div className="facture-identite">
          {/* **Les deux noms, dans cet ordre** (26 octobre 2026). C'est l'acte
              qui nomme le vendeur en tête d'une pièce commerciale ; l'enseigne
              est ce que le client reconnaît. Les mettre l'un sous l'autre les
              rend tous deux vrais. */}
          <p className="facture-raison">{IDENTITE.raisonSociale}</p>
          <p className="facture-enseigne">{IDENTITE.nomCommercial}</p>
          <p>{IDENTITE.activite}</p>
          <p>{adresse}</p>
          <p>Tél : {telephones.join(" · ")}</p>
          <p>Secrétariat : {formaterTelephone(IDENTITE.secretariat)}</p>
          {/* IFU et RCCM sont obligatoires **en tête** d'un document commercial
              au Burkina Faso. Ils restent donc là, sous l'identité, même si le
              carnet les porte plus discrètement. */}
          <p>
            RCCM {IDENTITE.rccm} · IFU {IDENTITE.ifu}
          </p>
        </div>
      </header>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
        <CasesDate date={contenu.date} />

        <div className="flex flex-wrap items-center gap-4">
          <h1 className="facture-titre text-bloc leading-tight font-bold tracking-tight uppercase">
            {contenu.type === "vente" ? (
              <>
                Facture
                <br />
                de vente
              </>
            ) : (
              <>
                Reçu de
                <br />
                versement
              </>
            )}
          </h1>
          <span className="facture-numero">N° {contenu.numero}</span>
        </div>
      </div>

      {/* **Nom et prénom séparés, comme sur le carnet.** Le produit range les
          clients en « nom complet » ; la facture, elle, a deux traits, et c'est
          sur eux que le client vérifie son identité. */}
      <div className="mt-5 grid gap-x-8 gap-y-3 sm:grid-cols-2 print:grid-cols-2">
        <p className="facture-champ">
          <span>Nom :</span>
          <span>{client?.nom || nomDuClient(client)}</span>
        </p>
        <p className="facture-champ">
          <span>Prénom :</span>
          <span>{client?.prenom || "—"}</span>
        </p>
        <p className="facture-champ">
          <span>Téléphone :</span>
          <span>{client ? formaterTelephone(client.telephone) : "—"}</span>
        </p>
        <p className="facture-champ">
          <span>Localité :</span>
          <span>{client?.adresse || "—"}</span>
        </p>
      </div>

      <table className="facture-lignes mt-5">
        <caption className="sr-only">Ce qui est vendu, et à quel prix.</caption>
        <thead>
          <tr>
            <th scope="col" style={{ width: "3.5rem" }}>
              Qté
            </th>
            <th scope="col">Désignation</th>
            <th scope="col" style={{ width: "9rem" }}>
              Prix d’achat
            </th>
            <th scope="col" style={{ width: "9rem" }}>
              Montant
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="facture-quantite">1</td>
            <td>
              <span className="font-semibold">{moto ? designation : "Moto introuvable"}</span>
              {moto && (
                <>
                  <span className="block text-legende">
                    N° de cadre : <span className="font-code font-semibold">{moto.numeroChassis}</span>
                  </span>
                  {moto.couleur && (
                    <span className="block text-legende">
                      Couleur : <span className="font-semibold">{moto.couleur}</span>
                    </span>
                  )}
                </>
              )}
            </td>
            <td className="facture-nombre">{formaterNombre(vente.prixConvenu)}</td>
            <td className="facture-nombre">{formaterNombre(vente.prixConvenu)}</td>
          </tr>

          {/* **Pas de rangée libre** (26 octobre 2026) : « le nombre de lignes
              doit être celles qui sont remplies, pas ajouter des vides ». Sur
              le carnet elles laissaient la place d'une mention manuscrite ; un
              document imprimé n'a pas ce besoin, et trois cases vides sous une
              seule moto font chercher ce qui manque. */}
        </tbody>
      </table>

      {/* Le règlement sur sa ligne : le carnet ne le porte pas — il ne connaît
          que l'espèce — mais le produit vend à crédit et en tranches, et c'est
          la confusion la plus coûteuse du comptoir. */}
      <p className="mt-3 text-corps">
        <span className="facture-intitule">Règlement :</span>{" "}
        <span className="font-semibold">
          {[
            LIBELLE_MODE[vente.modePaiement],
            contenu.moyenPaiement ? LIBELLE_MOYEN[contenu.moyenPaiement] : null,
            contenu.reference ? `réf. ${contenu.reference}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </p>

      <div className="mt-4 grid items-end gap-6 sm:grid-cols-2 print:grid-cols-2">
        <div className="self-end">
          {contenu.type === "versement" && (
            /* Ce reçu-ci rend compte d'un versement précis : le dire, sinon
               « Versé » se lirait comme le montant remis aujourd'hui. */
            <p className="mb-4 text-corps">
              <span className="facture-intitule">Versement de ce jour :</span>{" "}
              <span className="font-code font-bold">
                {formaterMontant(contenu.montantEncaisse)}
              </span>
            </p>
          )}
          <p className="facture-signature">Signature du client</p>
        </div>

        <dl className="space-y-2">
          <div className="facture-total facture-total-fort">
            <dt>TOTAL</dt>
            <dd>{formaterMontant(vente.prixConvenu)}</dd>
          </div>
          <div className="facture-total">
            <dt>Versé</dt>
            <dd>{formaterMontant(contenu.totalPaye)}</dd>
          </div>
          <div className="facture-total">
            <dt>Reste</dt>
            <dd>{formaterMontant(contenu.resteDu)}</dd>
          </div>
        </dl>
      </div>

      {/* **La somme en lettres fait foi contre les chiffres** : on ne lui
          ajoute pas un zéro d'un trait de stylo. Elle porte le total de la
          facture, et non ce qui a été versé — c'est la somme arrêtée. */}
      <p className="mt-4 text-corps">
        <span className="facture-intitule">Arrêtée à la somme de :</span>{" "}
        <span className="font-semibold">{montantEnLettres(vente.prixConvenu)}</span>
      </p>

      {/* **ACQUITTÉ seulement quand plus rien n'est dû.** Le porter sur une
          facture à crédit en ferait une quittance, c'est-à-dire une preuve de
          paiement que le client n'a pas. */}
      {acquitte ? (
        <p className="facture-acquitte mt-4">ACQUITTÉ</p>
      ) : (
        <p className="facture-acquitte mt-4">
          RESTE À PAYER : {formaterMontant(contenu.resteDu)}
        </p>
      )}

      {contenu.type === "vente" && <CeQuiPart vente={vente} />}

      <p className="mt-6 text-legende text-right">
        Établi par {contenu.operateur || "opérateur non enregistré"}
        {boutique ? ` — ${boutique.nom}` : ""}
      </p>
    </article>
  );
}

/**
 * Les trois cases de la date, comme sur le carnet.
 *
 * Jour, mois, an séparés plutôt qu'une date écrite : c'est ainsi que le
 * commanditaire la remplit, chiffre par chiffre, et c'est ce qui rend le
 * document reconnaissable au premier coup d'œil. Le jour et le mois sont
 * complétés d'un zéro — sur deux chiffres, les colonnes s'alignent d'une
 * facture à l'autre dans un classeur.
 */
function CasesDate({ date }: { date: Date | null }) {
  const jour = date ? `${date.getDate()}`.padStart(2, "0") : "—";
  const mois = date ? `${date.getMonth() + 1}`.padStart(2, "0") : "—";
  const an = date ? `${date.getFullYear()}` : "—";

  return (
    <table className="facture-date">
      <caption className="sr-only">Date de la pièce</caption>
      <thead>
        <tr>
          <th scope="col">JOUR</th>
          <th scope="col">MOIS</th>
          <th scope="col">AN</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>{jour}</td>
          <td>{mois}</td>
          <td>{an}</td>
        </tr>
      </tbody>
    </table>
  );
}

/**
 * Ce qui part avec la moto, sur le papier.
 *
 * **Deux formes, et la seconde n'est pas une transition** : une vente d'avant
 * S44 portait deux listes de texte libre, et son reçu se réimprime avec ce que
 * le gérant avait écrit ce jour-là. Traduire ces lignes en cases fabriquerait
 * une donnée que personne n'a saisie, sur un document qui prétend faire foi
 * (D61). Les deux formes cohabitent donc, pour de bon.
 */
function CeQuiPart({ vente }: { vente: Vente }) {
  const inclusions = inclusionsDeVente(vente);
  /* **Ce que le client a emporté, sur le reçu comme sur la fiche** (S53). Les
     deux lisent `papiersEmportesDeVente` et rien d'autre : la spec exige qu'ils
     disent la même chose, et une seule lecture est la seule façon de le
     garantir.

     Un reçu réimprimé montre donc l'état du jour de la réimpression, et non
     celui de la vente. C'est juste ici, à l'inverse des deux listes de texte
     libre juste en dessous : « ce que le client a pris » est un fait sur la
     vente qui se complète dans les semaines qui suivent, pas une phrase écrite
     une fois au comptoir. */
  const emportes = papiersEmportesDeVente(vente);

  const papiers = emportes.length > 0 && (
    <p className="mt-2 text-legende">
      Papiers emportés : <span className="font-semibold">{emportes.join(", ")}</span>
    </p>
  );

  if (inclusions) {
    return (
      <>
        <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-legende">
          {inclusions.map(({ libelle, inclus }) => (
            <li key={libelle} className="flex items-center gap-2">
              {/* Le mot porte l'information, le signe ne fait que la doubler :
                  « Casque » et « Casque : non » ne se confondent pas, même sur
                  une photocopie où la coche a pâli (`DESIGN.md` §5). */}
              <span aria-hidden="true">{inclus ? "✓" : "—"}</span>
              <span>
                {libelle}
                {inclus ? "" : " : non inclus"}
              </span>
            </li>
          ))}
        </ul>
        {papiers}
      </>
    );
  }

  if (vente.inclus.length === 0 && vente.nonInclus.length === 0) return null;
  return (
    <div className="mt-4 grid gap-4 text-legende sm:grid-cols-2 print:grid-cols-2">
      <Convenu titre="Inclus" valeurs={vente.inclus} />
      <Convenu titre="Non inclus" valeurs={vente.nonInclus} />
    </div>
  );
}

function Convenu({ titre, valeurs }: { titre: string; valeurs: string[] }) {
  if (valeurs.length === 0) return null;
  return (
    <section>
      <h2 className="font-semibold">{titre}</h2>
      <ul className="mt-1">
        {valeurs.map((valeur) => (
          <li key={valeur}>{valeur}</li>
        ))}
      </ul>
    </section>
  );
}
