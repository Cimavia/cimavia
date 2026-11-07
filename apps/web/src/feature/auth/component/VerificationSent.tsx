import { type ResendState, resendOutcome } from "@cmv/shared";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CmvButton } from "@/shared/component/CmvButton";
import { authClient } from "@/shared/lib/auth";

/**
 * Ce qui suit une inscription réussie depuis #270 : pas de session, un e-mail à ouvrir.
 *
 * Le texte ne dit PAS « ton compte est créé » : l'API répond pareil à une adresse déjà inscrite,
 * dont le propriétaire reçoit un autre e-mail. Dans les deux cas, il y a
 * un e-mail à ouvrir et une connexion ensuite — c'est tout ce que l'écran affirme.
 *
 * Le renvoi passe par `sendVerificationEmail`, sans `callbackURL` : c'est l'API qui décide où le
 * lien ramène.
 */
export function VerificationSent({ email }: Readonly<{ email: string }>) {
  const { t } = useTranslation();
  const [resend, setResend] = useState<ResendState>("idle");

  async function onResend() {
    setResend("sending");
    setResend(await resendOutcome(() => authClient.sendVerificationEmail({ email })));
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-cmv-text-mid text-sm">{t("auth.verificationSent.body", { email })}</p>
      {resend === "sent" && (
        <p role="status" className="text-cmv-text-mid text-sm">
          {t("auth.verificationSent.resent")}
        </p>
      )}
      {resend === "failed" && (
        <p role="alert" className="text-cmv-error text-sm">
          {t("auth.errors.generic")}
        </p>
      )}
      <CmvButton variant="secondary" disabled={resend === "sending"} onClick={onResend} fullWidth>
        {resend === "sending"
          ? t("auth.verificationSent.resending")
          : t("auth.verificationSent.resend")}
      </CmvButton>
      <Link
        to="/login"
        className="text-center font-semibold text-cmv-accent text-sm hover:text-cmv-accent-hi"
      >
        {t("auth.verificationSent.toLogin")}
      </Link>
    </div>
  );
}
