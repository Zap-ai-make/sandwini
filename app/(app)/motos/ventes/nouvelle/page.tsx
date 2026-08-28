"use client";

import { ArrowLeft, Bike, CircleAlert, Lock, Search, UserPlus } from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { FormulaireClient } from "@/components/FormulaireClient";
import { useSession } from "@/lib/auth/session";
import { chercherClients, formaterTelephone, type Client } from "@/lib/domain/client";
import { formaterMontant } from "@/lib/domain/format";
import { normaliserChassis, type Moto } from "@/lib/domain/moto";
import {
  EFFET_MODE,
  LIBELLE_MODE,
  LIBELLE_MOYEN,
  MODES_PAIEMENT,
  MOYENS_PAIEMENT,
  SAISIE_VENTE_VIDE,
  agregatsPaiement,
  lireMontant,
  lireMontantEncaisse,
  motoRemiseA,
  validerVente,
  type ModePaiement,
  type MoyenPaiement,
  type SaisieVente,
  type Vente,
} from "@/lib/domain/vente";
import { prochainNumero } from "@/lib/numerotation/compteur";
import { usePerimetre } from "@/lib/perimetre/perimetre";
import { useAbonnement } from "@/lib/repositories/abonnement";
import { useCatalogue, type Catalogue } from "@/lib/repositories/catalogue";
import { useFichierClients } from "@/lib/repositories/fichier-clients";
import { ecouterStock } from "@/lib/repositories/motos";
import { ecouterVentes, enregistrerVente, messageErreurVente } from "@/lib/repositories/ventes";

/**
 * Enregistrer une vente.
 *
 * Un seul écran, comme l'exige le §6.1 — parce que la vente se conclut debout,
 * le client en face, et qu'un assistant en quatre étapes se ferait fermer avant
 * la deuxième. L'ordre des sections suit celui de la conversation réelle :
 * quelle moto, pour qui, à quel prix, payée comment, combien aujourd'hui.
 *
 * **Ce n'est délibérément pas un `<form>`.** Il en contient un — celui de la
 * création d'un client à la volée — et deux formulaires ne s'imbriquent pas.
 * L'absence de validation par la touche Entrée est un gain ici, pas une perte :
 * le premier champ de l'écran est une recherche de châssis, et enregistrer une
 * vente en tapant Entrée après un numéro serait une catastrophe silencieuse.
 *
 * Tout ce que l'écran lit — stock, clients, ventes du mois — est déjà chargé
 * entier dans le cache Firestore. Rien ici n'attend le réseau, y compris le
 * numéro : c'est la promesse centrale du produit.
 */
/** Assez pour reconnaître la bonne ligne, trop peu pour noyer l'écran. */
const PREMIERS_RESULTATS = 8;

