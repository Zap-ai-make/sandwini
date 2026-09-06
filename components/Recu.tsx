import { formaterTelephone, type Client } from "@/lib/domain/client";
import { IDENTITE } from "@/lib/domain/entreprise";
import { formaterDate, formaterMontant } from "@/lib/domain/format";
import type { Boutique } from "@/lib/domain/boutique";
import type { Moto } from "@/lib/domain/moto";
import { LIBELLE_TYPE_RECU, type ContenuRecu } from "@/lib/domain/recu";
import { LIBELLE_MODE, LIBELLE_MOYEN } from "@/lib/domain/vente";

/**
 * Le reçu tel qu'il sort de l'imprimante (`prompt.md` §10).
 *
 * **C'est le seul rendu du reçu : celui de l'écran et celui du papier sont le
 * même arbre.** Le PDF, quand le gérant en veut un, sort de la boîte
 * d'impression du navigateur, qui compose depuis ce même HTML — d'où l'absence
 * de bibliothèque PDF, et d'où l'impossibilité que le papier et le fichier
 * divergent (`DECISIONS.md` D60).
 *
 * Rien ici ne demande le réseau : le monogramme est un tracé SVG écrit dans ce
 * fichier, l'identité de l'entreprise est une constante (D71), les polices sont
 * servies depuis notre domaine (`next/font`), et les chiffres sont calculés sur
 * place. C'est la condition pour qu'un reçu s'imprime un jour de coupure — et
 * c'est plus vrai qu'avant, où l'en-tête dépendait d'un document Firestore qui
 * pouvait être vide, ou n'être pas encore arrivé sur un appareil neuf (D35).
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
  /* Les quatre numéros de l'entreprise, plus celui du comptoir s'il en a un qui
     lui est propre. Le doublon est écarté : un même numéro imprimé deux fois
     ferait douter le client qu'il a bien lu. */
  const telephones = [
    ...IDENTITE.telephones,
    ...(boutique?.telephone && !IDENTITE.telephones.includes(boutique.telephone.replace(/\s/g, ""))
      ? [boutique.telephone]
      : []),
  ].map((numero) => formaterTelephone(numero));

  return (
    /* `bg-papier` et pas `bg-white` : à l'écran le reçu suit le thème comme le
       reste du produit. À l'impression, la feuille de style repasse la palette
       en clair — un reçu sorti en blanc sur noir viderait une cartouche et
       serait illisible sur un comptoir. */
    <article
      aria-label={`${LIBELLE_TYPE_RECU[contenu.type]} ${contenu.numero}`}
      className="mx-auto max-w-[148mm] rounded-plaque border border-bord bg-papier p-6 text-encre print:rounded-none print:border-0 print:p-0"
    >
      <header className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <Monogramme />
          <div className="min-w-0">
            <p className="font-display text-lg leading-tight font-bold tracking-tight">
              {IDENTITE.raisonSociale}
            </p>
            <p className="text-sm text-encre-doux">{IDENTITE.activite}</p>
            {boutique && <p className="text-sm text-encre-doux">{boutique.nom}</p>}
            <p className="text-sm text-encre-doux">{adresse}</p>
            <p className="text-sm text-encre-doux">{telephones.join(" · ")}</p>
            <p className="text-sm text-encre-doux">{IDENTITE.email}</p>
          </div>
        </div>

        {/* Le numéro dessiné comme une plaque : c'est la signature du produit,
            et sur le papier c'est ce que le client cherchera du regard en
            revenant au comptoir. À l'impression, le fond jaune cède la place à
            un cadre — de l'encre en moins, et un aplat de couleur ne sort pas
            en noir et blanc. */}
        <p className="plaque-code shrink-0 rounded-plaque border border-plaque-bord bg-plaque px-2 py-1 text-sm leading-none text-encre-fixe print:border-encre print:bg-transparent print:text-encre">
          {contenu.numero}
        </p>
      </header>

      <h1 className="mt-6 border-t-2 border-encre pt-3 font-display text-xl font-semibold tracking-tight">
        {LIBELLE_TYPE_RECU[contenu.type]}
      </h1>
      <p className="text-sm text-encre-doux">
        {contenu.date ? formaterDate(contenu.date) : "Date inconnue"}
        {contenu.type === "versement" ? ` · vente ${vente.numero}` : ""}
      </p>

      {/* L'écart de numéro se dit sur le papier, pas seulement à l'écran : c'est
          le document qui doit expliquer pourquoi il ne porte plus le numéro que
          le client a chez lui (D44). */}
      {contenu.numeroRemis && (
        <p className="mt-3 border border-encre p-2 text-sm">
          Ce reçu remplace le n<sup>o</sup> <span className="plaque-code">{contenu.numeroRemis}</span>,
          renuméroté à la synchronisation. Seul le numéro ci-dessus fait foi.
        </p>
      )}

      <dl className="mt-5 divide-y divide-bord border-y border-bord">
        <Ligne titre="Client">
          <span className="block">{client?.nom ?? "Client inconnu"}</span>
          {client && (
            <span className="block text-sm text-encre-doux">
              {formaterTelephone(client.telephone)}
            </span>
          )}
        </Ligne>
        <Ligne titre="Moto">
          <span className="block">{moto ? modele : "Moto introuvable"}</span>
          {moto && <span className="plaque-code block text-sm">{moto.numeroChassis}</span>}
        </Ligne>
        <Ligne titre="Mode de paiement">{LIBELLE_MODE[vente.modePaiement]}</Ligne>
      </dl>

      <dl className="mt-5">
        <Montant titre="Prix convenu" valeur={vente.prixConvenu} />
        {contenu.versement && (
          <Montant
            titre={
              contenu.moyenPaiement
                ? `Reçu ce jour — ${LIBELLE_MOYEN[contenu.moyenPaiement]}`
                : "Reçu ce jour"
            }
            valeur={contenu.montantEncaisse}
          />
        )}
        <Montant titre="Total payé" valeur={contenu.totalPaye} />
        {/* Le chiffre que le client vient chercher. Il est écrit en toutes
            lettres à côté du nombre : « reste dû » ne se déduit pas d'une
            graisse de caractère (DESIGN.md §5). */}
        <div className="mt-1 flex items-baseline justify-between gap-4 border-t-2 border-encre pt-2">
          <dt className="font-semibold">Reste dû</dt>
          <dd className="text-right text-lg font-bold tabular-nums">
            {formaterMontant(contenu.resteDu)}
          </dd>
        </div>
      </dl>

      {contenu.reference && (
        <p className="mt-3 text-sm text-encre-doux">Référence : {contenu.reference}</p>
      )}

      {(vente.inclus.length > 0 || vente.nonInclus.length > 0) && contenu.type === "vente" && (
        <div className="mt-5 grid gap-4 text-sm sm:grid-cols-2 print:grid-cols-2">
          <Convenu titre="Inclus" valeurs={vente.inclus} />
          <Convenu titre="Non inclus" valeurs={vente.nonInclus} />
        </div>
      )}

      <footer className="mt-6 border-t border-bord pt-3 text-sm">
        <p>
          Établi par{" "}
          <span className="font-medium">{contenu.operateur || "opérateur non enregistré"}</span>
        </p>
        {/* Les mentions légales sont obligatoires en tête d'un document
            commercial au Burkina Faso. Elles ne dépendent plus de ce que
            quelqu'un a pensé à saisir (D71 ; D11 disait l'inverse, quand elles
            étaient un champ qu'on pouvait laisser vide). */}
        <p className="mt-1 text-encre-doux">
          IFU {IDENTITE.ifu} · RCCM {IDENTITE.rccm}
        </p>

        <div className="mt-8 hidden justify-between gap-8 print:flex">
          <Signature titre="Le magasin" />
          <Signature titre="Le client" />
        </div>
      </footer>
    </article>
  );
}

