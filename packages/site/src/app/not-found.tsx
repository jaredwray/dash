import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import { ButtonLink } from "~/components/button-link";
import { cta } from "~/lib/site";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false },
};

export default function NotFound() {
  return (
    <section className="relative overflow-hidden" aria-labelledby="not-found-title">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(800px_400px_at_50%_-10%,rgb(129_140_248/0.16),transparent_60%)]"
      />
      <div className="container-x relative flex min-h-[60dvh] flex-col items-center justify-center py-24 text-center">
        <p className="eyebrow">404</p>
        <h1
          id="not-found-title"
          className="text-shine mt-4 font-display text-5xl font-semibold tracking-[-0.03em] sm:text-6xl"
        >
          No dashboard here.
        </h1>
        <p className="mt-5 max-w-md text-lg leading-8 text-mist">
          The page that you asked for does not exist. Go back to the home page or open the
          repository.
        </p>
        <div className="mt-9 flex flex-col gap-3 sm:flex-row">
          <ButtonLink href="/" trailingIcon={<ArrowRight />}>
            Go to the home page
          </ButtonLink>
          <ButtonLink href={cta.selfHost.href} variant="secondary">
            Open GitHub
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}
