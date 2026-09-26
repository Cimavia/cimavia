import { useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, useNavigate, useSearch } from "@tanstack/react-router";
import { type SubmitEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { CmvButton } from "@/shared/component/CmvButton";
import { CmvTextField } from "@/shared/component/CmvTextField";
import { authClient } from "@/shared/lib/auth";
import { safeRedirect } from "@/shared/lib/redirect";
import { AuthLayout } from "../component/AuthLayout";

export function LoginScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: session, isPending } = authClient.useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  /**
   * La page que la garde a dû quitter (#337) : le coach qui ouvrait un débrief depuis une
   * notification doit y arriver, pas sur l'accueil. `strict: false` pour que l'écran se monte sous
   * n'importe quel id de route, ses tests compris ; la valeur n'est de toute façon suivie qu'après
   * `safeRedirect`, puisqu'elle vient de l'URL.
   */
  const { redirect } = useSearch({ strict: false }) as { redirect?: unknown };
  const target = safeRedirect(redirect);
  /**
   * Où aller une fois connecté : l'accueil, ou la cible quand elle est sûre — `href`, posé, prend
   * la place de `to` dans le routeur. `replace` : l'écran de connexion ne doit pas rester dans
   * l'historique, sinon Retour y ramène et il renvoie aussitôt plus loin — le bouton ne sert plus
   * à rien.
   */
  const destination = {
    to: "/",
    search: { q: undefined, filter: undefined, athlete: undefined },
    ...(target == null ? {} : { href: target }),
    replace: true,
  } as const;

  // Déjà connecté → on ne montre pas l'écran de connexion.
  if (!isPending && session) {
    return <Navigate {...destination} />;
  }

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const { error: signInError } = await authClient.signIn.email({ email, password });
      if (signInError) {
        setError(t("auth.errors.invalidCredentials"));
        return;
      }
      // Le seul point de passage OBLIGÉ d'un changement de compte : une session expirée ramène
      // ici sans qu'aucune déconnexion soit passée, et le cache du précédent serait resservi.
      queryClient.clear();
      navigate(destination);
    } catch {
      // Échec réseau / CORS : la promesse rejette → on affiche une erreur générique.
      setError(t("auth.errors.generic"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout title={t("auth.login.title")}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <CmvTextField
          label={t("common.email")}
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <CmvTextField
          label={t("common.password")}
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {error != null && <p className="text-sm text-cmv-error">{error}</p>}
        <CmvButton type="submit" disabled={submitting} fullWidth>
          {submitting ? t("auth.login.submitting") : t("auth.login.submit")}
        </CmvButton>
      </form>
      <div className="mt-4 flex flex-col gap-2 text-sm text-cmv-text-mid">
        <Link to="/forgot-password" className="hover:text-cmv-text-hi">
          {t("auth.login.forgot")}
        </Link>
        <span>
          {t("auth.login.noAccount")}{" "}
          <Link to="/register" className="text-cmv-accent hover:text-cmv-accent-hi">
            {t("auth.login.toRegister")}
          </Link>
        </span>
      </div>
    </AuthLayout>
  );
}
