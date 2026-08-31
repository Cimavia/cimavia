import type { CapabilityName } from "@cmv/shared";
import { PASSWORD_MIN_LENGTH } from "@cmv/shared";
import { Link, Navigate, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { CmvButton } from "@/shared/component/CmvButton";
import { CmvTextField } from "@/shared/component/CmvTextField";
import { authClient } from "@/shared/lib/auth";
import { AuthLayout } from "../component/AuthLayout";

/**
 * Les capacités proposées à l'inscription, dans l'ordre d'affichage. Elles sont **cumulables**
 * (#7) : un coach qui se coache lui-même coche les deux. `role` n'est plus envoyé — l'API le
 * déduit comme persona d'atterrissage (#12).
 */
const SELECTABLE_CAPABILITIES: { name: CapabilityName; labelKey: string }[] = [
  { name: "coach", labelKey: "auth.register.capabilityCoach" },
  { name: "athlete", labelKey: "auth.register.capabilityAthlete" },
];

/** Bascule une capacité sans muter l'état existant (React compare par référence). */
function toggled(current: Set<CapabilityName>, name: CapabilityName): Set<CapabilityName> {
  const next = new Set(current);
  if (!next.delete(name)) next.add(name);
  return next;
}

export function RegisterScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: session, isPending } = authClient.useSession();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [capabilities, setCapabilities] = useState<Set<CapabilityName>>(new Set(["athlete"]));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!isPending && session) {
    return <Navigate to="/" search={{ q: undefined, filter: undefined }} />;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Garde côté client EN PLUS de celle de l'API (400) : un compte sans capacité se retrouverait
    // devant une application vide, et le dire ici évite un aller-retour pour l'apprendre.
    if (capabilities.size === 0) {
      setError(t("auth.errors.noCapability"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const { error: signUpError } = await authClient.signUp.email({
        email,
        password,
        name,
        isCoach: capabilities.has("coach"),
        isAthlete: capabilities.has("athlete"),
      });
      if (signUpError) {
        // 422 (UNPROCESSABLE_ENTITY) = e-mail déjà utilisé : c'est le seul 422 du sign-up côté
        // Better Auth (les autres validations — email/mot de passe invalides — sont des 400).
        const emailInUse = signUpError.status === 422;
        setError(t(emailInUse ? "auth.errors.emailInUse" : "auth.errors.generic"));
        return;
      }
      navigate({ to: "/", search: { q: undefined, filter: undefined } });
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
          <legend className="mb-1">{t("auth.register.capabilities")}</legend>
          <div className="flex gap-2">
            {SELECTABLE_CAPABILITIES.map(({ name, labelKey }) => {
              const checked = capabilities.has(name);
              return (
                // Une vraie case à cocher, masquée visuellement mais présente pour le clavier et
                // les lecteurs d'écran : ce sont deux choix INDÉPENDANTS, et un bouton déguisé en
                // `role="checkbox"` ne dirait pas qu'on peut cocher les deux.
                <label
                  key={name}
                  className={
                    checked
                      ? "flex-1 cursor-pointer rounded-lg border border-cmv-accent bg-cmv-accent-soft px-3 py-2 text-center text-cmv-text-hi focus-within:ring-2 focus-within:ring-cmv-accent"
                      : "flex-1 cursor-pointer rounded-lg border border-cmv-border bg-cmv-surface px-3 py-2 text-center text-cmv-text-mid focus-within:ring-2 focus-within:ring-cmv-accent"
                  }
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={checked}
                    onChange={() => setCapabilities(toggled(capabilities, name))}
                  />
                  {t(labelKey)}
                </label>
              );
            })}
          </div>
          <p className="text-cmv-text-low text-xs">{t("auth.register.capabilityHint")}</p>
        </fieldset>
        {error != null && <p className="text-sm text-cmv-error">{error}</p>}
        <CmvButton type="submit" disabled={submitting} fullWidth>
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
