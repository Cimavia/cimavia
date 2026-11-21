declare function CmvText(_: { className: string }): null;
declare function Icon(_: { color?: string; tintColor?: string; thumbColor?: string; style?: object }): null;
declare const cmvColors: Record<string, Record<string, string>>;

export const error = <CmvText className="text-cmv-error text-sm"/>; // ✗ noStateColorAsText
export const today = (isToday: boolean) => (isToday ? "text-cmv-accent text-xs" : "text-cmv-text-lo"); // ✗ noStateColorAsText
export const icon = <Icon color={cmvColors.error.DEFAULT} />; // ✗ noStateColorAsText
export const iconHi = (on: boolean) => <Icon color={on ? cmvColors.accent.hi : cmvColors.text.lo} />; // ✗ noStateColorAsText
export const styled = <Icon style={{ color: cmvColors.warning.DEFAULT }} />; // ✗ noStateColorAsText
export const iconFill = <Icon color={cmvColors.accent.fill} />; // ✗ noStateColorAsText

// La nuance -on écrit le texte ; un contrôle natif teinté garde le DEFAULT.
export const on = <CmvText className="text-cmv-accent-on text-xs"/>;
export const iconOn = <Icon color={cmvColors.error.on} />;
export const spinner = <Icon tintColor={cmvColors.accent.DEFAULT} />;
export const toggle = <Icon thumbColor={cmvColors.accent.DEFAULT} />;
export const fill = <Icon style={{ backgroundColor: cmvColors.accent.fill, color: cmvColors.text["on-fill"] }} />;
