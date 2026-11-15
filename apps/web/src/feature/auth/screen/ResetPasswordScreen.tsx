import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@cmv/shared";
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
 * Ce que dit un refus de Better Auth à l'envoi.
 *
 * - **`INVALID_TOKEN`, `USER_NOT_FOUND`** : le lien est mort — jeton inconnu, déjà consommé ou
 *   expiré, ou compte supprimé depuis l'envoi de l'e-mail (#256). Rien de ce qu'on tape n'y
 *   changera : le formulaire laisse la place au lien mort (#437).
 * - **`PASSWORD_TOO_LONG`** : le lien marche, le mot de passe dépasse la borne de l'API. Le champ
 *   ne porte pas de `maxLength` pour ça : il tronquerait EN SILENCE un mot de passe collé ou généré,
 *   et celui qu'aurait retenu le gestionnaire ne serait plus celui du compte.
 * - **429** : la limite de débit — il faut attendre, pas réessayer tout de suite.
 * - le reste : le générique. Aucun ne doit passer pour un lien mort : on redemanderait un e-mail
 *   pour rien.
 */
function resetRefusal(error: Readonly<{ status?: number; code?: string | undefined }>) {
  if (error.code === "INVALID_TOKEN" || error.code === "USER_NOT_FOUND") return "deadLink";
  if (error.code === "PASSWORD_TOO_LONG") return "auth.reset.passwordTooLong";
  if (error.status === 429) return "auth.errors.tooManyAttempts";
  return "auth.errors.generic";
}

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
 */
export function ResetPasswordScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { token: tokenInUrl, error: linkError } = route.useSearch();
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
    if (linkError !== undefined) {
      return <LinkNotice role="alert">{t("auth.reset.invalidToken")}</LinkNotice>;
    }
    if (token == null) {
      return <LinkNotice role="status">{t("auth.reset.missingToken")}</LinkNotice>;
    }
    // Refusé à l'envoi, le lien est mort comme s'il était arrivé refusé : l'URL le dit, et une page
    // rechargée ne prétendra pas qu'il marche peut-être encore.
    const onLinkRefused = () =>
      navigate({ to: "/reset-password", search: { error: "INVALID_TOKEN" }, replace: true });
    return <ResetPasswordForm token={token} onLinkRefused={onLinkRefused} />;
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
  onLinkRefused,
}: Readonly<{ token: string; onLinkRefused: () => void }>) {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const { error: resetError } = await authClient.resetPassword({
        newPassword: password,
        token,
      });
      if (resetError) {
        const refusal = resetRefusal(resetError);
        if (refusal === "deadLink") onLinkRefused();
        else setError(t(refusal, { max: PASSWORD_MAX_LENGTH }));
        return;
      }
      setDone(true);
    } catch {
      setError(t("auth.errors.generic"));
    } finally {
      setSubmitting(false);
    }
  }

  if (done) return <p className="text-sm text-cmv-text-mid">{t("auth.reset.success")}</p>;

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
