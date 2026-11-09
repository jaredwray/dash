import { ArrowRight } from "lucide-react";
import { cta } from "~/lib/site";
import { ButtonLink } from "./button-link";
import { GitHubIcon } from "./icons";

type CtaBandProps = {
  title?: string;
  description?: string;
};

/** The closing call to action with both paths. */
export function CtaBand({
  title = "Start with Dash today.",
  description = "Clone the repository and run it on your own machine, or create a Dash Cloud account and sign in.",
}: CtaBandProps) {
  return (
    <section aria-labelledby="cta-title" className="container-x py-20 sm:py-28">
      <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-panel px-6 py-16 text-center sm:px-12 sm:py-20">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_80%_at_20%_0%,rgb(94_234_212/0.18),transparent_60%),radial-gradient(50%_70%_at_90%_100%,rgb(129_140_248/0.22),transparent_60%)]"
        />
        <div
          aria-hidden="true"
          className="bg-grid pointer-events-none absolute inset-0 opacity-70"
        />
        <div className="relative">
          <h2
            id="cta-title"
            className="text-shine mx-auto max-w-2xl font-display text-4xl font-semibold tracking-[-0.03em] text-balance sm:text-5xl"
          >
            {title}
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-8 text-mist text-pretty">
            {description}
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <ButtonLink href={cta.cloud.href} size="lg" trailingIcon={<ArrowRight />}>
              {cta.cloud.label}
            </ButtonLink>
            <ButtonLink
              href={cta.selfHost.href}
              size="lg"
              variant="secondary"
              icon={<GitHubIcon />}
            >
              {cta.selfHost.label}
            </ButtonLink>
          </div>
        </div>
      </div>
    </section>
  );
}
