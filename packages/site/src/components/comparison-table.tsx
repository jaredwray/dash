import { Check, Minus } from "lucide-react";
import { type ComparisonValue, comparisonGroups, plans } from "~/content/plans";

function Cell({ value }: { value: ComparisonValue }) {
  if (value === true) {
    return (
      <span role="img" aria-label="Included" className="inline-flex text-paper">
        <Check className="size-4 text-accent" aria-hidden="true" />
      </span>
    );
  }
  if (value === false) {
    return (
      <span role="img" aria-label="Not included" className="inline-flex text-mist/50">
        <Minus className="size-4" aria-hidden="true" />
      </span>
    );
  }
  return <span className="text-paper">{value}</span>;
}

/** Feature comparison across the three plans. The table scrolls on narrow screens. */
export function ComparisonTable() {
  return (
    <div className="surface overflow-hidden rounded-3xl">
      <p className="border-b border-line px-6 py-3 text-xs text-mist lg:hidden">
        Scroll sideways to compare each plan.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[44rem] border-separate border-spacing-0 text-left text-[0.95rem]">
          <caption className="sr-only">Feature comparison across Dash plans</caption>
          <thead>
            <tr className="[&>th]:border-b [&>th]:border-line">
              <th
                scope="col"
                className="sticky left-0 z-10 bg-panel px-6 py-5 font-medium text-mist shadow-[1px_0_0_var(--color-line)]"
              >
                Feature
              </th>
              {plans.map((plan) => (
                <th
                  key={plan.id}
                  scope="col"
                  className={`px-6 py-5 font-semibold ${plan.highlighted ? "text-accent" : "text-paper"}`}
                >
                  {plan.name}
                </th>
              ))}
            </tr>
          </thead>
          {comparisonGroups.map((group) => (
            <tbody key={group.title}>
              <tr>
                <th
                  scope="rowgroup"
                  colSpan={plans.length + 1}
                  className="bg-panel-2 px-6 py-2.5 text-left font-mono text-[0.7rem] font-medium uppercase tracking-[0.16em] text-mist"
                >
                  {group.title}
                </th>
              </tr>
              {group.rows.map((row) => (
                <tr
                  key={row.label}
                  className="[&>td]:border-t [&>td]:border-line [&>th]:border-t [&>th]:border-line"
                >
                  <th
                    scope="row"
                    className="sticky left-0 z-10 bg-panel px-6 py-4 font-normal text-mist-2 shadow-[1px_0_0_var(--color-line)]"
                  >
                    {row.label}
                  </th>
                  {plans.map((plan) => (
                    <td key={plan.id} className="px-6 py-4">
                      <Cell value={row.values[plan.id]} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </div>
  );
}
