import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  RESET_PASSWORD_LINK_REFUSED,
  resetPasswordRefusal,
} from "@cmv/shared";
import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { type ReactNode, type SubmitEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CmvButton } from "@/shared/component/CmvButton";
import { CmvTextField } from "@/shared/component/CmvTextField";
import { authClient } from "@/shared/lib/auth";
import { AuthLayout } from "../component/AuthLayout";

// Le token vient du lien de reset (?token=…) généré par Better Auth.
const route = getRouteApi("/reset-password");

const LINK_CLASS = "mt-4 block text-sm text-cmv-accent hover:text-cmv-accent-hi";

/**
 * Les refus qui laissent le formulaire en place (`resetPasswordRefusal`) : le lien marche, seul le
 * mot de passe ou le moment est en cause. Le lien mort, lui, remplace le formulaire.
 */
const REFUSAL_KEY = {
  passwordTooShort: "auth.reset.passwordTooShort",
  passwordTooLong: "auth.reset.passwordTooLong",
  tooManyAttempts: "auth.errors.tooManyAttempts",
  generic: "auth.errors.generic",
} as const;

/**
 * Où mène le lien de l'e-mail de réinitialisation, une fois que Better Auth a vérifié son jeton.
 *
 * Trois arrivées (#437), et le formulaire n'est montré qu'à la seule qui peut aboutir :
 * - **jeton valable** (`?token=…`) : le formulaire ;
 * - **lien refusé** (`?error=…`, ou l'API qui refuse le jeton à l'envoi) : il est mort, seul un
 *   nouvel e-mail permet d'avancer ;
 * - **ni l'un ni l'autre** : page rechargée après que le jeton a quitté l'URL (#335), ou adresse
 *   tapée à la main. Le lien de l'e-mail marche peut-être encore — le texte le dit, et propose
 *   aussi d'en redemander un.
 *
 * Et une quatrième, posée par l'écran lui-même : **mot de passe changé** (`?done=true`).
 */
export function ResetPasswordScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { token: tokenInUrl, error: linkError, done } = route.useSearch();
  // Lu UNE fois : le jeton quitte l'URL juste après, et c'est cette copie qui part à l'envoi.
  const [token] = useState(tokenInUrl ?? null);

  // Le jeton suffit à prendre le compte : il ne doit rester ni dans la barre d'adresse, ni dans
  // l'historique, ni dans l'URL qu'emporterait un événement Sentry (#335). `replace` et non `push` :
  // Retour ne doit pas le ramener. Le prix, assumé : recharger la page le perd — l'écran le dit
  // alors (#437), et le lien du mail reste valable tant que le jeton n'a pas servi. `error`, lui,
  // n'a rien de secret et reste.
  useEffect(() => {
    if (tokenInUrl !== undefined) {
      const search = linkError === undefined ? {} : { error: linkError };
      navigate({ to: "/reset-password", search, replace: true });
    }
  }, [tokenInUrl, linkError, navigate]);

  function content() {
    if (done) return <p className="text-sm text-cmv-text-mid">{t("auth.reset.success")}</p>;
    if (linkError !== undefined) {
      return <LinkNotice role="alert">{t("auth.reset.invalidToken")}</LinkNotice>;
    }
    if (token == null) {
      return <LinkNotice role="status">{t("auth.reset.missingToken")}</LinkNotice>;
    }
    // L'issue de l'envoi va dans l'URL, pas dans un état : une page rechargée redit la même chose.
    // Refusé, le lien est mort comme s'il était arrivé refusé ; changé, le mot de passe ne fait
    // plus réclamer un lien.
    return (
      <ResetPasswordForm
        token={token}
        onDone={() => navigate({ to: "/reset-password", search: { done: true }, replace: true })}
        onLinkRefused={() =>
          navigate({
            to: "/reset-password",
            search: { error: RESET_PASSWORD_LINK_REFUSED },
            replace: true,
          })
        }
      />
    );
  }

  return (
    <AuthLayout title={t("auth.reset.title")}>
      {content()}
      <Link to="/login" className={LINK_CLASS}>
        {t("auth.reset.toLogin")}
      </Link>
    </AuthLayout>
  );
}

/** Pas de formulaire : il ne pourrait rien faire. La suite est un nouvel e-mail. */
function LinkNotice({
  role,
  children,
}: Readonly<{ role: "alert" | "status"; children: ReactNode }>) {
  const { t } = useTranslation();
  return (
    <>
      <p role={role} className="text-sm text-cmv-text-mid">
        {children}
      </p>
      <Link to="/forgot-password" className={LINK_CLASS}>
        {t("auth.reset.toForgotPassword")}
      </Link>
    </>
  );
}

function ResetPasswordForm({
  token,
  onDone,
  onLinkRefused,
}: Readonly<{ token: string; onDone: () => void; onLinkRefused: () => void }>) {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    let message: string;
    try {
      const { error: resetError } = await authClient.resetPassword({
        newPassword: password,
        token,
      });
      // Le bouton reste désactivé jusqu'à ce que le formulaire disparaisse : réactivé entre-temps,
      // un second clic renverrait un jeton qui a servi, ou qu'on sait mort.
      if (!resetError) {
        onDone();
        return;
      }
      const refusal = resetPasswordRefusal(resetError);
      if (refusal === "deadLink") {
        onLinkRefused();
        return;
      }
      message = t(REFUSAL_KEY[refusal], { min: PASSWORD_MIN_LENGTH, max: PASSWORD_MAX_LENGTH });
    } catch {
      message = t("auth.errors.generic");
    }
    setError(message);
    setSubmitting(false);
  }

  return (
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
      <CmvButton type="submit" disabled={submitting} fullWidth>
        {submitting ? t("auth.reset.submitting") : t("auth.reset.submit")}
      </CmvButton>
    </form>
  );
}
