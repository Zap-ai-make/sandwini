"use client";

import { ArrowLeft, CircleAlert, KeyRound, LoaderCircle, Lock, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useSession } from "@/lib/auth/session";
import { formaterTelephone, type Client } from "@/lib/domain/client";
import { formaterDate, formaterDateHeure, formaterMontant } from "@/lib/domain/format";
import type { Moto } from "@/lib/domain/moto";
import {
  LIBELLE_DOCUMENT,
  LIBELLE_MODE,
  LIBELLE_MOYEN,
  LIBELLE_STATUT_DOCUMENT,
  LIBELLE_STATUT_PAIEMENT,
  MOYENS_PAIEMENT,
  SAISIE_VERSEMENT_VIDE,
  estRenumerotee,
  lignePaiement,
  peutRemettreMoto,
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
 * La fiche d'une vente : tout le dossier sur un écran.
 *
 * C'est l'écran qu'on ouvre quand un client revient — avec son reçu, ou juste
 * son nom. Il doit répondre en une seconde à trois questions : qu'est-ce qu'il
 * a acheté, combien reste-t-il dû, où en sont ses papiers.
 *
 * Comme la fiche d'une moto, ce n'est pas une route à part mais un panneau de
 * `/motos/ventes`, ouvert par `?vente=`. Une route dynamique obligerait le
 * navigateur à demander au serveur un document que le service worker n'a jamais
 * vu : hors ligne, la vente qu'on vient d'enregistrer tomberait sur la page de
 * repli (D39).
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
  const { valeur: documents } = useAbonnement(
    souscrireDocuments,
    "Le dossier n’a pas pu être lu.",
  );

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
    <div>
      {/* Le lien de retour dans son propre bloc : « inline-flex » seul, la
          plaque du numéro qui suit se posait sur la même ligne et recouvrait le
          mot « Ventes ». */}
      <div>
        <Link
          href="/motos/ventes"
          className="inline-flex items-center gap-2 text-sm text-encre-doux hover:text-encre"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Ventes
        </Link>
      </div>

      {erreur ? (
        <p role="alert" className="mt-6 text-alerte">
          {erreur}
        </p>
      ) : vente === null ? (
        <p className="mt-6 flex items-center gap-3 text-encre-doux">
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          Chargement de la vente…
        </p>
      ) : (
        <>
          <span className="plaque-code mt-3 inline-block rounded-plaque border border-plaque-bord bg-plaque px-2 py-1 text-sm leading-none text-encre-fixe">
            {vente.numero}
          </span>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-encre">
            {client?.nom ?? "Client inconnu"}
          </h1>
          <p className="mt-1 text-sm text-encre-doux">
            {vente.date ? formaterDate(vente.date) : "Date inconnue"} · {vente.boutiqueId} ·{" "}
            {LIBELLE_MODE[vente.modePaiement]}
          </p>

          {estRenumerotee(vente) && <Renumerotee vente={vente} />}

          <Argent vente={vente} suivi={suivi} />

          {suivi && peutRemettreMoto(vente, suivi.resteDu) && <RemiseMoto vente={vente} />}

          <MotoVendue vente={vente} catalogue={catalogue} suivi={suivi} />

          {client && <FicheClient client={client} />}

          <Dossier documents={documents} />

          <Versements vente={vente} versements={versements} suivi={suivi} />

          {(vente.inclus.length > 0 || vente.nonInclus.length > 0) && (
            <div className="mt-6 grid gap-6 sm:grid-cols-2">
              <ListeConvenue titre="Inclus dans la vente" valeurs={vente.inclus} />
              <ListeConvenue titre="Non inclus" valeurs={vente.nonInclus} />
            </div>
          )}

          {estResponsable ? <Marge id={id} /> : <MargeMasquee />}
        </>
      )}
    </div>
  );
}

/**
 * Le signalement d'une renumérotation (D44, `prompt.md` §3.3).
 *
 * On le repère en comparant les deux champs, sans drapeau qui pourrait mentir.
 * Le message dit l'ancien numéro autant que le nouveau : c'est l'ancien qui est
 * écrit sur le reçu déjà remis au client.
 */
function Renumerotee({ vente }: { vente: Vente }) {
  return (
    <p
      role="status"
      className="mt-4 flex gap-3 rounded-plaque border border-plaque-bord bg-plaque/15 p-4 text-sm text-encre"
    >
      <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>
        Ce reçu a été renuméroté à la synchronisation : un autre appareil avait déjà attribué{" "}
        <span className="plaque-code">{vente.numeroInitial}</span> pendant la coupure. Le numéro qui
        fait foi est désormais <span className="plaque-code">{vente.numero}</span>. Si le client
        détient un reçu portant l’ancien, remettez-lui le nouveau.
      </span>
    </p>
  );
}

