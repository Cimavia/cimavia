import { Link } from "@tanstack/react-router";
import type { CmvAppShell } from "@/shared/component";

/**
 * Le bandeau d'un écran, sans la navigation que tire le vrai `CmvAppShell` (capacités, cloche,
 * interlocuteurs) : hors sujet pour un test d'écran. Seul compte ce que l'écran y pose — le
 * sous-titre, quand il en a un, se lit par `getByTestId("subtitle")`.
 *
 * Le retour reste un VRAI lien (#746) : c'est par lui que passent les tests de sortie, garde de
 * saisie comprise. Il exige donc un routeur, que `renderInRoute` monte.
 *
 * Ses props SONT celles du vrai : une prop qu'il gagne ou renomme se voit ici, au lieu de laisser
 * la doublure l'ignorer et les tests affirmer des absences à vide.
 */
export function StubAppShell({
  title,
  subtitle,
  actions,
  back,
  children,
}: Parameters<typeof CmvAppShell>[0]) {
  return (
    <main>
      {back == null ? null : <Link {...back.link}>{back.label}</Link>}
      <h1>{title}</h1>
      {subtitle == null ? null : <p data-testid="subtitle">{subtitle}</p>}
      {actions}
      {children}
    </main>
  );
}
