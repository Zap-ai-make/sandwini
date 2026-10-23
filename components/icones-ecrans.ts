import {
  Activity,
  Bike,
  Boxes,
  Building2,
  Coins,
  FolderCheck,
  FolderSync,
  HardHat,
  IdCard,
  LayoutGrid,
  type LucideIcon,
  Plus,
  Receipt,
  ReceiptText,
  Truck,
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
  "/motos/ventes?nouvelle=1": Plus,
  "/motos": Bike,
  "/motos/nouvelle": Store,
  "/motos/arrivages": Truck,
  "/motos/ventes": Receipt,
  "/motos/paiements": Coins,
  "/motos/dossiers": FolderCheck,
  "/motos/inventaire": Boxes,
  "/clients": Users,
  "/cartes-grises": IdCard,
  "/parametres/cartes-grises": FolderSync,
  "/prestataires": HardHat,
  "/pieces": Wrench,
  "/caisse": Coins,
  /* Sans ces deux lignes, les écrans de S55 retombaient sur `Activity` —
     déjà pris par `/parametres/referentiels`, dans la même colonne repliée.
     Deux entrées au même pictogramme, c'est une colonne qu'on ne lit plus. */
  "/caisse/depenses": ReceiptText,
  "/parametres/entreprise": Building2,
  "/parametres/boutiques": Store,
  "/parametres/utilisateurs": UserCheck,
  "/parametres/catalogue": Tags,
  "/parametres/referentiels": Activity,
};