function Argent({ vente, suivi }: { vente: Vente; suivi: LignePaiement | null }) {
  const totalPaye = suivi?.totalPaye ?? vente.totalPaye;
  const resteDu = suivi?.resteDu ?? vente.resteDu;
  const statutPaiement = suivi?.statutPaiement ?? vente.statutPaiement;
  const dernierVersementAt = suivi?.dernierVersementAt ?? vente.dernierVersementAt;
  const solde = resteDu === 0;

  return (
    <section className="mt-6 overflow-hidden rounded-plaque border-2 border-plaque-bord bg-papier">
      <dl className="divide-y divide-bord">
        <Ligne titre="Prix convenu" valeur={formaterMontant(vente.prixConvenu)} />
        <Ligne titre="Déjà payé" valeur={formaterMontant(totalPaye)} />
        <div className="flex items-baseline justify-between gap-4 bg-fond px-4 py-3">
          <dt className="text-sm font-medium text-encre">Reste dû</dt>
          <dd
            className={[
              "text-right text-xl font-semibold tabular-nums",
              solde ? "text-solde" : "text-encre",
            ].join(" ")}
          >
            {formaterMontant(resteDu)}
          </dd>
        </div>
      </dl>
      {/* Jamais la couleur seule : le statut est écrit en toutes lettres
          (DESIGN.md §5). */}
      <p className="border-t border-bord px-4 py-3 text-sm text-encre-doux">
        {LIBELLE_STATUT_PAIEMENT[statutPaiement]}
        {dernierVersementAt
          ? ` · dernier versement le ${formaterDate(dernierVersementAt)}`
          : " · aucun versement"}
      </p>
    </section>
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
    <section className="mt-6 rounded-plaque border-2 border-plaque-bord bg-plaque/15 p-4">
      <h2 className="flex items-center gap-2 font-semibold text-encre">
        <KeyRound aria-hidden="true" className="size-4 shrink-0" />
        Tranches soldées — la moto peut partir
      </h2>
      <p className="mt-1 max-w-prose text-sm text-encre-doux">
        Le client a versé la totalité du prix convenu. En confirmant, la moto passe en vendue et
        l’argent détenu pour son compte devient une recette du magasin. Cette confirmation ne
        s’annule pas depuis l’application.
      </p>

      {erreur && (
        <p role="alert" className="mt-3 text-sm text-alerte">
          {erreur}
        </p>
      )}

      {confirmation ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={remettre}
            className="inline-flex h-12 items-center rounded-plaque border border-plaque-bord bg-plaque px-5 font-semibold text-encre-fixe"
          >
            Oui, la moto est remise
          </button>
          <button
            type="button"
            onClick={() => setConfirmation(false)}
            className="inline-flex h-12 items-center rounded-plaque border border-bord px-4 font-medium text-encre hover:bg-papier"
          >
            Pas encore
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmation(true)}
          className="mt-4 inline-flex h-12 items-center rounded-plaque border border-plaque-bord bg-plaque px-5 font-semibold text-encre-fixe"
        >
          Confirmer la remise de la moto
        </button>
      )}
    </section>
  );
}

function MotoVendue({
  vente,
  catalogue,
  suivi,
}: {
  vente: Vente;
  catalogue: Catalogue;
  suivi: LignePaiement | null;
}) {
  const souscrire = useCallback(
    (auChangement: (moto: Moto | null) => void, enErreur: (cause: unknown) => void) =>
      ecouterMoto(vente.motoId, auChangement, enErreur),
    [vente.motoId],
  );
  const { valeur: moto } = useAbonnement(souscrire, "La moto n’a pas pu être chargée.");

  return (
    <Bloc titre="La moto">
      {moto === null ? (
        <p className="px-4 py-3 text-sm text-encre-doux">Chargement…</p>
      ) : (
        <dl className="divide-y divide-bord">
          <Ligne
            titre="Modèle"
            valeur={`${catalogue.nomMarque(moto.marqueId)} ${catalogue.nomModele(moto.modeleId)}`}
          />
          <Ligne titre="Châssis" valeur={moto.numeroChassis} code />
          <Ligne
            titre="Remise au client"
            valeur={
              vente.motoRemise
                ? vente.dateRemiseMoto
                  ? `Oui, le ${formaterDate(vente.dateRemiseMoto)}`
                  : "Oui"
                : /* Le montant s'ajoute, la phrase ne se remplace pas : « la
                     moto reste au magasin » est la distinction crédit /
                     tranches elle-même, et elle ne se dilue pas dans un
                     chiffre (§13). */
                  suivi && suivi.resteDu > 0
                  ? `Non — la moto reste au magasin, il reste ${formaterMontant(suivi.resteDu)} à verser`
                  : "Non — la moto reste au magasin"
            }
          />
          <div className="px-4 py-3">
            <Link
              href={`/motos?moto=${moto.id}`}
              className="text-sm font-medium text-encre underline underline-offset-4"
            >
              Ouvrir la fiche de la moto
            </Link>
          </div>
        </dl>
      )}
    </Bloc>
  );
}

