import { type AthleteRow, type AthleteRowFilter, visibleAthleteRows } from "@cmv/shared";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { AthleteTrackingTable } from "@/feature/dashboard/component/AthleteTrackingTable";
import { AthleteTrackingToolbar } from "@/feature/dashboard/component/AthleteTrackingToolbar";
import { CmvButton, CmvEmptyState } from "@/shared/component";

const route = getRouteApi("/");

type AthleteTrackingSectionProps = {
  /** Non vide ou vide, mais JAMAIS `null` : l'écran ne monte pas la section sans liste d'athlètes. */
  rows: readonly AthleteRow[];
  /** La liste des cycles a répondu — sans elle, les filtres d'état de cycle ne veulent rien dire. */
  plansLoaded: boolean;
  onOpenSheet: (athleteId: string) => void;
  onInvite: () => void;
};

/**
 * Le tableau de suivi et sa barre d'outils (#113, #123).
 *
 * La section possède l'état de sa barre — lu dans l'URL, pas dans un `useState` — plutôt que de le
 * recevoir en props : les quatre décisions qui en dépendent (que filtrer, quoi rendre, quel état
 * vide, comment réinitialiser) tiennent alors dans un seul endroit, et le tableau de bord n'a pas à
 * connaître un réglage d'affichage qui ne le regarde pas.
 */
export function AthleteTrackingSection({
  rows,
  plansLoaded,
  onOpenSheet,
  onInvite,
}: Readonly<AthleteTrackingSectionProps>) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { q, filter: urlFilter } = route.useSearch();

  /**
   * `replace` sur les deux : la barre est un RÉGLAGE DE VUE, pas une étape de navigation. Sans lui,
   * chaque frappe au clavier empilerait une entrée d'historique et le bouton Retour rembobinerait
   * la saisie au lieu de quitter le tableau de bord.
   */
  const setSearch = (next: string) =>
    navigate({ to: "/", search: { q: next || undefined, filter: urlFilter }, replace: true });
  // « Tous » ne s'écrit pas dans l'URL : c'est la valeur par défaut, l'y laisser serait du bruit.
  const setFilter = (next: AthleteRowFilter) =>
    navigate({ to: "/", search: { q, filter: next === "ALL" ? undefined : next }, replace: true });
  const reset = () =>
    navigate({ to: "/", search: { q: undefined, filter: undefined }, replace: true });

  /**
   * Un `?filter=` hérité d'un chargement précédent est IGNORÉ quand les cycles n'ont pas pu être
   * lus, jamais appliqué : `AthleteRow.plan` vaut alors `null` pour tout le monde, et « Sans plan »
   * annoncerait l'écurie entière comme étant à planifier.
   */
  const filter: AthleteRowFilter = plansLoaded ? (urlFilter ?? "ALL") : "ALL";
  const search = q ?? "";

  // Sélection ET ordre viennent de `@cmv/shared`, testés : la section ne fait que les rendre.
  const visible = visibleAthleteRows(rows, { search, filter, locale: i18n.language });
  const isFiltered = search !== "" || filter !== "ALL";

  return (
    <section className="flex flex-col gap-cmv-md">
      <h2 className="text-cmv-caption text-cmv-text-mid uppercase tracking-wide">
        {t("dashboard.section.athletes")}
      </h2>

      {/* Rien à chercher dans une écurie vide : la barre n'apparaît qu'avec des lignes. */}
      {rows.length === 0 ? null : (
        <AthleteTrackingToolbar
          search={search}
          filter={filter}
          canFilterByPlan={plansLoaded}
          onSearchChange={setSearch}
          onFilterChange={setFilter}
        />
      )}

      <AthleteTrackingBody
        isEmpty={rows.length === 0}
        isFiltered={isFiltered}
        visible={visible}
        plansLoaded={plansLoaded}
        onOpenSheet={onOpenSheet}
        onInvite={onInvite}
        onReset={reset}
      />
    </section>
  );
}

type AthleteTrackingBodyProps = {
  isEmpty: boolean;
  isFiltered: boolean;
  visible: readonly AthleteRow[];
  plansLoaded: boolean;
  onOpenSheet: (athleteId: string) => void;
  onInvite: () => void;
  onReset: () => void;
};

/**
 * Trois issues, et surtout PAS deux : « vous n'avez aucun athlète » et « aucun athlète ne
 * correspond » ne disent pas la même chose, et confondre les deux enverrait un coach inviter
 * quelqu'un parce qu'il a mal tapé un nom. L'état filtré propose donc de réinitialiser, jamais
 * d'inviter.
 */
function AthleteTrackingBody({
  isEmpty,
  isFiltered,
  visible,
  plansLoaded,
  onOpenSheet,
  onInvite,
  onReset,
}: Readonly<AthleteTrackingBodyProps>) {
  const { t } = useTranslation();

  if (isEmpty) {
    return (
      <CmvEmptyState
        title={t("athlete.empty.title")}
        description={t("athlete.empty.description")}
        action={<CmvButton onClick={onInvite}>{t("athlete.invite")}</CmvButton>}
      />
    );
  }

  if (visible.length === 0) {
    return (
      <CmvEmptyState
        title={t("dashboard.table.noMatch.title")}
        description={t("dashboard.table.noMatch.description")}
        action={
          <CmvButton variant="ghost" onClick={onReset}>
            {t("dashboard.table.noMatch.reset")}
          </CmvButton>
        }
      />
    );
  }

  return (
    <>
      {/* Le compte ne s'affiche QUE sur une vue filtrée : sur la liste entière il redirait la tuile
          « Athlètes suivis », à 300 px au-dessus. */}
      {isFiltered ? (
        <p className="text-cmv-caption text-cmv-text-mid">
          {t("dashboard.table.matchCount", { count: visible.length })}
        </p>
      ) : null}
      <AthleteTrackingTable rows={visible} canOfferPlan={plansLoaded} onOpenSheet={onOpenSheet} />
    </>
  );
}
