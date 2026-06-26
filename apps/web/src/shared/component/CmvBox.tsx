import type { HTMLAttributes, ReactNode } from "react";

type CmvBoxProps = Pick<HTMLAttributes<HTMLDivElement>, "className" | "id"> & {
  children: ReactNode;
};

export function CmvBox({ children, className, ...rest }: CmvBoxProps) {
  return (
    <div className={className} {...rest}>
      {children}
    </div>
  );
}
