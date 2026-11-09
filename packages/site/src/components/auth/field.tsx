import type { ComponentPropsWithoutRef } from "react";

type InputType = "text" | "email" | "password";

type FieldProps = {
  /** Name of the form field. The server action reads the value by this name. */
  name: string;
  label: string;
  type: InputType;
  autoComplete: string;
  /** Short help text under the input. */
  hint?: string;
} & Omit<
  ComponentPropsWithoutRef<"input">,
  "name" | "type" | "autoComplete" | "id" | "aria-describedby" | "className" | "children"
>;

const inputClasses =
  "h-12 w-full rounded-xl bg-ink-2 px-4 text-[0.97rem] text-paper ring-1 ring-inset ring-line-2 " +
  "transition-[box-shadow,background-color] duration-200 placeholder:text-mist/60 " +
  "hover:ring-white/25 focus-visible:bg-ink focus-visible:outline-none focus-visible:ring-2 " +
  "focus-visible:ring-accent focus-visible:shadow-[0_0_0_4px_rgb(94_234_212/0.18)]";

/** A labeled input with an optional hint. The id comes from the field name. */
export function Field({ name, label, type, autoComplete, hint, ...inputProps }: FieldProps) {
  const id = `field-${name}`;
  const hintId = hint ? `${id}-hint` : undefined;

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium text-paper">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        aria-describedby={hintId}
        className={inputClasses}
        {...inputProps}
      />
      {hint ? (
        <p id={hintId} className="text-[0.82rem] leading-5 text-mist">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
