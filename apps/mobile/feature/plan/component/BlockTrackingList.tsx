import {
  type BlockCheck,
  BlockTallyState,
  blockTally,
  CheckBoxKind,
  checkOf,
  checksOfBlock,
  phraseId,
  type ReadBlock,
  type SessionBlockTracking,
  tickedRows,
  trackingNote,
} from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { CmvBadge, CmvText } from "@/shared/component";
import { usePhraseText } from "@/shared/hook/usePhraseText";

type BlockTrackingListProps = {
  read: ReadBlock;
  tracking: SessionBlockTracking | null;
  onToggle: (check: BlockCheck) => void;
};

/**
 * « Mon suivi » d'un bloc (#722, frame 6) : une case par exercice et par tour, une par série ou par
 * bip, ou la seule case « Bloc fait » d'un autant que possible. Ouvert tout le temps — à l'avance,
 * pendant, après le débrief — et rien ne s'y coche tout seul : le chrono aide, l'athlète coche.
 *
 * Le décompte a trois états, et le troisième est silencieux : jamais « 0 sur 4 », jamais de rouge.
 */
export function BlockTrackingList({ read, tracking, onToggle }: Readonly<BlockTrackingListProps>) {
  const { t } = useTranslation();
  const text = usePhraseText();
  const checks = checksOfBlock(read.block);
  const ticked = tickedRows(checks, tracking);
  const tally = blockTally(checks, tracking);

  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-2">
        <CmvText className="flex-1 font-cmv-display text-cmv-text-hi">
          {t("plan.blocks.tracking")}
        </CmvText>
        {tally == null ? null : (
          <CmvBadge
            label={text([tally.label])}
            variant={tally.state === BlockTallyState.DONE ? "success" : "accent"}
          />
        )}
      </View>

      {checks.rows.map((row, rowIndex) => (
        <View
          // « Tour 2 », « Série 3 » : chaque rangée a son libellé, sauf quand elle est seule.
          key={row.label == null ? "single" : phraseId(row.label)}
          className="flex-row flex-wrap items-center gap-2"
        >
          {row.label == null ? null : (
            <CmvText className="w-20 text-cmv-text-mid text-xs">{text([row.label])}</CmvText>
          )}
          {row.boxes.map((box, boxIndex) => (
            <CheckBox
              key={box.kind === CheckBoxKind.EXERCISE ? box.key : "block"}
              label={
                box.kind === CheckBoxKind.EXERCISE
                  ? (read.labels[box.exerciseIndex] ?? "")
                  : t("plan.blocks.blockDone")
              }
              checked={ticked[rowIndex]?.[boxIndex] === true}
              onPress={() => onToggle(checkOf(rowIndex, box))}
            />
          ))}
        </View>
      ))}

      <CmvText className="text-cmv-text-lo text-xs">{text([trackingNote(checks)])}</CmvText>
    </View>
  );
}

function CheckBox({
  label,
  checked,
  onPress,
}: Readonly<{ label: string; checked: boolean; onPress: () => void }>) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      // 44 px de haut : le minimum tactile, une case ratée en pleine série agace plus qu'elle ne
      // coûte de place.
      className={`min-h-11 min-w-11 flex-row items-center justify-center gap-2 rounded-lg border px-3 ${
        checked ? "border-cmv-success-line bg-cmv-success-soft" : "border-cmv-border bg-cmv-surface"
      }`}
    >
      {checked ? <CmvText className="text-cmv-success-on text-xs">✓</CmvText> : null}
      <CmvText className={checked ? "text-cmv-success-on text-sm" : "text-cmv-text-hi text-sm"}>
        {label}
      </CmvText>
    </Pressable>
  );
}
