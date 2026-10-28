"use client";

import { useCallback, useMemo, useState, type FormEvent } from "react";
import {
  ErreurDeLecture,
  EtatChargement,
  EtatErreurSaisie,
  SansBoutique,
} from "@/components/patrons/Etats";
import { FiltrePeriode } from "@/components/patrons/FiltrePeriode";
import { TetePage } from "@/components/patrons/Page";
import { Tableau, type Colonne } from "@/components/patrons/Tableau";
import { useSession } from "@/lib/auth/session";
import type { Boutique } from "@/lib/domain/boutique";
import {
  depensesParPoste,
  libelleDuPoste,
  lireMontantCaisse,
  mouvementsDeLaPeriode,
  type Mouvement,
} from "@/lib/domain/caisse";
import { compter, formaterDateCourte, formaterMontant, formaterNombre } from "@/lib/domain/format";
import {
  PLAGE_VIDE,
  bornesPeriode,
  libellePeriode,
  plageInversee,
  type Periode,
  type PlagePeriode,
} from "@/lib/domain/periode";
import { trouverParNom, validerNom, type Referentiel } from "@/lib/domain/referentiel";
import { usePerimetre } from "@/lib/perimetre/perimetre";
import { useAbonnement } from "@/lib/repositories/abonnement";
import { ecouterMouvements, enregistrerSortieEspeces } from "@/lib/repositories/caisse";
import { usePostesDepense } from "@/lib/repositories/catalogue";
import { creerEntree } from "@/lib/repositories/referentiels";

/**
 * Les dépenses — on en saisit une, puis on relit celles d'avant (S55).
 *
 * **L'écran commence par son formulaire**, et c'est le commanditaire qui l'a
 * remis là : « quand on atterrit sur la page on trouve le formulaire pour
 * enregistrer une dépense ». La première version ouvrait sur une rangée de
 * périodes et deux onglets ; le geste qui amène ici — un billet vient de sortir
 * du tiroir — se trouvait repoussé sous deux écrans de décor.
 *
 * **Le poste se tape, il ne se choisit plus.** Un menu déroulant doublé d'un
 * bouton « Ajouter » demandait trois gestes pour écrire un mot. On le reconnaît
 * plutôt qu'on ne l'impose : `trouverParNom` rend le poste existant même écrit
 * « carburant » pour « Carburant », et sinon il se crée au passage. Les postes
 * se renomment dans Paramètres › Référentiels, avec les marques et les modèles
 * — rebaptiser un mot que des mois d'écritures citent n'est pas un geste de
 * comptoir, et les règles Firestore tiennent la même frontière (D27).
 *
 * **La période a quitté le haut de l'écran** pour se poser sur l'historique,
 * seule chose qu'elle filtre. Saisir ne dépend d'aucune période ; relire, si.
 */
export default function PageDepenses() {
  const { perimetre, boutiques, chargement } = usePerimetre();

  if (chargement) return <EtatChargement>Ouverture des dépenses…</EtatChargement>;

  if (perimetre.type === "aucune") {
    return (
      <SansBoutique
        titre="Dépenses"
        sansBoutiqueDeclaree="Déclarez une boutique : une dépense sort d’un tiroir, et le tiroir est celui d’une boutique."
      />
    );
  }

  return <Depenses boutiqueId={perimetre.boutiqueId} boutiques={boutiques} />;
}

