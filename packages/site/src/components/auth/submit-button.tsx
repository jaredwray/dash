import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";

type SubmitButtonProps = {
  children: ReactNode;
};

/**
 * The primary submit button of an auth form.
 * It uses the same look as the primary `ButtonLink`, but it is a real button.
 */
export function SubmitButton({ children }: SubmitButtonProps) {
  return (
    <button
      type="submit"
      className="group inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-accent px-6 text-base font-medium whitespace-nowrap text-ink shadow-[0_0_0_1px_rgb(94_234_212/0.4),0_10px_30px_-10px_rgb(94_234_212/0.6)] transition-[background-color,box-shadow,color,transform] duration-200 hover:bg-[#7ff0dd] hover:shadow-[0_0_0_1px_rgb(94_234_212/0.6),0_14px_40px_-10px_rgb(94_234_212/0.75)] focus-visible:outline-offset-4 motion-safe:active:scale-[0.98]"
    >
      <span>{children}</span>
      <ArrowRight
        className="size-4 shrink-0 transition-transform duration-200 motion-safe:group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </button>
  );
}
