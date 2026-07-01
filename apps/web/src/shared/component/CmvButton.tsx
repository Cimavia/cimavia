import type { ButtonHTMLAttributes, ReactNode } from "react";

type CmvButtonProps = Pick<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "type" | "disabled" | "onClick"
> & {
  children: ReactNode;
};

export function CmvButton({ children, type = "button", disabled, onClick }: CmvButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className="w-full rounded-lg bg-cmv-accent px-4 py-2 text-cmv-text-hi transition-colors hover:bg-cmv-accent-hi disabled:opacity-50"
    >
      {children}
    </button>
  );
}
