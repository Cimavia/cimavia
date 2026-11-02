import type { ReactNode } from "react";
import { IoChevronForward } from "react-icons/io5";
import { cn } from "@/shared/util/cn.util";

type CmvCardProps = {
  children: ReactNode;
  className?: string;
  /**
   * REMPLACE le fond et la bordure par défaut — pour une carte qui signale (cf. `DashboardTile`).
   *
   * Une prop à part, et non une classe de plus dans `className` : `cn` ne résout pas les conflits
   * Tailwind (choix assumé, cf. `cn.util.ts`), donc `bg-cmv-surface` et `bg-cmv-error-soft` se
   * retrouveraient toutes deux sur l'élément. L'ordre dans la CHAÎNE ne les départage pas — c'est
   * l'ordre de génération dans la feuille CSS qui tranche, et il ne dépend pas de nous. Le fond
   * d'alerte disparaissait ainsi sans que rien ne le signale.
   */
  surfaceClassName?: string;
  /**
   * La carte OUVRE quelque chose (un écran, un volet) : elle devient un bouton marqué d'un chevron
   * (#703). Omis = carte statique. Une carte qui sélectionne ou bascule n'est pas ce cas-là — le
   * chevron y promettrait une navigation qui n'a pas lieu.
   */
  onClick?: () => void;
};

export function CmvCard({
  children,
  className,
  surfaceClassName,
  onClick,
}: Readonly<CmvCardProps>) {
  const surface = surfaceClassName ?? "border-cmv-border bg-cmv-surface";
  const base = cn("rounded-cmv-lg border p-cmv-lg", surface);

  if (onClick == null) {
    return <div className={cn(base, className)}>{children}</div>;
  }

  /**
   * Le chevron dit qu'une carte OUVRE quelque chose (#703) : sans lui, rien ne distinguait à l'œil
   * une carte cliquable d'une carte statique — la différence n'existait que dans le code. Un
   * marqueur dans la carte plutôt qu'un effet de survol : il se voit avant le geste, et au tactile.
   *
   * C'est aussi LUI qui répond au survol (`group-hover`) : celui de la surface est retiré sur une
   * carte qui signale, et une carte d'alerte restait alors inerte sous la souris.
   *
   * Des `span` et non des `div` : un bouton n'admet que du contenu de phrase. Le contenu reste
   * calé en haut (seul le chevron est centré) : dans une grille, les cartes d'une rangée prennent
   * la hauteur de la plus haute, et des libellés centrés ne s'aligneraient plus d'une carte à
   * l'autre.
   */
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        base,
        "group flex w-full cursor-pointer gap-cmv-md text-left transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cmv-accent",
        // Le survol par défaut vise la surface neutre : sur une carte qui signale, il écraserait
        // sa couleur au passage de la souris. Elle garde donc la sienne.
        surfaceClassName == null ? "hover:border-cmv-border-hi hover:bg-cmv-surface-hi" : "",
        className,
      )}
    >
      <span className="block min-w-0 flex-1">{children}</span>
      <IoChevronForward
        aria-hidden
        className="shrink-0 self-center text-cmv-text-lo transition-transform group-hover:translate-x-0.5 group-hover:text-cmv-text-hi"
      />
    </button>
  );
}
