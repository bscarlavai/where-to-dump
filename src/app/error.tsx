"use client";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="px-4 py-24 text-center">
      <div className="max-w-md mx-auto">
        <h1 className="font-serif text-3xl sm:text-4xl font-bold text-primary mb-3">
          Something went wrong
        </h1>
        <p className="text-text-mid mb-8">
          An unexpected error occurred while loading this page. It&apos;s
          probably temporary.
        </p>
        <div className="flex justify-center gap-3">
          <button
            onClick={reset}
            className="bg-accent text-white px-6 py-3 rounded-xl font-semibold text-sm hover:bg-accent-light transition-colors"
          >
            Try again
          </button>
          <a
            href="/"
            className="bg-card border border-border text-primary px-6 py-3 rounded-xl font-semibold text-sm hover:border-accent hover:text-accent transition-colors inline-block"
          >
            Back to home
          </a>
        </div>
      </div>
    </section>
  );
}
