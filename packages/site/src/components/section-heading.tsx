import type { ReactNode } from "react";

type SectionHeadingProps = {
  /** Id of the heading element, for `aria-labelledby` on the section. */
  id?: string;
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  /** Center the heading block. Default is left aligned. */
  align?: "left" | "center";
  /** Heading level. Pages use h2 for sections and h1 for the page title. */
  as?: "h1" | "h2";
  className?: string;
};

/** Eyebrow, heading, and lead paragraph for a section. */
export function SectionHeading({
  id,
  eyebrow,
  title,
  description,
  align = "left",
  as: Heading = "h2",
  className = "",
}: SectionHeadingProps) {
  const alignment = align === "center" ? "mx-auto text-center items-center" : "";
  const size =
    Heading === "h1"
      ? "text-[2.5rem] leading-[1.02] sm:text-6xl"
      : "text-[2rem] leading-[1.08] sm:text-[2.75rem]";

  return (
    <div className={`flex max-w-2xl flex-col ${alignment} ${className}`}>
      {eyebrow ? <p className="eyebrow mb-4">{eyebrow}</p> : null}
      <Heading
        id={id}
        className={`text-shine font-display font-semibold tracking-[-0.03em] text-balance ${size}`}
      >
        {title}
      </Heading>
      {description ? (
        <p className="mt-5 text-lg leading-8 text-mist text-pretty">{description}</p>
      ) : null}
    </div>
  );
}
