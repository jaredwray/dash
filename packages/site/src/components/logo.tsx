import { site } from "~/lib/site";

type LogoProps = {
  /** Size of the icon in pixels. */
  size?: number;
  /** Hide the wordmark and show only the icon. */
  iconOnly?: boolean;
  className?: string;
};

/** The Dash mark: a teal line chart in a dark square, with the wordmark next to it. */
export function Logo({ size = 28, iconOnly = false, className = "" }: LogoProps) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        aria-hidden="true"
        className="shrink-0 rounded-[25%] ring-1 ring-white/10"
      >
        <rect width="32" height="32" rx="8" fill="#0e1524" />
        <path
          d="M7 21.5 12.5 14l4 4.5L25 10"
          stroke="#5eead4"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {iconOnly ? (
        <span className="sr-only">{site.name}</span>
      ) : (
        <span className="font-display text-[1.2rem] font-semibold tracking-tight text-paper">
          {site.name}
        </span>
      )}
    </span>
  );
}
