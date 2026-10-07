import type { AccountType, TrainingCapability } from "@cmv/shared";
import {
  ACCOUNT_TYPES,
  PASSWORD_MIN_LENGTH,
  SELECTABLE_CAPABILITIES,
  signUpCapabilities,
  signUpErrorKey,
  toggledCapability,
} from "@cmv/shared";
import { useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, useNavigate } from "@tanstack/react-router";
import { type SubmitEvent, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import type { IconType } from "react-icons";
import {
  IoBusinessOutline,
  IoCheckmark,
  IoCheckmarkCircle,
  IoEllipseOutline,
  IoPersonOutline,
} from "react-icons/io5";
import { CmvButton } from "@/shared/component/CmvButton";
import { CmvTextField } from "@/shared/component/CmvTextField";
import { resetAccountData } from "@/shared/lib/account-reset";
import { authClient } from "@/shared/lib/auth";
import { AuthLayout } from "../component/AuthLayout";

const TYPE_ICONS: Record<AccountType, IconType> = {
  training: IoPersonOutline,
  company: IoBusinessOutline,
};

const CHOICE_BASE = "cursor-pointer border focus-within:ring-2 focus-within:ring-cmv-accent";
const CHOICE_ON = `${CHOICE_BASE} border-cmv-accent bg-cmv-accent-soft`;
const CHOICE_OFF = `${CHOICE_BASE} border-cmv-border bg-cmv-surface hover:border-cmv-border-hi`;

export function RegisterScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const hintId = useId();
  const { data: session, isPending } = authClient.useSession();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Aucun type au départ (#595) : le choix est exclusif et engage le compte pour de bon — une
  // entreprise ne deviendra jamais coach —, il ne se présélectionne donc pas.
  const [type, setType] = useState<AccountType | null>(null);
  const [capabilities, setCapabilities] = useState<Set<TrainingCapability>>(new Set(["athlete"]));
  // À part de `error` : la maquette le place sous les cases, et il s'efface dès qu'on en coche une.
  const [noCapability, setNoCapability] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!isPending && session) {
    return <Navigate to="/" search={{ q: undefined, filter: undefined, athlete: undefined }} />;
  }

  const chosen = ACCOUNT_TYPES.find((option) => option.type === type);

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (type == null) return;
    // Garde côté client EN PLUS de celle de l'API (400) : un compte sans capacité se retrouverait
    // devant une application vide, et le dire ici évite un aller-retour pour l'apprendre.
    const signUp = signUpCapabilities(type, capabilities);
    if (signUp == null) {
      setNoCapability(true);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const { error: signUpError } = await authClient.signUp.email({
        email,
        password,
        name,
        ...signUp,
      });
      if (signUpError) {
        setError(t(signUpErrorKey(signUpError.status)));
        return;
      }
      // Même raison qu'à la connexion : rien du compte précédent ne doit survivre au changement.
      resetAccountData(queryClient);
      navigate({ to: "/", search: { q: undefined, filter: undefined, athlete: undefined } });
    } catch {
      setError(t("auth.errors.generic"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout title={t("auth.register.title")}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <fieldset className="flex flex-col gap-cmv-md">
          <legend className="mb-cmv-lg text-cmv-text-lo">{t("auth.register.lead")}</legend>
          <div className="flex gap-cmv-md">
            {ACCOUNT_TYPES.map((option) => {
              const checked = option.type === type;
              const Icon = TYPE_ICONS[option.type];
              const Mark = checked ? IoCheckmarkCircle : IoEllipseOutline;
              return (
                // Un vrai bouton radio, masqué mais présent pour le clavier et les lecteurs
                // d'écran : les deux cartes sont EXCLUSIVES, ce que des cases ne diraient pas.
                <label
                  key={option.type}
                  className={`relative flex-1 rounded-cmv-lg p-cmv-lg ${checked ? CHOICE_ON : CHOICE_OFF}`}
                >
                  {/* Le titre nomme la carte, l'explication la décrit : sans ce partage, le lecteur
                      d'écran les lirait d'un seul tenant, comme un unique long nom. */}
                  <input
                    type="radio"
                    name="accountType"
                    className="sr-only"
                    aria-label={t(option.labelKey)}
                    aria-describedby={`${hintId}-${option.type}`}
                    checked={checked}
                    onChange={() => setType(option.type)}
                  />
                  <Mark
                    aria-hidden="true"
                    className={`absolute top-cmv-md right-cmv-md ${checked ? "text-cmv-accent" : "text-cmv-border-hi"}`}
                  />
                  <Icon
                    aria-hidden="true"
                    size={24}
                    className={checked ? "text-cmv-accent-on" : "text-cmv-text-lo"}
                  />
                  <span className="mt-cmv-md block font-cmv-heading text-cmv-subtitle text-cmv-text-hi">
                    {t(option.labelKey)}
                  </span>
                  <span
                    id={`${hintId}-${option.type}`}
                    className="mt-cmv-xs block text-cmv-text-mid text-xs"
                  >
                    {t(option.hintKey)}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {type === "training" && (
          <fieldset>
            <legend className="sr-only">{t("auth.register.type.training")}</legend>
            <div className="flex gap-cmv-md">
              {SELECTABLE_CAPABILITIES.map(({ name: capability, labelKey }) => {
                const checked = capabilities.has(capability);
                return (
                  // Deux choix INDÉPENDANTS : de vraies cases, que l'on peut cocher toutes deux.
                  <label
                    key={capability}
                    className={`flex flex-1 items-center gap-cmv-sm rounded-cmv-md px-cmv-md py-cmv-md text-sm ${checked ? `${CHOICE_ON} text-cmv-text-hi` : `${CHOICE_OFF} text-cmv-text-mid`}`}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={checked}
                      onChange={() => {
                        setCapabilities(toggledCapability(capabilities, capability));
                        setNoCapability(false);
                      }}
                    />
                    <span
                      aria-hidden="true"
                      className={`flex size-[18px] shrink-0 items-center justify-center rounded-[5px] ${checked ? "bg-cmv-accent text-cmv-text-hi" : "border border-cmv-border-hi"}`}
                    >
                      {checked && <IoCheckmark size={12} />}
                    </span>
                    {t(labelKey)}
                  </label>
                );
              })}
            </div>
            {noCapability && (
              <p role="alert" className="mt-cmv-sm text-sm text-cmv-error">
                {t("auth.errors.noCapability")}
              </p>
            )}
          </fieldset>
        )}

        {/* Le reste n'apparaît qu'une fois le type choisi : c'est lui qui nomme le champ « nom ».
            Les valeurs vivent dans l'écran, pas dans les champs : changer de carte les garde. */}
        {chosen != null && (
          <>
            <CmvTextField
              label={t(chosen.nameLabelKey)}
              name="name"
              type="text"
              autoComplete={chosen.type === "company" ? "organization" : "name"}
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
            {error != null && <p className="text-sm text-cmv-error">{error}</p>}
            <CmvButton type="submit" disabled={submitting} fullWidth>
              {submitting ? t("auth.register.submitting") : t("auth.register.submit")}
            </CmvButton>
          </>
        )}
      </form>
      <div className="mt-cmv-xl text-center text-sm">
        <Link to="/login" className="font-semibold text-cmv-accent hover:text-cmv-accent-hi">
          {t("auth.register.toLogin")}
        </Link>
      </div>
    </AuthLayout>
  );
}
