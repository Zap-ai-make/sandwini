"use client";

import { Bike, Warehouse } from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, type ReactNode } from "react";
import { EtatErreur, EtatVide, SansBoutique } from "@/components/patrons/Etats";
import { TetePage } from "@/components/patrons/Page";
import { Tableau, type Colonne } from "@/components/patrons/Tableau";
import { SEUIL_INACTIVITE_DEFAUT, type ReglagesEntreprise } from "@/lib/domain/entreprise";
import { formaterDateCourte, formaterMontant, formaterNombre } from "@/lib/domain/format";
import type { Moto } from "@/lib/domain/moto";
import {
  dettes,
  estInactive,
  LIBELLE_STATUT_PAIEMENT,
  suivrePaiements,
  totalDetenu,
  totalDu,
  tranchesEnCours,
  type LignePaiement,
  type StatutPaiement,
  type Vente,
  type Versement,
} from "@/lib/domain/vente";
import { usePerimetre } from "@/lib/perimetre/perimetre";
import { useAbonnement } from "@/lib/repositories/abonnement";
import { useCatalogue, type Catalogue } from "@/lib/repositories/catalogue";
import { ecouterReglages } from "@/lib/repositories/entreprise";
import { useFichierClients } from "@/lib/repositories/fichier-clients";
import { ecouterStock } from "@/lib/repositories/motos";
import { ecouterVentes, ecouterVersementsDuPerimetre } from "@/lib/repositories/ventes";

/**
 * Le suivi des paiements (§6.3).
 *
 * **Deux sections, nommées, jamais mêlées.** C'est la raison d'être de cet
 * écran, et la confusion métier la plus coûteuse du projet (§13). Une *dette*
 * est de l'argent qui manque au magasin : la moto est partie avec le client.
 * Une *tranche* est de l'argent que le magasin détient : la moto n'est pas
 * sortie, et l'argent peut repartir. Les additionner ferait un chiffre qui ne
 * veut rien dire — d'où deux tableaux, deux totaux, deux vocabulaires, jamais
 * un cumul.
 *
 * **Elles sont visibles en même temps, et ce n'est pas un détail.** L'écran
 * précédent les rangeait derrière trois boutons dont un seul était pressé à la
 * fois : on ne pouvait pas se tromper, mais on ne pouvait pas non plus voir la
 * différence — et c'est la voir qui l'enseigne. La bande d'explication de
 * chaque section dit, en une phrase, où est la moto et qui détient l'argent.
 *
 * **La troisième liste a disparu.** « Tranches inactives » était un filtre de
 * la deuxième ; l'information vit désormais dans la colonne « État » de chaque
 * ligne — « Aucun versement depuis 60 jours » —, dans le filet rouge qui marque
 * la ligne, et dans le comptage en tête de section. Une liste dont chaque
 * élément se lit déjà dans une autre n'est pas une liste, c'est un tri.
 *
 * Tout est calculé en mémoire à partir des versements chargés, jamais depuis un
 * agrégat serveur (`prompt.md` §3.4, D56) : ces listes doivent s'ouvrir sans
 * réseau comme le reste du produit.
 */
