"use client";
import { useEffect } from "react";

/** Root error boundary: a friendly recovery screen instead of a raw stack. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="grid min-h-screen place-items-center px-6">
      <div className="card max-w-md p-8 text-center">
        <p className="text-4xl">🎸</p>
        <h1 className="mt-3 text-xl font-semibold text-white">Er ging iets mis</h1>
        <p className="mt-2 text-sm text-white/60">
          Dat was een valse noot van onze kant. Probeer het opnieuw — meestal is het zo verholpen.
        </p>
        <button
          onClick={reset}
          className="mt-5 inline-flex items-center justify-center rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white shadow-glow transition hover:opacity-90"
        >
          Opnieuw proberen
        </button>
      </div>
    </main>
  );
}
