import { formaterTelephone, type Client } from "@/lib/domain/client";
import { IDENTITE } from "@/lib/domain/entreprise";
import { formaterDate, formaterHeure, formaterMontant } from "@/lib/domain/format";
import type { Boutique } from "@/lib/domain/boutique";
import type { Moto } from "@/lib/domain/moto";
import { LIBELLE_TYPE_RECU, type ContenuRecu } from "@/lib/domain/recu";
import { LIBELLE_MODE, LIBELLE_MOYEN } from "@/lib/domain/vente";
import { Monogramme } from "@/components/Monogramme";

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

  /* Le modèle, la couleur et l'année sur une seule ligne (`c4:69`). C'est par
     là qu'on reconnaît une moto dans une cour, avant même de lire le châssis —
     et cela ne coûte pas de ligne, puisque c'est la même. */
  const designation = [modele, moto?.couleur, moto?.annee].filter(Boolean).join(" · ");

  return (
    /* `bg-papier` et pas `bg-white` : à l'écran le reçu suit le thème comme le
       reste du produit. À l'impression, la feuille de style repasse la palette
       en clair — un reçu sorti en blanc sur noir viderait une cartouche et
       serait illisible sur un comptoir. */
    <article
      aria-label={`${LIBELLE_TYPE_RECU[contenu.type]} ${contenu.numero}`}
      className="mx-auto max-w-[148mm] cadre p-6 text-encre print:rounded-none print:border-0 print:p-0"
    >
      {/* L'en-tête tient toute la largeur depuis que la souche l'a quittée
          (`c4:24-32`). Elle y volait la place de la raison sociale, qui se
          cassait en quatre lignes — vu sur capture. Quatre lignes : qui vend,
          quoi, où, à quel numéro. L'adresse électronique de l'entreprise en a
          été retirée : quatre numéros de téléphone répondent déjà à « comment
          vous joindre », et personne n'écrit un courriel depuis un reçu
          papier. */}
      <header className="flex min-w-0 items-start gap-3">
        {/* Monochrome, et c’est ce que sert la maquette `c4-recu.html` : le
            reçu devient un objet physique, souvent tiré en noir et blanc, et
            un aplat de couleur y vide une cartouche pour rien. */}
        <Monogramme variante="monochrome" className="mt-0.5 h-8 w-auto shrink-0 text-encre" />
        <div className="min-w-0">
          <p className="font-display text-lg leading-tight font-bold tracking-tight">
            {IDENTITE.raisonSociale}
          </p>
          <p className="text-sm text-encre-doux">{IDENTITE.activite}</p>
          <p className="text-sm text-encre-doux">{adresse}</p>
          <p className="text-sm text-encre-doux">{telephones.join(" · ")}</p>
        </div>
      </header>

      {/* IFU et RCCM sont obligatoires **en tête** d'un document commercial au
          Burkina Faso : ils étaient en pied, ce qui est le seul endroit où ils
          n'ont pas le droit d'être. Sur toute la largeur, et non serrés contre
          la raison sociale, où « BF-OUA-01-2016-A12-00847 » se coupait en deux
          (`c4:38-45`). Posés à l'installation, jamais saisis (D71 ; D11 disait
          l'inverse, quand ils étaient un champ qu'on pouvait laisser vide). */}
      <p className="mt-3 border-t border-bord pt-2 text-micro text-encre-doux">
        IFU <span className="plaque-code">{IDENTITE.ifu}</span> · RCCM{" "}
        <span className="plaque-code">{IDENTITE.rccm}</span>
      </p>

      {/* Le titre et la souche sur la même ligne (`c4:47-52`), le filet sous
          les deux : il sépare l'en-tête de l'entreprise du corps de la pièce.
          Posée là, la souche ne se lit plus comme un numéro d'archive mais
          comme la suite du titre — « reçu de versement n° PTG-2609-0043 »,
          c'est-à-dire la phrase qu'on dit au téléphone.

          C'est la souche et non la plaque jaune : le carnet à souches est
          l'objet que ce logiciel remplace (D70), et le jaune n'a que deux
          emplois dont le numéro n'est aucun. Seules les trois lettres de tête,
          qui *sont* le code boutique, se détachent — en gris, qui sort encore
          en noir et blanc, ce que le reçu est la plupart du temps. */}
      <div className="mt-5 flex items-baseline gap-4 border-b-2 border-encre pb-2">
        <h1 className="min-w-0 flex-1 font-display text-lg font-semibold tracking-tight">
          {LIBELLE_TYPE_RECU[contenu.type]}
        </h1>
        <Souche numero={contenu.numero} />
      </div>

      {/* La date et l'heure, sous le titre, à la place qu'un document
          commercial leur donne (`c4:57-59`). Elles étaient à deux endroits :
          en légende de la souche pour la date, en pied de page pour l'heure.
          Le lieu, lui, n'est pas répété ici comme dans la maquette : l'adresse
          du comptoir est imprimée trois lignes plus haut, et `boutique.adresse`
          est un texte libre dont on ne peut pas extraire un nom de ville. */}
      <p className="mt-2 text-sm text-encre-doux">
        {contenu.date
          ? `Le ${formaterDate(contenu.date)} à ${formaterHeure(contenu.date)}`
          : "Date inconnue"}
      </p>

      {/* Cinq lignes, une par fait (`c4:66-72`) — sept auparavant. « Mode de
          paiement » et « Moyen » se lisaient comme deux fois la même question :
          une seule ligne les tient. Le téléphone rejoint le nom, parce qu'il
          est ce qui distingue deux clients homonymes et non un fait séparé.
          Ce qui reste garde sa ligne entière : c'est ici qu'on recopie un
          numéro de châssis en le lisant à voix haute. */}
      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <Fait titre="Reçu de">
          {client?.nom ?? "Client inconnu"}
          {client && (
            <>
              {" · "}
              <span className="plaque-code">{formaterTelephone(client.telephone)}</span>
            </>
          )}
        </Fait>
        {contenu.type === "versement" && (
          <Fait titre="Au titre de">
            Vente <span className="plaque-code">{vente.numero}</span>
          </Fait>
        )}
        <Fait titre="Moto">{moto ? designation : "Moto introuvable"}</Fait>
        {moto && (
          <Fait titre="Châssis" code>
            {moto.numeroChassis}
          </Fait>
        )}
        <Fait titre="Règlement">
          {[
            LIBELLE_MODE[vente.modePaiement],
            contenu.moyenPaiement ? LIBELLE_MOYEN[contenu.moyenPaiement] : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </Fait>
        {/* La référence de transaction reste sa propre ligne quand il y en a
            une : c'est un code qu'on recopie pour retrouver un paiement mobile,
            et il est trop long pour tenir au bout de la ligne du règlement. */}
        {contenu.reference && (
          <Fait titre="Référence" code>
            {contenu.reference}
          </Fait>
        )}
      </dl>

      {/* Le montant encaissé se détache du reste (`c4:59-62`). C'est la raison
          d'être du papier : le client tient la preuve d'avoir versé cette
          somme-là, ce jour-là. Noyé dans la liste des montants, il se
          confondait avec le prix convenu et le total — trois nombres de même
          taille, dont un seul est ce qu'il vient de payer. */}
      {contenu.montantEncaisse > 0 && (
        <p className="mt-5 flex items-baseline gap-3 rounded-plaque border-2 border-encre px-4 py-3 font-bold">
          <span>Montant reçu</span>
          <span className="ml-auto text-2xl tabular-nums">
            {formaterMontant(contenu.montantEncaisse)}
          </span>
        </p>
      )}

      {/* Les trois montants de situation, à égalité : la mise en avant est
          prise par « Montant reçu », et deux mises en avant n'en font aucune.
          Chaque nombre garde son intitulé en toutes lettres — « reste dû » ne
          se déduit pas d'une graisse de caractère (DESIGN.md §5). */}
      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 border-t border-bord pt-3 text-sm">
        <Fait titre="Prix convenu" montant>
          {formaterMontant(vente.prixConvenu)}
        </Fait>
        <Fait titre="Total payé" montant>
          {formaterMontant(contenu.totalPaye)}
        </Fait>
        <Fait titre="Reste dû" montant>
          {formaterMontant(contenu.resteDu)}
        </Fait>
      </dl>

      {(vente.inclus.length > 0 || vente.nonInclus.length > 0) && contenu.type === "vente" && (
        <div className="mt-5 grid gap-4 text-sm sm:grid-cols-2 print:grid-cols-2">
          <Convenu titre="Inclus" valeurs={vente.inclus} />
          <Convenu titre="Non inclus" valeurs={vente.nonInclus} />
        </div>
      )}

      {/* Les deux signatures, sur l'écran comme sur le papier (`c4:76-86`).
          Elles n'apparaissaient qu'à l'impression, au nom de « un écran ne se
          signe pas » : mais D60 dit que le rendu de l'écran et celui du papier
          sont le même arbre, et un bloc qui n'existe qu'en `print:` est
          précisément le genre de chose qu'on ne revoit plus jamais. « Le
          gérant » plutôt que « Établi par » : c'est la légende d'une
          signature, en regard du trait du client, pas une phrase. */}
      <footer className="mt-10 grid grid-cols-2 gap-6 text-sm">
        <div>
          <p className="text-encre-doux">Le gérant</p>
          <p className="mt-5 font-medium">
            {contenu.operateur || "opérateur non enregistré"}
          </p>
        </div>
        <div>
          <p className="text-encre-doux">Le client</p>
          <p aria-hidden="true" className="mt-5 border-b border-encre">
            &nbsp;
          </p>
        </div>
      </footer>
    </article>
  );
}

/**
 * La souche : le numéro de pièce en talon cranté, arraché du carnet.
 *
 * Les trois lettres de tête *sont* le code boutique et se détachent en gris
 * (`socle.css:519-523`). Le crantage est un masque, pas une image : il tient à
 * l’impression et ne demande aucune requête réseau.
 *
 * Sans légende : elle portait la date et le nom de la boutique, qui figurent
 * l’une sous le titre et l’autre dans l’en-tête. La souche ne porte plus que ce
 * qu’elle seule porte — le numéro.
 */
function Souche({ numero }: { numero: string }) {
  const separation = numero.indexOf("-");
  const code = separation > 0 ? numero.slice(0, separation) : null;
  const suite = separation > 0 ? numero.slice(separation) : numero;

  return (
    <span className="souche shrink-0">
      <span className="souche-numero">
        {code && <span className="souche-code">{code}</span>}
        {suite}
      </span>
    </span>
  );
}

/**
 * Un fait du reçu : son intitulé à gauche, sa valeur à droite.
 *
 * Un fragment et non une boîte : la grille à deux colonnes de `.recu-faits`
 * aligne les valeurs entre elles d’une ligne à l’autre, ce qu’une suite de
 * boîtes en `justify-between` ne fait pas — chaque ligne y trouve son propre
 * alignement, et la colonne des montants ondule.
 */
function Fait({
  titre,
  children,
  code,
  montant,
}: {
  titre: string;
  children: React.ReactNode;
  /** Un numéro qu’on recopie : châssis, téléphone. */
  code?: boolean;
  /** Un montant : chiffres tabulaires, pour que les colonnes s’alignent. */
  montant?: boolean;
}) {
  return (
    <>
      <dt className="text-encre-doux">{titre}</dt>
      <dd
        className={`text-right font-semibold ${code ? "plaque-code" : ""} ${montant ? "tabular-nums" : ""}`}
      >
        {children}
      </dd>
    </>
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