export default function PagePaiements() {
  const { perimetre, chargement: perimetreEnCours } = usePerimetre();
  const catalogue = useCatalogue();
  const { clients } = useFichierClients();

  const boutiqueId = perimetre.boutiqueId;

  const souscrireVentes = useCallback(
    (auChangement: (ventes: Vente[]) => void, enErreur: (cause: unknown) => void) =>
      ecouterVentes(boutiqueId, auChangement, enErreur),
    [boutiqueId],
  );
  const { valeur: ventes, erreur } = useAbonnement(
    souscrireVentes,
    "Les ventes n’ont pas pu être chargées.",
  );

  const souscrireVersements = useCallback(
    (auChangement: (versements: Versement[]) => void, enErreur: (cause: unknown) => void) =>
      ecouterVersementsDuPerimetre(boutiqueId, auChangement, enErreur),
    [boutiqueId],
  );
  const { valeur: versements, erreur: erreurVersements } = useAbonnement(
    souscrireVersements,
    "Les versements n’ont pas pu être lus.",
  );

  const souscrireStock = useCallback(
    (auChangement: (motos: Moto[]) => void, enErreur: (cause: unknown) => void) =>
      ecouterStock(boutiqueId, auChangement, enErreur),
    [boutiqueId],
  );
  const { valeur: stock } = useAbonnement(souscrireStock, "Le stock n’a pas pu être chargé.");

  const souscrireReglages = useCallback(
    (auChangement: (reglages: ReglagesEntreprise) => void, enErreur: (cause: unknown) => void) =>
      ecouterReglages(auChangement, enErreur),
    [],
  );
  const { valeur: reglages } = useAbonnement(
    souscrireReglages,
    "Le seuil d’inactivité n’a pas pu être lu.",
  );
  const seuil = reglages?.seuilInactiviteTranches ?? SEUIL_INACTIVITE_DEFAUT;

  const lignes = useMemo(
    () => suivrePaiements(ventes ?? [], versements ?? [], new Date()),
    [ventes, versements],
  );
  const listeDettes = useMemo(() => dettes(lignes), [lignes]);
  const listeTranches = useMemo(() => tranchesEnCours(lignes), [lignes]);
  const inactives = useMemo(
    () => listeTranches.filter((ligne) => estInactive(ligne, seuil)),
    [listeTranches, seuil],
  );

  const nomClient = useCallback(
    (clientId: string) => clients.find((client) => client.id === clientId)?.nom ?? "Client inconnu",
    [clients],
  );
  const moto = useCallback(
    (motoId: string) => (stock ?? []).find((fiche) => fiche.id === motoId),
    [stock],
  );

  const toutesBoutiques = perimetre.type === "toutes";
  const communes = useMemo<Colonne<LignePaiement>[]>(
    () => colonnesCommunes({ nomClient, toutesBoutiques }),
    [nomClient, toutesBoutiques],
  );

  const colonnesDettes = useMemo<Colonne<LignePaiement>[]>(
    () => [
      ...communes,
      { cle: "moto", titre: "Moto", rendu: (ligne) => nomMoto(ligne, moto, catalogue) },
      /* Le prix convenu de la maquette n’est pas ici : il vaut exactement
         « déjà versé + reste dû », et sa colonne poussait « Action » hors du
         cadre à 1280 px, colonne des écrans dépliée — un geste qu’on ne voit
         pas est un geste qui n’existe pas. Il se lit sur la fiche, à un clic. */
      {
        cle: "verse",
        titre: "Déjà versé",
        chiffre: true,
        rendu: (l) => formaterNombre(l.totalPaye),
      },
      { cle: "reste", titre: "Reste dû", chiffre: true, rendu: (l) => formaterNombre(l.resteDu) },
      {
        cle: "dernier",
        titre: "Dernier versement",
        chiffre: true,
        rendu: (ligne) =>
          ligne.dernierVersementAt ? formaterDateCourte(ligne.dernierVersementAt) : "aucun",
      },
      {
        cle: "etat",
        titre: "État",
        rendu: (ligne) => <Etat statut={ligne.statutPaiement} />,
      },
      {
        cle: "action",
        titre: "Action",
        rendu: (ligne) => <Encaisser vente={ligne.vente.id} numero={ligne.vente.numero} />,
      },
    ],
    [communes, moto, catalogue],
  );

  const colonnesTranches = useMemo<Colonne<LignePaiement>[]>(
    () => [
      ...communes,
      { cle: "moto", titre: "Moto retenue", rendu: (ligne) => nomMoto(ligne, moto, catalogue) },
      /* « Détenu », pas « déjà versé » : le mot dit chez qui est l'argent, et
         c'est toute la différence avec le tableau du dessus. */
      { cle: "detenu", titre: "Détenu", chiffre: true, rendu: (l) => formaterNombre(l.totalPaye) },
      {
        cle: "reste",
        titre: "Reste à percevoir",
        chiffre: true,
        rendu: (l) => formaterNombre(l.resteDu),
      },
      {
        cle: "etat",
        titre: "État",
        rendu: (ligne) =>
          estInactive(ligne, seuil) && ligne.resteDu > 0 ? (
            <span className="pastille pastille-retard">
              Aucun versement depuis {ligne.joursSansVersement} jours
            </span>
          ) : (
            <Etat statut={ligne.statutPaiement} />
          ),
      },
      {
        cle: "action",
        titre: "Action",
        rendu: (ligne) =>
          ligne.resteDu === 0 ? (
            /* Le geste du jour : la moto peut sortir. C'est la seule ligne de
               l'écran qui appelle une action plutôt qu'un encaissement, et elle
               se voit depuis la liste — sans quoi une moto soldée dort au
               magasin sans que personne le sache. */
            <Link
              href={`/motos/ventes?vente=${ligne.vente.id}`}
              aria-label={`Remettre la moto de ${ligne.vente.numero}`}
              className="bouton bouton-plaque h-9 px-3 text-legende"
            >
              Remettre la moto
            </Link>
          ) : (
            <Encaisser vente={ligne.vente.id} numero={ligne.vente.numero} />
          ),
      },
    ],
    [communes, moto, catalogue, seuil],
  );

  if (perimetre.type === "aucune")
    return (
      <SansBoutique
        titre="Paiements"
        sansBoutiqueDeclaree="Aucune boutique n’est déclarée : il n’y a encore ni dette ni tranche à suivre."
      />
    );

  const chargement = (ventes === null || versements === null) && !erreur && !erreurVersements;

  return (
    <div>
      <TetePage
        titre="Paiements"
        sousTitre={toutesBoutiques ? "Toutes les boutiques" : perimetre.nom}
      />

      <EtatErreur message={erreur ?? erreurVersements} className="mb-4" />

      <Section
        titre="Dettes — crédit"
        resume={
          chargement
            ? "Lecture des dettes…"
            : listeDettes.length === 0
              ? ""
              : `${compter(listeDettes.length, "vente", "ventes")} · ${formaterMontant(totalDu(listeDettes))} dus`
        }
        explication={
          <>
            <Bike aria-hidden="true" className="mt-0.5 size-[17px] shrink-0 text-encre-doux" />
            <span>
              La moto est partie avec le client.{" "}
              <strong>Le client doit cet argent au magasin.</strong>
            </span>
          </>
        }
      >
        {!chargement && listeDettes.length === 0 ? (
          <EtatVide titre="Aucune dette.">
            Toutes les ventes à crédit sont soldées : le magasin n’attend d’argent de personne.
          </EtatVide>
        ) : (
          <div className="cadre cadre-tableau lg:max-h-none">
            <Tableau
              legende="Ventes à crédit dont il reste quelque chose à percevoir. Montants en francs CFA."
              colonnes={colonnesDettes}
              lignes={listeDettes}
              cleDe={(ligne) => ligne.vente.id}
              chargement={chargement}
            />
          </div>
        )}
      </Section>

      <Section
        titre="Tranches — motos retenues au magasin"
        resume={
          chargement
            ? "Lecture des tranches…"
            : listeTranches.length === 0
              ? ""
              : [
                  `${compter(listeTranches.length, "moto", "motos")} · ${formaterMontant(totalDetenu(listeTranches))} détenus`,
                  inactives.length > 0
                    ? `${inactives.length} sans versement depuis ${seuil} jours ou plus`
                    : "",
                ]
                  .filter(Boolean)
                  .join(" · ")
        }
        explication={
          <>
            <Warehouse aria-hidden="true" className="mt-0.5 size-[17px] shrink-0 text-encre-doux" />
            <span>
              La moto n’est pas sortie. <strong>Le magasin détient l’argent déjà versé</strong> — ce
              n’est pas une dette du client.
            </span>
          </>
        }
      >
        {!chargement && listeTranches.length === 0 ? (
          <EtatVide titre="Aucune moto retenue au magasin.">
            Aucune vente en tranches n’attend son dernier versement.
          </EtatVide>
        ) : (
          <div className="cadre cadre-tableau lg:max-h-none">
            <Tableau
              legende="Ventes en tranches : motos retenues jusqu’au dernier versement. Montants en francs CFA."
              colonnes={colonnesTranches}
              lignes={listeTranches}
              cleDe={(ligne) => ligne.vente.id}
              chargement={chargement}
              enRetard={(ligne) => estInactive(ligne, seuil) && ligne.resteDu > 0}
            />
          </div>
        )}
      </Section>

      {perimetreEnCours && <span className="sr-only">Chargement du périmètre…</span>}
    </div>
  );
}

