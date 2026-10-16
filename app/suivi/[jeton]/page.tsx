import type { Metadata } from "next";
import { urlFonction } from "@/lib/fonctions/url";
import { formaterAnciennete, formaterDateCourte, formaterMontant } from "@/lib/domain/format";
import { estJetonPlausible } from "@/lib/domain/jeton-suivi";
import { lireSuivi, type LigneSuivi, type SuiviPrestataire } from "@/lib/domain/suivi-prestataire";

export const metadata: Metadata = {
  title: "Suivi des cartes grises — SDI",
  /* **`noindex` est un critère de la spec**, et la seule protection contre
     l'indexation d'un lien secret qui finira dans un groupe WhatsApp. */
  robots: { index: false, follow: false },
};

/**
 * Le portail du prestataire (S56) : un lien, et rien d'autre.
 *
 * **C'est la seule page du produit accessible sans compte.** Tout ce qui s'y
 * affiche vient d'une Cloud Function appelée **ici, côté serveur** : Firestore
 * reste fermé, et un test de règles prouve qu'un visiteur non authentifié n'en
 * lit rien. Le jeton ne traverse donc jamais le navigateur du prestataire
 * autrement que dans l'URL qu'il a déjà.
 *
 * **Hors du groupe `(app)`** : pas de coquille, pas de navigation, pas de
 * périmètre. Le `FournisseurSession` de `app/layout.tsx` l'enveloppe quand même
 * — il est à la racine, et `/login` comme `/hors-ligne` le partagent déjà — mais
 * **rien ici ne l'interroge**. Un `usePerimetre` ou un `useSession` dans ce
 * sous-arbre serait un défaut de périmètre.
 *
 * **En ligne seulement, et c'est une exception écrite à D40.** Pas de cache,
 * pas de service worker, pas de lecture hors réseau : le prestataire consulte
 * depuis chez lui, pas depuis un comptoir en coupure. Quand le réseau manque,
 * la page le **dit** — elle ne reste pas blanche.
 */
export const dynamic = "force-dynamic";

type Verdict =
  | { quoi: "suivi"; suivi: SuiviPrestataire }
  | { quoi: "invalide" }
  | { quoi: "reseau" };

/**
 * Interroge la fonction, et range le résultat en trois cas seulement.
 *
 * **« Invalide » couvre le jeton inconnu, le jeton révoqué et le jeton
 * malformé**, exactement comme la fonction : les distinguer dirait à qui essaie
 * des liens au hasard lequel a existé. Une charge utile illisible y tombe aussi
 * — un relecteur qui refuse est un refus.
 *
 * « Réseau » est tout le reste : la fonction injoignable, un projet mal
 * configuré, une panne. Ce cas-là ne doit jamais se déguiser en « lien
 * invalide », sinon le prestataire jette un lien parfaitement bon.
 */
async function interroger(jeton: string): Promise<Verdict> {
  if (!estJetonPlausible(jeton)) return { quoi: "invalide" };

  try {
    const reponse = await fetch(urlFonction("suiviPrestataire"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jeton }),
      /* Le prestataire consulte pour savoir où en sont ses cartes AUJOURD'HUI.
         Une réponse mise en cache lui montrerait l'état d'hier sans le dire. */
      cache: "no-store",
    });

    if (reponse.status === 404) return { quoi: "invalide" };
    if (!reponse.ok) return { quoi: "reseau" };

    const suivi = lireSuivi(await reponse.json());
    return suivi ? { quoi: "suivi", suivi } : { quoi: "invalide" };
  } catch {
    return { quoi: "reseau" };
  }
}

