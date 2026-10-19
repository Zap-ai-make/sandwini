import type { Metadata, Viewport } from "next";
import { Archivo, IBM_Plex_Mono } from "next/font/google";
import type { ReactNode } from "react";
import { FiletMarque } from "@/components/FiletMarque";
import { FournisseurSession } from "@/lib/auth/session";
import { FournisseurEtatReseau } from "@/lib/reseau/etat-reseau";
import "./globals.css";

/* `next/font` télécharge les polices à la compilation et les sert depuis notre
   domaine. C’est ce qui permet aux reçus de s’imprimer hors ligne (S10) : pas
   un octet à demander à Google au moment de l’impression. */
const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-plex-mono",
  display: "swap",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "SDI — Gestion",
  description: "Ventes de motos, paiements et dossiers administratifs, en boutique et hors ligne.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "SDI" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  /* Une seule valeur depuis S54 : le clair est le défaut, et cette couleur ne
     peut pas suivre `data-theme` — c'est une métadonnée statique, servie avant
     que la page existe. Garder une variante sombre indexée sur le réglage
     système donnerait une barre de navigateur sombre autour d'une application
     claire, ce qui est pire que de ne pas la décliner du tout. */
  themeColor: "#ffffff",
  // On ne bride pas le zoom : l’écran se lit parfois à bout de bras, en plein
  // soleil, par quelqu’un qui n’a pas ses lunettes (DESIGN.md §11).
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    /* `suppressHydrationWarning` couvre exactement ce que le script en tête de
       `<body>` fait juste en dessous : il pose `data-nav` et `data-theme` sur
       cet élément avant que React hydrate. L'écart est donc voulu, et c'est le
       seul moyen de ne pas ouvrir l'écran en clair avant de virer au sombre.

       Sans cet attribut, React signalait l'écart à chaque chargement — une
       erreur permanente dans la console, qui ne cassait rien et rendait la
       suivante plus facile à ne pas voir. C'est le remède que documente Next
       pour ce cas précis (`02-guides/preventing-flash-before-hydration.md`).

       Il ne masque qu'un niveau : les attributs de cet élément-ci. Tout écart
       à l'intérieur de l'application continue de se signaler. */
    <html
      lang="fr"
      className={`${archivo.variable} ${plexMono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-dvh antialiased">
        {/* L'état de la navigation, posé **avant** le premier rendu.

            Sans ce script, la colonne s'ouvrait grande puis se refermait sous
            les yeux de celui qui l'avait repliée la veille — un mouvement que
            personne n'a demandé, à chaque chargement de page. Il est en ligne
            et synchrone pour cette raison précise : tout ce qui passe par React
            arrive après la peinture.

            Il ne fait rien d'autre que lire une préférence d'affichage : pas de
            réseau, pas de donnée, rien qui mérite un `nonce` (le `script-src`
            du projet autorise l'inline, cf. `next.config.ts`). */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              'try{if(localStorage.getItem("sdi.nav.repliee")==="1")' +
              'document.documentElement.dataset.nav="repliee";' +
              /* Le thème choisi, posé avant la peinture pour la même raison que
                 le repli : sans cela l'écran s'ouvre en clair puis vire au
                 sombre sous les yeux, à chaque page. Rien n'est posé quand
                 aucun choix n'a été fait — l'absence d'attribut vaut « comme le
                 système », et c'est `prefers-color-scheme` qui décide. */
              'var t=localStorage.getItem("sdi.theme");' +
              'if(t==="clair"||t==="sombre")document.documentElement.dataset.theme=t;' +
              "}catch(e){}",
          }}
        />
        <FournisseurSession>
          <FournisseurEtatReseau>
            {/* Le filet est passé sous le fournisseur : sa lueur dit l'état de
                la liaison, il doit donc pouvoir le lire. Il reste posé avant
                tout le reste, et fixé en haut de l'écran — sa place à l'image
                ne change pas. */}
            <FiletMarque />
            {children}
          </FournisseurEtatReseau>
        </FournisseurSession>
      </body>
    </html>
  );
}
