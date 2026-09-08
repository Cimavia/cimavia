import type {
  AthleteCalendarBounds,
  AthleteCalendarWeek,
  ScheduledSessionSummaryDto,
} from "@cmv/shared";
import { athleteWeekNeighbours, weekSessionProgress } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { CmvText } from "@/shared/component";
import { formatDateRange } from "@/shared/util/date.util";

type WeekNavHeaderProps = {
  week: AthleteCalendarWeek<ScheduledSessionSummaryDto>;
  bounds: AthleteCalendarBounds | null;
  /** Vrai tant que l'athlète n'a choisi aucune semaine — c'est ce qui ferme « Aujourd'hui ». */
  isDefault: boolean;
  /** `null` = revenir au défaut, et non « le lundi d'aujourd'hui » — cf. `PlanningScreen`. */
  onGoToMonday: (monday: string | null) => void;
};

/**
 * Le bandeau de tête du planning athlète : quelle semaine on regarde, où on en est, et de quoi en
 * changer (#236).
 *
 * Il coiffe l'écran HORS du `ScrollView` : les sept jours défilent dessous et les commandes restent
 * sous le pouce, sans avoir à remonter. Même disposition que les onglets de `SessionsScreen`.
 *
 * La plage de dates a remplacé le titre « Cette semaine » : dès qu'on peut en regarder une autre,
 * ce titre ment une fois sur deux. Les dates, elles, disent toujours vrai — et « Aujourd'hui »
 * fermé dit qu'on y est.
 */
export function WeekNavHeader({
  week,
  bounds,
  isDefault,
  onGoToMonday,
}: Readonly<WeekNavHeaderProps>) {
  const { t } = useTranslation();

  // La dérivation vit dans @cmv/shared, testée : « fait » n'a qu'une définition, et le web affiche
  // le même compteur (#25).
  const progress = weekSessionProgress(
    week.days.flatMap((day) => day.entries.map((entry) => entry.session)),
  );
  // Où s'arrête la plage est tranché dans @cmv/shared : les deux clients se borneraient sinon
  // différemment sur les mêmes cycles (#236).
  const { previous, next } = athleteWeekNeighbours(week.startDate, bounds);

  return (
    <View className="gap-2 border-cmv-border border-b px-4 py-3">
      <View className="flex-row items-center justify-between gap-2">
        <CmvText className="font-cmv-display text-cmv-text-hi text-lg">
          {formatDateRange(week.startDate, week.endDate)}
        </CmvText>

        {/* `null` = liste absente : « — », jamais « 0/0 » qui se lirait « semaine de repos ». */}
        <CmvText className="text-cmv-text-lo text-sm">
          {progress == null
            ? "—"
            : t("plan.doneCount", { done: progress.done, total: progress.total })}
        </CmvText>
      </View>

      <View className="flex-row items-center gap-2">
        <WeekNavButton
          label="←"
          accessibilityLabel={t("plan.week.previous")}
          disabled={previous == null}
          onPress={() => onGoToMonday(previous)}
        />
        {/* `null` et non le lundi courant : effacer le choix rend l'écran à son défaut, qui suivra
            le calendrier la semaine prochaine sans qu'on ait à y toucher. */}
        <WeekNavButton
          label={t("plan.week.today")}
          accessibilityLabel={t("plan.week.today")}
          disabled={isDefault}
          onPress={() => onGoToMonday(null)}
          grow
        />
        <WeekNavButton
          label="→"
          accessibilityLabel={t("plan.week.next")}
          disabled={next == null}
          onPress={() => onGoToMonday(next)}
        />
      </View>
    </View>
  );
}

type WeekNavButtonProps = {
  label: string;
  accessibilityLabel: string;
  disabled: boolean;
  onPress: () => void;
  grow?: boolean;
};

/**
 * Une commande de semaine. `CmvButton` ne peut pas servir : il prend toute la largeur, et il en
 * faut trois sur une ligne. D'où la même forme que les onglets de `SessionsScreen` — bordure,
 * `min-h-11` pour la cible tactile.
 *
 * Fermée, la commande reste À SA PLACE, estompée : la retirer ferait sauter la rangée d'un bord à
 * l'autre entre deux semaines, et l'athlète perdrait la cible qu'il vise.
 *
 * Les flèches portent leur libellé en accessibilité (#199) : « ← » ne se lit pas à voix haute, et
 * les trois libellés entiers côte à côte ne tiennent pas en largeur sur un téléphone.
 *
 * Pas d'`accessibilityState={{ disabled }}` : `Pressable` le dérive déjà de `disabled` sur natif, et
 * c'est la prop héritée dont la dette **Q-6** demande de s'éloigner — `react-native-web` ne la mappe
 * sur aucun attribut ARIA, alors que `disabled` seul rend bien `aria-disabled`.
 */
function WeekNavButton({
  label,
  accessibilityLabel,
  disabled,
  onPress,
  grow,
}: Readonly<WeekNavButtonProps>) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      className={`min-h-11 items-center justify-center rounded-lg border border-cmv-border px-4 ${
        grow === true ? "flex-1" : ""
      } ${disabled ? "opacity-40" : ""}`}
    >
      <CmvText className={disabled ? "text-cmv-text-lo text-sm" : "text-cmv-text-mid text-sm"}>
        {label}
      </CmvText>
    </Pressable>
  );
}
