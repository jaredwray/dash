import { Building2, LogOut, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { signOutAction } from "~/server/actions";

export type AccountOverviewProps = {
  name: string;
  email: string;
  memberSince: Date;
  organization: {
    name: string;
    planName: string;
    /** The formatted price, for example "$0.10". */
    price: string;
    /** For example "per compute hour". */
    priceUnit: string;
  };
};

type DetailProps = {
  term: string;
  children: ReactNode;
};

/** One row of a details list: a small term above a value. */
function Detail({ term, children }: DetailProps) {
  return (
    <div className="flex flex-col gap-1 py-4 first:pt-0 last:pb-0">
      <dt className="text-[0.82rem] font-medium text-mist">{term}</dt>
      <dd className="text-[1.02rem] leading-7 text-paper break-words">{children}</dd>
    </div>
  );
}

type CardProps = {
  id: string;
  eyebrow: string;
  title: string;
  icon: ReactNode;
  children: ReactNode;
};

/** A `surface` card with an icon, an eyebrow, and a heading. */
function Card({ id, eyebrow, title, icon, children }: CardProps) {
  return (
    <article aria-labelledby={id} className="surface rounded-3xl p-6 sm:p-8">
      <div className="flex items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent ring-1 ring-inset ring-accent/30 [&>svg]:size-5">
          {icon}
        </span>
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2 id={id} className="text-lg font-semibold text-paper">
            {title}
          </h2>
        </div>
      </div>
      <dl className="mt-6 divide-y divide-line border-t border-line pt-6">{children}</dl>
    </article>
  );
}

/** Formats the sign-up date, for example "November 9, 2026". */
function formatMemberSince(date: Date): string {
  return date.toLocaleDateString("en-US", { dateStyle: "long", timeZone: "UTC" });
}

/** The signed-in view of a Dash Cloud account. */
export function AccountOverview({ name, email, memberSince, organization }: AccountOverviewProps) {
  return (
    <section className="relative overflow-hidden" aria-labelledby="account-title">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_420px_at_50%_-10%,rgb(94_234_212/0.12),transparent_60%)]"
      />
      <div
        aria-hidden="true"
        className="bg-grid pointer-events-none absolute inset-x-0 top-0 h-[24rem]"
      />
      <div className="container-x relative pt-14 pb-20 sm:pt-20 sm:pb-28">
        <header className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <p className="eyebrow mb-4">Dash Cloud account</p>
            <h1
              id="account-title"
              className="text-shine font-display text-[2.25rem] leading-[1.05] font-semibold tracking-[-0.03em] text-balance break-words sm:text-5xl"
            >
              {organization.name}
            </h1>
            <p className="mt-4 text-lg leading-8 text-mist text-pretty">
              Welcome, {name}. You are the owner of this organization on Dash Cloud.
            </p>
          </div>
          <form action={signOutAction} className="shrink-0">
            <button
              type="submit"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-white/[0.06] px-5 text-[0.95rem] font-medium whitespace-nowrap text-paper ring-1 ring-inset ring-white/15 backdrop-blur transition-[background-color,box-shadow,color,transform] duration-200 hover:bg-white/[0.1] hover:ring-white/25 focus-visible:outline-offset-4 motion-safe:active:scale-[0.98]"
            >
              <LogOut className="size-4 shrink-0" aria-hidden="true" />
              <span>Sign out</span>
            </button>
          </form>
        </header>

        <div className="mt-10 grid grid-cols-1 gap-5 sm:mt-12 lg:grid-cols-2 motion-safe:animate-rise">
          <Card
            id="account-organization"
            eyebrow="Organization"
            title="Your team"
            icon={<Building2 aria-hidden="true" />}
          >
            <Detail term="Name">{organization.name}</Detail>
            <Detail term="Plan">
              <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span>{organization.planName}</span>
                <span className="font-mono text-sm text-mist-2">
                  {organization.price} {organization.priceUnit}
                </span>
              </span>
            </Detail>
            <Detail term="Your role">
              <span className="inline-flex items-center rounded-full bg-accent/12 px-2.5 py-0.5 font-mono text-[0.72rem] font-medium uppercase tracking-[0.16em] text-accent ring-1 ring-inset ring-accent/30">
                Owner
              </span>
            </Detail>
          </Card>

          <Card
            id="account-person"
            eyebrow="You"
            title="Your details"
            icon={<UserRound aria-hidden="true" />}
          >
            <Detail term="Name">{name}</Detail>
            <Detail term="Email">{email}</Detail>
            <Detail term="Member since">
              <time dateTime={memberSince.toISOString()}>{formatMemberSince(memberSince)}</time>
            </Detail>
          </Card>
        </div>
      </div>
    </section>
  );
}
