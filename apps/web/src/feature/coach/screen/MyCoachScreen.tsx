import type { CoachAthleteDto } from "@cmv/shared";
import { Link } from "@tanstack/react-router";
import { type SubmitEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAcceptInvitation, useMyCoach } from "@/feature/coach/hook/useMyCoach";
import {
  CmvAppShell,
  CmvAvatar,
  CmvButton,
  CmvCard,
  CmvErrorState,
  CmvTextField,
} from "@/shared/component";
import { apiErrorMessage } from "@/shared/lib/api";
import { formatDate } from "@/shared/util/date.util";

/**
 * « Mon coach » côté web (#28) — équivalent de `JoinCoachScreen` sur mobile, dont il reprend le
 * flux : soit l'athlète est lié et on le lui montre, soit il ne l'est pas et on lui demande son
 * code d'invitation.
 *
 * Trois états, comme la maquette : lié, aucun coach, code refusé. Ils ne sont pas trois variantes
 * d'un même écran mais trois situations distinctes — d'où deux rendus séparés plutôt qu'un
 * formulaire qu'on désactiverait.
 */
export function MyCoachScreen() {
  const { t } = useTranslation();
  const { data: coach, isPending, isError, refetch } = useMyCoach();

  return (
    <CmvAppShell title={t("coach.title")} subtitle={t("coach.subtitle")}>
      {isPending ? <p className="text-cmv-text-mid">{t("common.loading")}</p> : null}

      {/* Panne réseau et « pas de coach » sont deux choses différentes : afficher le formulaire de
          code sur une API injoignable inviterait l'athlète à rejoindre un coach qu'il a déjà. */}
      {isError ? (
        <CmvErrorState
          title={t("common.errorTitle")}
          description={t("common.errorDescription")}
          retryLabel={t("common.retry")}
          onRetry={() => refetch()}
        />
      ) : null}

      {!isPending && !isError ? (
        coach == null ? (
          <JoinCoachForm />
        ) : (
          <LinkedCoachCard coach={coach} />
        )
      ) : null}
    </CmvAppShell>
  );
}

/**
 * L'athlète est lié. Le bouton « Message » de la maquette est là depuis #29 — il attendait sa
 * destination, `/messages` étant fermée à l'athlète jusque-là. Un bouton qui renvoie à l'accueil
 * est exactement le cul-de-sac que cette épic supprime.
 */
function LinkedCoachCard({ coach }: Readonly<{ coach: CoachAthleteDto }>) {
  const { t } = useTranslation();

  return (
    <CmvCard>
      <div className="flex items-center gap-cmv-md">
        <CmvAvatar name={coach.coachName} />
        <div className="flex flex-1 flex-col gap-cmv-xs">
          <h2 className="text-cmv-subtitle text-cmv-text-hi">{coach.coachName}</h2>
          {/* `joinedAt` est nullable (la relation peut avoir été posée sans passer par une
              acceptation) : « — » plutôt qu'une date inventée. */}
          <p className="text-cmv-caption text-cmv-text-mid">
            {coach.joinedAt == null
              ? t("coach.linked.sinceUnknown")
              : t("coach.linked.since", { date: formatDate(coach.joinedAt.slice(0, 10)) })}
          </p>
        </div>

        <Link
          to="/messages"
          // `?athlete=` désigne le fil ouvert côté coach : l'athlète n'en a qu'un, le paramètre
          // reste donc absent. La clé est REQUISE mais peut valoir undefined (cf. la route).
          // `as` : c'est un écran d'athlète, le fil s'ouvre donc à ce titre.
          search={{ athlete: undefined, as: "athlete" }}
          className="inline-flex items-center rounded-cmv-md border border-cmv-border px-cmv-lg py-cmv-sm text-cmv-body text-cmv-text-mid transition-colors hover:border-cmv-border-hi hover:text-cmv-text-hi"
        >
          {t("coach.linked.message")}
        </Link>
      </div>
    </CmvCard>
  );
}

// L'athlète n'a pas de coach : on lui demande le code que le sien lui a communiqué.
function JoinCoachForm() {
  const { t } = useTranslation();
  const accept = useAcceptInvitation();
  const [code, setCode] = useState("");

  const trimmed = code.trim();

  function onSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (trimmed.length === 0 || accept.isPending) return;
    accept.mutate({ code: trimmed });
  }

  return (
    <CmvCard>
      <form className="flex max-w-md flex-col gap-cmv-md" onSubmit={onSubmit}>
        <div className="flex flex-col gap-cmv-xs">
          <h2 className="text-cmv-subtitle text-cmv-text-hi">{t("coach.missing.title")}</h2>
          <p className="text-cmv-body text-cmv-text-mid">{t("coach.missing.description")}</p>
        </div>

        {/* Le message du serveur d'abord : il dit précisément ce qui cloche (code inconnu, expiré,
            déjà consommé) là où un libellé unique devrait rester vague. La seconde ligne, elle,
            donne le recours — c'est ce qui manque toujours à un message d'erreur d'API. */}
        {accept.isError ? (
          <div className="flex flex-col gap-cmv-xs rounded-cmv-md border border-cmv-error-line bg-cmv-error-soft px-cmv-md py-cmv-sm">
            <p className="text-cmv-body text-cmv-error-on">
              {apiErrorMessage(accept.error) ?? t("coach.join.errorTitle")}
            </p>
            <p className="text-cmv-caption text-cmv-text-mid">{t("coach.join.errorDescription")}</p>
          </div>
        ) : null}

        <CmvTextField
          label={t("coach.join.codeLabel")}
          name="invitation-code"
          placeholder={t("coach.join.codePlaceholder")}
          value={code}
          onChange={(event) => setCode(event.target.value)}
          // Un code se saisit tel quel : ni complétion, ni correction.
          autoComplete="off"
        />

        <div>
          <CmvButton type="submit" disabled={accept.isPending || trimmed.length === 0}>
            {accept.isPending ? t("coach.join.joining") : t("coach.join.submit")}
          </CmvButton>
        </div>
      </form>
    </CmvCard>
  );
}
