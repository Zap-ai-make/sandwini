"use client";

import { CircleAlert, Info, KeyRound, Lock, Printer, ReceiptText } from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { DossierDocuments } from "@/components/DossierDocuments";
import { Avis } from "@/components/patrons/Avis";
import { Champ } from "@/components/patrons/Champ";
import { EtatChargement, EtatErreur, EtatErreurSaisie } from "@/components/patrons/Etats";
import {
  Fait,
  Faits,
  PanneauLateral,
  TitrePanneau,
} from "@/components/patrons/PanneauLateral";
import { useSession } from "@/lib/auth/session";
import { formaterTelephone, type Client } from "@/lib/domain/client";
import { formaterDate, formaterDateHeure, formaterMontant } from "@/lib/domain/format";
import type { Moto } from "@/lib/domain/moto";
import { identifiantRecu, rangInscrit } from "@/lib/domain/recu";
import {
  LIBELLE_MODE,
  LIBELLE_MOYEN,
  LIBELLE_STATUT_PAIEMENT,
  MOYENS_PAIEMENT,
  SAISIE_VERSEMENT_VIDE,
  estRenumerotee,
  lignePaiement,
  peutRemettreMoto,
  resumerDossier,
  validerVersement,
  type DocumentDossier,
  type LignePaiement,
  type MargeVente,
  type MoyenPaiement,
  type SaisieVersement,
  type Vente,
  type Versement,
} from "@/lib/domain/vente";
import { useAbonnement } from "@/lib/repositories/abonnement";
import { useCatalogue, type Catalogue } from "@/lib/repositories/catalogue";
import { useFichierClients } from "@/lib/repositories/fichier-clients";
import { ecouterMoto } from "@/lib/repositories/motos";
import {
  confirmerRemiseMoto,
  ecouterDocumentsDeVente,
  ecouterMargeVente,
  ecouterVente,
  ecouterVersements,
  enregistrerVersement,
  messageErreurVersement,
} from "@/lib/repositories/ventes";

/**
 * La fiche d'une vente : tout le dossier, à côté de la liste.
 *
 * C'est l'écran qu'on ouvre quand un client revient — avec son reçu, ou juste
 * son nom. Il doit répondre en une seconde à trois questions : qu'est-ce qu'il
 * a acheté, combien reste-t-il dû, où en sont ses papiers.
 *
 * **C'est un panneau, désormais, et plus une page.** La fiche remplaçait la
 * liste : on revenait, la recherche était à refaire et la position perdue. Elle
 * s'ouvre maintenant à droite du tableau, qui reste lisible — `CAHIER-UI.md`
 * §7. Ce n'est toujours pas une route : `?vente=` plutôt que `/ventes/[id]`,
 * parce qu'une route dynamique tomberait hors ligne sur la page de repli pour
 * une vente enregistrée il y a dix secondes (D39).
 *
 * **L'identité passe du titre à la souche.** L'écran portait un `h1` au nom du
 * client ; il n'y en a plus qu'un, « Ventes », et le panneau est une section de
 * cet écran, pas une page de plus. Ce que le client cherche des yeux en tendant
 * son papier, c'est le numéro de la pièce : il est en tête, dessiné comme le
 * talon qu'on arrache du carnet (D70).
 *
 * **Les faits d'abord, resserrés.** L'argent, la moto et le client tenaient
 * trois cadres empilés de quatre lignes chacun ; dans 420 px, trois cadres font
 * une pile de boîtes. Ils sont une seule liste de faits, dans l'ordre où la
 * question se pose : qui, quoi, combien, combien reste-t-il.
 */
