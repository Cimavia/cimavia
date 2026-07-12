import { Link, Navigate, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { CmvButton } from "@/shared/component/CmvButton";
import { CmvTextField } from "@/shared/component/CmvTextField";
import { authClient } from "@/shared/lib/auth";
import { AuthLayout } from "../component/AuthLayout";

export function LoginScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: session, isPending } = authClient.useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Déjà connecté → on ne montre pas l'écran de connexion.
  if (!isPending && session) {
    return <Navigate to="/" />;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const { error: signInError } = await authClient.signIn.email({ email, password });
      if (signInError) {
        setError(t("auth.errors.invalidCredentials"));
        return;
      }
      navigate({ to: "/" });
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
