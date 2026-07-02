"use client";
import { useEffect } from "react";
import Link from "next/link";

/** In-app error boundary: keeps the nav usable and offers a way back. */
export default function AppError({
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
    <div className="grid place-items-center py-24">
      <div className="card max-w-md p-8 text-center">
        <p className="text-4xl">🎧</p>
        <h1 className="mt-3 text-xl font-semibold text-white">Deze pagina haperde even</h1>
        <p className="mt-2 text-sm text-white/60">
          We konden de gegevens niet laden. Probeer het opnieuw of ga terug naar je dashboard.
        </p>
        <div className="mt-5 flex justify-center gap-3">
          <button
            onClick={reset}
            className="inline-flex items-center justify-center rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white shadow-glow transition hover:opacity-90"
          >
            Opnieuw proberen
          </button>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-xl border border-white/15 px-4 py-2 text-sm font-medium text-white/80 transition hover:bg-white/5"
          >
            Naar dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
