"use client";

import { Bike, Lock, Search, UserRound, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { ChampsClient, FicheReconnue } from "@/components/FormulaireClient";
import { Champ } from "@/components/patrons/Champ";
import { EtatErreur, EtatErreurSaisie, EtatSansResultat, EtatVide } from "@/components/patrons/Etats";
import { Groupe } from "@/components/patrons/Formulaire";
import { Modale } from "@/components/patrons/Modale";
import { Segmente } from "@/components/patrons/Segmente";
import { useSession } from "@/lib/auth/session";
import {
  SAISIE_CLIENT_VIDE,
  chercherClients,
  formaterTelephone,
  nipDejaPris,
  nomComplet,
  telephoneDejaPris,
  validerClient,
  type Client,
  type SaisieClient,
} from "@/lib/domain/client";
import { creerClient, messageErreurClient } from "@/lib/repositories/clients";
import { formaterMontant, formaterNombre } from "@/lib/domain/format";
import { normaliserChassis, type Moto } from "@/lib/domain/moto";
import {
  LIBELLE_INCLUSION,
  LIBELLE_MODE,
  LIBELLE_MOYEN,
  MODES_PAIEMENT,
  MOYENS_PAIEMENT,
  MOTOS_PAR_VENTE_MAX,
  SAISIE_GROUPEE_VIDE,
  appliquerSaisieGroupee,
  groupeDepuisDepart,
  lireMontant,
  lireMontantEncaisse,
  motoRemiseA,
  repartirEncaisse,
  totalGroupe,
  validerVenteGroupee,
  ventesDuGroupe,
  type LigneMotoVendue,
  type ModePaiement,
  type MoyenPaiement,
  type RefusGroupe,
  type SaisieVente,
  type SaisieVenteGroupee,
  type Vente,
} from "@/lib/domain/vente";
import type { VentePiece } from "@/lib/domain/vente-piece";
import { prochainNumero } from "@/lib/numerotation/compteur";
import { usePerimetre } from "@/lib/perimetre/perimetre";
import { useAbonnement } from "@/lib/repositories/abonnement";
import { useCatalogue, type Catalogue } from "@/lib/repositories/catalogue";
import { useFichierClients } from "@/lib/repositories/fichier-clients";
import { ecouterStock } from "@/lib/repositories/motos";
import { ecouterVentes, enregistrerVentes, messageErreurVente } from "@/lib/repositories/ventes";
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
 * - **Le client se crée par défaut, et sans étape à lui.** C'est le cas
 *   ordinaire au comptoir, et c'était l'inverse : on cherchait d'abord dans un
 *   fichier où l'acheteur n'est en général pas. On tape son nom ici, et c'est
 *   « Enregistrer la vente » qui le crée en passant — la première version
 *   gardait un bouton « Créer le client », soit une validation de plus au
 *   milieu d'un geste qui n'en demande qu'une ; le commanditaire l'a dit après
 *   essai. Le rapprochement, lui, n'a pas bougé d'un pouce — téléphone et pièce
 *   d'identité sont lus avant d'écrire, sur la liste **lue** et jamais aplatie
 *   (D95/D96), et une fiche reconnue est proposée au lieu d'être opposée.
 *   **Tout se valide avant que rien ne s'écrive** : une vente refusée pour son
 *   montant ne doit pas laisser derrière elle une fiche client sans vente.
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
 * **Plusieurs motos dans une vente (26 octobre 2026).** « Souvent une seule
 * personne peut acheter 2-3 motos en même temps. » La liste du stock est donc
 * un jeu de cases à cocher, et chaque moto retenue prend sa ligne avec son
 * propre prix. Le commanditaire a tranché l'option A : **une saisie, plusieurs
 * ventes** — chacune garde son numéro, son reçu, son dossier de carte grise et
 * son crédit, parce que les papiers d'une moto suivent la moto et que le client
 * peut revendre l'une sans les autres. `ventesDuGroupe` fait la projection, et
 * au-delà d'elle plus rien dans le produit ne sait qu'il y en avait plusieurs.
 *
 * L'acompte, lui, reste unique : le client dépose une somme pour l'ensemble.
 * Elle se répartit dans l'ordre des lignes, et le tableau montre le résultat —
 * qui est soldée, qui garde une dette — avant qu'on valide.
 *
 * **Deux choses ne bougent pas, et elles sont délibérées.**
 *
 * Ce n'est **pas un `<form>`**, et il n'en contient plus aucun. La règle était
 * la même avant — on ne peut pas imbriquer deux formulaires —, mais elle se
 * tenait alors sur un équilibre : la modale s'abstenait parce que le bloc
 * client, lui, en était un. Depuis que les champs du client sont posés seuls
 * (`ChampsClient`), il n'y a plus rien à ménager. L'absence de validation par
 * Entrée reste un gain — le premier champ de l'écran est une recherche de
 * châssis, et enregistrer une vente en tapant Entrée après un numéro serait
 * une catastrophe silencieuse.
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
export function ModaleVente({
  onFermer,
  depart,
}: {
  onFermer: () => void;
  /**
   * Des champs déjà remplis à l'ouverture (S57).
   *
   * L'assistant retrouve la moto au stock et le client au fichier, puis ouvre
   * cette modale garnie — **sans rien enregistrer**. Tout le reste du
   * formulaire est inchangé : mêmes vérifications, même bouton, même geste
   * humain pour engager la vente. Absent, le formulaire s'ouvre vide comme
   * toujours.
   */
  depart?: Partial<SaisieVente>;
}) {
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

  /* Le départ passe par `appliquerSaisieVente` et non par un étalement : c'est
     lui qui tient la règle du montant reçu selon le mode de paiement, et la
     contourner poserait un acompte incohérent avec le prix pré-rempli. */
  const [saisie, setSaisie] = useState<SaisieVenteGroupee>(() =>
    depart
      ? appliquerSaisieGroupee(SAISIE_GROUPEE_VIDE, groupeDepuisDepart(depart), false)
      : SAISIE_GROUPEE_VIDE,
  );
  /* **La saisie du client vit ici, et pas dans un formulaire à part.** C'est ce
     que le commanditaire a demandé après essai : le client neuf n'a pas
     d'étape à lui. Le garder dans l'état de la modale a une seconde vertu, et
     c'est un défaut réel qu'il a trouvé — tant que ces champs appartenaient à
     un composant voisin, toucher au mode de paiement pouvait les lui faire
     perdre. Un seul état, un seul geste. */
  const [client, setClient] = useState<SaisieClient>(SAISIE_CLIENT_VIDE);
  /* La fiche reconnue au moment d'enregistrer, gardée à part de l'erreur : on
     ne se contente pas de refuser, on la propose (D95/D96). */
  const [rapproche, setRapproche] = useState<Client | null>(null);
  const [rechercheMoto, setRechercheMoto] = useState("");
  const [rechercheClient, setRechercheClient] = useState("");
  /* **Le refus porte la ligne qu'il vise.** Avec une moto, « le prix convenu
     est obligatoire » suffisait ; avec trois, il faut dire laquelle — sinon on
     relit les trois lignes pour trouver celle qui manque (`DESIGN.md` §5). Les
     messages qui ne visent aucune ligne portent `rang: null`. */
  const [refus, setRefus] = useState<RefusGroupe | null>(null);
  const [enregistrees, setEnregistrees] = useState<{ id: string; numero: string }[] | null>(null);

  /* Le montant reçu a-t-il été tapé à la main ? Tant que non, il suit le mode
     de paiement — voir `changer` juste en dessous. */
  const [montantTouche, setMontantTouche] = useState(false);

  /* La règle du montant reçu vit dans le domaine, où un test unitaire peut
     l'atteindre : elle a traversé tout un lot sans jouer, faute de pouvoir
     être éprouvée ailleurs qu'à l'écran. */
  const changer = (partie: Partial<SaisieVenteGroupee>) =>
    setSaisie((actuel) => appliquerSaisieGroupee(actuel, partie, montantTouche));

  /** Un message qui ne vise aucune ligne : le client, le stock, le serveur. */
  const dire = (message: string) => setRefus({ message, rang: null });

  const changerClient = (partie: Partial<SaisieClient>) =>
    setClient((actuel) => ({ ...actuel, ...partie }));

  function repartirDeZero() {
    setSaisie(SAISIE_GROUPEE_VIDE);
    setMontantTouche(false);
    setClient(SAISIE_CLIENT_VIDE);
    setRapproche(null);
    setRechercheMoto("");
    setRechercheClient("");
    setRefus(null);
    setEnregistrees(null);
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

  const auPlafond = saisie.motos.length >= MOTOS_PAR_VENTE_MAX;
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

  /* Les motos retenues, dans l'ordre où elles ont été cochées — celui des
     lignes, donc celui dans lequel l'acompte se répartit. Une moto qu'un autre
     comptoir vient de vendre disparaît de `vendables` : la ligne reste, et
     `enregistrer` la refuse en la nommant plutôt que de la vendre deux fois. */
  const motosRetenues = useMemo(
    () =>
      saisie.motos.map((ligne) => ({
        ligne,
        moto: vendables.find((moto) => moto.id === ligne.motoId),
      })),
    [saisie.motos, vendables],
  );
  const clientChoisi = clients.find((client) => client.id === saisie.clientId);

  const estGerant = session.statut === "connecte" && session.utilisateur.role === "gerant";

  const numeroAVenir =
    boutiqueId && perimetre.type === "boutique"
      ? prochainNumero({ boutiqueId, code: perimetre.code }, numerosConnus)
      : null;

  /**
   * Cocher une moto l'ajoute à la vente ; la recocher la retire.
   *
   * **Plusieurs motos dans une vente** (26 octobre 2026) : « souvent une seule
   * personne peut acheter 2-3 motos en même temps ». La liste n'est plus un
   * choix exclusif, et chaque moto cochée prend sa ligne avec son propre prix —
   * deux motos du même lot ne se vendent pas au même prix.
   *
   * Le prix conseillé s'installe comme point de départ, jamais comme verrou :
   * c'est un repère de vente, et le prix réel se négocie.
   */
  function basculerMoto(moto: Moto) {
    const deja = saisie.motos.some((ligne) => ligne.motoId === moto.id);
    const motos = deja
      ? saisie.motos.filter((ligne) => ligne.motoId !== moto.id)
      : [
          ...saisie.motos,
          {
            motoId: moto.id,
            prixConvenu: moto.prixVenteConseille !== null ? String(moto.prixVenteConseille) : "",
          },
        ];
    changer({ motos });
    setRefus(null);
  }

  function changerPrix(rang: number, prixConvenu: string) {
    changer({
      motos: saisie.motos.map((ligne, index) =>
        index === rang ? { ...ligne, prixConvenu } : ligne,
      ),
    });
  }

  function retirerMoto(rang: number) {
    changer({ motos: saisie.motos.filter((_, index) => index !== rang) });
    setRefus(null);
  }

  /**
   * Enregistre la vente — et le client avec elle s'il est neuf.
   *
   * **Le client n'a pas d'étape à lui.** On tape son nom dans la modale et
   * c'est ce bouton-ci qui le crée, juste avant la vente. Le commanditaire l'a
   * dit après essai, et il avait raison : « Créer le client » était une
   * validation de plus au milieu d'un geste qui n'en demande qu'une.
   *
   * **Tout se valide avant que rien ne s'écrive.** L'ordre n'est pas
   * cosmétique : créer le client d'abord, puis buter sur un montant refusé,
   * laisserait derrière soi une fiche sans vente — et le fichier clients se
   * remplirait de gens qui ne sont jamais venus.
   *
   * **Plusieurs motos font plusieurs ventes, en une écriture.** L'arbitrage du
   * 26 octobre 2026 (option A) : chacune garde son numéro, son reçu, son
   * dossier et son crédit. Le lot garantit qu'elles partent toutes ou aucune —
   * deux ventes écrites sur trois laisseraient la troisième moto en stock,
   * vendable à quelqu'un d'autre, pendant que le client repart avec elle.
   */
  function enregistrer() {
    if (session.statut !== "connecte" || !boutiqueId || perimetre.type !== "boutique") return;

    const clientRetenu = saisie.clientId;
    const clientANaitre = clientRetenu === "";

    if (clientANaitre) {
      const problemeClient = validerClient(client);
      if (problemeClient) {
        dire(problemeClient);
        return;
      }
      /* Un fichier pas encore lu n'est pas un fichier vide : sans ce garde, le
         rapprochement répondrait « numéro libre » sur une liste qu'il n'a pas
         lue, et la même personne existerait deux fois (D95). */
      if (lus === null) {
        dire("Le fichier clients n’a pas fini d’arriver. Réessayez dans un instant.");
        return;
      }
    }

    /* Le client n'existe pas encore, mais il existera : la vente se valide
       avec un identifiant de remplacement, pour que le contrôle porte sur ce
       qui reste — les motos, les prix, le montant reçu. */
    const probleme = validerVenteGroupee({
      ...saisie,
      clientId: clientRetenu || "client-a-naitre",
    });
    if (probleme) {
      setRefus(probleme);
      return;
    }

    /* **Nommée, et non comptée.** Une moto cochée puis vendue ailleurs pendant
       la saisie a disparu du stock vendable. Refuser « une moto n'est plus
       disponible » obligerait à comparer trois lignes à une liste ; on dit
       laquelle, et on allume sa ligne. */
    const perdue = motosRetenues.findIndex((retenue) => retenue.moto === undefined);
    if (perdue >= 0) {
      setRefus({
        message: "Cette moto n’est plus disponible à la vente. Retirez-la, ou choisissez-en une autre.",
        rang: perdue,
      });
      return;
    }

    const auteur = { uid: session.utilisateur.uid, nom: session.utilisateur.nom };
    let clientId = clientRetenu;

    if (clientANaitre && lus !== null) {
      /* Le rapprochement au dernier moment, sur la liste **lue** : on propose
         la fiche trouvée au lieu de refuser, et la vente attend ce choix
         plutôt que de fabriquer un doublon (D95/D96). */
      const doublon = nipDejaPris(client.nip, lus) ?? telephoneDejaPris(client.telephone, lus);
      if (doublon) {
        setRapproche(doublon);
        setRefus(null);
        return;
      }
      /* L'identifiant existe avant que l'écriture n'aboutisse : c'est ce qui
         rattache la vente au client créé à l'instant, réseau ou pas (D66). */
      const cree = creerClient(client, auteur);
      cree.enregistre.catch((cause: unknown) => dire(messageErreurClient(cause)));
      clientId = cree.id;
    }

    setRefus(null);
    setRapproche(null);

    /* **Recopié, et non pointé.** Le dossier de carte grise porte le nom du
       propriétaire et la moto en clair : celle qui traite les papiers ne lit ni
       le fichier des clients ni le stock, et sans cette copie sa liste
       afficherait des identifiants.

       Le client vient de `clientChoisi` quand il existe déjà, et de la saisie
       quand il naît avec la vente — c'est le même nom, lu à deux endroits selon
       le chemin pris. */
    const clientNom = nomComplet(clientChoisi ?? client);
    const aEcrire = ventesDuGroupe({ ...saisie, clientId }).map((vente, rang) => {
      const moto = motosRetenues[rang].moto as Moto;
      return {
        saisie: vente,
        dossier: {
          clientNom,
          motoLibelle: `${catalogue.nomMarque(moto.marqueId)} ${catalogue.nomModele(
            moto.modeleId,
          )}`.trim(),
          numeroChassis: moto.numeroChassis,
        },
      };
    });

    const { ventes: ecrites, enregistre } = enregistrerVentes(
      aEcrire,
      { boutique: { boutiqueId, code: perimetre.code }, numerosConnus },
      auteur,
    );
    enregistre.catch((cause: unknown) => dire(messageErreurVente(cause)));

    setEnregistrees(ecrites);
    setSaisie(SAISIE_GROUPEE_VIDE);
    setMontantTouche(false);
    setClient(SAISIE_CLIENT_VIDE);
    setRechercheMoto("");
    setRechercheClient("");
  }

  const total = totalGroupe(saisie.motos);
  const encaisse = lireMontantEncaisse(saisie.montantEncaisse) ?? 0;
  /* Les parts servent à deux endroits — les lignes et le récapitulatif — et
     c'est la même règle que celle qui sera écrite : elles sont calculées une
     fois, ici, plutôt que redites à chaque place. */
  const parts = repartirEncaisse(
    encaisse,
    saisie.motos.map((ligne) => lireMontant(ligne.prixConvenu) ?? 0),
  );
  const resteDu = Math.max(total - Math.min(encaisse, total), 0);

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

  if (enregistrees) {
    const seule = enregistrees.length === 1;
    return (
      <Modale
        ouvert
        onFermer={fermer}
        titre={seule ? "Vente enregistrée" : `${enregistrees.length} ventes enregistrées`}
        taille="moyenne"
        pied={
          <>
            <button type="button" onClick={repartirDeZero} className="bouton bouton-neutre">
              Enregistrer une autre vente
            </button>
            {/* `repartirDeZero` et non `fermer` : le lien enlève déjà
                `?nouvelle=1` de l'adresse, ce qui referme la modale. Appeler
                la fermeture ici lancerait un second changement d'adresse en
                même temps que la navigation, et les deux se disputeraient.

                Plusieurs ventes n'ont pas de fiche commune à ouvrir : le lien
                mène alors à la liste, où elles sont les premières. */}
            <Link
              href={seule ? `/motos/ventes?vente=${enregistrees[0].id}` : "/motos/ventes"}
              onClick={repartirDeZero}
              className="ml-auto bouton bouton-principal"
            >
              {seule ? "Voir la vente" : "Voir les ventes"}
            </Link>
          </>
        }
      >
        <div role="status">
          {/* **Tous les numéros, et non un décompte.** Ce sont les numéros
              qu'on dicte au client et qu'on écrit sur les reçus : « 2 ventes
              enregistrées » obligerait à aller les chercher dans la liste. */}
          <p className="font-medium text-encre">
            {seule ? "Vente enregistrée" : "Ventes enregistrées"} —{" "}
            {enregistrees.map((vente, rang) => (
              <span key={vente.id}>
                {rang > 0 && " · "}
                <span className="plaque-code">{vente.numero}</span>
              </span>
            ))}
          </p>
          <p className="mt-1 max-w-prose text-corps text-encre-doux">
            {seule
              ? "Le dossier de carte grise est ouvert. Si le réseau manque, la vente partira seule dès son retour."
              : "Chaque moto a son reçu et son dossier de carte grise. Si le réseau manque, les ventes partiront ensemble dès son retour."}
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
      description={
        saisie.motos.length > 1
          ? `${saisie.motos.length} motos, donc ${saisie.motos.length} ventes : chacune aura son numéro, son reçu et son dossier.`
          : "Le numéro de la pièce sera attribué à l’enregistrement, même sans réseau."
      }
      taille="large"
      pied={
        <>
          {/* L'erreur vit dans le pied, avec le bouton qu'elle explique : un
              message resté en haut d'un formulaire long ne serait jamais lu.
              Elle ne réserve pas sa ligne — le pied est ancré en bas et grandit
              vers le haut, donc le bouton ne se dérobe pas sous le doigt. */}
          {refus && <EtatErreurSaisie message={refus.message} className="w-full" />}
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

          {/* C'est **ce bloc-ci** qui change quand un client est retenu, et
              jamais la liste au-dessus : replier un groupe de boutons radio au
              moment du choix le détruirait sous les doigts de qui le parcourt
              aux flèches.

              Il vivait hors du `Groupe` parce qu'il portait un `<form>` et
              qu'un formulaire ne se range pas dans le `fieldset` d'un autre.
              Ce n'est plus le cas — `ChampsClient` n'est que des champs —, mais
              la séparation reste : elle dit que ce bloc répond à la liste, au
              lieu d'en faire partie. */}
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
                <div className="mt-4 max-w-[40rem]">
                  {/* Les champs seuls : pas de `<form>`, pas de bouton. Le
                      client part avec la vente, et c'est le pied de la modale
                      qui conclut les deux. */}
                  <ChampsClient prefixe="nouveau-client" saisie={client} changer={changerClient} />

                  {rapproche && (
                    <FicheReconnue
                      client={rapproche}
                      surUtilisation={(trouve) => {
                        changer({ clientId: trouve.id });
                        setRapproche(null);
                        /* La recherche se cale sur la fiche adoptée : si on
                           revient changer d'avis, elle est encore là. */
                        setRechercheClient(nomComplet(trouve));
                      }}
                      surAbandon={() => setRapproche(null)}
                    />
                  )}
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
                  aide={`Châssis, marque ou modèle. Cochez-en plusieurs si le client en achète plusieurs. ${vendables.length} motos en stock à ${perimetre.nom}.`}
                  placeholder="Châssis, marque ou modèle"
                  valeur={rechercheMoto}
                  changer={setRechercheMoto}
                  monospace
                />

                {auPlafond && (
                  <p className="mt-3 text-corps text-encre-doux">
                    {MOTOS_PAR_VENTE_MAX} motos dans cette vente, c’est le maximum. Enregistrez-la,
                    puis commencez-en une seconde.
                  </p>
                )}

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
                            multiple
                            choisi={saisie.motos.some((ligne) => ligne.motoId === moto.id)}
                            /* Le plafond s'oppose ici, pas à la validation : un
                               refus découvert après avoir coché onze motos
                               ferait tout reprendre (`DESIGN.md` §10). */
                            desactive={
                              auPlafond && !saisie.motos.some((ligne) => ligne.motoId === moto.id)
                            }
                            surChoix={() => basculerMoto(moto)}
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

          <Groupe titre={saisie.motos.length > 1 ? "Les prix" : "Le prix"}>
            {saisie.motos.length === 0 ? (
              <p className="text-corps text-encre-doux">
                Cochez une moto ci-dessus — ou plusieurs — pour en fixer le prix.
              </p>
            ) : (
              <LignesVendues
                lignes={saisie.motos}
                motos={motosRetenues.map((retenue) => retenue.moto)}
                parts={parts}
                total={total}
                catalogue={catalogue}
                rangFautif={refus?.rang ?? null}
                acompte={encaisse}
                changerPrix={changerPrix}
                retirer={retirerMoto}
              />
            )}

            {/* La frontière de D2, dite là où la question se pose — devant le
                montant. Un gérant qui ne voit pas de marge doit savoir qu'elle
                existe et qu'elle ne lui est pas cachée par accident. */}
            {estGerant && (
              <p className="mt-2 flex items-center gap-2 text-legende text-encre-doux">
                <Lock aria-hidden="true" className="size-3.5 shrink-0" />
                La marge de ces ventes est calculée pour le responsable seul.
              </p>
            )}
          </Groupe>

          <Groupe
            titre={
              saisie.motos.length > 1 ? "Ce qui part avec chaque moto" : "Ce qui part avec la moto"
            }
          >
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
              /* Le montant reçu n'est pas posé ici : c'est `changer` qui tient
                 la règle, parce qu'elle doit valoir aussi quand le prix bouge
                 — et parce que le comptant étant le mode par défaut, ce
                 rappel-ci ne se déclenche pas au cas le plus courant. */
              changer={(mode: ModePaiement) => changer({ modePaiement: mode })}
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
                  onChange={(evenement) => {
                    setMontantTouche(true);
                    changer({ montantEncaisse: evenement.target.value });
                  }}
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
            motos={motosRetenues.map((retenue) => retenue.moto)}
            client={clientChoisi}
            catalogue={catalogue}
            numero={numeroAVenir}
            total={total}
            encaisse={encaisse}
          />
        </aside>
      </div>
    </Modale>
  );
}

/**
 * Les motos de la vente, une ligne chacune, avec leur prix (26 octobre 2026).
 *
 * **Un champ par moto, et non un prix pour l'ensemble.** Deux motos du même lot
 * ne se vendent pas au même prix, et c'est le prix de *cette* moto qui
 * s'imprime sur *son* reçu. Un total divisé par trois aurait fabriqué trois
 * prix que personne n'a convenus.
 *
 * **La répartition de l'acompte se lit avant d'être écrite.** Le client dépose
 * une somme pour l'ensemble ; la règle la pose sur la première moto puis la
 * fait déborder. Ces deux colonnes montrent le résultat ligne par ligne — qui
 * est soldée, qui garde une dette — pour que rien ne s'écrive que le gérant
 * n'ait pu lire. Elles n'apparaissent qu'à partir de deux motos : sur une
 * seule, le pied de la modale dit déjà le reste dû.
 *
 * La grille est celle du classeur des cartes grises (S59) : la forme que le
 * commanditaire lit sans l'apprendre.
 */
function LignesVendues({
  lignes,
  motos,
  parts,
  total,
  catalogue,
  rangFautif,
  acompte,
  changerPrix,
  retirer,
}: {
  lignes: LigneMotoVendue[];
  /** La moto de chaque ligne, ou `undefined` si elle a quitté le stock entre-temps. */
  motos: (Moto | undefined)[];
  parts: number[];
  total: number;
  catalogue: Catalogue;
  rangFautif: number | null;
  acompte: number;
  changerPrix: (rang: number, valeur: string) => void;
  retirer: (rang: number) => void;
}) {
  const detaille = lignes.length > 1;

  return (
    <>
      <div className="cadre-grille">
        <table className="grille-saisie">
          <caption className="sr-only">
            Les motos de cette vente, une ligne chacune, avec le prix convenu de chacune.
          </caption>
          <thead>
            <tr>
              <th scope="col" className="gouttiere">
                <span className="sr-only">Ligne</span>
                <span aria-hidden="true">#</span>
              </th>
              <th scope="col" style={{ width: "13rem" }}>
                Moto
              </th>
              <th scope="col" style={{ width: "9rem" }}>
                Prix convenu
              </th>
              {detaille && (
                <>
                  <th scope="col" style={{ width: "7rem" }}>
                    Reçu
                  </th>
                  <th scope="col" style={{ width: "7rem" }}>
                    Reste
                  </th>
                </>
              )}
              <th scope="col" style={{ width: "2.75rem" }}>
                <span className="sr-only">Retirer la moto</span>
              </th>
            </tr>
          </thead>

          <tbody>
            {lignes.map((ligne, rang) => {
              const moto = motos[rang];
              const prix = lireMontant(ligne.prixConvenu) ?? 0;
              const part = parts[rang] ?? 0;
              return (
                <tr
                  key={ligne.motoId}
                  className={rangFautif === rang ? "ligne-fautive" : undefined}
                >
                  <td className="gouttiere">{rang + 1}</td>

                  <td className="px-2.5 py-1.5">
                    {moto ? (
                      <>
                        <span className="block font-code text-legende break-all text-encre">
                          {moto.numeroChassis}
                        </span>
                        <span className="block text-corps text-encre-doux">
                          {catalogue.nomMarque(moto.marqueId)} {catalogue.nomModele(moto.modeleId)}
                        </span>
                      </>
                    ) : (
                      /* Elle a été vendue ailleurs pendant la saisie. Nommée et
                         non effacée : effacer la ligne sous les doigts ferait
                         disparaître un prix déjà tapé sans rien expliquer. */
                      <span className="text-corps text-alerte">
                        Cette moto n’est plus disponible. Retirez-la.
                      </span>
                    )}
                  </td>

                  <td>
                    <input
                      inputMode="numeric"
                      value={ligne.prixConvenu}
                      onChange={(evenement) => changerPrix(rang, evenement.target.value)}
                      className="cellule font-code tabular-nums"
                      aria-label={`Prix convenu, ligne ${rang + 1}`}
                    />
                  </td>

                  {detaille && (
                    <>
                      <td className="px-2.5 font-code text-corps tabular-nums text-encre-doux">
                        {formaterNombre(part)}
                      </td>
                      <td className="px-2.5 font-code text-corps tabular-nums text-encre-doux">
                        {formaterNombre(Math.max(prix - part, 0))}
                      </td>
                    </>
                  )}

                  <td>
                    <button
                      type="button"
                      onClick={() => retirer(rang)}
                      className="flex h-11 w-full items-center justify-center text-encre-doux transition hover:text-alerte"
                    >
                      <X aria-hidden="true" className="size-4" />
                      <span className="sr-only">Retirer la moto de la ligne {rang + 1}</span>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {detaille && (
        <p className="mt-2 flex flex-wrap items-baseline justify-end gap-x-4 gap-y-1">
          <span className="text-corps text-encre-doux">
            {lignes.length} motos · acompte réparti dans l’ordre des lignes
          </span>
          <span className="text-corps text-encre-doux">Total</span>
          <span className="font-code text-bloc font-medium whitespace-nowrap text-encre">
            {formaterMontant(total)}
          </span>
        </p>
      )}

      {detaille && acompte > 0 && acompte < total && (
        /* La règle, dite là où on en voit l'effet. Sans elle, les deux colonnes
           paraîtraient arbitraires — or elles sont prévisibles, et c'est ce qui
           permet de les contredire en changeant les prix ou l'ordre. */
        <p className="mt-1 text-right text-legende text-encre-doux">
          L’acompte solde les premières lignes avant d’entamer les suivantes.
        </p>
      )}
    </>
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
  motos,
  client,
  catalogue,
  numero,
  total,
  encaisse,
}: {
  saisie: SaisieVenteGroupee;
  /** Les motos retenues, dans l'ordre des lignes. Les disparues sont omises. */
  motos: (Moto | undefined)[];
  client: Client | undefined;
  catalogue: Catalogue;
  numero: string | null;
  total: number;
  encaisse: number;
}) {
  const remise = motoRemiseA(saisie.modePaiement);
  const inclusions = [
    saisie.carteGrise ? LIBELLE_INCLUSION.carteGrise : null,
    saisie.casque ? LIBELLE_INCLUSION.casque : null,
  ].filter(Boolean);
  const connues = motos.filter((moto): moto is Moto => moto !== undefined);
  const plusieurs = saisie.motos.length > 1;

  return (
    <section aria-label="Récapitulatif de la vente" className="cadre rounded-carte p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h2 className="text-bloc font-bold tracking-tight text-encre">Ce qui sera enregistré</h2>
        {/* `data-test` parce que ce numéro est le seul endroit du produit où se
            voit la numérotation hors ligne de S7, depuis que l'écran de
            diagnostic a disparu (S54). Rien d'autre ne le distingue d'une
            plaque de code quelconque, et la suite bout en bout doit pouvoir le
            viser sans dépendre de sa mise en forme.

            Avec plusieurs motos, c'est le **premier** d'une série : les
            suivants se tirent du même compteur, à l'enregistrement. */}
        {numero && (
          <span data-test="prochain-numero" className="plaque-code text-legende text-encre-doux">
            {plusieurs ? `à partir de ${numero}` : numero}
          </span>
        )}
      </div>

      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
        <LigneRecap
          titre="Client"
          valeur={client ? nomComplet(client) : "à choisir"}
          absent={!client}
        />
        <LigneRecap
          titre={plusieurs ? `Motos (${saisie.motos.length})` : "Moto"}
          valeur={
            connues.length > 0
              ? connues
                  .map((moto) =>
                    `${catalogue.nomMarque(moto.marqueId)} ${catalogue.nomModele(
                      moto.modeleId,
                    )}`.trim(),
                  )
                  .join(" · ")
              : "à choisir"
          }
          absent={connues.length === 0}
        />
        <LigneRecap titre="Mode" valeur={LIBELLE_MODE[saisie.modePaiement]} />
        <LigneRecap
          titre={plusieurs ? "Total convenu" : "Prix convenu"}
          valeur={total > 0 ? formaterMontant(total) : "à saisir"}
          absent={total <= 0}
          montant={total > 0}
        />
        <LigneRecap titre="Versement" valeur={formaterMontant(Math.min(encaisse, total))} montant />
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
          ? plusieurs
            ? "Le client repart avec les motos. Elles passeront au statut « vendue »."
            : "Le client repart avec la moto. Elle passera au statut « vendue »."
          : plusieurs
            ? "Les motos restent au magasin, réservées, jusqu’au dernier versement. L’argent reçu est un engagement, pas une recette."
            : "La moto reste au magasin, réservée, jusqu’au dernier versement. L’argent reçu est un engagement, pas une recette."}
      </p>

      {plusieurs && (
        /* Ce que l'option A veut dire, dit là où on valide : le commanditaire
           l'a choisie pour cela, et c'est ce qui se vérifiera à la caisse. */
        <p className="mt-2 text-corps text-encre-doux">
          {saisie.motos.length} ventes distinctes seront enregistrées : un reçu, un dossier de
          carte grise et un crédit par moto.
        </p>
      )}
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
  multiple = false,
  desactive = false,
  children,
}: {
  nom: string;
  choisi: boolean;
  surChoix: () => void;
  /**
   * Plusieurs lignes à la fois — les motos d'une même vente (26 octobre 2026).
   *
   * **Une case à cocher, et non un radio qu'on décocherait.** Un groupe de
   * radios dit « une seule parmi celles-ci » : aux lecteurs d'écran comme aux
   * flèches du clavier, qui déplacent *et* choisissent. Pour une liste où l'on
   * en prend plusieurs, c'est faux — et la touche ne peut pas, dans un groupe
   * de radios, parcourir sans cocher.
   */
  multiple?: boolean;
  /** Proposé mais pas cochable — le plafond d'une vente est atteint. */
  desactive?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label
      className={[
        "flex items-center gap-3 rounded-champ border px-4 py-3",
        desactive ? "cursor-not-allowed opacity-50" : "cursor-pointer",
        "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-encre",
        choisi
          ? "border-2 border-encre bg-papier px-[15px] py-[11px]"
          : desactive
            ? "border-bord bg-papier"
            : "border-bord bg-papier hover:bg-survol",
      ].join(" ")}
    >
      <input
        type={multiple ? "checkbox" : "radio"}
        name={multiple ? undefined : nom}
        checked={choisi}
        disabled={desactive}
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
