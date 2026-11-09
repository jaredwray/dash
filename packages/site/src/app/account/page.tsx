import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountOverview } from "~/components/account/account-overview";
import { cloudPlan, formatPrice, plans } from "~/content/plans";
import { pageMetadata } from "~/lib/metadata";
import { cta } from "~/lib/site";
import { getCurrentAccount } from "~/server/current-account";

export const metadata: Metadata = pageMetadata({
  title: "Your account",
  description: "Your Dash Cloud account and organization.",
  path: "/account/",
  index: false,
});

/** Reads the session for each request. A visitor with no session goes to the sign-in page. */
export default async function AccountPage() {
  const current = await getCurrentAccount();
  if (!current) redirect(cta.signIn.href);

  const { account, organization } = current;
  const plan = plans.find((candidate) => candidate.id === organization.plan) ?? cloudPlan;
  return (
    <AccountOverview
      name={account.name}
      email={account.email}
      memberSince={account.createdAt}
      organization={{
        name: organization.name,
        planName: plan.name,
        price: formatPrice(plan),
        priceUnit: plan.priceUnit,
      }}
    />
  );
}
