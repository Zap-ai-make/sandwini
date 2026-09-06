"use client";

import { signInWithEmailAndPassword } from "firebase/auth";
import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Monogramme } from "@/components/Monogramme";
import { Avis, type TonAvis } from "@/components/patrons/Avis";
import { Champ } from "@/components/patrons/Champ";
import { seDeconnecter, useSession } from "@/lib/auth/session";
import { IDENTITE } from "@/lib/domain/entreprise";
import { accueilDuRole } from "@/lib/domain/espaces";
import { authentification, configurationPresente } from "@/lib/firebase/client";

/* Après cinq échecs, l’écran s’impose une pause. Ce n’est pas la protection
   principale — un attaquant sérieux n’utilise pas notre formulaire — mais
   Firebase Auth applique déjà ses propres limites côté serveur, et celle-ci
   coupe le bruit et l’acharnement au comptoir. Cf. DECISIONS.md D26. */
const ECHECS_AVANT_PAUSE = 5;
const PAUSE_SECONDES = 30;

/**
 * Le refus, nommé puis expliqué.
 *
 * L’écran rendait une ligne rouge unique. Elle disait *que* ça avait raté, pas
 * quoi tenter — et c’est tout ce qui manque à quelqu’un debout derrière son
 * comptoir. Le titre nomme la situation, la phrase donne la suite, et le ton
 * dit de quelle nature elle est : refusé, en attente, ou sans réseau.
 */
type Refus = { ton: TonAvis; titre: string; explication: string };

function refusDeLaConnexion(cause: unknown): Refus {
  const code = (cause as { code?: string }).code ?? "";
  switch (code) {
    /* Ce code ne dit pas « pas de réseau », il dit « la demande n’a pas
       abouti ». Un bloqueur de publicités, un pare-feu d’entreprise ou un VPN
       la retiennent aussi — et le message annonçait alors une cause fausse à
       quelqu’un dont la connexion marchait, ce qui ne laisse rien à tenter.
       Constaté sur la préversion, serveur joignable et requête bloquée. */
    case "auth/network-request-failed":
      return {
        ton: "plaque",
        titre: "La demande n’a pas atteint le serveur",
        explication:
          "La première ouverture sur un appareil demande du réseau. Si le réseau fonctionne, un bloqueur de publicités, un pare-feu ou un VPN peut retenir la demande. Une fois entré, vous travaillerez sans réseau toute la journée.",
      };
    case "auth/user-disabled":
      return {
        ton: "alerte",
        titre: "Ce compte a été désactivé",
        explication: "Contactez le responsable : lui seul peut le réactiver.",
      };
    case "auth/too-many-requests":
      return {
        ton: "alerte",
        titre: "Trop de tentatives",
        explication: "Patientez quelques minutes avant de réessayer.",
      };
    default:
      /* Volontairement identique pour un e-mail inconnu et un mot de passe
         faux : dire lequel des deux est en cause révèle quels comptes
         existent (SECURITY.md §8). Le titre comme l’explication. */
      return {
        ton: "alerte",
        titre: "Adresse e-mail ou mot de passe incorrect",
        explication:
          "Vérifiez la saisie. Si vous ne retrouvez pas le mot de passe, demandez au responsable de le réinitialiser.",
      };
  }
}