function Ligne({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="shrink-0 text-sm text-encre-doux">{titre}</dt>
      <dd className="min-w-0 text-right">{children}</dd>
    </div>
  );
}

function Montant({ titre, valeur }: { titre: string; valeur: number }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <dt className="text-sm text-encre-doux">{titre}</dt>
      <dd className="text-right tabular-nums">{formaterMontant(valeur)}</dd>
    </div>
  );
}

function Convenu({ titre, valeurs }: { titre: string; valeurs: string[] }) {
  if (valeurs.length === 0) return null;
  return (
    <section>
      <h2 className="font-medium">{titre}</h2>
      <ul className="mt-1 text-encre-doux">
        {valeurs.map((valeur) => (
          <li key={valeur}>{valeur}</li>
        ))}
      </ul>
    </section>
  );
}

/** Deux traits de signature, sur le papier seulement : un écran ne se signe pas. */
function Signature({ titre }: { titre: string }) {
  return (
    <div className="flex-1">
      <p className="text-encre-doux">{titre}</p>
      <div aria-hidden="true" className="mt-10 border-t border-encre" />
    </div>
  );
}

/**
 * Le monogramme, en monochrome et en tracé.
 *
 * Écrit ici plutôt que chargé comme fichier : un reçu s'imprime hors ligne, et
 * une balise `<img src="/…">` demanderait une requête au moment même où il n'y
 * a pas de réseau. C'est le même tracé que `design/marque/monogramme-se.svg`,
 * sans dégradé — il prend l'encre du texte courant, donc le noir du papier.
 *
 * `aria-hidden` : la raison sociale est écrite juste à côté. Un lecteur d'écran
 * qui annoncerait la raison sociale deux fois ne rendrait service à
 * personne.
 */
function Monogramme() {
  return (
    <svg
      viewBox="0 0 546 402"
      aria-hidden="true"
      className="mt-0.5 h-8 w-auto shrink-0 text-encre"
    >
      <path
        fill="currentColor"
        fillOpacity="0.55"
        d="M6 126C3 160 4 210 20 246C36 285 75 315 151 334C190 331 221 314 221 286C200 258 130 236 60 212C30 196 12 162 6 126Z"
      />
      <path
        fill="currentColor"
        d="M204 4H540C540 44 518 74 467 94L387 98V156H514C514 192 492 228 451 242L387 246V304L468 308C512 318 538 344 540 391V396H219C270 374 303 330 307 276C307 248 293 228 273 206C240 186 185 166 128 152C105 142 96 124 96 106C96 84 130 74 165 78C195 82 220 96 246 114L250 119L253 113L293 57C265 38 235 20 204 4Z"
      />
    </svg>
  );
}
