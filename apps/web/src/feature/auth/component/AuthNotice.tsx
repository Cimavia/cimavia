import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

/** Les pages d'authentification vers lesquelles mène un lien de pied de formulaire. */
type AuthLinkTarget = "/login" | "/forgot-password";

/** Le lien sous le formulaire d'une page d'authentification : retour à la connexion, ou la suite. */
export function AuthLink({ to, children }: Readonly<{ to: AuthLinkTarget; children: ReactNode }>) {
  return (
    <Link to={to} className="mt-4 block text-cmv-accent text-sm hover:text-cmv-accent-hi">
      {children}
    </Link>
  );
}

/**
 * Le paragraphe de message d'une page d'authentification.
 *
 * Son rôle dit QUAND il apparaît, pas ce qu'il dit :
 * - `alert` : un refus ;
 * - `status` : un message qui remplace la page APRÈS une action — le mot de passe changé (#437) ;
 * - rien : affiché dès l'arrivée, il EST le contenu de la page et se lit avec elle. Une région
 *   `status` n'annonce que ce qui change après le premier rendu, elle n'y dirait rien de plus.
 */
export function AuthMessage({
  role,
  children,
}: Readonly<{ role?: "alert" | "status" | undefined; children: ReactNode }>) {
  return (
    <p role={role} className="text-cmv-text-mid text-sm">
      {children}
    </p>
  );
}

/**
 * Un message tenu à la place d'un formulaire qui ne pourrait rien faire, et le lien qui mène à la
 * suite : lien de vérification refusé (#270), lien de réinitialisation mort ou absent (#437).
 * `alert` pour un refus ; sans, le message est le contenu de la page (`AuthMessage`).
 */
export function AuthNotice({
  alert = false,
  to,
  linkLabel,
  children,
}: Readonly<{ alert?: boolean; to: AuthLinkTarget; linkLabel: string; children: ReactNode }>) {
  return (
    <>
      <AuthMessage role={alert ? "alert" : undefined}>{children}</AuthMessage>
      <AuthLink to={to}>{linkLabel}</AuthLink>
    </>
  );
}
