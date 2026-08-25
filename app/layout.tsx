import type { Metadata, Viewport } from "next";
import { Archivo, IBM_Plex_Mono } from "next/font/google";
import type { ReactNode } from "react";
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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0f14" },
  ],
  // On ne bride pas le zoom : l’écran se lit parfois à bout de bras, en plein
  // soleil, par quelqu’un qui n’a pas ses lunettes (DESIGN.md §11).
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" className={`${archivo.variable} ${plexMono.variable}`}>
      <body className="min-h-dvh antialiased">
        <FournisseurEtatReseau>{children}</FournisseurEtatReseau>
      </body>
    </html>
  );
}
