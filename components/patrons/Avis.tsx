import { CircleAlert, Lock, TriangleAlert, WifiOff } from "lucide-react";
import type { ReactNode } from "react";

/**
 * L’avis : ce qui s’est passé, et ce qu’on peut y faire.
 *
 * Un message d’erreur d’une ligne dit *que* ça a raté. Il ne dit pas quoi
 * tenter, et c’est précisément ce qui manque à quelqu’un debout derrière un
 * comptoir avec un client en face. L’avis sépare les deux : un titre qui
 * nomme la situation, une phrase qui donne la suite (`DESIGN.md` §12).
 *
 * **Le ton n’est pas une humeur, c’est une catégorie de fait**, et les trois
 * viennent du métier plutôt que de la convention :
 *
 * - `alerte` — c’est refusé, et la personne peut corriger. Le rouge du logo.
 * - `transit` — c’est parti et ce n’est pas revenu : un compte qui attend son
 *   rôle, un papier chez le prestataire, une saisie en file d’attente. Le bleu
 *   de la goutte (D70).
 * - `plaque` — le hors-ligne, et lui seul. C’est le deuxième des deux emplois
 *   du jaune, l’autre étant le repère de boutique (D70). Un avis jaune veut
 *   toujours dire « le réseau manque », jamais « attention ».
 *
 * **Jamais la couleur seule** : l’icône double le ton, le titre l’écrit, et le
 * `role="alert"` le dit à qui n’a pas l’écran. Le soleil sur un écran bon
 * marché efface les nuances bien avant les mots.
 */
export type TonAvis = "alerte" | "transit" | "plaque";

const ICONE: Record<TonAvis, typeof CircleAlert> = {
  alerte: TriangleAlert,
  transit: Lock,
  plaque: WifiOff,
};

const HABILLAGE: Record<TonAvis, string> = {
  alerte: "border-l-alerte bg-alerte-surface text-encre",
  transit: "border-l-goutte bg-goutte-surface text-encre",
  plaque: "border-l-plaque-bord bg-plaque text-encre-fixe",
};

const TEINTE_ICONE: Record<TonAvis, string> = {
  alerte: "text-alerte",
  transit: "text-goutte",
  plaque: "text-encre-fixe",
};

export function Avis({
  ton,
  titre,
  children,
  role,
  className,
}: {
  ton: TonAvis;
  titre: string;
  children?: ReactNode;
  /**
   * `alert` quand l’avis répond à un geste qu’on vient de faire — il
   * interrompt. Rien quand il décrit un état déjà là à l’ouverture de
   * l’écran : un avis permanent annoncé comme une alerte est réannoncé à
   * chaque chargement et finit par couvrir les vraies.
   */
  role?: "alert" | "status";
  className?: string;
}) {
  const Icone = ICONE[ton];
  return (
    <div
      role={role}
      className={`flex gap-3 rounded-champ border-l-[3px] p-3 ${HABILLAGE[ton]} ${className ?? ""}`}
    >
      <Icone aria-hidden="true" className={`mt-0.5 size-[18px] shrink-0 ${TEINTE_ICONE[ton]}`} />
      <div className="min-w-0">
        <p className="font-semibold">{titre}</p>
        {children && (
          <div
            className={`mt-1 text-corps ${ton === "plaque" ? "text-encre-fixe" : "text-encre-doux"}`}
          >
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