export function FicheVente({ id }: { id: string }) {
  const session = useSession();
  const catalogue = useCatalogue();
  const { clients } = useFichierClients();

  const souscrireVente = useCallback(
    (auChangement: (vente: Vente | null) => void, enErreur: (cause: unknown) => void) =>
      ecouterVente(id, auChangement, enErreur),
    [id],
  );
  const { valeur: vente, erreur } = useAbonnement(
    souscrireVente,
    "Cette vente n’a pas pu être chargée.",
  );

  const souscrireVersements = useCallback(
    (auChangement: (versements: Versement[]) => void, enErreur: (cause: unknown) => void) =>
      ecouterVersements(id, auChangement, enErreur),
    [id],
  );
  const { valeur: versements } = useAbonnement(
    souscrireVersements,
    "Les versements n’ont pas pu être lus.",
  );

  const souscrireDocuments = useCallback(
    (auChangement: (documents: DocumentDossier[]) => void, enErreur: (cause: unknown) => void) =>
      ecouterDocumentsDeVente(id, auChangement, enErreur),
    [id],
  );
  const { valeur: documents } = useAbonnement(souscrireDocuments, "Le dossier n’a pas pu être lu.");

  const motoId = vente?.motoId ?? "";
  const souscrireMoto = useCallback(
    (auChangement: (moto: Moto | null) => void, enErreur: (cause: unknown) => void) =>
      motoId ? ecouterMoto(motoId, auChangement, enErreur) : () => {},
    [motoId],
  );
  const { valeur: moto } = useAbonnement(souscrireMoto, "La moto n’a pas pu être chargée.");

  const estResponsable = session.statut === "connecte" && session.utilisateur.role === "responsable";
  const client = vente ? clients.find((fiche) => fiche.id === vente.clientId) : undefined;

  /* Les totaux affichés viennent des versements, pas des champs de la vente :
     ceux-ci sont un cache que deux appareils hors ligne peuvent s'écraser
     mutuellement (D56). Tant que les versements ne sont pas lus, `suivi` reste
     nul et l'écran retombe sur le cache — c'est le seul chiffre disponible, et
     il est juste dans le cas ordinaire. */
  const suivi = useMemo<LignePaiement | null>(
    () => (vente && versements ? lignePaiement(vente, versements, new Date()) : null),
    [vente, versements],
  );

  return (
    <PanneauLateral
      nom={vente ? `Vente ${vente.numero}` : "Vente"}
      fermerVers="/motos/ventes"
      identite={
        vente ? (
          <div className="souche">
            <p className="souche-numero">
              <span className="souche-code">{vente.boutiqueId}</span>
              {vente.numero.startsWith(`${vente.boutiqueId}-`)
                ? vente.numero.slice(vente.boutiqueId.length)
                : ` ${vente.numero}`}
            </p>
            <p className="souche-legende">
              {vente.date ? `Vente du ${formaterDate(vente.date)}` : "Date inconnue"}
            </p>
          </div>
        ) : (
          <p className="font-semibold text-encre">Vente</p>
        )
      }
      actions={
        vente ? (
          <>
            {/* Le reçu de la vente se réimprime à tout moment, et il se compose
                à la lecture : rien n'a été figé à la première impression (D61). */}
            <Link
              href={`/motos/recus?recu=${identifiantRecu(vente.id, null)}`}
              className="bouton bouton-plaque"
            >
              <Printer aria-hidden="true" className="size-4" />
              Reçu de vente
            </Link>
            {moto && (
              <Link href={`/motos?moto=${moto.id}`} className="bouton bouton-neutre">
                Fiche de la moto
              </Link>
            )}
          </>
        ) : undefined
      }
    >
      {erreur ? (
        <EtatErreur message={erreur} />
      ) : vente === null ? (
        <EtatChargement>Chargement de la vente…</EtatChargement>
      ) : (
        <>
          {estRenumerotee(vente) && (
            <Avis role="status" ton="alerte" titre="Ce reçu a été renuméroté" className="mb-4">
              Un autre appareil avait déjà attribué{" "}
              <span className="plaque-code">{vente.numeroInitial}</span> pendant la coupure. Le
              numéro qui fait foi est désormais{" "}
              <span className="plaque-code">{vente.numero}</span>. Si le client détient un reçu
              portant l’ancien, remettez-lui le nouveau.
            </Avis>
          )}

          <Identite
            vente={vente}
            client={client}
            moto={moto}
            catalogue={catalogue}
            suivi={suivi}
          />

          <EffetVente vente={vente} suivi={suivi} />

          {suivi && peutRemettreMoto(vente, suivi.resteDu) && <RemiseMoto vente={vente} />}

          <section>
            <TitrePanneau>Les versements</TitrePanneau>
            <ListeVersements versements={versements} />
            {/* Le formulaire n’apparaît qu’une fois les versements lus : leur
                nombre donne le rang du reçu, et leur somme le reste réellement
                dû. Sans eux, on numéroterait à l’aveugle. */}
            {suivi && suivi.resteDu > 0 && (
              <FormulaireVersement
                vente={vente}
                versements={versements ?? []}
                resteDu={suivi.resteDu}
              />
            )}
          </section>

          <section>
            <TitrePanneau>Le dossier</TitrePanneau>
            {documents && documents.length > 0 && (
              <p className="mb-2 text-corps text-encre-doux">{resumerDossier(documents)}</p>
            )}
            <DossierDocuments documents={documents} />
          </section>

          {(vente.inclus.length > 0 || vente.nonInclus.length > 0) && (
            <section>
              <TitrePanneau>Ce qui était convenu</TitrePanneau>
              <ListeConvenue titre="Inclus dans la vente" valeurs={vente.inclus} />
              <ListeConvenue titre="Non inclus" valeurs={vente.nonInclus} />
            </section>
          )}

          <section>
            <TitrePanneau>Marge</TitrePanneau>
            {estResponsable ? <Marge id={id} /> : <MargeMasquee />}
          </section>
        </>
      )}
    </PanneauLateral>
  );
}

