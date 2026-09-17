"use client";

import { Bike, Lock, Search, UserRound } from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { FormulaireClient } from "@/components/FormulaireClient";
import { Champ } from "@/components/patrons/Champ";
import { EtatErreur, EtatErreurSaisie, EtatSansResultat, EtatVide } from "@/components/patrons/Etats";
import { Groupe } from "@/components/patrons/Formulaire";
import { Modale } from "@/components/patrons/Modale";
import { Segmente } from "@/components/patrons/Segmente";
import { useSession } from "@/lib/auth/session";
import { chercherClients, formaterTelephone, nomComplet, type Client } from "@/lib/domain/client";
import { formaterMontant } from "@/lib/domain/format";
import { normaliserChassis, type Moto } from "@/lib/domain/moto";
import {
  LIBELLE_INCLUSION,
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
import type { VentePiece } from "@/lib/domain/vente-piece";
import { prochainNumero } from "@/lib/numerotation/compteur";
import { usePerimetre } from "@/lib/perimetre/perimetre";
import { useAbonnement } from "@/lib/repositories/abonnement";
import { useCatalogue, type Catalogue } from "@/lib/repositories/catalogue";
import { useFichierClients } from "@/lib/repositories/fichier-clients";
import { ecouterStock } from "@/lib/repositories/motos";
import { ecouterVentes, enregistrerVente, messageErreurVente } from "@/lib/repositories/ventes";
import { ecouterVentesPieces } from "@/lib/repositories/ventes-pieces";

/**
 * Enregistrer une vente, par-dessus le registre des ventes.
 *
 * **C'était une page, c'est une modale (S44).** Le geste central du produit
 * faisait quitter la liste qu'on venait de consulter ; on revenait, la
 * recherche était à refaire. La liste reste maintenant derrière, et se met à
 * jour sous la modale au moment où la vente part.
 *
 * Ce que S44 a changé dans le formulaire lui-même, et pourquoi :
 *
 * - **Le client se crée par défaut.** C'est le cas ordinaire au comptoir, et
 *   c'était l'inverse : on cherchait d'abord dans un fichier où l'acheteur
 *   n'est en général pas. Le rapprochement, lui, n'a pas bougé d'un pouce —
 *   téléphone et pièce d'identité sont lus avant d'écrire, sur la liste **lue**
 *   et jamais aplatie (D95/D96), et une fiche reconnue est proposée au lieu
 *   d'être opposée.
 * - **Rien ne se déroule tant qu'on n'a pas tapé.** Les deux listes montraient
 *   tout par défaut : tout le stock vendable, tout le fichier. Elles ne
 *   répondent plus qu'à une recherche.
 * - **Ce qui part avec la moto se coche** — carte grise, casque — au lieu de
 *   s'écrire en deux zones de texte libre.
 * - **Le mode et le moyen de paiement sont des segments.** Trois pavés
 *   `EFFET_MODE` plus un bandeau qui les redisait tenaient un tiers de l'écran
 *   pour une phrase. La conséquence est dans le récapitulatif, où elle se lit
 *   au moment de valider — et le comportement, lui, est intact.
 *
 * **Deux choses ne bougent pas, et elles sont délibérées.**
 *
 * Ce n'est toujours **pas un `<form>`** : il en contient un, celui de la
 * création du client, et deux formulaires ne s'imbriquent pas. L'absence de
 * validation par Entrée est un gain — le premier champ de l'écran est une
 * recherche de châssis, et enregistrer une vente en tapant Entrée après un
 * numéro serait une catastrophe silencieuse.
 *
 * Et **les listes ne se replient pas quand on a choisi.** La maquette le
 * demandait, ç'a été essayé, puis retiré : dans un groupe de boutons radio les
 * flèches du clavier déplacent **et** choisissent. Replier au choix détruirait
 * le groupe sous les doigts de qui le parcourt, en emportant le focus. Seul le
 * bloc *sous* la liste change — ce qui ne touche pas au groupe ni au focus.
 *
 * Tout ce que la modale lit est déjà dans le cache Firestore. Rien n'attend le
 * réseau, numéro compris : c'est la promesse centrale du produit (D66, D76).
 */

/** Assez pour reconnaître la bonne ligne, trop peu pour noyer l'écran. */
const PREMIERS_RESULTATS = 8;

/**
 * **Montée seulement quand elle est ouverte**, et c'est la page qui en décide.
 *
 * Elle ouvre trois écoutes Firestore — le stock, les ventes, les ventes de
 * pièces —, dont deux que l'écran des ventes tient déjà. Laissée montée en
 * permanence, elle les doublait pour un formulaire fermé les trois quarts du
 * temps. Le démontage remet aussi la saisie à zéro sans qu'un effet ait à s'en
 * charger, comme pour les trois autres modals du produit.
 */
export function ModaleVente({ onFermer }: { onFermer: () => void }) {
  const { perimetre } = usePerimetre();
  const session = useSession();
  const catalogue = useCatalogue();
  const { clients, lus, chargement: clientsEnCours } = useFichierClients();

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

  /* **Le compteur est partagé avec le comptoir** : un numéro dicté au téléphone
     ne doit désigner qu'une seule pièce comptable. Cette modale doit donc
     connaître les numéros que les ventes de pièces ont brûlés, exactement comme
     l'écran de vente de pièces connaît ceux des motos. */
  const souscrireVentesPieces = useCallback(
    (auChangement: (ventes: VentePiece[]) => void, enErreur: (cause: unknown) => void) =>
      perimetre.type === "boutique"
        ? ecouterVentesPieces(boutiqueId, auChangement, enErreur)
        : () => {},
    [boutiqueId, perimetre.type],
  );
  const { valeur: ventesPieces } = useAbonnement(
    souscrireVentesPieces,
    "Les ventes n’ont pas pu être lues.",
  );

  const numerosConnus = useMemo(
    () => [
      ...(ventes ?? []).flatMap((vente) => [vente.numero, vente.numeroInitial]),
      ...(ventesPieces ?? []).map((vente) => vente.numero),
    ],
    [ventes, ventesPieces],
  );

  const [saisie, setSaisie] = useState<SaisieVente>(SAISIE_VENTE_VIDE);
  const [rechercheMoto, setRechercheMoto] = useState("");
  const [rechercheClient, setRechercheClient] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enregistree, setEnregistree] = useState<{ id: string; numero: string } | null>(null);

  const changer = (partie: Partial<SaisieVente>) =>
    setSaisie((actuel) => ({ ...actuel, ...partie }));

  function repartirDeZero() {
    setSaisie(SAISIE_VENTE_VIDE);
    setRechercheMoto("");
    setRechercheClient("");
    setErreur(null);
    setEnregistree(null);
  }

  /* Pas de remise à zéro ici : la modale se démonte en se fermant, et l'état
     repart de ses valeurs initiales à la réouverture. */
  const fermer = onFermer;

  /* Seules les motos réellement disponibles sont proposées. Une moto vendue ou
     réservée qui resterait dans la liste finirait par être vendue deux fois —
     et c'est la seule prévention possible : hors ligne, aucun serveur ne peut
     arbitrer entre deux appareils (limite assumée de S8). */
  const vendables = useMemo(
    () => (stock ?? []).filter((moto) => moto.statut === "en_stock"),
    [stock],
  );

  const chercheMoto = rechercheMoto.trim().length > 0;
  const motosTrouvees = useMemo(() => {
    const cherche = normaliserChassis(rechercheMoto);
    if (!cherche) return [];
    return vendables.filter(
      (moto) =>
        moto.numeroChassis.includes(cherche) ||
        normaliserChassis(catalogue.nomModele(moto.modeleId)).includes(cherche) ||
        normaliserChassis(catalogue.nomMarque(moto.marqueId)).includes(cherche),
    );
  }, [vendables, rechercheMoto, catalogue]);
  const resultatsMotos = motosTrouvees.slice(0, PREMIERS_RESULTATS);

  const chercheClient = rechercheClient.trim().length > 0;
  const clientsTrouves = useMemo(
    () => (chercheClient ? chercherClients(clients, rechercheClient) : []),
    [clients, rechercheClient, chercheClient],
  );
  const resultatsClients = clientsTrouves.slice(0, PREMIERS_RESULTATS);

  const motoChoisie = vendables.find((moto) => moto.id === saisie.motoId);
  const clientChoisi = clients.find((client) => client.id === saisie.clientId);

  const estGerant = session.statut === "connecte" && session.utilisateur.role === "gerant";

  const numeroAVenir =
    boutiqueId && perimetre.type === "boutique"
      ? prochainNumero({ boutiqueId, code: perimetre.code }, numerosConnus)
      : null;

  function choisirMoto(moto: Moto) {
    /* Le prix conseillé s'installe comme point de départ, jamais comme verrou :
       c'est un repère de vente, et le prix réel se négocie. On ne l'écrase pas
       si le gérant a déjà tapé un montant. */
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
      { boutique: { boutiqueId, code: perimetre.code }, numerosConnus },
      { uid: session.utilisateur.uid, nom: session.utilisateur.nom },
    );
    enregistre.catch((cause) => setErreur(messageErreurVente(cause)));

    setEnregistree({ id, numero });
    setSaisie(SAISIE_VENTE_VIDE);
    setRechercheMoto("");
    setRechercheClient("");
  }

  const prixConvenu = lireMontant(saisie.prixConvenu) ?? 0;
  const encaisse = lireMontantEncaisse(saisie.montantEncaisse) ?? 0;
  const { resteDu } = agregatsPaiement(
    prixConvenu,
    encaisse > 0 && encaisse <= prixConvenu ? [{ montant: encaisse }] : [],
  );

  if (perimetre.type !== "boutique") {
    return (
      <Modale
        ouvert
        onFermer={fermer}
        titre="Nouvelle vente"
        taille="moyenne"
        pied={
          <button type="button" onClick={fermer} className="ml-auto bouton bouton-neutre">
            Fermer
          </button>
        }
      >
        <p className="max-w-prose text-encre-doux">
          Une vente appartient à une boutique précise — son numéro en porte le code. Choisissez-en
          une dans le bandeau, en haut de l’écran, avant d’enregistrer.
        </p>
      </Modale>
    );
  }

  if (enregistree) {
    return (
      <Modale
        ouvert
        onFermer={fermer}
        titre="Vente enregistrée"
        taille="moyenne"
        pied={
          <>
            <button type="button" onClick={repartirDeZero} className="bouton bouton-neutre">
              Enregistrer une autre vente
            </button>
            {/* `repartirDeZero` et non `fermer` : le lien enlève déjà
                `?nouvelle=1` de l'adresse, ce qui referme la modale. Appeler
                la fermeture ici lancerait un second changement d'adresse en
                même temps que la navigation, et les deux se disputeraient. */}
            <Link
              href={`/motos/ventes?vente=${enregistree.id}`}
              onClick={repartirDeZero}
              className="ml-auto bouton bouton-principal"
            >
              Voir la vente
            </Link>
          </>
        }
      >
        <div role="status">
          <p className="font-medium text-encre">
            Vente enregistrée — <span className="plaque-code">{enregistree.numero}</span>
          </p>
          <p className="mt-1 max-w-prose text-corps text-encre-doux">
            Le dossier est ouvert avec ses quatre documents à traiter. Si le réseau manque, la vente
            partira seule dès son retour.
          </p>
        </div>
      </Modale>
    );
  }

  return (
    <Modale
      ouvert
      onFermer={fermer}
      titre="Nouvelle vente"
      description="Le numéro de la pièce sera attribué à l’enregistrement, même sans réseau."
      taille="large"
      pied={
        <>
          {/* L'erreur vit dans le pied, avec le bouton qu'elle explique : un
              message resté en haut d'un formulaire long ne serait jamais lu.
              Elle ne réserve pas sa ligne — le pied est ancré en bas et grandit
              vers le haut, donc le bouton ne se dérobe pas sous le doigt. */}
          {erreur && <EtatErreurSaisie message={erreur} className="w-full" />}
          <p className="flex items-baseline gap-2">
            <span className="text-corps text-encre-doux">Reste dû</span>
            <span className="font-code text-bloc font-medium whitespace-nowrap text-encre">
              {formaterMontant(resteDu)}
            </span>
          </p>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button type="button" onClick={fermer} className="bouton bouton-neutre">
              Annuler
            </button>
            <button type="button" onClick={enregistrer} className="bouton bouton-principal">
              Enregistrer la vente
            </button>
          </div>
        </>
      }
    >
      <EtatErreur message={erreurStock} className="mb-4" />

      <div className="grid items-start gap-x-8 gap-y-6 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="min-w-0">
          <Groupe titre="Le client">
            <ChampRecherche
              id="recherche-client-vente"
              libelle="Chercher un client"
              aide="Rien ne s’affiche tant que vous n’avez pas tapé. Un nom, un prénom, ou un numéro."
              placeholder="Un numéro, ou le début d’un nom"
              valeur={rechercheClient}
              changer={setRechercheClient}
            />

            {chercheClient &&
              (clientsEnCours ? (
                <p className="mt-3 text-corps text-encre-doux">Chargement du fichier clients…</p>
              ) : resultatsClients.length === 0 ? (
                <EtatSansResultat className="mt-3">
                  Personne ne correspond. La fiche se crée juste en dessous.
                </EtatSansResultat>
              ) : (
                <>
                  <ul className="mt-3 space-y-2">
                    {resultatsClients.map((client) => (
                      <li key={client.id}>
                        <Choix
                          nom="client-vente"
                          choisi={saisie.clientId === client.id}
                          surChoix={() => changer({ clientId: client.id })}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block font-medium text-encre">
                              {nomComplet(client)}
                            </span>
                            <span className="block text-corps text-encre-doux">
                              {formaterTelephone(client.telephone)}
                              {client.adresse ? ` · ${client.adresse}` : ""}
                            </span>
                          </span>
                        </Choix>
                      </li>
                    ))}
                  </ul>
                  <Tronquee
                    montres={resultatsClients.length}
                    total={clientsTrouves.length}
                    mot="clients"
                  />
                </>
              ))}
          </Groupe>

          {/* Hors du `Groupe` : `FormulaireClient` est lui-même un `<form>`, et
              un formulaire ne se range pas dans le `fieldset` d'un autre.

              C'est **ce bloc-ci** qui change quand un client est retenu, et
              jamais la liste au-dessus : replier un groupe de boutons radio au
              moment du choix le détruirait sous les doigts de qui le parcourt
              aux flèches. */}
          <section className="mb-8">
            {clientChoisi ? (
              <ClientRetenu
                client={clientChoisi}
                surChangement={() => changer({ clientId: "" })}
              />
            ) : (
              <div className="rounded-champ border border-bord bg-fond p-4">
                <h3 className="font-semibold text-encre">Nouveau client</h3>
                <p className="mt-1 text-corps text-encre-doux">
                  Il sera rattaché à cette vente immédiatement, réseau ou pas.
                </p>
                <div className="mt-4">
                  <FormulaireClient
                    clients={lus}
                    surEnregistrement={(id) => changer({ clientId: id })}
                    surFicheExistante={(client) => {
                      changer({ clientId: client.id });
                      /* La recherche se cale sur la fiche adoptée : si on
                         revient changer d'avis, elle est encore là. */
                      setRechercheClient(nomComplet(client));
                    }}
                  />
                </div>
              </div>
            )}
          </section>

          <Groupe titre="La moto">
            {stock === null ? (
              <p className="text-corps text-encre-doux">Chargement du stock…</p>
            ) : vendables.length === 0 ? (
              <EtatVide
                titre={`Aucune moto disponible dans ${perimetre.nom}.`}
                action={
                  <Link href="/motos/nouvelle" className="bouton bouton-principal">
                    <Bike aria-hidden="true" className="size-4" />
                    Faire entrer une moto
                  </Link>
                }
              >
                Les motos vendues et réservées ne réapparaissent pas ici. Faites-en entrer une pour
                pouvoir vendre.
              </EtatVide>
            ) : (
              <>
                <ChampRecherche
                  id="recherche-moto-vente"
                  libelle="Chercher dans le stock"
                  aide={`Châssis, marque ou modèle. ${vendables.length} motos en stock à ${perimetre.nom}.`}
                  placeholder="Châssis, marque ou modèle"
                  valeur={rechercheMoto}
                  changer={setRechercheMoto}
                  monospace
                />

                {!chercheMoto ? (
                  /* L'état d'attente est une invitation, pas un trou
                     (`DESIGN.md` §10) : il dit ce qu'on peut taper plutôt que
                     de laisser une zone vide sous un champ. */
                  <p className="mt-3 flex items-center gap-2 text-corps text-encre-doux">
                    <Search aria-hidden="true" className="size-4 shrink-0" />
                    Tapez un châssis, une marque ou un modèle pour voir les motos.
                  </p>
                ) : resultatsMotos.length === 0 ? (
                  <EtatSansResultat className="mt-3">
                    Aucune moto disponible ne correspond. Vérifiez le châssis, ou effacez la
                    recherche.
                  </EtatSansResultat>
                ) : (
                  <>
                    <ul className="mt-3 space-y-2">
                      {resultatsMotos.map((moto) => (
                        <li key={moto.id}>
                          <Choix
                            nom="moto-vendue"
                            choisi={saisie.motoId === moto.id}
                            surChoix={() => choisirMoto(moto)}
                          >
                            <span className="plaque-code shrink-0 text-legende leading-none text-encre">
                              {moto.numeroChassis}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block font-medium text-encre">
                                {catalogue.nomMarque(moto.marqueId)}{" "}
                                {catalogue.nomModele(moto.modeleId)}
                              </span>
                              <span className="block text-corps text-encre-doux">
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
                    <Tronquee
                      montres={resultatsMotos.length}
                      total={motosTrouvees.length}
                      mot="motos"
                    />
                  </>
                )}
              </>
            )}
          </Groupe>

          <Groupe titre="Le prix">
            <div className="max-w-[16rem]">
              <Champ id="prix-convenu" libelle="Prix convenu" aide="En FCFA entiers, sans centimes.">
                <input
                  id="prix-convenu"
                  inputMode="numeric"
                  aria-describedby="prix-convenu-aide"
                  value={saisie.prixConvenu}
                  onChange={(evenement) => changer({ prixConvenu: evenement.target.value })}
                  className="plaque-code saisie"
                />
              </Champ>
            </div>

            {/* La frontière de D2, dite là où la question se pose — devant le
                montant. Un gérant qui ne voit pas de marge doit savoir qu'elle
                existe et qu'elle ne lui est pas cachée par accident. */}
            {estGerant && (
              <p className="mt-2 flex items-center gap-2 text-legende text-encre-doux">
                <Lock aria-hidden="true" className="size-3.5 shrink-0" />
                La marge de cette vente est calculée pour le responsable seul.
              </p>
            )}
          </Groupe>

          <Groupe titre="Ce qui part avec la moto">
            {/* Deux cases fixes, cochées : c'est le cas ordinaire, et le
                décocher est le geste rare. Ce sont de vraies cases à cocher —
                les deux sont indépendantes, contrairement au mode de paiement
                juste en dessous, qui est un choix exclusif. */}
            <div className="space-y-2">
              <Case
                id="inclus-carte-grise"
                libelle={LIBELLE_INCLUSION.carteGrise}
                coche={saisie.carteGrise}
                changer={(carteGrise) => changer({ carteGrise })}
              />
              <Case
                id="inclus-casque"
                libelle={LIBELLE_INCLUSION.casque}
                coche={saisie.casque}
                changer={(casque) => changer({ casque })}
              />
            </div>
          </Groupe>

          <Groupe titre="Le paiement">
            <Segmente
              libelle="Mode de paiement"
              valeur={saisie.modePaiement}
              changer={(mode: ModePaiement) =>
                changer({
                  modePaiement: mode,
                  /* Le comptant impose le montant entier : le pré-remplir évite
                     de faire retaper ce que la règle exige déjà. */
                  montantEncaisse:
                    mode === "comptant" ? saisie.prixConvenu : saisie.montantEncaisse,
                })
              }
              options={MODES_PAIEMENT.map((mode) => ({
                valeur: mode,
                libelle: LIBELLE_MODE[mode],
              }))}
            />

            <div className="mt-4 max-w-[16rem]">
              <Champ
                id="montant-encaisse"
                libelle="Montant reçu"
                aide={
                  saisie.modePaiement === "comptant"
                    ? "Au comptant, le prix convenu en entier."
                    : "Laissez vide si le client ne verse rien aujourd’hui."
                }
              >
                <input
                  id="montant-encaisse"
                  inputMode="numeric"
                  aria-describedby="montant-encaisse-aide"
                  value={saisie.montantEncaisse}
                  onChange={(evenement) => changer({ montantEncaisse: evenement.target.value })}
                  className="plaque-code saisie"
                />
              </Champ>
            </div>

            <Segmente
              className="mt-4"
              libelle="Moyen de paiement"
              valeur={saisie.moyenPaiement}
              changer={(moyen: MoyenPaiement) => changer({ moyenPaiement: moyen })}
              options={MOYENS_PAIEMENT.map((moyen) => ({
                valeur: moyen,
                libelle: LIBELLE_MOYEN[moyen],
              }))}
            />

            {saisie.moyenPaiement !== "especes" && (
              <div className="mt-4">
                <Champ id="reference-paiement" libelle="Référence du transfert" facultatif>
                  <input
                    id="reference-paiement"
                    value={saisie.reference}
                    maxLength={60}
                    onChange={(evenement) => changer({ reference: evenement.target.value })}
                    className="plaque-code saisie"
                  />
                </Champ>
              </div>
            )}
          </Groupe>
        </div>

        {/* Sur grand écran il reste collé en haut de la colonne de droite ; en
            dessous il se range à la fin du formulaire, juste avant la barre qui
            porte déjà le reste dû. */}
        <aside className="min-w-0 xl:sticky xl:top-0">
          <Recapitulatif
            saisie={saisie}
            moto={motoChoisie}
            client={clientChoisi}
            catalogue={catalogue}
            numero={numeroAVenir}
          />
        </aside>
      </div>
    </Modale>
  );
}

/**
 * Le client retenu, à la place du formulaire de création.
 *
 * Ce bloc remplace le formulaire, jamais la liste de recherche au-dessus : le
 * groupe de boutons radio doit survivre au choix qu'on y fait.
 */
function ClientRetenu({ client, surChangement }: { client: Client; surChangement: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-champ border border-bord bg-fond p-4">
      <UserRound aria-hidden="true" className="size-5 shrink-0 text-encre-doux" />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-encre">{nomComplet(client)}</p>
        <p className="text-corps text-encre-doux">{formaterTelephone(client.telephone)}</p>
      </div>
      <button type="button" onClick={surChangement} className="bouton bouton-discret">
        Changer de client
      </button>
    </div>
  );
}

/**
 * Le récapitulatif — la signature de cet écran.
 *
 * Il répond aux quatre questions qu'on se pose à cet instant précis : quel
 * numéro portera la pièce, qui achète quoi, combien, et est-ce que le client
 * repart avec la moto. **C'est lui qui porte désormais la conséquence du
 * mode de paiement**, que trois pavés et un bandeau répétaient dans le
 * formulaire — dite une fois, à l'endroit où l'on relit avant de valider.
 *
 * Il ne redit pas le châssis : la moto retenue le porte déjà, et un second
 * numéro dans la même colonne se lit comme un autre numéro — or il n'y en a
 * qu'un qui compte ici, celui de la pièce.
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
  const { totalPaye } = agregatsPaiement(
    prixConvenu,
    encaisse > 0 && encaisse <= prixConvenu ? [{ montant: encaisse }] : [],
  );
  const remise = motoRemiseA(saisie.modePaiement);
  const inclusions = [
    saisie.carteGrise ? LIBELLE_INCLUSION.carteGrise : null,
    saisie.casque ? LIBELLE_INCLUSION.casque : null,
  ].filter(Boolean);

  return (
    <section aria-label="Récapitulatif de la vente" className="cadre rounded-carte p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h2 className="text-bloc font-bold tracking-tight text-encre">Ce qui sera enregistré</h2>
        {numero && <span className="plaque-code text-legende text-encre-doux">{numero}</span>}
      </div>

      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
        <LigneRecap titre="Client" valeur={client ? nomComplet(client) : "à choisir"} absent={!client} />
        <LigneRecap
          titre="Moto"
          valeur={
            moto
              ? `${catalogue.nomMarque(moto.marqueId)} ${catalogue.nomModele(moto.modeleId)}`
              : "à choisir"
          }
          absent={!moto}
        />
        <LigneRecap titre="Mode" valeur={LIBELLE_MODE[saisie.modePaiement]} />
        <LigneRecap
          titre="Prix convenu"
          valeur={prixConvenu > 0 ? formaterMontant(prixConvenu) : "à saisir"}
          absent={prixConvenu <= 0}
          montant={prixConvenu > 0}
        />
        <LigneRecap titre="Versement" valeur={formaterMontant(totalPaye)} montant />
        <LigneRecap
          titre="Avec la moto"
          valeur={inclusions.length > 0 ? inclusions.join(" · ") : "rien"}
          absent={inclusions.length === 0}
        />
      </dl>

      {/* La conséquence du mode, dite une fois et à l'endroit où l'on relit.
          C'est la confusion la plus coûteuse du produit — crédit, la moto part ;
          tranches, elle reste — et elle se paie au comptoir, pas ici. */}
      <p className="mt-4 border-t border-bord pt-3 text-corps text-encre-doux">
        {remise
          ? "Le client repart avec la moto. Elle passera au statut « vendue »."
          : "La moto reste au magasin, réservée, jusqu’au dernier versement. L’argent reçu est un engagement, pas une recette."}
      </p>
    </section>
  );
}