export default async function PageSuivi({ params }: { params: Promise<{ jeton: string }> }) {
  const { jeton } = await params;
  const verdict = await interroger(jeton);

  if (verdict.quoi === "invalide") {
    return (
      <Message titre="Ce lien n’est plus valide">
        Il a peut-être été remplacé par un nouveau. Demandez le lien à jour à la boutique.
      </Message>
    );
  }

  if (verdict.quoi === "reseau") {
    return (
      <Message titre="Ce suivi a besoin du réseau">
        La connexion n’a pas répondu. Réessayez dans un moment : le lien, lui, reste valable.
      </Message>
    );
  }

  const { prestataire, enCours, historique, argent } = verdict.suivi;

  return (
    <main className="mx-auto min-h-dvh max-w-3xl px-5 py-10 sm:px-6">
      <Enseigne />

      <h1 className="mt-5 text-2xl font-semibold tracking-tight text-encre">{prestataire.nom}</h1>
      <p className="mt-1 text-encre-doux">
        Les cartes grises que la boutique vous a confiées. Cette page se met à jour toute seule, à
        chaque fois que vous l’ouvrez.
      </p>

      <section className="mt-8">
        <Titre compte={enCours.length}>Chez vous en ce moment</Titre>
        {enCours.length === 0 ? (
          /* **Deux phrases, et il faut les deux.** « Tout a été rendu » sur un
             prestataire à qui l'on n'a jamais rien confié contredit le bloc du
             dessous, qui dit « rien encore ». Vu sur une capture, pas sur un
             test : les deux cas rendent zéro ligne, et aucune assertion de
             longueur ne les distingue. */
          <p className="encadre-vide mt-3 text-center text-encre-doux">
            {historique.length === 0
              ? "La boutique ne vous a encore confié aucune carte grise."
              : "Aucune carte grise chez vous. Tout a été rendu."}
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {enCours.map((ligne) => (
              <Carte key={`${ligne.numeroVente}-${ligne.chassis}`} ligne={ligne} dehors />
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <Titre compte={historique.length}>Déjà rendues</Titre>
        {historique.length === 0 ? (
          <p className="mt-3 text-encre-doux">Rien encore.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {historique.map((ligne) => (
              <Carte key={`${ligne.numeroVente}-${ligne.chassis}`} ligne={ligne} dehors={false} />
            ))}
          </ul>
        )}
      </section>

      {/* **« Avances reçues » et non « solde »**, et c'est une décision de la
          spec (possibilité (a)) : le produit ne connaît ni prix convenu ni
          règlement final, donc les deux termes de la soustraction manquent.
          Écrire « solde » — même à zéro — se lirait « on ne me doit rien ». */}
      <section className="cadre mt-10 px-5 py-4">
        <h2 className="text-sm font-medium uppercase tracking-wide text-encre-doux">
          Avances reçues
        </h2>
        <p className="mt-1 font-mono text-xl font-medium tabular-nums text-encre">
          {formaterMontant(argent.avances)}
        </p>
        <p className="mt-2 text-sm text-encre-doux">
          Total des avances versées par la boutique pour les cartes ci-dessus. Pour toute question
          sur un règlement, adressez-vous à la boutique.
        </p>
      </section>

      <p className="mt-10 border-t border-bord pt-5 text-sm text-encre-doux">
        Page de consultation. Vous ne pouvez rien modifier depuis ici — et personne d’autre que vous
        ne devrait avoir ce lien.
      </p>
    </main>
  );
}

/** La plaque de l'enseigne, reprise de `app/hors-ligne` : c'est l'identité du produit, et elle dit d'où vient la page. */
function Enseigne() {
  return (
    /* `self-start` n'est pas décoratif : la page de refus est une colonne
       `flex`, qui étire ses enfants sur toute la largeur. Sans lui la plaque
       traverse l'écran comme une bannière, et ce n'est plus une plaque. */
    <p className="plaque-code inline-block self-start rounded-plaque border border-encre-fixe bg-encre-fixe px-2 py-1 text-sm text-plaque">
      SDI
    </p>
  );
}

function Titre({ children, compte }: { children: React.ReactNode; compte: number }) {
  return (
    <h2 className="flex items-baseline gap-2 text-lg font-semibold tracking-tight text-encre">
      {children}
      <span className="font-mono text-sm font-normal tabular-nums text-encre-doux">{compte}</span>
    </h2>
  );
}

/**
 * Une carte grise, en une tuile lisible au pouce.
 *
 * Pas un tableau : cette page se lit sur un téléphone d'entrée de gamme, et un
 * tableau de quatre colonnes y défilerait de côté. Le numéro et le châssis sont
 * en caractères à chasse fixe parce qu'on les dicte au téléphone.
 */
function Carte({ ligne, dehors }: { ligne: LigneSuivi; dehors: boolean }) {
  const depose = ligne.deposeLe ? new Date(ligne.deposeLe) : null;
  const revenu = ligne.revenuLe ? new Date(ligne.revenuLe) : null;

  return (
    <li className="cadre px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="plaque-code font-mono text-sm text-encre">{ligne.numeroVente}</span>
        {dehors ? (
          <span className="text-sm text-encre-doux">
            Confiée {formaterAnciennete(ligne.joursDehors)}
          </span>
        ) : (
          <span className="pastille pastille-solde">
            Rendue{revenu ? ` le ${formaterDateCourte(revenu)}` : ""}
          </span>
        )}
      </div>

      <p className="mt-2 font-medium text-encre">{ligne.moto}</p>
      {ligne.chassis ? (
        <p className="font-mono text-sm text-encre-doux">{ligne.chassis}</p>
      ) : null}
      <p className="mt-1 text-sm text-encre-doux">
        Client : {ligne.client}
        {depose ? ` · déposée le ${formaterDateCourte(depose)}` : ""}
      </p>
    </li>
  );
}

/**
 * Le refus, et l'absence de réseau.
 *
 * **Aucune mention du prestataire ni de la boutique.** Un message qui dirait
 * « le lien de Sawadogo a été remplacé » renseignerait qui essaie des liens au
 * hasard. Et une erreur ne s'excuse pas et n'est jamais vague (`DESIGN.md` §12) :
 * elle dit ce qui s'est passé et ce qu'on peut faire.
 */
function Message({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-prose flex-col justify-center px-6 py-12">
      <Enseigne />
      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-encre">{titre}</h1>
      <p className="mt-3 text-encre-doux">{children}</p>
    </main>
  );
}