export default function PageNouvelleVente() {
  const { perimetre } = usePerimetre();
  const session = useSession();
  const catalogue = useCatalogue();
  const { clients, chargement: clientsEnCours } = useFichierClients();

  const boutiqueId = perimetre.boutiqueId;

  const souscrireStock = useCallback(
    (auChangement: (motos: Moto[]) => void, enErreur: (cause: unknown) => void) =>
      ecouterStock(boutiqueId, auChangement, enErreur),
    [boutiqueId],
  );
  const { valeur: stock, erreur: erreurStock } = useAbonnement(
    souscrireStock,
    "Le stock n’a pas pu être chargé.",
  );

  const souscrireVentes = useCallback(
    (auChangement: (ventes: Vente[]) => void, enErreur: (cause: unknown) => void) =>
      ecouterVentes(boutiqueId, auChangement, enErreur),
    [boutiqueId],
  );
  const { valeur: ventes } = useAbonnement(souscrireVentes, "Les ventes n’ont pas pu être lues.");

  const [saisie, setSaisie] = useState<SaisieVente>(SAISIE_VENTE_VIDE);
  const [rechercheMoto, setRechercheMoto] = useState("");
  const [rechercheClient, setRechercheClient] = useState("");
  const [creationClient, setCreationClient] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enregistree, setEnregistree] = useState<{ id: string; numero: string } | null>(null);

  const changer = (partie: Partial<SaisieVente>) =>
    setSaisie((actuel) => ({ ...actuel, ...partie }));

  /* Seules les motos réellement disponibles sont proposées. Une moto vendue ou
     réservée qui resterait dans la liste finirait par être vendue deux fois —
     et c'est la seule prévention possible : hors ligne, aucun serveur ne peut
     arbitrer entre deux appareils (cf. la limite assumée de la fiche S8). */
  const vendables = useMemo(
    () => (stock ?? []).filter((moto) => moto.statut === "en_stock"),
    [stock],
  );

  /* Les deux listes ne montrent que leurs premiers résultats : un stock de
     cinquante motos déroulé en entier repousserait le prix convenu hors de
     l'écran, et on saisit debout. Le nombre total est dit quand il y a plus,
     pour qu'une liste tronquée ne se lise pas comme une liste complète. */
  const motosTrouvees = useMemo(() => {
    const cherche = normaliserChassis(rechercheMoto);
    if (!cherche) return vendables;
    return vendables.filter(
      (moto) =>
        moto.numeroChassis.includes(cherche) ||
        normaliserChassis(catalogue.nomModele(moto.modeleId)).includes(cherche) ||
        normaliserChassis(catalogue.nomMarque(moto.marqueId)).includes(cherche),
    );
  }, [vendables, rechercheMoto, catalogue]);
  const resultatsMotos = motosTrouvees.slice(0, PREMIERS_RESULTATS);

  const clientsTrouves = useMemo(
    () => chercherClients(clients, rechercheClient),
    [clients, rechercheClient],
  );
  const resultatsClients = clientsTrouves.slice(0, PREMIERS_RESULTATS);

  const motoChoisie = vendables.find((moto) => moto.id === saisie.motoId);
  const clientChoisi = clients.find((client) => client.id === saisie.clientId);

  const numeroAVenir =
    boutiqueId && perimetre.type === "boutique"
      ? prochainNumero(
          { boutiqueId, code: perimetre.code },
          (ventes ?? []).flatMap((vente) => [vente.numero, vente.numeroInitial]),
        )
      : null;

  function choisirMoto(moto: Moto) {
    /* Le prix conseillé s'installe comme point de départ, jamais comme
       verrou : c'est un repère de vente, et le prix réel se négocie. On ne
       l'écrase pas si le gérant a déjà tapé un montant. */
    const prixConvenu =
      saisie.prixConvenu.trim() === "" && moto.prixVenteConseille !== null
        ? String(moto.prixVenteConseille)
        : saisie.prixConvenu;
    changer({ motoId: moto.id, prixConvenu });
    setErreur(null);
  }

  function enregistrer() {
    if (session.statut !== "connecte" || !boutiqueId || perimetre.type !== "boutique") return;

    const probleme = validerVente(saisie);
    if (probleme) {
      setErreur(probleme);
      return;
    }
    if (!motoChoisie) {
      setErreur("Cette moto n’est plus disponible à la vente. Choisissez-en une autre.");
      return;
    }

    setErreur(null);
    const { id, numero, enregistre } = enregistrerVente(
      saisie,
      {
        boutique: { boutiqueId, code: perimetre.code },
        numerosConnus: (ventes ?? []).flatMap((vente) => [vente.numero, vente.numeroInitial]),
      },
      { uid: session.utilisateur.uid, nom: session.utilisateur.nom },
    );
    enregistre.catch((cause) => setErreur(messageErreurVente(cause)));

    setEnregistree({ id, numero });
    setSaisie(SAISIE_VENTE_VIDE);
    setRechercheMoto("");
    setRechercheClient("");
  }

  if (perimetre.type !== "boutique") {
    return (
      <Cadre>
        <p className="max-w-prose text-encre-doux">
          Une vente appartient à une boutique précise — son numéro en porte le code. Choisissez-en
          une dans le bandeau, en haut de l’écran, avant d’enregistrer.
        </p>
      </Cadre>
    );
  }

  return (
    <Cadre>
      {enregistree && (
        <div role="status" className="mb-6 rounded-plaque border border-plaque-bord bg-papier p-4">
          <p className="font-medium text-encre">
            Vente enregistrée — <span className="plaque-code">{enregistree.numero}</span>
          </p>
          <p className="mt-1 max-w-prose text-sm text-encre-doux">
            Le dossier est ouvert avec ses quatre documents à traiter. Si le réseau manque, la vente
            partira seule dès son retour.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={`/motos/ventes?vente=${enregistree.id}`}
              className="inline-flex h-11 items-center rounded-plaque border border-bord px-3 text-sm font-medium text-encre hover:bg-fond"
            >
              Voir la vente
            </Link>
            <Link
              href="/motos/ventes"
              className="inline-flex h-11 items-center rounded-plaque border border-bord px-3 text-sm font-medium text-encre hover:bg-fond"
            >
              Voir les ventes
            </Link>
          </div>
        </div>
      )}

      {erreurStock && (
        <p role="alert" className="mb-4 text-sm text-alerte">
          {erreurStock}
        </p>
      )}

      <fieldset className="rounded-plaque border border-bord bg-papier p-4">
        <legend className="px-1 font-semibold text-encre">La moto</legend>

        {stock === null ? (
          <p className="mt-2 text-sm text-encre-doux">Chargement du stock…</p>
        ) : vendables.length === 0 ? (
          <div className="mt-2">
            <p className="text-encre">Aucune moto disponible dans {perimetre.nom}.</p>
            <p className="mt-1 max-w-prose text-sm text-encre-doux">
              Les motos vendues et réservées ne réapparaissent pas ici. Faites-en entrer une pour
              pouvoir vendre.
            </p>
            <Link
              href="/motos/nouvelle"
              className="mt-4 inline-flex h-12 items-center gap-2 rounded-plaque border border-plaque-bord bg-plaque px-4 font-semibold text-encre-fixe"
            >
              <Bike aria-hidden="true" className="size-4" />
              Faire entrer une moto
            </Link>
          </div>
        ) : (
          <>
            <ChampRecherche
              id="recherche-moto-vente"
              libelle="Chercher dans le stock"
              placeholder="Châssis, marque ou modèle"
              valeur={rechercheMoto}
              changer={setRechercheMoto}
              monospace
            />

            {resultatsMotos.length === 0 ? (
              <p className="mt-3 rounded-plaque border border-dashed border-bord p-3 text-sm text-encre-doux">
                Aucune moto disponible ne correspond. Vérifiez le châssis, ou effacez la recherche.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {resultatsMotos.map((moto) => (
                  <li key={moto.id}>
                    <Choix
                      nom="moto-vendue"
                      choisi={saisie.motoId === moto.id}
                      surChoix={() => choisirMoto(moto)}
                    >
                      <span className="plaque-code shrink-0 rounded-plaque border border-plaque-bord bg-plaque px-2 py-1 text-xs leading-none text-encre-fixe">
                        {moto.numeroChassis}
                      </span>
                      {/* Une seule colonne de texte, pas deux : sur un écran de
                          téléphone, un prix aligné à droite venait chevaucher un
                          nom de modèle un peu long — vu en regardant la capture,
                          pas en lisant le code. Le prix conseillé descend donc
                          sur la ligne secondaire, où il se lit aussi bien. */}
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-encre">
                          {catalogue.nomMarque(moto.marqueId)} {catalogue.nomModele(moto.modeleId)}
                        </span>
                        <span className="block text-sm text-encre-doux">
                          {moto.couleur || "Couleur non notée"}
                          {moto.annee ? ` · ${moto.annee}` : ""}
                          {moto.prixVenteConseille !== null && (
                            <>
                              {" · conseillé "}
                              <span className="font-medium text-encre">
                                {formaterMontant(moto.prixVenteConseille)}
                              </span>
                            </>
                          )}
                        </span>
                      </span>
                    </Choix>
                  </li>
                ))}
              </ul>
            )}
            <Tronquee montres={resultatsMotos.length} total={motosTrouvees.length} mot="motos" />
          </>
        )}
      </fieldset>

      <fieldset className="mt-6 rounded-plaque border border-bord bg-papier p-4">
        <legend className="px-1 font-semibold text-encre">Le client</legend>

        <ChampRecherche
          id="recherche-client-vente"
          libelle="Chercher un client"
          placeholder="Un numéro, ou le début d’un nom"
          valeur={rechercheClient}
          changer={setRechercheClient}
        />

        {clientsEnCours ? (
          <p className="mt-3 text-sm text-encre-doux">Chargement du fichier clients…</p>
        ) : resultatsClients.length === 0 ? (
          <p className="mt-3 rounded-plaque border border-dashed border-bord p-3 text-sm text-encre-doux">
            {clients.length === 0
              ? "Le fichier clients est vide. Créez la fiche de cet acheteur, elle servira à toutes les boutiques."
              : "Personne ne correspond. Vérifiez le numéro, ou créez la fiche."}
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {resultatsClients.map((client) => (
              <li key={client.id}>
                <Choix
                  nom="client-vente"
                  choisi={saisie.clientId === client.id}
                  surChoix={() => changer({ clientId: client.id })}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-encre">{client.nom}</span>
                    <span className="block text-sm text-encre-doux">
                      {formaterTelephone(client.telephone)}
                      {client.adresse ? ` · ${client.adresse}` : ""}
                    </span>
                  </span>
                </Choix>
              </li>
            ))}
          </ul>
        )}
        <Tronquee montres={resultatsClients.length} total={clientsTrouves.length} mot="clients" />

        <button
          type="button"
          onClick={() => setCreationClient((ouvert) => !ouvert)}
          aria-expanded={creationClient}
          className="mt-3 inline-flex h-11 items-center gap-2 rounded-plaque border border-bord px-3 text-sm font-medium text-encre hover:bg-fond"
        >
          <UserPlus aria-hidden="true" className="size-4" />
          {creationClient ? "Fermer" : "Nouveau client"}
        </button>
      </fieldset>

      {/* Hors du bloc précédent : `FormulaireClient` est lui-même un `<form>`,
          et un formulaire ne s'imbrique pas dans un autre. Il reste à sa place
          dans la lecture de l'écran, juste sous le choix du client. */}
      {creationClient && (
        <section className="mt-2 rounded-plaque border border-bord bg-fond p-4">
          <h2 className="font-semibold text-encre">Nouveau client</h2>
          <p className="mt-1 text-sm text-encre-doux">
            Il sera rattaché à cette vente immédiatement, réseau ou pas.
          </p>
          <div className="mt-4">
            <FormulaireClient
              clients={clients}
              surEnregistrement={(id, saisieClient) => {
                changer({ clientId: id });
                setCreationClient(false);
                /* La recherche se cale sur le nom saisi plutôt que de se vider :
                   la liste ne montre que ses premiers résultats, et un fichier
                   de deux cents clients aurait fait disparaître de l'écran
                   celui qu'on vient tout juste de créer. */
                setRechercheClient(saisieClient.nom.trim());
              }}
              surAnnulation={() => setCreationClient(false)}
            />
          </div>
        </section>
      )}

      <fieldset className="mt-6 rounded-plaque border border-bord bg-papier p-4">
        <legend className="px-1 font-semibold text-encre">La vente</legend>

        <div className="mt-2">
          <label htmlFor="prix-convenu" className="block text-sm font-medium text-encre">
            Prix convenu
          </label>
          <input
            id="prix-convenu"
            inputMode="numeric"
            value={saisie.prixConvenu}
            onChange={(evenement) => changer({ prixConvenu: evenement.target.value })}
            className="mt-1.5 h-12 w-full rounded-plaque border border-bord bg-papier px-3 text-lg text-encre"
          />
          <p className="mt-1 text-sm text-encre-doux">En FCFA entiers, sans centimes.</p>
        </div>

        <div className="mt-4">
          <span className="block text-sm font-medium text-encre">Mode de paiement</span>
          <div className="mt-1.5 space-y-2">
            {MODES_PAIEMENT.map((mode) => (
              <Choix
                key={mode}
                nom="mode-paiement"
                choisi={saisie.modePaiement === mode}
                surChoix={() =>
                  changer({
                    modePaiement: mode as ModePaiement,
                    /* Le comptant impose le montant entier : le pré-remplir
                       évite de faire retaper ce que la règle exige déjà. */
                    montantEncaisse: mode === "comptant" ? saisie.prixConvenu : saisie.montantEncaisse,
                  })
                }
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-encre">{LIBELLE_MODE[mode]}</span>
                  <span className="block text-sm text-encre-doux">{EFFET_MODE[mode]}</span>
                </span>
              </Choix>
            ))}
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <ListeLibre
            id="inclus"
            libelle="Inclus dans la vente"
            aide="Un par ligne : casque, plaque, carte grise…"
            valeur={saisie.inclus}
            changer={(inclus) => changer({ inclus })}
          />
          <ListeLibre
            id="non-inclus"
            libelle="Non inclus"
            aide="Ce que le client fera de son côté."
            valeur={saisie.nonInclus}
            changer={(nonInclus) => changer({ nonInclus })}
          />
        </div>
      </fieldset>

      <fieldset className="mt-6 rounded-plaque border border-bord bg-papier p-4">
        <legend className="px-1 font-semibold text-encre">Encaissé aujourd’hui</legend>

        <div className="mt-2">
          <label htmlFor="montant-encaisse" className="block text-sm font-medium text-encre">
            Montant reçu{" "}
            {saisie.modePaiement === "comptant" ? (
              <span className="font-normal text-encre-doux">(le prix convenu en entier)</span>
            ) : (
              <span className="font-normal text-encre-doux">(vide si le client ne verse rien)</span>
            )}
          </label>
          <input
            id="montant-encaisse"
            inputMode="numeric"
            value={saisie.montantEncaisse}
            onChange={(evenement) => changer({ montantEncaisse: evenement.target.value })}
            className="mt-1.5 h-12 w-full rounded-plaque border border-bord bg-papier px-3 text-lg text-encre"
          />
        </div>

        <div className="mt-4">
          <label htmlFor="moyen-paiement" className="block text-sm font-medium text-encre">
            Moyen de paiement
          </label>
          <select
            id="moyen-paiement"
            value={saisie.moyenPaiement}
            onChange={(evenement) =>
              changer({ moyenPaiement: evenement.target.value as MoyenPaiement })
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

        {saisie.moyenPaiement !== "especes" && (
          <div className="mt-4">
            <label htmlFor="reference-paiement" className="block text-sm font-medium text-encre">
              Référence du transfert{" "}
              <span className="font-normal text-encre-doux">(facultatif)</span>
            </label>
            <input
              id="reference-paiement"
              value={saisie.reference}
              maxLength={60}
              onChange={(evenement) => changer({ reference: evenement.target.value })}
              className="plaque-code mt-1.5 h-12 w-full rounded-plaque border border-bord bg-papier px-3 text-encre"
            />
          </div>
        )}
      </fieldset>

      <Recapitulatif
        saisie={saisie}
        moto={motoChoisie}
        client={clientChoisi}
        catalogue={catalogue}
        numero={numeroAVenir}
      />

      <p role="alert" aria-live="assertive" className="mt-3 min-h-5 text-sm text-alerte">
        {erreur ?? ""}
      </p>

      <button
        type="button"
        onClick={enregistrer}
        className="mt-3 inline-flex h-12 items-center rounded-plaque border border-plaque-bord bg-plaque px-5 font-semibold text-encre-fixe"
      >
        Enregistrer la vente
      </button>
    </Cadre>
  );
}

