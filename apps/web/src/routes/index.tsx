import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background">
      <h1 className="font-display text-title text-text-hi">cimavia</h1>
    </main>
  );
}