function LigneRecap({
  titre,
  valeur,
  absent = false,
  montant = false,
}: {
  titre: string;
  valeur: string;
  absent?: boolean;
  montant?: boolean;
}) {
  return (
    <>
      <dt className="text-corps text-encre-doux">{titre}</dt>
      <dd
        className={[
          "text-right font-semibold text-encre",
          montant ? "font-code whitespace-nowrap" : "",
          absent ? "font-normal text-corps text-encre-doux italic" : "",
        ].join(" ")}
      >
        {valeur}
      </dd>
    </>
  );
}

/**
 * Un choix dans une liste : moto, client.
 *
 * Un vrai bouton radio sous une étiquette : les flèches du clavier parcourent
 * le groupe, et le lecteur d'écran annonce « 2 sur 8 ». Une pile de `<button>`
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
        "flex cursor-pointer items-center gap-3 rounded-champ border px-4 py-3",
        "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-encre",
        choisi
          ? "border-2 border-encre bg-papier px-[15px] py-[11px]"
          : "border-bord bg-papier hover:bg-survol",
      ].join(" ")}
    >
      <input
        type="radio"
        name={nom}
        checked={choisi}
        onChange={surChoix}
        className="size-[18px] shrink-0 accent-encre"
      />
      {children}
    </label>
  );
}

/** Une case à cocher : indépendante, contrairement au segmenté du mode. */
function Case({
  id,
  libelle,
  coche,
  changer,
}: {
  id: string;
  libelle: string;
  coche: boolean;
  changer: (coche: boolean) => void;
}) {
  return (
    <label
      htmlFor={id}
      className={[
        "flex cursor-pointer items-center gap-3 rounded-champ border px-4 py-3",
        "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-encre",
        coche ? "border-encre bg-papier" : "border-bord bg-papier hover:bg-survol",
      ].join(" ")}
    >
      <input
        id={id}
        type="checkbox"
        checked={coche}
        onChange={(evenement) => changer(evenement.target.checked)}
        className="size-[18px] shrink-0 accent-encre"
      />
      <span className="font-medium text-encre">{libelle}</span>
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
    <p className="mt-2 text-corps text-encre-doux">
      {montres} {mot} sur {total}. Affinez la recherche pour voir les autres.
    </p>
  );
}

function ChampRecherche({
  id,
  libelle,
  aide,
  placeholder,
  valeur,
  changer,
  monospace = false,
}: {
  id: string;
  libelle: string;
  aide: string;
  placeholder: string;
  valeur: string;
  changer: (valeur: string) => void;
  monospace?: boolean;
}) {
  return (
    <Champ id={id} libelle={libelle} aide={aide}>
      <div className="relative">
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
          aria-describedby={`${id}-aide`}
          value={valeur}
          onChange={(evenement) => changer(evenement.target.value)}
          className={[
            "saisie pr-3 pl-9 placeholder:text-encre-doux",
            monospace ? "plaque-code placeholder:font-sans placeholder:tracking-normal" : "",
          ].join(" ")}
        />
      </div>
    </Champ>
  );
}