/**
 * Qui, quoi, combien — en une seule liste.
 *
 * L'ordre suit la question qu'on se pose en tendant la main vers le reçu : le
 * nom qu'on vérifie, la moto qu'on reconnaît, puis l'argent. Le reste dû ferme
 * la liste parce que c'est le chiffre qu'on annonce à voix haute.
 */
function Identite({
  vente,
  client,
  moto,
  catalogue,
  suivi,
}: {
  vente: Vente;
  client: Client | undefined;
  moto: Moto | null;
  catalogue: Catalogue;
  suivi: LignePaiement | null;
}) {
  const totalPaye = suivi?.totalPaye ?? vente.totalPaye;
  const resteDu = suivi?.resteDu ?? vente.resteDu;
  const statutPaiement = suivi?.statutPaiement ?? vente.statutPaiement;

  return (
    <Faits>
      <Fait titre="Client">{client?.nom ?? "Client inconnu"}</Fait>
      {client && (
        <Fait titre="Téléphone" code>
          {formaterTelephone(client.telephone)}
        </Fait>
      )}
      <Fait titre="Moto">
        {moto ? `${catalogue.nomMarque(moto.marqueId)} ${catalogue.nomModele(moto.modeleId)}` : "…"}
      </Fait>
      {moto && (
        <Fait titre="Châssis" code>
          {moto.numeroChassis}
        </Fait>
      )}
      <Fait titre="Mode">{LIBELLE_MODE[vente.modePaiement]}</Fait>
      <Fait titre="Prix convenu" code>
        {formaterMontant(vente.prixConvenu)}
      </Fait>
      <Fait titre="Déjà versé" code>
        {formaterMontant(totalPaye)}
      </Fait>
      <Fait titre="Reste dû" code>
        {/* Jamais la couleur seule : « Soldée » est écrit juste dessous. */}
        <span className={resteDu === 0 ? "text-solde" : "text-encre"}>
          {formaterMontant(resteDu)}
        </span>
      </Fait>
      <Fait titre="Paiement">{LIBELLE_STATUT_PAIEMENT[statutPaiement]}</Fait>
    </Faits>
  );
}

/**
 * Ce que le mode de paiement a décidé du sort de la moto.
 *
 * La distinction crédit / tranches est la confusion la plus coûteuse du produit
 * (`prompt.md` §13), et elle ne se déduit pas d'un montant : elle s'écrit. La
 * phrase se lit ici comme sur l'écran de saisie, au même endroit de la lecture
 * et avec les mêmes mots.
 */
function EffetVente({ vente, suivi }: { vente: Vente; suivi: LignePaiement | null }) {
  const resteDu = suivi?.resteDu ?? vente.resteDu;

  return (
    <p className="mt-4 flex gap-2 rounded-champ border-l-[3px] border-l-goutte bg-goutte-surface p-3 text-encre">
      <Info aria-hidden="true" className="mt-0.5 size-[18px] shrink-0 text-goutte" />
      <span>
        {vente.motoRemise
          ? vente.dateRemiseMoto
            ? `La moto a été remise au client le ${formaterDate(vente.dateRemiseMoto)}.`
            : "La moto a été remise au client."
          : /* Le montant s'ajoute, la phrase ne se remplace pas : « la moto
               reste au magasin » est la distinction elle-même, et elle ne se
               dilue pas dans un chiffre (§13). */
            resteDu > 0
            ? `Non remise : la moto reste au magasin, il reste ${formaterMontant(resteDu)} à verser.`
            : "Non remise : la moto reste au magasin."}
      </span>
    </p>
  );
}

/**
 * La remise de la moto au terme des tranches.
 *
 * C'est le seul geste du produit qui change la nature de l'argent déjà
 * encaissé : jusqu'ici le magasin le détenait pour le compte du client, après
 * il l'a gagné (§6.2). D'où la confirmation en deux temps — pas une boîte de
 * dialogue du navigateur, qui se ferme d'un clic distrait et ne se teste pas —
 * et d'où la phrase qui dit ce qui devient irréversible.
 */