/**
 * Une des deux sections, avec son titre, son compte et sa phrase.
 *
 * La phrase n'est pas de la décoration : c'est elle qui empêche de lire les
 * deux tableaux comme deux moitiés d'une même somme. Elle dit où est la moto —
 * partie ou retenue —, et de là découle qui détient l'argent.
 */
function Section({
  titre,
  resume,
  explication,
  children,
}: {
  titre: string;
  /** Le compte et le total. Vide quand la liste l’est : l’état vide le dit déjà,
      et « 0 vente · 0 FCFA dus » est un chiffre qu’on n’a pas demandé. */
  resume: string;
  explication: ReactNode;
  children: ReactNode;
}) {
  const identifiant = `section-${titre.split(" ")[0].toLowerCase()}`;
  return (
    <section aria-labelledby={identifiant} className="mb-8">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 id={identifiant} className="text-bloc font-bold tracking-tight text-encre">
          {titre}
        </h2>
        {resume && <p className="text-corps text-encre-doux">{resume}</p>}
      </div>

      {/* Une surface, pas seulement un fond : la maquette pose la bande sur
          `--fond`, qui est ici le sol de la page — elle y était littéralement
          invisible, en clair comme en sombre. Elle prend donc le papier et un
          filet, comme tout ce qui se détache du sol. */}
      <p className="mb-3 flex items-start gap-2 rounded-champ border border-bord bg-papier px-3 py-2 text-corps text-encre">
        {explication}
      </p>

      {children}
    </section>
  );
}

