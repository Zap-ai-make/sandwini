"use client";

import { Bike, Info, Lock, Search, UserPlus } from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { FormulaireClient } from "@/components/FormulaireClient";
import { Champ } from "@/components/patrons/Champ";
import { EtatErreur, EtatErreurSaisie, EtatSansResultat, EtatVide } from "@/components/patrons/Etats";
import { Formulaire, Groupe } from "@/components/patrons/Formulaire";
import { TetePage, useSurTitre } from "@/components/patrons/Page";
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
 * la deuxième. L'ordre des groupes suit celui de la maquette validée : qui
 * achète, quelle moto, à quel prix, payée comment, combien aujourd'hui.
 *
 * **« Long, doit rester serein » (`CAHIER-UI.md` §9).** Trois choses le tiennent
 * maintenant, et aucune n'est décorative. La saisie garde **une colonne** de
 * 40 rem au lieu de s'étaler sur toute la zone de travail — la place gagnée à
 * droite ne sert pas à étirer les champs, elle porte le récapitulatif, qui
 * reste sous les yeux pendant qu'on saisit. La **barre de validation reste
 * collée en bas**, avec le reste dû, le chiffre qu'on relit à voix haute. Et
 * les groupes sont **courts et titrés**, un seul champ par ligne.
 *
 * **Ce que la maquette montre et qu'on n'a pas construit.** Elle replie le
 * groupe résolu sur une fiche « Haojue HJ 125-11 · Changer », ce qui raccourcit
 * franchement l'écran. Essayé, puis retiré : la liste est un vrai groupe de
 * boutons radio, et dans un groupe de boutons radio les flèches du clavier
 * **déplacent et choisissent à la fois**. Une première flèche vers le bas
 * aurait donc détruit le groupe sous les doigts de la personne en train de le
 * parcourir, en emportant le focus avec lui (`DESIGN.md` §11). Le dessin de la
 * maquette suppose une liste déroulante à recherche — que D72 laisse hors de
 * S29, faute de composant accessible pour la porter. La liste reste donc
 * ouverte, et le choix se marque sur sa ligne.
 *
 * **Ce n'est délibérément pas un `<form>`.** Il en contient un — celui de la
 * création d'un client à la volée — et deux formulaires ne s'imbriquent pas.
 * L'absence de validation par la touche Entrée est un gain ici, pas une perte :
 * un des premiers champs de l'écran est une recherche de châssis, et
 * enregistrer une vente en tapant Entrée après un numéro serait une catastrophe
 * silencieuse.
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

  const estGerant = session.statut === "connecte" && session.utilisateur.role === "gerant";

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
      <div>
        <TetePage titre="Nouvelle vente" />
        <p className="max-w-prose text-encre-doux">
          Une vente appartient à une boutique précise — son numéro en porte le code. Choisissez-en
          une dans le bandeau, en haut de l’écran, avant d’enregistrer.
        </p>
      </div>
    );
  }

  const surTitre = useSurTitre("Motos");
  const prixConvenu = lireMontant(saisie.prixConvenu) ?? 0;
  const encaisse = lireMontantEncaisse(saisie.montantEncaisse) ?? 0;
  const { resteDu } = agregatsPaiement(
    prixConvenu,
    encaisse > 0 && encaisse <= prixConvenu ? [{ montant: encaisse }] : [],
  );

  return (
    <div>
      <TetePage
        surTitre={surTitre}
        titre="Nouvelle vente"
        sousTitre="Le numéro de la pièce sera attribué à l’enregistrement, même sans réseau."
      />

      {enregistree && (
        <div
          role="status"
          className="mb-6 max-w-[40rem] cadre p-4"
        >
          <p className="font-medium text-encre">
            Vente enregistrée — <span className="plaque-code">{enregistree.numero}</span>
          </p>
          <p className="mt-1 max-w-prose text-corps text-encre-doux">
            Le dossier est ouvert avec ses quatre documents à traiter. Si le réseau manque, la vente
            partira seule dès son retour.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href={`/motos/ventes?vente=${enregistree.id}`} className="bouton bouton-neutre">
              Voir la vente
            </Link>
            <Link href="/motos/ventes" className="bouton bouton-neutre">
              Voir les ventes
            </Link>
          </div>
        </div>
      )}

      <EtatErreur message={erreurStock} className="mb-4" />

      <Formulaire
        recapitulatif={
          <Recapitulatif
            saisie={saisie}
            moto={motoChoisie}
            client={clientChoisi}
            catalogue={catalogue}
            numero={numeroAVenir}
          />
        }
        barre={
          <>
            {/* L'erreur vit dans la barre, et pas au pied de la colonne : le
                bouton étant collé en bas, un message resté à deux mille pixels
                de là ne serait jamais lu.

                Elle ne réserve pas sa ligne, contrairement à ce que fait
                `EtatErreurSaisie` partout ailleurs, et pour la raison même qui
                l'y oblige ailleurs : la réserve existe pour que le bouton ne
                se dérobe pas sous le doigt. Ici la barre est ancrée par le bas
                — elle grandit vers le haut, et le bouton ne bouge pas. Une
                ligne vide en permanence n'aurait fait qu'épaissir une barre
                qui reste à l'écran toute la saisie. */}
            {erreur && <EtatErreurSaisie message={erreur} className="w-full" />}
            <p className="flex items-baseline gap-2">
              <span className="text-corps text-encre-doux">Reste dû</span>
              <span className="font-code text-bloc font-medium whitespace-nowrap text-encre">
                {formaterMontant(resteDu)}
              </span>
            </p>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Link href="/motos/ventes" className="bouton bouton-neutre">
                Annuler
              </Link>
              <button type="button" onClick={enregistrer} className="bouton bouton-principal">
                Enregistrer la vente
              </button>
            </div>
          </>
        }
      >
        <Groupe titre="Le client">
          <ChampRecherche
            id="recherche-client-vente"
            libelle="Chercher un client"
            aide="Un nom, ou le début d’un numéro de téléphone."
            placeholder="Un numéro, ou le début d’un nom"
            valeur={rechercheClient}
            changer={setRechercheClient}
          />

          {clientsEnCours ? (
            <p className="mt-3 text-corps text-encre-doux">Chargement du fichier clients…</p>
          ) : resultatsClients.length === 0 ? (
            <EtatSansResultat className="mt-3">
              {clients.length === 0
                ? "Le fichier clients est vide. Créez la fiche de cet acheteur, elle servira à toutes les boutiques."
                : "Personne ne correspond. Vérifiez le numéro, ou créez la fiche."}
            </EtatSansResultat>
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
                      <span className="block text-corps text-encre-doux">
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
            className="bouton bouton-neutre mt-3"
          >
            <UserPlus aria-hidden="true" className="size-4" />
            {creationClient ? "Fermer" : "Nouveau client"}
          </button>
        </Groupe>

        {/* Hors du groupe précédent : `FormulaireClient` est lui-même un
            `<form>`, et un formulaire ne se range pas dans le `fieldset` d'un
            autre. Il reste à sa place dans la lecture de l'écran, juste sous le
            choix du client. */}
        {creationClient && (
          <section className="mb-8 rounded-champ border border-bord bg-fond p-4">
            <h2 className="font-semibold text-encre">Nouveau client</h2>
            <p className="mt-1 text-corps text-encre-doux">
              Il sera rattaché à cette vente immédiatement, réseau ou pas.
            </p>
            <div className="mt-4">
              <FormulaireClient
                clients={clients}
                surEnregistrement={(id, saisieClient) => {
                  changer({ clientId: id });
                  setCreationClient(false);
                  /* La recherche se cale sur le nom saisi plutôt que de se
                     vider : si le gérant revient changer de client, la liste ne
                     montre que ses premiers résultats, et un fichier de deux
                     cents clients aurait fait disparaître celui qu'il vient
                     tout juste de créer. */
                  setRechercheClient(saisieClient.nom.trim());
                }}
                surAnnulation={() => setCreationClient(false)}
              />
            </div>
          </section>
        )}

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
                aide={`Seules les motos en stock à ${perimetre.nom} sont proposées.`}
                placeholder="Châssis, marque ou modèle"
                valeur={rechercheMoto}
                changer={setRechercheMoto}
                monospace
              />

              {resultatsMotos.length === 0 ? (
                <EtatSansResultat className="mt-3">
                  Aucune moto disponible ne correspond. Vérifiez le châssis, ou effacez la recherche.
                </EtatSansResultat>
              ) : (
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
                        {/* Une seule colonne de texte, pas deux : sur un écran
                            de téléphone, un prix aligné à droite venait
                            chevaucher un nom de modèle un peu long — vu en
                            regardant la capture, pas en lisant le code. Le prix
                            conseillé descend donc sur la ligne secondaire, où il
                            se lit aussi bien. */}
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium text-encre">
                            {catalogue.nomMarque(moto.marqueId)} {catalogue.nomModele(moto.modeleId)}
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
              )}
              <Tronquee montres={resultatsMotos.length} total={motosTrouvees.length} mot="motos" />
            </>
          )}
        </Groupe>

        <Groupe titre="Le prix">
          <div className="max-w-[16rem]">
            <Champ
              id="prix-convenu"
              libelle="Prix convenu"
              aide="En FCFA entiers, sans centimes."
            >
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

          <div className="mt-4 space-y-4">
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
        </Groupe>

        <Groupe titre="Le mode de paiement">
          <p className="mb-3 text-corps text-encre-doux">
            Ce choix décide si la moto part avec le client ou reste au magasin. Il ne se change pas
            après l’enregistrement.
          </p>

          <div className="space-y-2" role="radiogroup" aria-label="Mode de paiement">
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
                    montantEncaisse:
                      mode === "comptant" ? saisie.prixConvenu : saisie.montantEncaisse,
                  })
                }
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-encre">{LIBELLE_MODE[mode]}</span>
                  <span className="block text-corps text-encre-doux">{EFFET_MODE[mode]}</span>
                </span>
              </Choix>
            ))}
          </div>

          {/* La conséquence, redite en clair juste au-dessus de la zone de
              saisie qu'elle commande : ce qui suit est un montant, et selon le
              mode ce montant est une recette ou un engagement. C'est la
              confusion la plus coûteuse du produit — crédit, la moto part ;
              tranches, elle reste — et elle se paie au comptoir, pas ici. */}
          <p className="mt-4 flex gap-2 rounded-champ border-l-[3px] border-l-goutte bg-goutte-surface p-3 text-encre">
            <Info aria-hidden="true" className="mt-0.5 size-[18px] shrink-0 text-goutte" />
            <span>
              <strong className="font-semibold">
                {LIBELLE_MODE[saisie.modePaiement]} choisi.
              </strong>{" "}
              {EFFET_MODE[saisie.modePaiement]}
            </span>
          </p>
        </Groupe>

        <Groupe titre="Le premier versement">
          <div className="max-w-[16rem]">
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

          <div className="mt-4 max-w-[16rem]">
            <Champ id="moyen-paiement" libelle="Moyen de paiement">
              <select
                id="moyen-paiement"
                value={saisie.moyenPaiement}
                onChange={(evenement) =>
                  changer({ moyenPaiement: evenement.target.value as MoyenPaiement })
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
          </div>

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
      </Formulaire>
    </div>
  );
}

