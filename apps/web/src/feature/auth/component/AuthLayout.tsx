import type { ReactNode } from "react";

type AuthLayoutProps = {
  title: string;
  children: ReactNode;
};

export function AuthLayout({ title, children }: AuthLayoutProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-cmv-bg-0 p-4">
      <div className="w-full max-w-sm rounded-xl border border-cmv-border bg-cmv-surface p-6">
        <h1 className="mb-6 font-cmv-display text-2xl text-cmv-text-hi">{title}</h1>
        {children}
      </div>
    </main>
  );
}
