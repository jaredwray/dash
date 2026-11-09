import { Plus } from "lucide-react";
import type { FaqItem } from "~/content/faq";

/** A list of questions. Each answer opens with a native details element. */
export function Faq({ items }: { items: readonly FaqItem[] }) {
  return (
    <div className="divide-y divide-line border-y border-line">
      {items.map((item) => (
        <details key={item.id} className="group">
          <summary className="flex cursor-pointer items-center justify-between gap-6 py-5 text-left text-[1.05rem] font-medium text-paper transition-colors hover:text-accent [&::-webkit-details-marker]:hidden">
            <span>{item.question}</span>
            <Plus
              className="size-5 shrink-0 text-mist transition-transform duration-200 group-open:rotate-45"
              aria-hidden="true"
            />
          </summary>
          <p className="max-w-3xl pb-6 text-[0.97rem] leading-7 text-mist">{item.answer}</p>
        </details>
      ))}
    </div>
  );
}
