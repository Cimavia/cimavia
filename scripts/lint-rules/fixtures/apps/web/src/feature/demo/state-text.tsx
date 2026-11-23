export const error = <p className="text-cmv-caption text-cmv-error"/>; // ✗ noStateColorAsText
export const link = <a className="text-cmv-accent hover:underline"/>; // ✗ noStateColorAsText
export const hover = "text-cmv-text-hi hover:text-cmv-accent"; // ✗ noStateColorAsText
export const last = "text-cmv-success"; // ✗ noStateColorAsText
export const inTemplate = `shrink-0 text-cmv-info ${link}`; // ✗ noStateColorAsText
export const warning = <span className="text-cmv-warning" />; // ✗ noStateColorAsText
export const key = { "text-cmv-error": true }; // ✗ noStateColorAsText
export type Tone = "text-cmv-accent"; // ✗ noStateColorAsText
export const placeholder = "placeholder-cmv-info"; // ✗ noStateColorAsText
export const split = `text-cmv-error${link}`; // ✗ noStateColorAsText
export const accentHi = "text-cmv-accent-hi"; // ✗ noStateColorAsText
export const softText = "hover:text-cmv-error-soft"; // ✗ noStateColorAsText
export const lineText = "text-cmv-info-line/50"; // ✗ noStateColorAsText
export const fillText = "text-cmv-accent-fill hover:text-cmv-accent-fill-hover"; // ✗ noStateColorAsText
export const violet = "font-cmv-display text-cmv-violet"; // ✗ noStateColorAsText

// Seule la nuance -on écrit du texte ; aplats et bordures restent libres, survol compris.
export const on = <p className="text-cmv-error-on"/>;
export const fillHover = "bg-cmv-accent-fill hover:bg-cmv-accent-fill-hover text-cmv-text-on-fill";
export const accentHover = "bg-cmv-accent hover:bg-cmv-accent-hi border-cmv-accent-line";
export const fill = <span className="bg-cmv-accent border-cmv-error text-cmv-text-hi" />;
export const soft = "bg-cmv-error-soft text-cmv-error-on";
export const keyOn = { "text-cmv-error-on": true };
export const placeholderOn = "placeholder-cmv-info-on";
export const violetOn = "text-cmv-violet-on hover:underline";
