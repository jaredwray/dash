import { Braces, Database, KeyRound, Layers3, LayoutDashboard, Users } from "lucide-react";
import Image from "next/image";
import type { ComponentType, SVGProps } from "react";
import { type Feature, type FeatureIcon, features } from "~/content/features";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

const icons: Record<FeatureIcon, IconComponent> = {
  dashboards: LayoutDashboard,
  "data-sources": Database,
  workspaces: Layers3,
  team: Users,
  tokens: KeyRound,
  api: Braces,
};

function FeatureIconBadge({ icon }: { icon: FeatureIcon }) {
  const Icon = icons[icon];
  return (
    <span className="flex size-10 items-center justify-center rounded-xl bg-accent/10 text-accent ring-1 ring-inset ring-accent/25">
      <Icon className="size-5" aria-hidden="true" />
    </span>
  );
}

function LargeCard({ feature }: { feature: Feature }) {
  const shot = feature.screenshot;
  return (
    <article className="surface group relative flex flex-col overflow-hidden rounded-3xl md:col-span-12 lg:col-span-6">
      <div className="p-7 pb-0 sm:p-8 sm:pb-0">
        <FeatureIconBadge icon={feature.icon} />
        <h3 className="mt-5 text-xl font-semibold text-paper">{feature.title}</h3>
        <p className="mt-2 max-w-md text-[0.97rem] leading-7 text-mist">{feature.description}</p>
      </div>
      {shot ? (
        <div className="relative mt-7 ml-7 flex-1 overflow-hidden rounded-tl-xl border-t border-l border-white/10 bg-ink-2 sm:ml-8">
          <div className="relative aspect-[16/9] w-full">
            <Image
              src={shot.src}
              alt={shot.alt}
              width={shot.width}
              height={shot.height}
              sizes="(min-width: 1024px) 560px, 100vw"
              className="absolute inset-0 h-full w-full object-cover object-left-top transition-transform duration-500 motion-safe:group-hover:scale-[1.02]"
            />
          </div>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-panel/80 via-transparent to-transparent"
          />
        </div>
      ) : null}
    </article>
  );
}

function SmallCard({ feature }: { feature: Feature }) {
  return (
    <article className="surface rounded-3xl p-6 transition-colors hover:border-white/15 md:col-span-6 lg:col-span-3">
      <FeatureIconBadge icon={feature.icon} />
      <h3 className="mt-5 text-[1.05rem] font-semibold text-paper">{feature.title}</h3>
      <p className="mt-2 text-[0.92rem] leading-6 text-mist">{feature.description}</p>
    </article>
  );
}

/** A bento grid: two large cards with screenshots and four smaller cards. */
export function FeatureGrid() {
  const large = features.filter((feature) => feature.screenshot);
  const small = features.filter((feature) => !feature.screenshot);

  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-12">
      {large.map((feature) => (
        <LargeCard key={feature.id} feature={feature} />
      ))}
      {small.map((feature) => (
        <SmallCard key={feature.id} feature={feature} />
      ))}
    </div>
  );
}
