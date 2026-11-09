import { Boxes, Cloud, CreditCard, Database, Layers, Leaf, Snowflake, Sun } from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { type Adapter, adapters } from "~/content/adapters";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

const icons: Record<string, IconComponent> = {
  postgres: Database,
  mysql: Database,
  snowflake: Snowflake,
  mongodb: Leaf,
  bigquery: Cloud,
  databricks: Layers,
  redshift: Boxes,
  stripe: CreditCard,
};

function AdapterTile({ adapter }: { adapter: Adapter }) {
  const Icon = icons[adapter.id] ?? Database;
  return (
    <li className="surface group relative flex items-center gap-4 rounded-2xl p-4 transition-colors hover:border-white/15 sm:p-5">
      <span
        className="flex size-11 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset"
        style={{
          backgroundColor: `color-mix(in srgb, ${adapter.color} 14%, transparent)`,
          color: adapter.color,
          // The ring uses the adapter color at low opacity.
          boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${adapter.color} 35%, transparent)`,
        }}
      >
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="truncate font-medium text-paper">{adapter.name}</p>
        <p className="text-sm text-mist">{adapter.note}</p>
      </div>
    </li>
  );
}

/** Tiles for each supported data source, plus one tile for adapters on the way. */
export function AdapterGrid() {
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {adapters.map((adapter) => (
        <AdapterTile key={adapter.id} adapter={adapter} />
      ))}
      <li className="flex items-center gap-4 rounded-2xl border border-dashed border-white/15 p-4 sm:p-5">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/[0.04] text-mist ring-1 ring-inset ring-white/10">
          <Sun className="size-5" aria-hidden="true" />
        </span>
        <div>
          <p className="font-medium text-paper">More on the way</p>
          <p className="text-sm text-mist">Each adapter is one package.</p>
        </div>
      </li>
    </ul>
  );
}
