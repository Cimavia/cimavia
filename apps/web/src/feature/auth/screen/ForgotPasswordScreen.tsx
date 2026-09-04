import { Link } from "@tanstack/react-router";
import { type SubmitEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { CmvButton } from "@/shared/component/CmvButton";
import { CmvTextField } from "@/shared/component/CmvTextField";
import { authClient } from "@/shared/lib/auth";
import { AuthLayout } from "../component/AuthLayout";

export function ForgotPasswordScreen() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const { error: requestError } = await authClient.requestPasswordReset({
        email,
        redirectTo: `${window.location.origin}/reset-password`,
      });
      /**
       * Le client Better Auth NE LÈVE PAS sur une réponse d'erreur : il la rend. Sans cette
       * lecture, une panne s'afficherait « e-mail envoyé » alors que rien n'est parti.
       *
       * Cela ne rouvre PAS l'énumération d'adresses : une adresse inconnue reçoit `status: true`
       * sans erreur, exactement comme une adresse connue. Seule une panne se distingue.
       */
      if (requestError != null) {
        setError(t("auth.errors.generic"));
        return;
      }
      setSent(true);
    } catch {
      setError(t("auth.errors.generic"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout title={t("auth.forgot.title")}>
      {sent ? (
        <p className="text-sm text-cmv-text-mid">{t("auth.forgot.sent")}</p>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <p className="text-sm text-cmv-text-mid">{t("auth.forgot.description")}</p>
          <CmvTextField
            label={t("common.email")}
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          {error != null && <p className="text-sm text-cmv-error">{error}</p>}
          <CmvButton type="submit" disabled={submitting} fullWidth>
            {submitting ? t("auth.forgot.submitting") : t("auth.forgot.submit")}
          </CmvButton>
        </form>
      )}
      <Link to="/login" className="mt-4 block text-sm text-cmv-accent hover:text-cmv-accent-hi">
        {t("auth.forgot.back")}
      </Link>
    </AuthLayout>
  );
}
