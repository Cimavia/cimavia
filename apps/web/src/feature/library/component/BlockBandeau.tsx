import { type BlockStructure, BlockType, emomTopCount } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { CmvDurationField } from "@/shared/component";

// Valeurs attendues derrière les clés i18n assemblées de ce fichier — lues par `pnpm check:i18n`.
// i18n-values library.builder.blockType: BlockType
//
// Les clés de `bandeau` portent le NOM DU CHAMP du schéma (`totalDurationSeconds`, pas
// `totalDuration`) : le marqueur d'ajustement les assemble à partir du champ modifié, et deux
// vocabulaires auraient produit une clé introuvable — ce qui est arrivé.
// i18n-values library.builder.bandeau: setCount, restBetweenSetsSeconds, intervalSeconds, totalDurationSeconds, topCount, targetRounds, roundCount, restBetweenRoundsSeconds

type BandeauProps<T extends BlockStructure> = {
  structure: T;
  onChange: (structure: T) => void;
};

/**
 * Le « bandeau » d'un bloc : ce qui vaut pour TOUTES ses lignes. Un composant par type plutôt
 * qu'un aiguillage unique — chaque type a ses champs, et les mélanger dans une seule fonction
 * produirait exactement la complexité que la porte qualité refuse.
 */
export function BlockBandeau({ structure, onChange }: Readonly<BandeauProps<BlockStructure>>) {
  if (structure.type === BlockType.SERIES) {
    return <SeriesBandeau structure={structure} onChange={onChange} />;
  }
  if (structure.type === BlockType.EMOM) {
    return <EmomBandeau structure={structure} onChange={onChange} />;
  }
  if (structure.type === BlockType.AMRAP) {
    return <AmrapBandeau structure={structure} onChange={onChange} />;
  }
  if (structure.type === BlockType.CIRCUIT) {
    return <CircuitBandeau structure={structure} onChange={onChange} />;
  }
  // Libre : aucun paramètre d'ensemble. Ce n'est pas un manque — c'est le cas où rien ne vaut
  // pour toutes les lignes, et où le bandeau n'a donc rien à montrer.
  return null;
}

function CountField({
  label,
  value,
  min,
  onChange,
}: Readonly<{ label: string; value: number; min: number; onChange: (value: number) => void }>) {
  return (
    <label className="flex items-center gap-cmv-sm">
      <span className="whitespace-nowrap text-cmv-caption text-cmv-text-mid">{label}</span>
      <input
        type="number"
        min={min}
        value={value}
        onChange={(event) => {
          const parsed = Number.parseInt(event.target.value, 10);
          // Un champ vidé ne vaut pas zéro : on ignore, le champ garde sa dernière valeur.
          if (Number.isFinite(parsed) && parsed >= min) onChange(parsed);
        }}
        className="w-16 rounded-cmv-sm border border-cmv-border bg-cmv-surface px-cmv-sm py-cmv-xs text-cmv-body text-cmv-text-hi outline-none focus:border-cmv-accent"
      />
    </label>
  );
}

/**
 * Le bandeau tient sur UNE ligne : ses champs sont courts (un nombre, une durée) et les empiler
 * étirait la carte de bloc sans rien ajouter. Le libellé passe à gauche du champ plutôt qu'au-
 * dessus, ce qui divise la hauteur par deux.
 */
function Row({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="flex flex-wrap items-center gap-cmv-lg">{children}</div>;
}

function SeriesBandeau({
  structure,
  onChange,
}: Readonly<BandeauProps<Extract<BlockStructure, { type: "SERIES" }>>>) {
  const { t } = useTranslation();
  return (
    <Row>
      <CountField
        label={t("library.builder.bandeau.setCount")}
        value={structure.setCount}
        min={1}
        onChange={(setCount) => onChange({ ...structure, setCount })}
      />
      <CmvDurationField
        label={t("library.builder.bandeau.restBetweenSetsSeconds")}
        value={structure.restBetweenSetsSeconds}
        onChange={(restBetweenSetsSeconds) => onChange({ ...structure, restBetweenSetsSeconds })}
        placeholder="2'30"
      />
    </Row>
  );
}

function EmomBandeau({
  structure,
  onChange,
}: Readonly<BandeauProps<Extract<BlockStructure, { type: "EMOM" }>>>) {
  const { t } = useTranslation();
  return (
    <Row>
      <CmvDurationField
        label={t("library.builder.bandeau.intervalSeconds")}
        value={structure.intervalSeconds}
        onChange={(seconds) =>
          // L'intervalle n'est pas nullable : un EMOM sans intervalle n'est pas un EMOM.
          seconds == null ? undefined : onChange({ ...structure, intervalSeconds: seconds })
        }
        placeholder="1'"
      />
      <CmvDurationField
        label={t("library.builder.bandeau.totalDurationSeconds")}
        value={structure.totalDurationSeconds}
        onChange={(seconds) =>
          seconds == null ? undefined : onChange({ ...structure, totalDurationSeconds: seconds })
        }
        placeholder="10'"
      />
      {/* DÉRIVÉ, jamais stocké : un nombre de tops enregistré finirait par contredire les deux
          durées dont il découle. */}
      <span className="text-cmv-caption text-cmv-text-mid">
        {t("library.builder.bandeau.topCount", { count: emomTopCount(structure) })}
      </span>
    </Row>
  );
}

function AmrapBandeau({
  structure,
  onChange,
}: Readonly<BandeauProps<Extract<BlockStructure, { type: "AMRAP" }>>>) {
  const { t } = useTranslation();
  return (
    <Row>
      <CmvDurationField
        label={t("library.builder.bandeau.totalDurationSeconds")}
        value={structure.totalDurationSeconds}
        onChange={(seconds) =>
          seconds == null ? undefined : onChange({ ...structure, totalDurationSeconds: seconds })
        }
        placeholder="8'"
      />
      <CountField
        label={t("library.builder.bandeau.targetRounds")}
        // L'objectif est INDICATIF et nullable ; 1 est le plancher quand le coach en pose un.
        value={structure.targetRounds ?? 1}
        min={1}
        onChange={(targetRounds) => onChange({ ...structure, targetRounds })}
      />
    </Row>
  );
}

function CircuitBandeau({
  structure,
  onChange,
}: Readonly<BandeauProps<Extract<BlockStructure, { type: "CIRCUIT" }>>>) {
  const { t } = useTranslation();
  return (
    <Row>
      <CountField
        label={t("library.builder.bandeau.roundCount")}
        value={structure.roundCount}
        min={1}
        onChange={(roundCount) => onChange({ ...structure, roundCount })}
      />
      <CmvDurationField
        label={t("library.builder.bandeau.restBetweenRoundsSeconds")}
        value={structure.restBetweenRoundsSeconds}
        onChange={(restBetweenRoundsSeconds) =>
          onChange({ ...structure, restBetweenRoundsSeconds })
        }
        placeholder="3'"
      />
    </Row>
  );
}