/**
 * Le récapitulatif — la signature de cet écran.
 *
 * Dessiné comme le talon d'un carnet à souches, parce que c'est exactement son
 * rôle : ce qui sera écrit sur le reçu, relu à voix haute avant de valider. Il
 * répond aux trois questions qu'on se pose à cet instant précis — quel numéro,
 * combien reste-t-il dû, et est-ce que le client repart avec la moto.
 */
function Recapitulatif({
  saisie,
  moto,
  client,
  catalogue,
  numero,
}: {
  saisie: SaisieVente;
  moto: Moto | undefined;
  client: Client | undefined;
  catalogue: Catalogue;
  numero: string | null;
}) {
  const prixConvenu = lireMontant(saisie.prixConvenu) ?? 0;
  const encaisse = lireMontantEncaisse(saisie.montantEncaisse) ?? 0;
  const { totalPaye, resteDu } = agregatsPaiement(
    prixConvenu,
    encaisse > 0 && encaisse <= prixConvenu ? [{ montant: encaisse }] : [],
  );
  const remise = motoRemiseA(saisie.modePaiement);

  return (
    <section
      aria-label="Récapitulatif de la vente"
      className="mt-6 overflow-hidden rounded-plaque border-2 border-plaque-bord bg-papier"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b-2 border-dashed border-bord px-4 py-3">
        <h2 className="text-sm font-semibold tracking-wide text-encre-doux uppercase">
          Ce qui sera enregistré
        </h2>
        {numero && (
          <span className="plaque-code rounded-plaque border border-plaque-bord bg-plaque px-2 py-1 text-sm leading-none text-encre-fixe">
            {numero}
          </span>
        )}
      </div>

      <dl className="divide-y divide-bord">
        <LigneRecap
          titre="Moto"
          valeur={
            moto
              ? `${catalogue.nomMarque(moto.marqueId)} ${catalogue.nomModele(moto.modeleId)} — ${moto.numeroChassis}`
              : "à choisir"
          }
          absent={!moto}
        />
        <LigneRecap titre="Client" valeur={client?.nom ?? "à choisir"} absent={!client} />
        <LigneRecap
          titre="Prix convenu"
          valeur={prixConvenu > 0 ? formaterMontant(prixConvenu) : "à saisir"}
          absent={prixConvenu <= 0}
        />
        <LigneRecap titre="Encaissé aujourd’hui" valeur={formaterMontant(totalPaye)} />
        <div className="flex items-baseline justify-between gap-4 bg-fond px-4 py-3">
          <dt className="text-sm font-medium text-encre">Reste dû</dt>
          {/* Le vert ne se met qu'une fois un prix saisi : sur un formulaire
              vide, « 0 FCFA » en vert se lit « soldé », ce qui est faux. */}
          <dd
            className={[
              "text-right text-lg font-semibold",
              prixConvenu > 0 && resteDu === 0 ? "text-solde" : "text-encre",
            ].join(" ")}
          >
            {formaterMontant(resteDu)}
          </dd>
        </div>
      </dl>

      <p className="flex gap-2 border-t border-bord px-4 py-3 text-sm text-encre-doux">
        <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <span>
          {remise
            ? "Le client repart avec la moto. Elle passera au statut « vendue »."
            : "La moto reste au magasin, réservée, jusqu’au dernier versement. L’argent reçu est un engagement, pas une recette."}
        </span>
      </p>
    </section>
  );
}