function RemiseMoto({ vente }: { vente: Vente }) {
  const session = useSession();
  const [confirmation, setConfirmation] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  function remettre() {
    if (session.statut !== "connecte") return;
    setErreur(null);
    setConfirmation(false);
    confirmerRemiseMoto(vente, {
      uid: session.utilisateur.uid,
      nom: session.utilisateur.nom,
    }).catch((cause) => setErreur(messageErreurVersement(cause)));
  }

  return (
    <section className="mt-4 rounded-champ border border-solde bg-solde-surface p-3">
      <h3 className="flex items-center gap-2 font-semibold text-encre">
        <KeyRound aria-hidden="true" className="size-4 shrink-0" />
        Tranches soldées — la moto peut partir
      </h3>
      <p className="mt-1 text-corps text-encre-doux">
        Le client a versé la totalité du prix convenu. En confirmant, la moto passe en vendue et
        l’argent détenu pour son compte devient une recette du magasin. Cette confirmation ne
        s’annule pas depuis l’application.
      </p>

      <EtatErreur message={erreur} className="mt-3" />

      {confirmation ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={remettre} className="bouton bouton-plaque">
            Oui, la moto est remise
          </button>
          <button
            type="button"
            onClick={() => setConfirmation(false)}
            className="bouton bouton-neutre"
          >
            Pas encore
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmation(true)}
          className="bouton bouton-plaque mt-3"
        >
          Confirmer la remise de la moto
        </button>
      )}
    </section>
  );
}

