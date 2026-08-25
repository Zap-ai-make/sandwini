import Link from "next/link";

export const metadata = { title: "Hors ligne — SDI" };

/**
 * Page de repli du service worker : elle ne s’affiche que pour une adresse
 * jamais ouverte auparavant, donc absente du cache, alors que le réseau est
 * coupé. Les écrans déjà visités, eux, continuent de fonctionner.
 *
 * Elle explique ce qui s’est passé et ce qu’on peut faire — une erreur ne
 * s’excuse pas et n’est jamais vague (DESIGN.md §12).
 */
export default function HorsLigne() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-prose flex-col justify-center px-6 py-12">
      <p className="plaque-code mb-4 inline-block self-start rounded-plaque border border-encre-fixe bg-encre-fixe px-2 py-1 text-sm text-plaque">
        SDI
      </p>
      <h1 className="text-2xl font-semibold tracking-tight text-encre">
        Cet écran n’a pas encore été ouvert sur cet appareil
      </h1>
      <p className="mt-3 text-encre-doux">
        Il n’est donc pas en mémoire, et le réseau est coupé. Les écrans déjà utilisés restent
        accessibles, et vos saisies en attente partiront dès le retour du réseau — rien n’est perdu.
      </p>
      <Link
        href="/dashboard"
        className="mt-6 inline-flex h-12 items-center self-start rounded-plaque border border-plaque-bord bg-plaque px-5 font-semibold text-encre-fixe"
      >
        Revenir à l’accueil
      </Link>
    </main>
  );
}