function LigneRecap({
  titre,
  valeur,
  absent = false,
}: {
  titre: string;
  valeur: string;
  absent?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-2.5">
      <dt className="text-sm text-encre-doux">{titre}</dt>
      <dd className={["text-right", absent ? "text-sm text-encre-doux italic" : "text-encre"].join(" ")}>
        {valeur}
      </dd>
    </div>
  );
}

/**
 * Un choix dans une liste : moto, client, mode de paiement.
 *
 * Un vrai bouton radio sous une étiquette, masqué visuellement mais bien
 * présent dans l'arbre d'accessibilité : les flèches du clavier parcourent le
 * groupe, et le lecteur d'écran annonce « 2 sur 8 ». Une pile de `<button>`
 * aurait l'air pareille et ne dirait rien de tel.
 */
function Choix({
  nom,
  choisi,
  surChoix,
  children,
}: {
  nom: string;
  choisi: boolean;
  surChoix: () => void;
  children: React.ReactNode;
}) {
  return (
    <label
      className={[
        "flex cursor-pointer items-center gap-3 rounded-plaque border px-3 py-2.5",
        "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-encre",
        choisi ? "border-plaque-bord bg-plaque/15" : "border-bord bg-papier hover:bg-fond",
      ].join(" ")}
    >
      <input
        type="radio"
        name={nom}
        checked={choisi}
        onChange={surChoix}
        className="size-5 shrink-0 accent-encre"
      />
      {children}
    </label>
  );
}

