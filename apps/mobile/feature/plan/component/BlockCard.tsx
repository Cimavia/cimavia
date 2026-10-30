import {
  type BlockTally,
  BlockTallyState,
  blockHeading,
  flowPhrase,
  gridReading,
  type ReadBlock,
  settingsPhrase,
} from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { ExerciseExtras } from "@/feature/plan/component/ExerciseExtras";
import { GridValues } from "@/feature/plan/component/GridValues";
import { CmvBadge, CmvText } from "@/shared/component";
import { usePhraseText } from "@/shared/hook/usePhraseText";

type BlockCardProps = {
  read: ReadBlock;
  planId: string;
  sessionId: string;
  /** Le décompte du bloc ; `null` quand rien n'est coché — sans pastille. */
  tally: BlockTally | null;
  /** Ouvre l'écran du bloc. Absent sur cet écran : la carte n'y mène nulle part. */
  onOpen?: () => void;
  /**
   * La ligne d'enchaînement sous l'en-tête. L'écran du bloc la remplace par « Un tour », qui dit
   * la même chose en codes.
   */
  showFlow?: boolean;
};

/**
 * Un bloc tel que l'athlète le lit (#722, maquette `athlete_seance_blocs`, composant « Athlète -
 * Bloc lecture ») : son numéro ou son libellé, sa structure, sa phrase et sa consigne, puis chaque
 * exercice sous son code, avec ses valeurs, sa note et sa consigne. Rien ne dit qu'un exercice en
 * remplace un autre : la séance planifiée EST la séance de l'athlète.
 */
export function BlockCard({
  read,
  planId,
  sessionId,
  tally,
  onOpen,
  showFlow = true,
}: Readonly<BlockCardProps>) {
  const { t } = useTranslation();
  const text = usePhraseText();
  const { block, number, exercises, names, labels } = read;
  const count = exercises.length;
  const phrase = settingsPhrase(block.settings, count, names);
  const flow = showFlow ? flowPhrase(block.settings, labels) : null;

  const header = (
    <View className="gap-1">
      <View className="flex-row items-center gap-2">
        <BlockMark number={number} label={block.label} />
        <CmvBadge label={block.name} />
        <View className="flex-1" />
        {tally == null ? null : (
          <CmvBadge
            label={text([tally.label])}
            variant={tally.state === BlockTallyState.DONE ? "success" : "accent"}
          />
        )}
        {/* Un vrai bouton, pas une flèche : c'est par lui que s'ouvrent le suivi et le chrono. */}
        {onOpen == null ? null : (
          <Pressable
            onPress={onOpen}
            accessibilityRole="button"
            accessibilityLabel={t("plan.blocks.open", { block: blockHeading(read) })}
            className="rounded-lg border border-cmv-border px-3 py-2"
          >
            <CmvText className="text-cmv-text-mid text-sm">{t("plan.blocks.openShort")}</CmvText>
          </Pressable>
        )}
      </View>
      {phrase == null ? null : (
        <CmvText className="text-cmv-text-hi text-sm">{text(phrase)}</CmvText>
      )}
      {flow == null ? null : (
        <CmvText className="text-cmv-text-mid text-xs">{text([flow])}</CmvText>
      )}
    </View>
  );

  return (
    <View className="gap-3 rounded-lg border border-cmv-border bg-cmv-surface p-3">
      {header}

      {block.instructions == null ? null : (
        <CmvText className="text-cmv-text-mid text-sm">{block.instructions}</CmvText>
      )}

      <View className="gap-3 border-cmv-border border-l pl-3">
        {exercises.map(({ row, content, code }) => (
          <View key={row.id} className="gap-1">
            <CmvText className="text-cmv-text-hi">
              {code == null ? null : <CmvText className="text-cmv-text-mid">{`${code}  `}</CmvText>}
              {content.title}
            </CmvText>
            <GridValues
              reading={gridReading(row.grid, block.settings, count)}
              customMetrics={content.customMetrics}
            />
            {row.note == null ? null : (
              <CmvText className="text-cmv-text-mid text-sm">{row.note}</CmvText>
            )}
            <ExerciseExtras exercise={content} planId={planId} sessionId={sessionId} />
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * Le numéro encadré d'un bloc, ou son libellé (*Tranché en #719*) : la bordure distingue le numéro
 * du nom de la structure qui le suit.
 */
export function BlockMark({
  number,
  label,
}: Readonly<{ number: string | null; label: string | null }>) {
  if (number == null) {
    return <CmvText className="font-cmv-display text-cmv-text-hi">{label}</CmvText>;
  }
  return (
    // Un carré, pas une pastille : la marque garde sa forme d'un bloc à l'autre.
    <View className="h-7 w-7 items-center justify-center rounded-md border border-cmv-border-hi">
      <CmvText className="font-cmv-mono text-cmv-text-hi text-sm">{number}</CmvText>
    </View>
  );
}
