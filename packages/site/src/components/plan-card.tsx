import { ArrowRight, Check } from "lucide-react";
import { formatPrice, type Plan } from "~/content/plans";
import { ButtonLink } from "./button-link";

/** One pricing plan. The highlighted plan gets a teal outline and glow. */
export function PlanCard({ plan }: { plan: Plan }) {
  const highlighted = plan.highlighted;

  return (
    <article
      aria-labelledby={`plan-${plan.id}`}
      className={`relative flex flex-col rounded-3xl p-7 sm:p-8 ${
        highlighted
          ? "bg-[linear-gradient(180deg,rgb(94_234_212/0.09),rgb(94_234_212/0.02)_40%),var(--color-panel)] shadow-glow ring-1 ring-accent/40"
          : "surface"
      }`}
    >
      {highlighted ? (
        <span className="absolute -top-3 left-7 rounded-full bg-accent px-3 py-1 font-mono text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-ink">
          Most popular
        </span>
      ) : null}

      <h3 id={`plan-${plan.id}`} className="text-lg font-semibold text-paper">
        {plan.name}
      </h3>
      <p className="mt-1.5 min-h-12 text-[0.95rem] leading-6 text-mist">{plan.description}</p>

      <p className="mt-6 flex items-baseline gap-2">
        <span className="font-display text-5xl font-semibold tracking-tight text-paper">
          {formatPrice(plan)}
        </span>
        {plan.priceUnit ? <span className="text-sm text-mist">{plan.priceUnit}</span> : null}
      </p>
      <p className="mt-1 text-sm text-mist">
        {plan.price === null ? "Talk to us" : plan.priceLabel}
      </p>

      <div className="mt-7">
        <ButtonLink
          href={plan.cta.href}
          variant={highlighted ? "primary" : "secondary"}
          className="w-full"
          trailingIcon={<ArrowRight />}
        >
          {plan.cta.label}
        </ButtonLink>
      </div>

      <ul className="mt-8 space-y-3 border-t border-line pt-7">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-start gap-3 text-[0.95rem] text-mist-2">
            <Check className="mt-1 size-4 shrink-0 text-accent" aria-hidden="true" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}
