"use client";

import { signInWithEmailAndPassword } from "firebase/auth";
import { CircleAlert, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { seDeconnecter, useSession } from "@/lib/auth/session";
import { accueilDuRole } from "@/lib/domain/espaces";
import { authentification, configurationPresente } from "@/lib/firebase/client";

/* Après cinq échecs, l’écran s’impose une pause. Ce n’est pas la protection
   principale — un attaquant sérieux n’utilise pas notre formulaire — mais
   Firebase Auth applique déjà ses propres limites côté serveur, et celle-ci
   coupe le bruit et l’acharnement au comptoir. Cf. DECISIONS.md D26. */
const ECHECS_AVANT_PAUSE = 5;
const PAUSE_SECONDES = 30;

function messageDErreur(cause: unknown): string {
  const code = (cause as { code?: string }).code ?? "";
  switch (code) {
    /* Ce code ne dit pas « pas de réseau », il dit « la demande n’a pas
       abouti ». Un bloqueur de publicités, un pare-feu d’entreprise ou un VPN
       la retiennent aussi — et le message annonçait alors une cause fausse à
       quelqu’un dont la connexion marchait, ce qui ne laisse rien à tenter.
       Constaté sur la préversion, serveur joignable et requête bloquée. */
    case "auth/network-request-failed":
      return "La demande n’a pas atteint le serveur. Vérifiez votre connexion — la première ouverture sur un appareil en demande une. Si le réseau fonctionne, un bloqueur de publicités, un pare-feu ou un VPN peut retenir la demande.";
    case "auth/user-disabled":
      return "Ce compte a été désactivé. Contactez le responsable.";
    case "auth/too-many-requests":
      return "Trop de tentatives. Patientez quelques minutes avant de réessayer.";
    default:
      /* Volontairement identique pour un e-mail inconnu et un mot de passe
         faux : dire lequel des deux est en cause révèle quels comptes
         existent (SECURITY.md §8). */
      return "Adresse e-mail ou mot de passe incorrect.";
  }
}

export default function Connexion() {
  const router = useRouter();
  const session = useSession();
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
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
    setErreur(null);
    setEnvoi(true);
    try {
      await signInWithEmailAndPassword(authentification(), email.trim().toLowerCase(), motDePasse);
      setEchecs(0);
      // La redirection est faite par l'effet ci-dessus, qui connaît le rôle.
    } catch (cause) {
      setErreur(messageDErreur(cause));
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
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6 py-12">
      <p className="plaque-code mb-6 self-start rounded-plaque border border-plaque-bord bg-plaque px-3 py-1.5 text-base text-encre-fixe">
        SDI
      </p>

      <h1 className="text-2xl font-semibold tracking-tight text-encre">Connexion</h1>
      <p className="mt-2 text-sm text-encre-doux">
        Votre compte est créé par le responsable. La première connexion sur un appareil demande du
        réseau&nbsp;; ensuite, l’application fonctionne sans.
      </p>

      {!configurationPresente ? (
        <p className="mt-6 flex gap-3 rounded-plaque border border-bord bg-papier p-4 text-sm text-encre">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-alerte" />
          <span>
            Firebase n’est pas configuré sur cet appareil. Copiez <code className="font-code">.env.example</code>{" "}
            vers <code className="font-code">.env.local</code>.
          </span>
        </p>
      ) : session.statut === "sans_role" ? (
        /* Le mot de passe était bon, et pourtant l’application refuse d’ouvrir.
           Sans cet écran, le formulaire se contentait de rester là : la panne la
           plus décourageante du produit, parce qu’elle ne laisse rien à tenter. */
        <div className="mt-6">
          <p className="flex gap-3 rounded-plaque border border-bord bg-papier p-4 text-sm text-encre">
            <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-alerte" />
            <span>
              Votre mot de passe est bon, mais ce compte n’a pas encore de rôle&nbsp;: l’application
              ne sait pas ce que vous avez le droit de voir. Un compte créé directement dans la
              console Firebase reste dans cet état — le rôle se pose depuis le serveur. Demandez au
              responsable de terminer la création.
            </span>
          </p>
          <button
            type="button"
            onClick={() => void seDeconnecter()}
            className="mt-4 inline-flex h-11 items-center rounded-plaque border border-bord px-4 text-sm font-medium text-encre hover:bg-papier"
          >
            Essayer un autre compte
          </button>
        </div>
      ) : (
        <form onSubmit={connecter} className="mt-8 space-y-4" noValidate>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-encre">
              Adresse e-mail
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              inputMode="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5 h-12 w-full rounded-plaque border border-bord bg-papier px-3 text-encre"
            />
          </div>

          <div>
            <label htmlFor="mot-de-passe" className="block text-sm font-medium text-encre">
              Mot de passe
            </label>
            <input
              id="mot-de-passe"
              name="mot-de-passe"
              type="password"
              autoComplete="current-password"
              required
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
              className="mt-1.5 h-12 w-full rounded-plaque border border-bord bg-papier px-3 text-encre"
            />
          </div>

          {/* L’erreur est annoncée aux lecteurs d’écran, pas seulement affichée. */}
          <p role="alert" aria-live="assertive" className="min-h-5 text-sm text-alerte">
            {erreur ?? ""}
          </p>

          <button
            type="submit"
            disabled={bloque}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-plaque border border-plaque-bord bg-plaque font-semibold text-encre-fixe disabled:opacity-60"
          >
            {envoi && <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />}
            {pause > 0 ? `Réessayez dans ${pause} s` : envoi ? "Connexion…" : "Se connecter"}
          </button>
        </form>
      )}
    </main>
  );
}
