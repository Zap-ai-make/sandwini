import { lireVersion } from "@/lib/domain/version";

/**
 * La version de ce paquet, lue une fois pour toutes.
 *
 * Les trois valeurs sont posées par `next.config.ts` et remplacées
 * littéralement à la compilation. Elles se lisent **une par une** : Next
 * substitue l'expression `process.env.NEXT_PUBLIC_VERSION` entière, et un
 * `const { NEXT_PUBLIC_VERSION } = process.env` ne trouverait rien
 * (doc Next, `05-config/01-next-config-js/env.md`). C'est le genre d'erreur
 * qui compile, passe la revue, et rend « — » en production.
 *
 * Ce module ne fait que cette lecture ; tout le jugement est dans
 * `lib/domain/version.ts`, qui se teste sans build.
 */
export const VERSION_COURANTE = lireVersion({
  numero: process.env.NEXT_PUBLIC_VERSION,
  compileeLe: process.env.NEXT_PUBLIC_COMPILEE_LE,
  empreinte: process.env.NEXT_PUBLIC_EMPREINTE,
});
