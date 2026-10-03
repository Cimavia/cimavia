import { useRef, useState } from "react";
import { type GestureResponderEvent, View } from "react-native";
import { nudge, positionAt } from "../util/seek.util";

/**
 * Au-delà de cet écart (en dp), un toucher devient un geste : c'est le seuil du défilement natif
 * d'Android, et celui à partir duquel le curseur décide qui, de lui ou de la liste, garde le doigt.
 */
const DRAG_SLOP = 8;

type CmvSeekBarProps = {
  /** Position montrée, en secondes. */
  position: number;
  /** Durée de la note ; `null` tant qu'on ne la connaît pas — la barre ne vise alors rien. */
  total: number | null;
  /** Barre inerte : la note ne peut pas être lue (#304). */
  disabled?: boolean;
  /** Ce que le lecteur d'écran annonce de la barre, et sa valeur (« 0:45 sur 1:30 »). */
  label: string;
  valueText: string;
  /** Le doigt glisse : la position qu'il vise, `null` quand il lâche ou que le geste est repris. */
  onScrub: (seconds: number | null) => void;
  /** Le saut est décidé : appui, relâché d'un glissé, ou pas d'accessibilité. */
  onSeek: (seconds: number) => void;
};

/**
 * Curseur de lecture qu'on tape ou qu'on glisse (#536). Contrôlé : il ne connaît ni le lecteur ni
 * le temps, il rend des positions.
 *
 * DEUX zones imbriquées, comme le curseur natif d'Android dans une liste qui défile :
 * - l'intérieure prend le doigt dès le toucher, SANS bloquer le défilement natif. Un toucher bref y
 *   saute ; un mouvement vertical laisse la liste le reprendre ;
 * - l'extérieure ne le prend qu'au-delà de `DRAG_SLOP` horizontaux, et bloque ALORS le défilement
 *   jusqu'au relâché — le doigt peut dériver verticalement sans perdre le glissé.
 *
 * Une seule vue ne peut pas faire les deux : bloquer ou non le défilement se décide à la prise du
 * doigt, une fois pour toutes. D'où les props du système de responder, et non `PanResponder` qui
 * les enveloppe : il bloque le défilement par défaut et calcule son `dx` sur des horodatages que le
 * harnais rend égaux.
 *
 * `locationX` n'est lu qu'au premier contact : sur Android, il se recalcule ensuite sur la vue SOUS
 * le doigt, plus sur la barre. Le glissé suit donc l'écart de `pageX`.
 */
export function CmvSeekBar({
  position,
  total,
  disabled = false,
  label,
  valueText,
  onScrub,
  onSeek,
}: Readonly<CmvSeekBarProps>) {
  const [width, setWidth] = useState(0);
  const startRef = useRef({ locationX: 0, pageX: 0, pageY: 0 });
  const inert = disabled || total == null || total <= 0;

  const targetOf = (event: GestureResponderEvent) => {
    const start = startRef.current;
    return positionAt(start.locationX + event.nativeEvent.pageX - start.pageX, width, total);
  };
  const isHorizontalDrag = (event: GestureResponderEvent) => {
    const dx = Math.abs(event.nativeEvent.pageX - startRef.current.pageX);
    const dy = Math.abs(event.nativeEvent.pageY - startRef.current.pageY);
    return dx > DRAG_SLOP && dx > dy;
  };
  const release = (event: GestureResponderEvent) => {
    const target = targetOf(event);
    if (target != null) onSeek(target);
  };

  const progress = total != null && total > 0 ? Math.min(1, Math.max(0, position / total)) : 0;

  return (
    <View
      className="h-3 flex-1 justify-center"
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      // `aria-value*` et non `accessibilityValue` : même valeur native, mais `react-native-web` ne
      // rend que celles-ci — l'objet hérité serait invisible des tests (dette Q-6).
      aria-valuemin={0}
      aria-valuemax={Math.round(total ?? 0)}
      aria-valuenow={Math.round(position)}
      aria-valuetext={valueText}
      aria-disabled={inert}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(event) => {
        if (inert || total == null) return;
        onSeek(nudge(position, event.nativeEvent.actionName === "increment" ? 1 : -1, total));
      }}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      onMoveShouldSetResponder={(event) => !inert && isHorizontalDrag(event)}
      onResponderGrant={(event) => {
        onScrub(targetOf(event));
        // Rendre `true` bloque le défilement natif tant que le doigt glisse.
        return true;
      }}
      onResponderMove={(event) => onScrub(targetOf(event))}
      onResponderRelease={(event) => {
        onScrub(null);
        release(event);
      }}
      onResponderTerminate={() => onScrub(null)}
      onResponderTerminationRequest={() => false}
    >
      {/* `box-only` : seule cette vue reçoit le doigt, jamais le trait ni la pastille — sinon
          `locationX` serait relatif à eux. Il l'empêche aussi d'être aplatie par Fabric, ce qui la
          retirerait des cibles tactiles. Le `hitSlop` élargit la zone sans hausser la ligne. */}
      <View
        className="h-full justify-center"
        pointerEvents="box-only"
        hitSlop={{ top: 10, bottom: 10 }}
        onStartShouldSetResponder={() => !inert}
        onResponderGrant={(event) => {
          const { locationX, pageX, pageY } = event.nativeEvent;
          startRef.current = { locationX, pageX, pageY };
        }}
        onResponderRelease={(event) => {
          // Un doigt parti à la verticale cherchait la liste, pas la note.
          if (Math.abs(event.nativeEvent.pageY - startRef.current.pageY) <= DRAG_SLOP) {
            release(event);
          }
        }}
        onResponderTerminationRequest={() => true}
      >
        <View className="h-1 overflow-hidden rounded-full bg-cmv-border">
          {/* Largeur et position dynamiques (pourcentage de progression) : valeurs, pas classes —
              aucune couleur ici, juste de la mise en page. */}
          <View className="h-full bg-cmv-text-hi" style={{ width: `${progress * 100}%` }} />
        </View>
        <View
          className="absolute top-0 size-3 rounded-full bg-cmv-text-hi"
          style={{ left: `${progress * 100}%`, marginLeft: -6 }}
        />
      </View>
    </View>
  );
}
