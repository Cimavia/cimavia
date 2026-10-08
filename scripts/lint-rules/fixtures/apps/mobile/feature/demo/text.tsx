declare function CmvText(_: { children: string }): null;
declare function CmvButton(_: { accessibilityLabel: string; accessibilityHint?: string }): null;

export const child = <CmvText>Séance du jour</CmvText>; // ✗ noHardcodedText
export const a11y = <CmvButton accessibilityLabel="Valider" />; // ✗ noHardcodedText
export const hint = <CmvButton accessibilityLabel="✓" accessibilityHint="Valide la séance" />; // ✗ noHardcodedText