function FicheClient({ client }: { client: Client }) {
  return (
    <Bloc titre="Le client">
      <dl className="divide-y divide-bord">
        <Ligne titre="Nom" valeur={client.nom} />
        <Ligne titre="Téléphone" valeur={formaterTelephone(client.telephone)} />
        {client.telephone2 && (
          <Ligne titre="Second téléphone" valeur={formaterTelephone(client.telephone2)} />
        )}
        {client.adresse && <Ligne titre="Adresse" valeur={client.adresse} />}
      </dl>
    </Bloc>
  );
}

/**
 * Le dossier. S8 le crée, S11 le fera vivre — l'écran le dit plutôt que de
 * faire croire à des boutons qui n'existent pas encore.
 */
function Dossier({ documents }: { documents: DocumentDossier[] | null }) {
  return (
    <Bloc titre="Le dossier">
      {documents === null ? (
        <p className="px-4 py-3 text-sm text-encre-doux">Chargement du dossier…</p>
      ) : documents.length === 0 ? (
        <p className="px-4 py-3 text-sm text-encre-doux">
          Aucun document n’est encore parvenu au serveur pour cette vente.
        </p>
      ) : (
        <dl className="divide-y divide-bord">
          {documents.map((document) => (
            <Ligne
              key={document.id}
              titre={LIBELLE_DOCUMENT[document.type]}
              valeur={LIBELLE_STATUT_DOCUMENT[document.statut]}
            />
          ))}
        </dl>
      )}
    </Bloc>
  );
}

function Versements({
  vente,
  versements,
  suivi,
}: {
  vente: Vente;
  versements: Versement[] | null;
  suivi: LignePaiement | null;
}) {
  return (
    <>
      <ListeVersements versements={versements} />
      {/* Le formulaire n’apparaît qu’une fois les versements lus : leur nombre
          donne le rang du reçu, et leur somme le reste réellement dû. Sans
          eux, on numéroterait à l’aveugle. */}
      {suivi && suivi.resteDu > 0 && (
        <FormulaireVersement
          vente={vente}
          versements={versements ?? []}
          resteDu={suivi.resteDu}
        />
      )}
    </>
  );
}

