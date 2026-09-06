import {
  Activity,
  Bike,
  Building2,
  Coins,
  FolderCheck,
  HardHat,
  LayoutGrid,
  type LucideIcon,
  Plus,
  Printer,
  Receipt,
  RefreshCw,
  Store,
  Tags,
  UserCheck,
  Users,
  Wrench,
} from "lucide-react";

/**
 * L’icône de chaque écran, une fois pour toutes.
 *
 * Elle sert à deux endroits qui doivent s’accorder : la colonne de gauche, où
 * elle survit seule au repli, et le hub des réglages. Deux tables auraient
 * donné deux dessins pour le même écran selon l’endroit d’où on le regarde —
 * ce qui défait précisément ce à quoi sert une icône.
 *
 * Aucune n’est décorative au sens de `DESIGN.md` §8 : chacune double un
 * libellé écrit, jamais ne le remplace, et elles portent toutes
 * `aria-hidden`.
 */
export const ICONE_ECRAN: Record<string, LucideIcon> = {
  "/supervision": Activity,
  "/dashboard": LayoutGrid,
  "/motos/ventes/nouvelle": Plus,
  "/motos": Bike,
  "/motos/nouvelle": Store,
  "/motos/ventes": Receipt,
  "/motos/paiements": Coins,
  "/motos/dossiers": FolderCheck,
  "/motos/recus": Printer,
  "/clients": Users,
  "/pieces": Wrench,
  "/caisse": Coins,
  "/parametres/entreprise": Building2,
  "/parametres/boutiques": Store,
  "/parametres/utilisateurs": UserCheck,
  "/parametres/catalogue": Tags,
  "/parametres/referentiels": Activity,
  "/parametres/prestataires": HardHat,
  "/diagnostic": RefreshCw,
};