/**
 * Le récapitulatif — la signature de cet écran.
 *
 * Il répond aux quatre questions qu'on se pose à cet instant précis : quel
 * numéro portera la pièce, qui achète quoi, combien, et est-ce que le client
 * repart avec la moto. Sur grand écran il reste collé en haut de la colonne de
 * droite : on relit sans remonter le formulaire.
 *
 * **Il ne redit pas le châssis.** La moto retenue le porte déjà, deux blocs
 * plus haut, et un second numéro dans la même colonne se lit comme un autre
 * numéro — or il n'y en a qu'un qui compte ici, celui de la pièce.
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

  return (
    <section aria-label="Récapitulatif de la vente" className="cadre rounded-carte p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h2 className="text-bloc font-bold tracking-tight text-encre">Ce qui sera enregistré</h2>
        {numero && (
          <span className="plaque-code text-legende text-encre-doux">
            {numero}
          </span>
        )}
      </div>

      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
        <LigneRecap titre="Client" valeur={client?.nom ?? "à choisir"} absent={!client} />
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
      </dl>

      <p className="mt-4 flex gap-2 border-t border-bord pt-3 text-corps text-encre-doux">
        <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
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
        "flex cursor-pointer items-center gap-3 rounded-champ border px-4 py-3",
        "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-encre",
        /* Le mode retenu se distingue par la bordure et par la graisse, jamais
           par la seule couleur — l'état natif du bouton radio reste la source
           de vérité (`DESIGN.md` §5). */
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
    <Champ id={id} libelle={libelle} facultatif aide={aide}>
      <textarea
        id={id}
        rows={2}
        aria-describedby={`${id}-aide`}
        value={valeur}
        onChange={(evenement) => changer(evenement.target.value)}
        className="saisie"
      />
    </Champ>
  );
}
