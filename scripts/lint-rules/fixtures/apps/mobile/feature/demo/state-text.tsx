declare function CmvText(_: { className: string }): null;

export const error = <CmvText className="text-cmv-error text-sm"/>; // ✗ noStateColorAsText
export const today = (isToday: boolean) => (isToday ? "text-cmv-accent text-xs" : "text-cmv-text-lo"); // ✗ noStateColorAsText

export const on = <CmvText className="text-cmv-accent-on text-xs"/>;