/**
 * Dit qu'une liste est tronquée. Une liste qui s'arrête sans le dire fait
 * conclure « il n'y en a pas d'autre », et on crée un doublon du client qu'on
 * n'a pas vu (`DESIGN.md` §10, l'état dense).
 */
function Tronquee({ montres, total, mot }: { montres: number; total: number; mot: string }) {
  if (total <= montres) return null;
  return (
    <p className="mt-2 text-sm text-encre-doux">
      {montres} {mot} sur {total}. Affinez la recherche pour voir les autres.
    </p>
  );
}

function ChampRecherche({
  id,
  libelle,
  placeholder,
  valeur,
  changer,
  monospace = false,
}: {
  id: string;
  libelle: string;
  placeholder: string;
  valeur: string;
  changer: (valeur: string) => void;
  monospace?: boolean;
}) {
  return (
    <div className="mt-2">
      <label htmlFor={id} className="block text-sm font-medium text-encre">
        {libelle}
      </label>
      <div className="relative mt-1.5">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-encre-doux"
        />
        <input
          id={id}
          type="search"
          inputMode="search"
          autoComplete="off"
          placeholder={placeholder}
          value={valeur}
          onChange={(evenement) => changer(evenement.target.value)}
          className={[
            "h-12 w-full rounded-plaque border border-bord bg-papier pr-3 pl-9 text-encre placeholder:text-encre-doux",
            monospace ? "plaque-code placeholder:font-sans placeholder:tracking-normal" : "",
          ].join(" ")}
        />
      </div>
    </div>
  );
}

