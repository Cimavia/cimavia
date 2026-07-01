import { PASSWORD_MIN_LENGTH } from "@cmv/shared";
import { Link } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { CmvButton } from "@/shared/component/CmvButton";
import { CmvTextField } from "@/shared/component/CmvTextField";
import { authClient } from "@/shared/lib/auth";
import { AuthLayout } from "../component/AuthLayout";

// Le token vient du lien de reset (?token=…) généré par Better Auth.
function readToken(): string | null {
  return new URLSearchParams(window.location.search).get("token");
}

export function ResetPasswordScreen() {
  const { t } = useTranslation();
  const [token] = useState(readToken);
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (token == null) {
      setError(t("auth.reset.invalidToken"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const { error: resetError } = await authClient.resetPassword({
        newPassword: password,
        token,
      });
      if (resetError) {
        setError(t("auth.reset.invalidToken"));
        return;
      }
      setDone(true);
    } catch {
      setError(t("auth.errors.generic"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout title={t("auth.reset.title")}>
      {done ? (
        <p className="text-sm text-cmv-text-mid">{t("auth.reset.success")}</p>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <CmvTextField
            label={t("auth.reset.newPassword")}
            name="newPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={PASSWORD_MIN_LENGTH}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {error != null && <p className="text-sm text-cmv-error">{error}</p>}
          <CmvButton type="submit" disabled={submitting}>
            {submitting ? t("auth.reset.submitting") : t("auth.reset.submit")}
          </CmvButton>
        </form>
      )}
      <Link to="/login" className="mt-4 block text-sm text-cmv-accent hover:text-cmv-accent-hi">
        {t("auth.reset.toLogin")}
      </Link>
    </AuthLayout>
  );
}