function ListeVersements({ versements }: { versements: Versement[] | null }) {
  return (
    <Bloc titre="Versements">
      {versements === null ? (
        <p className="px-4 py-3 text-sm text-encre-doux">Chargement…</p>
      ) : versements.length === 0 ? (
        <p className="px-4 py-3 text-sm text-encre-doux">
          Aucun versement enregistré : le client n’a encore rien déposé.
        </p>
      ) : (
        <ul className="divide-y divide-bord">
          {versements.map((versement) => (
            <li
              key={versement.id}
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3"
            >
              <span className="min-w-0">
                <span className="block text-encre">
                  {LIBELLE_MOYEN[versement.moyenPaiement]}
                  {versement.numeroRecu && (
                    <span className="plaque-code ml-2 text-sm text-encre-doux">
                      {versement.numeroRecu}
                    </span>
                  )}
                </span>
                <span className="block text-sm text-encre-doux">
                  {versement.date ? formaterDateHeure(versement.date) : "—"}
                  {versement.reference ? ` · ${versement.reference}` : ""}
                </span>
              </span>
              <span className="font-semibold text-encre tabular-nums">
                {formaterMontant(versement.montant)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Bloc>
  );
}

function ListeConvenue({ titre, valeurs }: { titre: string; valeurs: string[] }) {
  return (
    <section>
      <h2 className="text-sm font-semibold tracking-wide text-encre-doux uppercase">{titre}</h2>
      {valeurs.length === 0 ? (
        <p className="mt-2 rounded-plaque border border-dashed border-bord p-3 text-sm text-encre-doux">
          Rien de noté.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-bord overflow-hidden rounded-plaque border border-bord bg-papier">
          {valeurs.map((valeur) => (
            <li key={valeur} className="px-4 py-2.5 text-encre">
              {valeur}
            </li>
          ))}
        </ul>
      )}
    </section>
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

  return (
    <section className="mt-6">
      <h2 className="text-sm font-semibold tracking-wide text-encre-doux uppercase">Marge</h2>
      {erreur ? (
        <p role="alert" className="mt-2 text-sm text-alerte">
          {erreur}
        </p>
      ) : marge === null ? (
        <p className="mt-2 flex gap-3 rounded-plaque border border-dashed border-bord p-4 text-sm text-encre-doux">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>
            La marge se calcule sur le serveur, à partir du coût d’entrée de la moto. Elle
            apparaîtra dès que cette vente y sera parvenue.
          </span>
        </p>
      ) : (
        <dl className="mt-2 divide-y divide-bord overflow-hidden rounded-plaque border border-bord bg-papier">
          <Ligne titre="Coût de la moto, figé à la vente" valeur={formaterMontant(marge.coutMotoSnapshot)} />
          <div className="flex items-baseline justify-between gap-4 bg-fond px-4 py-3">
            <dt className="text-sm font-medium text-encre">Marge</dt>
            <dd
              className={[
                "text-right text-lg font-semibold",
                marge.marge < 0 ? "text-alerte" : "text-solde",
              ].join(" ")}
            >
              {formaterMontant(marge.marge)}
            </dd>
          </div>
        </dl>
      )}
    </section>
  );
}

function MargeMasquee() {
  return (
    <section className="mt-6">
      <h2 className="text-sm font-semibold tracking-wide text-encre-doux uppercase">Marge</h2>
      <p className="mt-2 flex gap-3 rounded-plaque border border-dashed border-bord p-4 text-sm text-encre-doux">
        <Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <span>
          Le coût de la moto et la marge de cette vente sont réservés au responsable. Ils ne sont
          pas masqués à l’écran&nbsp;: ils ne quittent jamais le serveur pour votre compte.
        </span>
      </p>
    </section>
  );
}

function Bloc({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="text-sm font-semibold tracking-wide text-encre-doux uppercase">{titre}</h2>
      <div className="mt-2 overflow-hidden rounded-plaque border border-bord bg-papier">
        {children}
      </div>
    </section>
  );
}

function Ligne({ titre, valeur, code = false }: { titre: string; valeur: string; code?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-3">
      <dt className="text-sm text-encre-doux">{titre}</dt>
      <dd className={["text-right text-encre", code ? "plaque-code" : ""].join(" ")}>{valeur}</dd>
    </div>
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
    <section className="mt-6">
      <h2 className="text-sm font-semibold tracking-wide text-encre-doux uppercase">
        Encaisser un versement
      </h2>

      {recu && (
        <p
          role="status"
          className="mt-2 rounded-plaque border border-plaque-bord bg-plaque/15 p-4 text-sm text-encre"
        >
          Versement enregistré — reçu <span className="plaque-code">{recu}</span>. Si le réseau
          manque, il partira seul dès son retour.
        </p>
      )}

      <form
        onSubmit={encaisser}
        noValidate
        className="mt-2 rounded-plaque border border-bord bg-papier p-4"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="montant-versement" className="block text-sm font-medium text-encre">
              Montant reçu
            </label>
            <input
              id="montant-versement"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={saisie.montant}
              onChange={(evenement) =>
                setSaisie((actuel) => ({ ...actuel, montant: evenement.target.value }))
              }
              className="mt-1.5 h-12 w-full rounded-plaque border border-bord bg-papier px-3 text-encre tabular-nums"
            />
            <p className="mt-1 text-sm text-encre-doux">
              Au plus {formaterMontant(resteDu)}, le reste dû.
            </p>
          </div>

          <div>
            <label htmlFor="moyen-versement" className="block text-sm font-medium text-encre">
              Moyen de paiement
            </label>
            <select
              id="moyen-versement"
              value={saisie.moyenPaiement}
              onChange={(evenement) =>
                setSaisie((actuel) => ({
                  ...actuel,
                  moyenPaiement: evenement.target.value as MoyenPaiement,
                }))
              }
              className="mt-1.5 h-12 w-full rounded-plaque border border-bord bg-papier px-3 text-encre"
            >
              {MOYENS_PAIEMENT.map((moyen) => (
                <option key={moyen} value={moyen}>
                  {LIBELLE_MOYEN[moyen]}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="reference-versement" className="block text-sm font-medium text-encre">
              Référence <span className="font-normal text-encre-doux">(facultatif)</span>
            </label>
            <input
              id="reference-versement"
              type="text"
              autoComplete="off"
              placeholder="Numéro de transaction mobile money"
              value={saisie.reference}
              onChange={(evenement) =>
                setSaisie((actuel) => ({ ...actuel, reference: evenement.target.value }))
              }
              className="mt-1.5 h-12 w-full rounded-plaque border border-bord bg-papier px-3 text-encre placeholder:text-encre-doux"
            />
          </div>
        </div>

        <p role="alert" aria-live="assertive" className="mt-3 min-h-5 text-sm text-alerte">
          {erreur ?? ""}
        </p>

        <button
          type="submit"
          className="inline-flex h-12 items-center rounded-plaque border border-plaque-bord bg-plaque px-5 font-semibold text-encre-fixe"
        >
          Enregistrer le versement
        </button>
      </form>
    </section>
  );
}