function Depenses({
  boutiqueId,
  boutiques,
}: {
  boutiqueId: string | null;
  boutiques: Boutique[];
}) {
  const session = useSession();
  const utilisateur = session.statut === "connecte" ? session.utilisateur : null;

  /* « Ce mois-ci » à l'ouverture : une dépense isolée se lit dans le journal du
     jour, un poste se juge sur un mois. « Aujourd'hui » reste à un clic. */
  const [periode, setPeriode] = useState<Periode>("ce-mois");
  const [plage, setPlage] = useState<PlagePeriode>(PLAGE_VIDE);
  const maintenant = useMemo(() => new Date(), []);
  const bornes = useMemo(
    () => bornesPeriode(periode, maintenant, plage),
    [periode, maintenant, plage],
  );
  const intitule = libellePeriode(periode, maintenant, plage);
  const inversee = plageInversee(periode, plage);

  const { lus: postesLus, nomDuPoste, erreur: erreurPostes } = usePostesDepense();

  const souscrire = useCallback(
    (auChangement: (m: Mouvement[]) => void, enErreur: (cause: unknown) => void) =>
      ecouterMouvements(boutiqueId, auChangement, enErreur),
    [boutiqueId],
  );
  const { valeur: mouvements, erreur, echec, reessayer } = useAbonnement(
    souscrire,
    "Les dépenses n’ont pas pu être lues.",
  );

  /* Du plus récent au plus ancien : on relit ses dépenses en partant de la
     dernière, à l'inverse du journal de caisse qui suit le fil de la journée. */
  const sorties = useMemo(
    () =>
      mouvementsDeLaPeriode(mouvements ?? [], bornes)
        .filter((mouvement) => mouvement.sens === "sortie")
        .reverse(),
    [mouvements, bornes],
  );
  const parPoste = useMemo(() => depensesParPoste(sorties, nomDuPoste), [sorties, nomDuPoste]);
  const total = useMemo(
    () => sorties.reduce((somme, sortie) => somme + sortie.montant, 0),
    [sorties],
  );
  const chargement = mouvements === null && !erreur;

  const nomDeLaBoutique = useCallback(
    (id: string) => boutiques.find((boutique) => boutique.id === id)?.nom ?? id,
    [boutiques],
  );

  const colonnes = useMemo<Colonne<Mouvement>[]>(
    () => [
      {
        cle: "date",
        titre: "Date",
        /* Une sortie sans date est une écriture pas encore parvenue au serveur
           (D82), pas une sortie sans date. */
        rendu: (m) => (m.date ? formaterDateCourte(m.date) : "à l’instant"),
      },
      {
        cle: "poste",
        titre: "Poste",
        principal: true,
        /* Le même nom que le bloc « Où l'argent est parti », par la même
           fonction : une avance prestataire s'y lisait « Sans poste » alors que
           le total juste au-dessus l'appelait « Avance prestataire ». */
        rendu: (m) => {
          const libelle = libelleDuPoste(m.posteId, m.origine, nomDuPoste);
          return libelle === "Sans poste" ? (
            <span className="text-encre-doux">{libelle}</span>
          ) : (
            libelle
          );
        },
      },
      { cle: "objet", titre: "À quoi", rendu: (m) => m.libelle || "—" },
      ...(boutiqueId === null
        ? [
            {
              cle: "boutique",
              titre: "Boutique",
              rendu: (m: Mouvement) => nomDeLaBoutique(m.boutiqueId),
            },
          ]
        : []),
      { cle: "operateur", titre: "Saisi par", rendu: (m) => m.operateur || "—" },
      {
        cle: "montant",
        titre: "Montant",
        chiffre: true,
        rendu: (m) => <span className="text-alerte">− {formaterNombre(m.montant)}</span>,
      },
    ],
    [nomDuPoste, boutiqueId, nomDeLaBoutique],
  );

  return (
    <div>
      <TetePage
        retour={{ href: "/caisse", libelle: "Caisse" }}
        surTitre="Caisse"
        titre="Dépenses"
      />

      <div className="mt-4 grid gap-6">
        {/* **La saisie d'abord, et pour tout le monde.** Le responsable en vue
            entreprise n'avait pas de formulaire du tout : on ne retire pas un
            billet de trois tiroirs à la fois, donc l'écran se contentait de
            l'envoyer choisir une boutique au bandeau. Le commanditaire a tranché
            autrement — « il faut consolider toutes les dépenses dans la caisse
            du gérant » : la boutique devient un champ du formulaire, et la
            dépense tombe dans le tiroir de ce gérant-là. */}
        <SaisieDepense
          postes={postesLus}
          erreurPostes={erreurPostes}
          boutiqueId={boutiqueId}
          boutiques={boutiques}
          enregistrer={(boutiqueDuTiroir, saisie) =>
            enregistrerSortieEspeces(boutiqueDuTiroir, saisie, {
              uid: utilisateur!.uid,
              nom: utilisateur!.nom,
            })
          }
        />

        <section aria-labelledby="titre-historique">
          <h2 id="titre-historique" className="mb-3 text-bloc font-bold tracking-tight text-encre">
            L’historique
          </h2>

          {/* Le filtre appartient à ce qu'il filtre. En haut de l'écran il
              semblait commander la page entière — alors que la saisie, elle, ne
              dépend d'aucune période. */}
          <FiltrePeriode
            periode={periode}
            changer={setPeriode}
            plage={plage}
            changerPlage={setPlage}
            className="mb-4"
          />

          {erreur ? (
            <ErreurDeLecture
              titre="Les dépenses n’ont pas pu être lues"
              echec={echec}
              reessayer={reessayer}
              sortie={{ href: "/caisse", libelle: "Voir la caisse" }}
            >
              {erreur}
            </ErreurDeLecture>
          ) : inversee ? null : chargement ? (
            <EtatChargement>Lecture des dépenses…</EtatChargement>
          ) : sorties.length === 0 ? (
            /* D63 : une phrase, pas un tableau vide et trois zéros. */
            null
          ) : (
            <div className="grid gap-6">
              <div className="cadre p-4 sm:p-5">
                <p className="text-legende font-bold tracking-[0.07em] text-encre-doux uppercase">
                  Total des dépenses
                </p>
                <p className="mt-1 font-code text-chiffre leading-tight tabular-nums text-encre">
                  {formaterMontant(total)}
                </p>
                <p className="text-legende text-encre-doux">
                  {compter(sorties.length, "sortie")} · {intitule ?? "toutes périodes"}
                </p>

                {/* Où l'argent est parti : c'est à cela que servent les postes,
                    et c'est la seule chose qu'un total seul ne dit pas. */}
                <dl className="mt-4 grid gap-2 border-t border-bord pt-4">
                  {parPoste.map((depense) => (
                    <div
                      key={`${depense.posteId}-${depense.libelle}`}
                      className="flex flex-wrap items-baseline justify-between gap-x-3"
                    >
                      <dt className="text-corps text-encre">{depense.libelle}</dt>
                      <dd className="font-code text-corps tabular-nums text-alerte">
                        − {formaterNombre(depense.montant)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>

              <Tableau
                legende="Les dépenses de la période, de la plus récente à la plus ancienne"
                colonnes={colonnes}
                lignes={sorties}
                cleDe={(mouvement) => mouvement.id}
              />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/**
 * Enregistrer une dépense — le seul mouvement que quelqu’un compose à la main.
 *
 * Tous les autres sont la conséquence d’un geste métier : une vente, un
 * versement, une pièce vendue. Celui-ci n’a rien derrière lui, et c’est
 * pourquoi il exige un poste : sans classement, « combien de carburant ce
 * mois-ci » reste sans réponse et le livre retombe au rang de journal.
 *
 * **On n’attend pas l’accusé de réception du serveur** (D76). Hors ligne, la
 * promesse de Firestore ne se résout jamais : le bouton resterait désactivé et
 * les champs pleins, indéfiniment, pour une écriture pourtant déjà acquise dans
 * le cache local. La validation, elle, est immédiate — `enregistrerSortieEspeces`
 * lève de façon synchrone sur un montant absurde ou un poste absent, avant même
 * de toucher à Firestore.
 *
 * **Le détail, lui, est facultatif depuis S55.** C'est le poste qui dit où
 * l'argent est parti ; le détail ne répond qu'à « laquelle de ces sorties-là ».
 * L'exiger faisait retaper « loyer » sous un poste nommé « Loyer », et c'est
 * cette redite qui rendait les deux champs indistinguables.
 *
 * **La distinction se porte par les exemples, pas par des phrases d'aide.** Une
 * ligne de légende sous chacun des deux champs a été essayée et retirée le jour
 * même : les deux colonnes de la grille prenaient des hauteurs différentes, et
 * l'étiquette « Montant » se retrouvait décrochée d'une ligne. « Ça casse
 * l'UX ». Les invites suffisent — « Carburant, Loyer, Transport… » contre
 * « plein du tricycle, livraison », on voit lequel se répète.
 */
function SaisieDepense({
  enregistrer,
  postes,
  erreurPostes,
  boutiqueId,
  boutiques,
}: {
  enregistrer: (
    boutiqueId: string,
    saisie: { montant: string; libelle: string; posteId: string },
  ) => Promise<void>;
  /** `null` tant que l’écoute n’a pas répondu : reconnaître un poste en dépend (D95). */
  postes: Referentiel[] | null;
  erreurPostes: string | null;
  /** La boutique du périmètre, ou `null` en vue entreprise : il faut alors la demander. */
  boutiqueId: string | null;
  boutiques: Boutique[];
}) {
  const [montant, setMontant] = useState("");
  const [libelle, setLibelle] = useState("");
  const [nomPoste, setNomPoste] = useState("");
  const [boutiqueChoisie, setBoutiqueChoisie] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);

  const session = useSession();
  const utilisateur = session.statut === "connecte" ? session.utilisateur : null;

  /* Le tiroir qui paie : celui du périmètre quand il y en a un, sinon celui que
     le responsable désigne. Jamais deviné — une dépense mal attribuée fausse la
     caisse d'un gérant qui n'y est pour rien. */
  const tiroir = boutiqueId ?? boutiqueChoisie;

  /**
   * **Le bouton attend la lecture des postes ; il ne gronde pas après coup.**
   *
   * Tant que l'écoute n'a pas répondu, on ne sait pas si le poste tapé existe
   * déjà, et en créer un second couperait son histoire en deux (D95). La
   * première version de cet écran refusait la saisie une fois le bouton pressé,
   * avec un « réessayez dans un instant » — ce qui punissait quiconque tape
   * plus vite que Firestore, c'est-à-dire tout le monde au comptoir.
   *
   * Une lecture **en échec** ne bloque pas, elle : mieux vaut un poste en
   * double, qui se renomme, qu'une dépense perdue, qui ne se retrouve pas.
   */
  const enAttentePostes = postes === null && erreurPostes === null;

  function soumettre(evenement: FormEvent) {
    evenement.preventDefault();
    setErreur(null);

    if (!tiroir) {
      setErreur("Choisissez la boutique dont le tiroir paie.");
      return;
    }
    const nomInvalide = validerNom(nomPoste, "ce poste");
    if (nomInvalide) {
      setErreur(nomInvalide);
      return;
    }
    /**
     * **Le montant se lit avant que le poste se crée, et l'ordre compte.**
     *
     * `enregistrerSortieEspeces` refuse un montant absurde — mais de façon
     * synchrone, donc *après* la création du poste quelques lignes plus bas.
     * Une saisie au montant vide laissait ainsi un poste tout neuf dans le
     * référentiel, sans aucune dépense accrochée : un mot de plus dans une
     * liste partagée par toutes les boutiques, que seul le responsable peut
     * retirer. Le geste échouait et salissait quand même.
     */
    const francs = lireMontantCaisse(montant);
    if (francs === null || francs <= 0) {
      setErreur("Le montant de la sortie doit être un nombre de francs supérieur à zéro.");
      return;
    }
    try {
      /* On reconnaît le poste plutôt qu'on ne l'impose : « carburant » retrouve
         « Carburant ». S'il est nouveau, `creerEntree` rend son identifiant
         tout de suite — l'écriture part derrière, et la dépense n'attend pas
         (D76). */
      const existant = trouverParNom(nomPoste, postes ?? []);
      let posteId = existant?.id;
      if (!posteId) {
        const creation = creerEntree("postesDepense", nomPoste, {
          uid: utilisateur!.uid,
          nom: utilisateur!.nom,
        });
        posteId = creation.id;
        creation.enregistre.catch(() => undefined);
      }

      const partie = enregistrer(tiroir, { montant, libelle, posteId });
      setMontant("");
      setLibelle("");
      setNomPoste("");
      partie.catch((cause) =>
        setErreur(
          cause instanceof Error ? cause.message : "La dépense n’a pas pu être enregistrée.",
        ),
      );
    } catch (cause) {
      setErreur(cause instanceof Error ? cause.message : "La dépense n’a pas pu être enregistrée.");
    }
  }

  return (
    <form onSubmit={soumettre} className="cadre p-4 sm:p-5">
      <h2 className="text-bloc font-bold tracking-tight text-encre">Enregistrer une dépense</h2>
      <p className="mt-1 max-w-prose text-corps text-encre-doux">
        L’argent qui quitte le tiroir pour autre chose qu’un client&nbsp;: carburant, course,
        loyer. Le poste le range&nbsp;; sans lui, on saurait que l’argent est parti sans savoir où.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {boutiqueId === null && (
          <div className="champ">
            <label htmlFor="depense-boutique">Boutique</label>
            <select
              id="depense-boutique"
              className="saisie"
              value={boutiqueChoisie}
              onChange={(evenement) => setBoutiqueChoisie(evenement.target.value)}
            >
              <option value="">Choisir la boutique</option>
              {boutiques.map((boutique) => (
                <option key={boutique.id} value={boutique.id}>
                  {boutique.nom}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="champ">
          <label htmlFor="depense-poste">Poste de dépense</label>
          {/* Un champ libre, et la liste en simple suggestion : le poste qu'on
              tape existe déjà neuf fois sur dix, mais la dixième ne doit pas
              demander un détour par un autre écran. */}
          <input
            id="depense-poste"
            className="saisie"
            type="text"
            list="postes-connus"
            maxLength={60}
            autoComplete="off"
            placeholder="Carburant, Loyer, Transport…"
            value={nomPoste}
            onChange={(evenement) => setNomPoste(evenement.target.value)}
          />
          <datalist id="postes-connus">
            {(postes ?? []).map((poste) => (
              <option key={poste.id} value={poste.nom} />
            ))}
          </datalist>
          {/* Sans cette phrase, un échec de lecture laissait l'écran muet : les
              suggestions manquaient sans que rien ne dise pourquoi. */}
          {erreurPostes && <p className="mt-1 text-legende text-encre-doux">{erreurPostes}</p>}
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-[10rem_minmax(0,1fr)_auto] sm:items-end">
        <div className="champ">
          <label htmlFor="depense-montant">Montant</label>
          <input
            id="depense-montant"
            className="saisie"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={montant}
            onChange={(evenement) => setMontant(evenement.target.value)}
          />
        </div>
        <div className="champ">
          <label htmlFor="depense-libelle">
            À quoi <span className="font-normal text-encre-doux">(facultatif)</span>
          </label>
          <input
            id="depense-libelle"
            className="saisie"
            type="text"
            maxLength={120}
            autoComplete="off"
            placeholder="plein du tricycle, livraison"
            value={libelle}
            onChange={(evenement) => setLibelle(evenement.target.value)}
          />
        </div>
        <button type="submit" className="bouton bouton-neutre h-11" disabled={enAttentePostes}>
          Enregistrer la dépense
        </button>
      </div>

      <EtatErreurSaisie message={erreur} className="mt-2" />
    </form>
  );
}