function ListeLibre({
  id,
  libelle,
  aide,
  valeur,
  changer,
}: {
  id: string;
  libelle: string;
  aide: string;
  valeur: string;
  changer: (valeur: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-encre">
        {libelle} <span className="font-normal text-encre-doux">(facultatif)</span>
      </label>
      <textarea
        id={id}
        rows={3}
        value={valeur}
        onChange={(evenement) => changer(evenement.target.value)}
        className="mt-1.5 w-full rounded-plaque border border-bord bg-papier px-3 py-2 text-encre"
      />
      <p className="mt-1 text-sm text-encre-doux">{aide}</p>
    </div>
  );
}

function Cadre({ children }: { children: React.ReactNode }) {
  const session = useSession();
  const estGerant = session.statut === "connecte" && session.utilisateur.role === "gerant";

  return (
    <div>
      <Link
        href="/motos/ventes"
        className="inline-flex items-center gap-2 text-sm text-encre-doux hover:text-encre"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Ventes
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-encre">Nouvelle vente</h1>
      {estGerant && (
        <p className="mt-1 flex items-center gap-2 text-sm text-encre-doux">
          <Lock aria-hidden="true" className="size-3.5 shrink-0" />
          La marge de cette vente est calculée pour le responsable seul.
        </p>
      )}
      <div className="mt-6">{children}</div>
    </div>
  );
}
