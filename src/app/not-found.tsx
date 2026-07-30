import Link from "next/link";

export default function NotFound() {
  return (
    <section className="px-4 py-24 text-center">
      <div className="max-w-md mx-auto">
        <p className="text-xs font-semibold tracking-wider text-text-light uppercase mb-3">
          404
        </p>
        <h1 className="font-serif text-3xl sm:text-4xl font-bold text-primary mb-3">
          Page not found
        </h1>
        <p className="text-text-mid mb-8">
          That page doesn&apos;t exist. Maybe the facility closed, or the link
          is wrong. Try browsing by state instead.
        </p>
        <div className="flex justify-center gap-3">
          <Link
            href="/"
            className="bg-accent text-white px-6 py-3 rounded-xl font-semibold text-sm hover:bg-accent-light transition-colors"
          >
            Back to home
          </Link>
          <Link
            href="/states"
            className="bg-card border border-border text-primary px-6 py-3 rounded-xl font-semibold text-sm hover:border-accent hover:text-accent transition-colors"
          >
            Browse states
          </Link>
        </div>
      </div>
    </section>
  );
}
