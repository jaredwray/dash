import Link from "next/link";
import type { ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg";

type ButtonLinkProps = {
  href: string;
  children: ReactNode;
  variant?: Variant;
  size?: Size;
  className?: string;
  /** Icon placed before the label. */
  icon?: ReactNode;
  /** Icon placed after the label. */
  trailingIcon?: ReactNode;
};

const base =
  "group inline-flex items-center justify-center gap-2 rounded-full font-medium whitespace-nowrap " +
  "transition-[background-color,box-shadow,color,transform] duration-200 " +
  "motion-safe:active:scale-[0.98] focus-visible:outline-offset-4";

const variants: Record<Variant, string> = {
  primary:
    "bg-accent text-ink shadow-[0_0_0_1px_rgb(94_234_212/0.4),0_10px_30px_-10px_rgb(94_234_212/0.6)] " +
    "hover:bg-[#7ff0dd] hover:shadow-[0_0_0_1px_rgb(94_234_212/0.6),0_14px_40px_-10px_rgb(94_234_212/0.75)]",
  secondary:
    "bg-white/[0.06] text-paper ring-1 ring-inset ring-white/15 backdrop-blur " +
    "hover:bg-white/[0.1] hover:ring-white/25",
  ghost: "text-mist-2 hover:text-paper hover:bg-white/[0.06]",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-4 text-sm",
  md: "h-11 px-5 text-[0.95rem]",
  lg: "h-12 px-6 text-base",
};

function isExternal(href: string): boolean {
  return /^(https?:|mailto:)/.test(href);
}

/** A link styled as a button. Use it for calls to action. */
export function ButtonLink({
  href,
  children,
  variant = "primary",
  size = "md",
  className = "",
  icon,
  trailingIcon,
}: ButtonLinkProps) {
  const classes = `${base} ${variants[variant]} ${sizes[size]} ${className}`;
  const content = (
    <>
      {icon ? <span className="shrink-0 [&>svg]:size-4">{icon}</span> : null}
      <span>{children}</span>
      {trailingIcon ? (
        <span className="shrink-0 transition-transform duration-200 motion-safe:group-hover:translate-x-0.5 [&>svg]:size-4">
          {trailingIcon}
        </span>
      ) : null}
    </>
  );

  if (isExternal(href)) {
    return (
      <a href={href} className={classes}>
        {content}
      </a>
    );
  }
  return (
    <Link href={href} className={classes}>
      {content}
    </Link>
  );
}