export default function Connexion() {
  const router = useRouter();
  const session = useSession();
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [refus, setRefus] = useState<Refus | null>(null);
  const [echecs, setEchecs] = useState(0);
  const [pause, setPause] = useState(0);

  /* La destination dépend du rôle (D63) : le responsable ouvre sur la
     supervision, le gérant sur l'accueil de sa boutique. Elle n'est donc connue
     qu'une fois la session ouverte — d'où la redirection ici, et non dans le
     gestionnaire de soumission, qui rendrait la main avant que le rôle arrive. */
  useEffect(() => {
    if (session.statut === "connecte") router.replace(accueilDuRole(session.utilisateur.role));
  }, [session, router]);

  useEffect(() => {
    if (pause <= 0) return;
    const minuterie = setTimeout(() => setPause((reste) => reste - 1), 1000);
    return () => clearTimeout(minuterie);
  }, [pause]);

  async function connecter(evenement: React.FormEvent) {
    evenement.preventDefault();
    if (envoi || pause > 0) return;
    setRefus(null);
    setEnvoi(true);
    try {
      await signInWithEmailAndPassword(authentification(), email.trim().toLowerCase(), motDePasse);
      setEchecs(0);
      // La redirection est faite par l'effet ci-dessus, qui connaît le rôle.
    } catch (cause) {
      setRefus(refusDeLaConnexion(cause));
      setMotDePasse("");
      const total = echecs + 1;
      setEchecs(total);
      if (total >= ECHECS_AVANT_PAUSE) {
        setPause(PAUSE_SECONDES);
        setEchecs(0);
      }
    } finally {
      setEnvoi(false);
    }
  }

  const bloque = envoi || pause > 0;

  return (
    /* Le seul écran sans coquille, et le premier contact avec la marque : le
       monogramme y a enfin la place d’exister à sa taille. Sur téléphone la
       colonne nuit passe au-dessus et se réduit à une bande — elle situe, elle
       ne mange pas l’écran de celui qui veut juste entrer. */
    <div className="grid min-h-dvh grid-rows-[auto_1fr] md:grid-cols-[420px_minmax(0,1fr)] md:grid-rows-[1fr]">
      <PanneauMarque />

      <main className="flex flex-col justify-center px-6 py-10 md:px-14">
        <div className="w-full max-w-[380px]">
          <h1 className="text-ecran font-semibold tracking-tight text-encre">Connexion</h1>
          <p className="mt-1 text-corps text-encre-doux">
            Entrez avec le compte que le responsable vous a créé.
          </p>

          {!configurationPresente ? (
            <Avis ton="alerte" titre="Firebase n’est pas configuré sur cet appareil" className="mt-6">
              Copiez <code className="font-code">.env.example</code> vers{" "}
              <code className="font-code">.env.local</code>.
            </Avis>
          ) : session.statut === "sans_role" ? (
            <SansRole />
          ) : (
            <form onSubmit={connecter} className="mt-6 space-y-4" noValidate>
              {/* L’avis vit au-dessus des champs, comme dans la maquette : on
                  lit ce qui s’est passé avant de reposer les doigts sur le
                  clavier, pas après avoir cherché le bouton. */}
              {refus && (
                <Avis role="alert" ton={refus.ton} titre={refus.titre}>
                  {refus.explication}
                </Avis>
              )}

              <Champ id="email" libelle="Adresse e-mail">
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  inputMode="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="saisie"
                />
              </Champ>

              <Champ id="mot-de-passe" libelle="Mot de passe">
                <input
                  id="mot-de-passe"
                  name="mot-de-passe"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={motDePasse}
                  onChange={(e) => setMotDePasse(e.target.value)}
                  className="saisie"
                />
              </Champ>

              <button
                type="submit"
                disabled={bloque}
                className="bouton bouton-plaque w-full justify-center disabled:opacity-60"
              >
                {envoi && <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />}
                {pause > 0 ? `Réessayez dans ${pause} s` : envoi ? "Connexion…" : "Se connecter"}
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}

/**
 * Le panneau de marque.
 *
 * La raison sociale vient de `IDENTITE` (D71) : c’est la même chaîne qu’en
 * tête de reçu, et elle ne peut donc pas diverger d’un écran à l’autre.
 *
 * Les villes ne sont pas la liste des boutiques — on n’est pas connecté, on ne
 * sait rien. C’est la phrase de l’entreprise, et elle vient de son acte.
 */
function PanneauMarque() {
  return (
    <div className="flex flex-col bg-nuit px-6 py-8 text-coquille-encre md:px-10 md:py-14 [--color-focus-halo:var(--color-nuit)] [--color-focus-trait:#ffffff]">
      <Monogramme className="mb-6 w-24 md:mb-10 md:w-42" titre="Sandwidi et Frères" />
      <p className="font-display text-bloc font-bold tracking-tight md:text-ecran">
        {IDENTITE.raisonSociale}
      </p>
      <p className="mt-2 max-w-[34ch] text-corps text-coquille-doux">
        Motos, pièces détachées et dossiers — Pouytenga, Koudougou, Ouagadougou.
      </p>
      <p className="mt-auto hidden pt-10 font-code text-micro tracking-widest text-coquille-muet md:block">
        SDI
      </p>
    </div>
  );
}

/**
 * Le mot de passe était bon, et pourtant l’application refuse d’ouvrir.
 *
 * Sans cet écran, le formulaire se contentait de rester là : la panne la plus
 * décourageante du produit, parce qu’elle ne laisse rien à tenter. Le ton est
 * `transit` et non `alerte` — le compte existe, il attend son rôle ; rien
 * n’est cassé, quelque chose n’est pas encore arrivé (D70).
 */
function SansRole() {
  return (
    <div className="mt-6">
      <Avis role="alert" ton="transit" titre="Ce compte n’a pas encore de rôle">
        Votre mot de passe est bon, mais personne ne lui a encore donné accès à une
        boutique&nbsp;: l’application ne sait pas ce que vous avez le droit de voir. Un compte créé
        directement dans la console Firebase reste dans cet état — le rôle se pose depuis le
        serveur. Demandez au responsable de terminer la création.
      </Avis>
      <button
        type="button"
        onClick={() => void seDeconnecter()}
        className="bouton bouton-neutre mt-4"
      >
        Essayer un autre compte
      </button>
    </div>
  );
}
