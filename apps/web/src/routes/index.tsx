import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-white">
      <h1 className="text-cmv-2xl font-semibold text-cmv-neutral-800">cimavia</h1>
    </main>
  );
}