/* Jamais la couleur seule : le mot est écrit, la pastille ne fait que le
   doubler. Même correspondance qu'en A6 — l'impayé prend la braise, le partiel
   le bleu de la goutte, le soldé le vert (D70). */
const TON_PAIEMENT: Record<StatutPaiement, string> = {
  impaye: "pastille-retard",
  partiel: "pastille-transit",
  solde: "pastille-solde",
};

function Etat({ statut }: { statut: StatutPaiement }) {
  return (
    <span className={`pastille ${TON_PAIEMENT[statut]}`}>{LIBELLE_STATUT_PAIEMENT[statut]}</span>
  );
}

/**
 * Le geste, depuis la liste.
 *
 * C'est un lien, pas un bouton : encaisser demande un montant, un moyen et une
 * référence, et ce formulaire vit dans la fiche de la vente — l'écrire une
 * seconde fois ici en ferait deux à corriger. Le nom accessible dit sur quelle
 * pièce, sans quoi l'écran offrirait sept liens nommés « Encaisser ».
 */
function Encaisser({ vente, numero }: { vente: string; numero: string }) {
  return (
    <Link
      href={`/motos/ventes?vente=${vente}`}
      aria-label={`Encaisser un versement sur ${numero}`}
      className="bouton bouton-neutre h-9 px-3 text-legende"
    >
      Encaisser
    </Link>
  );
}

/** Les colonnes que les deux tableaux partagent : la pièce, la boutique, le client. */
function colonnesCommunes({
  nomClient,
  toutesBoutiques,
}: {
  nomClient: (clientId: string) => string;
  toutesBoutiques: boolean;
}): Colonne<LignePaiement>[] {
  const liste: Colonne<LignePaiement>[] = [
    {
      cle: "numero",
      titre: "Pièce",
      principal: true,
      rendu: (ligne) => (
        <Link
          href={`/motos/ventes?vente=${ligne.vente.id}`}
          className="plaque-code whitespace-nowrap text-encre underline-offset-2 hover:underline"
        >
          {ligne.vente.numero}
        </Link>
      ),
    },
    {
      cle: "client",
      titre: "Client",
      principal: true,
      rendu: (ligne) => nomClient(ligne.vente.clientId),
    },
  ];

  if (toutesBoutiques) {
    liste.splice(1, 0, {
      cle: "boutique",
      titre: "Boutique",
      rendu: (ligne) => (
        <span className="plaque-code rounded-plaque border border-plaque-bord bg-plaque px-1.5 py-0.5 text-legende leading-none text-encre-fixe">
          {ligne.vente.boutiqueId}
        </span>
      ),
    });
  }
  return liste;
}

function nomMoto(
  ligne: LignePaiement,
  moto: (motoId: string) => Moto | undefined,
  catalogue: Catalogue,
): string {
  const fiche = moto(ligne.vente.motoId);
  return fiche
    ? `${catalogue.nomMarque(fiche.marqueId)} ${catalogue.nomModele(fiche.modeleId)}`
    : "Moto hors de ce périmètre";
}

function compter(nombre: number, singulier: string, pluriel: string): string {
  return `${nombre} ${nombre > 1 ? pluriel : singulier}`;
}
