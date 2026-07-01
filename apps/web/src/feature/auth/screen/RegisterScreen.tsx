import { PASSWORD_MIN_LENGTH, Role, type RoleType } from "@cmv/shared";
import { Link, Navigate, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { CmvButton } from "@/shared/component/CmvButton";
import { CmvTextField } from "@/shared/component/CmvTextField";
import { authClient } from "@/shared/lib/auth";
import { AuthLayout } from "../component/AuthLayout";

// À l'inscription, l'utilisateur choisit son rôle (ADMIN n'est pas auto-assignable).
const SELECTABLE_ROLES: RoleType[] = [Role.COACH, Role.ATHLETE];

export function RegisterScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: session, isPending } = authClient.useSession();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<RoleType>(Role.ATHLETE);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!isPending && session) {
    return <Navigate to="/" />;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const { error: signUpError } = await authClient.signUp.email({ email, password, name, role });
      if (signUpError) {
        setError(t("auth.errors.generic"));
        return;
      }
      navigate({ to: "/" });
    } catch {
      setError(t("auth.errors.generic"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout title={t("auth.register.title")}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <CmvTextField
          label={t("auth.register.name")}
          name="name"
          type="text"
          autoComplete="name"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
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
          autoComplete="new-password"
          required
          minLength={PASSWORD_MIN_LENGTH}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <fieldset className="flex flex-col gap-1 text-sm text-cmv-text-mid">
          <legend className="mb-1">{t("auth.register.role")}</legend>
          <div className="flex gap-2">
            {SELECTABLE_ROLES.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setRole(value)}
                className={
                  role === value
                    ? "flex-1 rounded-lg border border-cmv-accent bg-cmv-accent-soft px-3 py-2 text-cmv-text-hi"
                    : "flex-1 rounded-lg border border-cmv-border bg-cmv-surface px-3 py-2 text-cmv-text-mid"
                }
              >
                {value === Role.COACH ? t("role.coach") : t("role.athlete")}
              </button>
            ))}
          </div>
        </fieldset>
        {error != null && <p className="text-sm text-cmv-error">{error}</p>}
        <CmvButton type="submit" disabled={submitting}>
          {submitting ? t("auth.register.submitting") : t("auth.register.submit")}
        </CmvButton>
      </form>
      <div className="mt-4 text-sm text-cmv-text-mid">
        {t("auth.register.hasAccount")}{" "}
        <Link to="/login" className="text-cmv-accent hover:text-cmv-accent-hi">
          {t("auth.register.toLogin")}
        </Link>
      </div>
    </AuthLayout>
  );
}