function ListeVersements({ versements }: { versements: Versement[] | null }) {
  if (versements === null) return <p className="text-corps text-encre-doux">Chargement…</p>;
  if (versements.length === 0)
    return (
      <p className="text-corps text-encre-doux">
        Aucun versement enregistré : le client n’a encore rien déposé.
      </p>
    );

  return (
    <ul className="divide-y divide-bord">
      {versements.map((versement) => (
        <li key={versement.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2">
          <span className="plaque-code text-corps text-encre-doux">
            {versement.date ? formaterDateHeure(versement.date) : "—"}
          </span>
          <span className="font-code ml-auto font-semibold whitespace-nowrap text-encre">
            {formaterMontant(versement.montant)}
          </span>
          <span className="w-full text-corps text-encre-doux">
            {LIBELLE_MOYEN[versement.moyenPaiement]}
            {versement.reference ? ` · ${versement.reference}` : ""}
            {/* L'acompte du jour de la vente n'a pas de reçu à lui : il est
                porté par le reçu de vente, remis en même temps (D52). */}
            {rangInscrit(versement.numeroRecu) !== null && (
              <>
                {" · "}
                {/* « Reçu » puis le numéro, et pas le numéro seul : le nom
                    accessible du lien doit dire où il mène, et une suite de
                    chiffres ne le dit pas (`DESIGN.md` §8). */}
                <Link
                  href={`/motos/recus?recu=${identifiantRecu(versement.venteId, versement.id)}`}
                  className="inline-flex items-center gap-1 font-medium text-encre underline underline-offset-2"
                >
                  <ReceiptText aria-hidden="true" className="size-3.5" />
                  Reçu <span className="plaque-code">{versement.numeroRecu}</span>
                </Link>
              </>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

function ListeConvenue({ titre, valeurs }: { titre: string; valeurs: string[] }) {
  if (valeurs.length === 0) return null;
  return (
    <div className="mt-2">
      <p className="text-corps text-encre-doux">{titre}</p>
      <ul className="mt-1 list-inside list-disc text-encre">
        {valeurs.map((valeur) => (
          <li key={valeur}>{valeur}</li>
        ))}
      </ul>
    </div>
  );
}

/**
 * La marge — réservée au responsable, et écrite par le serveur seul (D51).
 *
 * Elle peut manquer, et pour une bonne raison : c'est un déclencheur qui la
 * calcule, donc elle n'existe qu'une fois la vente parvenue au serveur. Une
 * vente saisie hors ligne n'en a pas encore. On le dit — un blanc se lirait
 * comme une panne.
 */
function Marge({ id }: { id: string }) {
  const souscrire = useCallback(
    (auChangement: (marge: MargeVente | null) => void, enErreur: (cause: unknown) => void) =>
      ecouterMargeVente(id, auChangement, enErreur),
    [id],
  );
  const { valeur: marge, erreur } = useAbonnement(souscrire, "La marge n’a pas pu être lue.");

  if (erreur) return <EtatErreur message={erreur} />;
  if (marge === null)
    return (
      <p className="flex gap-2 text-corps text-encre-doux">
        <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <span>
          La marge se calcule sur le serveur, à partir du coût d’entrée de la moto. Elle apparaîtra
          dès que cette vente y sera parvenue.
        </span>
      </p>
    );

  return (
    <Faits>
      <Fait titre="Coût de la moto, figé à la vente" code>
        {formaterMontant(marge.coutMotoSnapshot)}
      </Fait>
      <Fait titre="Marge" code>
        <span className={marge.marge < 0 ? "text-alerte" : "text-solde"}>
          {formaterMontant(marge.marge)}
        </span>
      </Fait>
    </Faits>
  );
}

function MargeMasquee() {
  return (
    <p className="flex gap-2 text-corps text-encre-doux">
      <Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>
        Le coût de la moto et la marge de cette vente sont réservés au responsable. Ils ne sont pas
        masqués à l’écran&nbsp;: ils ne quittent jamais le serveur pour votre compte.
      </span>
    </p>
  );
}

/**
 * Encaisser un versement.
 *
 * Trois champs, dont un seul est obligatoire : c'est un geste de comptoir, pas
 * une saisie comptable. Le maximum admissible est affiché plutôt que deviné —
 * dire « au plus 350 000 FCFA » vaut mieux que refuser après coup.
 *
 * L'écriture n'est pas attendue : le lot part dans la file de Firestore et
 * l'écoute de la sous-collection met la fiche à jour depuis le cache, sans
 * réseau. Le gérant voit son versement et peut annoncer le numéro du reçu
 * immédiatement, comme pour la vente elle-même.
 */
function FormulaireVersement({
  vente,
  versements,
  resteDu,
}: {
  vente: Vente;
  versements: readonly Versement[];
  resteDu: number;
}) {
  const session = useSession();
  const [saisie, setSaisie] = useState<SaisieVersement>(SAISIE_VERSEMENT_VIDE);
  const [erreur, setErreur] = useState<string | null>(null);
  const [recu, setRecu] = useState<string | null>(null);

  function encaisser(evenement: React.FormEvent) {
    evenement.preventDefault();
    if (session.statut !== "connecte") return;

    const probleme = validerVersement(saisie, resteDu);
    if (probleme) {
      setErreur(probleme);
      setRecu(null);
      return;
    }

    setErreur(null);
    const { numeroRecu, enregistre } = enregistrerVersement(vente, versements, saisie, {
      uid: session.utilisateur.uid,
      nom: session.utilisateur.nom,
    });
    enregistre.catch((cause) => setErreur(messageErreurVersement(cause)));

    setRecu(numeroRecu);
    setSaisie(SAISIE_VERSEMENT_VIDE);
  }

  return (
    <form onSubmit={encaisser} noValidate className="mt-4 rounded-champ border border-bord p-3">
      <p className="mb-3 font-semibold text-encre">Encaisser un versement</p>

      {recu && (
        <p role="status" className="mb-3 text-corps text-encre">
          Versement enregistré — reçu <span className="plaque-code">{recu}</span>. Si le réseau
          manque, il partira seul dès son retour.
        </p>
      )}

      <div className="space-y-3">
        <Champ
          id="montant-versement"
          libelle="Montant reçu"
          aide={`Au plus ${formaterMontant(resteDu)}, le reste dû.`}
        >
          <input
            id="montant-versement"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            aria-describedby="montant-versement-aide"
            value={saisie.montant}
            onChange={(evenement) =>
              setSaisie((actuel) => ({ ...actuel, montant: evenement.target.value }))
            }
            className="plaque-code saisie"
          />
        </Champ>

        <Champ id="moyen-versement" libelle="Moyen de paiement">
          <select
            id="moyen-versement"
            value={saisie.moyenPaiement}
            onChange={(evenement) =>
              setSaisie((actuel) => ({
                ...actuel,
                moyenPaiement: evenement.target.value as MoyenPaiement,
              }))
            }
            className="saisie"
          >
            {MOYENS_PAIEMENT.map((moyen) => (
              <option key={moyen} value={moyen}>
                {LIBELLE_MOYEN[moyen]}
              </option>
            ))}
          </select>
        </Champ>

        <Champ id="reference-versement" libelle="Référence" facultatif>
          <input
            id="reference-versement"
            type="text"
            autoComplete="off"
            placeholder="Numéro de transaction mobile money"
            value={saisie.reference}
            onChange={(evenement) =>
              setSaisie((actuel) => ({ ...actuel, reference: evenement.target.value }))
            }
            className="saisie placeholder:text-encre-doux"
          />
        </Champ>
      </div>

      <EtatErreurSaisie message={erreur} className="mt-2" />

      <button type="submit" className="bouton bouton-plaque">
        Enregistrer le versement
      </button>
    </form>
  );
}
