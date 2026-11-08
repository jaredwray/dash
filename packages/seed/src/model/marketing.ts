import { DAY_MS, addDays, isoDate, monthLabel, startOfDay } from "../calendar.ts";
import { CHANNELS, STORYLINE, type Channel, type Region } from "../company.ts";
import { column, dollars, ratio, type SeedDomain } from "../table.ts";
import type { Account, Campaign, World } from "./types.ts";

const DEVICES = ["desktop", "mobile", "tablet"] as const;
type Device = (typeof DEVICES)[number];

/** Share of sessions that become a signup, by channel. */
const SIGNUP_RATE: Record<Channel, number> = {
  "Organic Search": 0.016,
  "Paid Search": 0.024,
  "Paid Social": 0.009,
  Referral: 0.045,
  Partner: 0.03,
  Events: 0.06,
  Direct: 0.022,
  Outbound: 0.011,
};

const CHANNEL_INFO: Record<Channel, { type: string; owner: string; description: string }> = {
  "Organic Search": { type: "Organic", owner: "Content", description: "Unpaid search traffic to the website and docs." },
  "Paid Search": { type: "Paid", owner: "Demand Gen", description: "Search ads on brand and category keywords." },
  "Paid Social": { type: "Paid", owner: "Demand Gen", description: "Social ads for operations and IT audiences." },
  Referral: { type: "Owned", owner: "Lifecycle", description: "Customer referral program." },
  Partner: { type: "Partner", owner: "Partnerships", description: "Co-marketing with integration and services partners." },
  Events: { type: "Paid", owner: "Field Marketing", description: "Regional summits and the annual user conference." },
  Direct: { type: "Organic", owner: "Brand", description: "Typed-in and bookmarked visits." },
  Outbound: { type: "Sales", owner: "Sales Development", description: "Account-based outreach by SDRs." },
};

interface CampaignSpec {
  name: string;
  channel: Channel;
  objective: string;
  region: Region | "Global";
  start: number;
  end: number | null;
  /** Daily spend in USD for always-on campaigns. */
  daily?: number;
  /** One-day lumps: [month, USD]. */
  lumps?: [number, number][];
  cpc: number;
  ctr: number;
}

function campaignSpecs(months: number): CampaignSpec[] {
  const specs: CampaignSpec[] = [
    { name: "Brand Search – North America", channel: "Paid Search", objective: "Brand", region: "North America", start: 0, end: null, daily: 650, cpc: 1.9, ctr: 0.09 },
    { name: "Workflow Automation – Generic", channel: "Paid Search", objective: "Demand Gen", region: "Global", start: 0, end: null, daily: 1400, cpc: 7.2, ctr: 0.035 },
    { name: "Competitor Keywords – North America", channel: "Paid Search", objective: "Demand Gen", region: "North America", start: 4, end: 24, daily: 520, cpc: 9.5, ctr: 0.025 },
    { name: "Approval Software – Generic", channel: "Paid Search", objective: "Demand Gen", region: "Global", start: 6, end: null, daily: 600, cpc: 6.4, ctr: 0.038 },
    { name: "Brand Search – EMEA", channel: "Paid Search", objective: "Brand", region: "EMEA", start: STORYLINE.emeaTeam, end: null, daily: 240, cpc: 1.7, ctr: 0.085 },
    { name: "AI Workflow Automation – Generic", channel: "Paid Search", objective: "Demand Gen", region: "Global", start: STORYLINE.aiAssistLaunch, end: null, daily: 900, cpc: 6.0, ctr: 0.041 },
    { name: "Meta Retargeting", channel: "Paid Social", objective: "Retargeting", region: "Global", start: 0, end: 18, daily: 300, cpc: 2.6, ctr: 0.009 },
    { name: "LinkedIn – Operations Leaders", channel: "Paid Social", objective: "Demand Gen", region: "Global", start: 2, end: null, daily: 1100, cpc: 11, ctr: 0.0055 },
    { name: "Spring Social Push", channel: "Paid Social", objective: "Demand Gen", region: "North America", start: STORYLINE.socialPushStart, end: STORYLINE.socialPushEnd, daily: 5200, cpc: 8, ctr: 0.007 },
    { name: "LinkedIn – IT and Systems Admins", channel: "Paid Social", objective: "Demand Gen", region: "Global", start: 12, end: null, daily: 500, cpc: 12.5, ctr: 0.005 },
    { name: "SEO – Content Hub", channel: "Organic Search", objective: "Brand", region: "Global", start: 0, end: null, cpc: 1, ctr: 0.03 },
    { name: "Customer Referral Program", channel: "Referral", objective: "Demand Gen", region: "Global", start: 0, end: null, cpc: 150, ctr: 0.25 },
  ];
  const cities = ["Austin", "Chicago", "Atlanta", "Denver", "Boston", "Seattle"];
  for (let year = 0; year * 12 < months; year += 1) {
    const base = year * 12;
    specs.push({ name: `${cities[year % cities.length]} Ops Summit`, channel: "Events", objective: "Pipeline Acceleration", region: "North America", start: base + 2, end: base + 2, lumps: [[base + 2, 62_000]], cpc: 120, ctr: 0.12 });
    specs.push({ name: `${cities[(year + 3) % cities.length]} Ops Summit`, channel: "Events", objective: "Pipeline Acceleration", region: "North America", start: base + 7, end: base + 7, lumps: [[base + 7, 66_000]], cpc: 120, ctr: 0.12 });
    if (base + 5 >= STORYLINE.emeaTeam) {
      specs.push({ name: "London Ops Summit", channel: "Events", objective: "Pipeline Acceleration", region: "EMEA", start: base + 5, end: base + 5, lumps: [[base + 5, 58_000]], cpc: 120, ctr: 0.12 });
    }
    specs.push({ name: "Fernway Connect user conference", channel: "Events", objective: "Brand", region: "Global", start: base + 10, end: base + 10, lumps: [[base + 10, 240_000]], cpc: 95, ctr: 0.15 });
    const webinars: [number, number][] = [];
    for (let month = base; month < base + 12; month += 1) webinars.push([month, 6_000]);
    specs.push({ name: "Partner Webinar Series", channel: "Partner", objective: "Demand Gen", region: "Global", start: base, end: base + 11, lumps: webinars, cpc: 45, ctr: 0.05 });
    const abm: [number, number][] = [];
    for (let month = base; month < base + 12; month += 3) abm.push([month, 18_000]);
    specs.push({ name: "ABM – Enterprise Accounts", channel: "Outbound", objective: "Pipeline Acceleration", region: "North America", start: base, end: base + 11, lumps: abm, cpc: 80, ctr: 0.033 });
  }
  return specs.filter((spec) => spec.start < months).map((spec) => ({ ...spec, end: spec.end !== null && spec.end >= months ? null : spec.end }));
}

/** Builds campaigns, their daily spend, and the campaign of each signup. */
export function buildCampaigns(world: World): void {
  const { ctx, accounts } = world;
  const rng = ctx.rng.fork("campaigns");
  const { timeline, scale } = ctx;
  const owners = ["Priya Natarajan", "Marcus Bell", "Elena Ortiz", "Tom Whitaker", "Hannah Becker"];
  const totalDays = Math.round((timeline.asOf.getTime() - timeline.start.getTime()) / DAY_MS);
  const dayOf = (date: Date) => Math.floor((startOfDay(date).getTime() - timeline.start.getTime()) / DAY_MS);
  const campaigns: Campaign[] = campaignSpecs(timeline.months).map((spec, index) => {
    const year = timeline.monthStart(spec.start).getUTCFullYear();
    const needsYear = spec.channel === "Events" || spec.name.startsWith("Partner Webinar") || spec.name.startsWith("ABM");
    const campaign: Campaign = {
      id: `cmp_${String(index + 1).padStart(3, "0")}`,
      name: needsYear ? `${spec.name} ${year}` : spec.name,
      channel: spec.channel,
      objective: spec.objective,
      region: spec.region,
      startMonth: spec.start,
      endMonth: spec.end,
      dailySpend: new Map(),
      cpc: spec.cpc,
      ctr: spec.ctr,
      owner: rng.pick(owners),
    };
    const firstDay = dayOf(timeline.monthStart(spec.start));
    const lastDay = spec.end === null ? totalDays - 1 : dayOf(timeline.monthEnd(spec.end)) - 1;
    if (spec.daily) {
      for (let day = firstDay; day <= lastDay; day += 1) {
        const date = addDays(timeline.start, day);
        const month = timeline.monthIndex(date);
        const weekday = date.getUTCDay() === 0 || date.getUTCDay() === 6 ? 0.74 : 1.1;
        const growth = 1.022 ** month;
        const cents = Math.round(spec.daily * growth * weekday * scale * rng.between(0.86, 1.14) * 100);
        campaign.dailySpend.set(day, cents);
      }
    }
    for (const [month, amount] of spec.lumps ?? []) {
      if (month >= timeline.months) continue;
      const start = timeline.monthStart(month);
      // The third Wednesday of the month.
      let day = start;
      let wednesdays = 0;
      while (wednesdays < 3) {
        if (day.getUTCDay() === 3) wednesdays += 1;
        if (wednesdays < 3) day = addDays(day, 1);
      }
      const value = Math.round(amount * scale * rng.between(0.9, 1.1) * 100);
      if (spec.name.startsWith("ABM")) {
        // Outbound tools and gifts spread over the quarter.
        const days = Math.min(90, totalDays - dayOf(start));
        for (let offset = 0; offset < days; offset += 1) {
          campaign.dailySpend.set(dayOf(start) + offset, Math.round(value / days));
        }
      } else {
        campaign.dailySpend.set(dayOf(day), (campaign.dailySpend.get(dayOf(day)) ?? 0) + value);
      }
    }
    return campaign;
  });

  // Attribute each signup to a campaign of its channel that ran that week.
  const referral = campaigns.find((campaign) => campaign.channel === "Referral");
  for (const account of accounts) {
    const day = dayOf(account.createdAt);
    const live = campaigns
      .filter((campaign) => campaign.channel === account.channel)
      .map((campaign) => {
        let weight = 0;
        for (let back = 0; back < 10; back += 1) weight += campaign.dailySpend.get(day - back) ?? 0;
        if (campaign.channel === "Organic Search" || campaign.channel === "Referral") weight = 1;
        return { value: campaign, weight };
      })
      .filter((item) => item.weight > 0);
    if (live.length === 0) continue;
    const campaign = rng.weighted(live);
    world.attribution.set(account.id, campaign.id);
    if (campaign === referral) {
      campaign.dailySpend.set(day, (campaign.dailySpend.get(day) ?? 0) + 15_000);
    }
  }
  world.campaigns = campaigns;
}

export interface MarketingFacts {
  /** Program spend in USD for each month. */
  spendByMonth: number[];
}

function firstPaidStart(account: Account): Date | null {
  return account.subscriptions[0]?.startedAt ?? null;
}

export function buildMarketing(world: World): { domain: SeedDomain; facts: MarketingFacts } {
  const { ctx, accounts, campaigns } = world;
  const rng = ctx.rng.fork("marketing");
  const { timeline } = ctx;
  const totalDays = Math.round((timeline.asOf.getTime() - timeline.start.getTime()) / DAY_MS);
  const rawDays = ctx.size === "small" ? 90 : 365;
  const rawStart = totalDays - rawDays;
  const dayOf = (date: Date) => Math.floor((startOfDay(date).getTime() - timeline.start.getTime()) / DAY_MS);

  // Signups and new customers by channel and month.
  const signups = new Map<string, number>();
  const signupsByDay = new Map<string, number>();
  const newCustomers = new Map<string, { count: number; mrr: number }>();
  for (const account of accounts) {
    const key = `${account.createdMonth}|${account.channel}`;
    signups.set(key, (signups.get(key) ?? 0) + 1);
    const dayKey = `${dayOf(account.createdAt)}|${account.channel}|${account.signupDevice}`;
    signupsByDay.set(dayKey, (signupsByDay.get(dayKey) ?? 0) + 1);
    const paid = firstPaidStart(account);
    if (paid) {
      const paidKey = `${timeline.monthIndex(paid)}|${account.channel}`;
      const entry = newCustomers.get(paidKey) ?? { count: 0, mrr: 0 };
      entry.count += 1;
      entry.mrr += account.subscriptions[0]!.events[0]!.mrrAfter;
      newCustomers.set(paidKey, entry);
    }
  }

  // Daily sessions for each channel and device over the whole history.
  const sessionsByMonth = new Map<string, number>();
  const sessionRows: Record<string, unknown>[] = [];
  for (let month = 0; month < timeline.months; month += 1) {
    const start = timeline.monthStart(month);
    const end = timeline.monthEnd(month);
    const days: Date[] = [];
    for (let day = start; day.getTime() < end.getTime(); day = addDays(day, 1)) days.push(day);
    for (const channel of CHANNELS) {
      const monthSignups = signups.get(`${month}|${channel}`) ?? 0;
      const push = channel === "Paid Social" && month >= STORYLINE.socialPushStart && month <= STORYLINE.socialPushEnd;
      const rate = SIGNUP_RATE[channel] * (push ? 0.55 : 1) * rng.between(0.93, 1.07);
      const total = Math.round(Math.max(monthSignups, 1) / rate);
      const weights = days.map((day) => (day.getUTCDay() === 0 ? 0.58 : day.getUTCDay() === 6 ? 0.62 : 1.12) * rng.between(0.9, 1.1));
      const weightSum = weights.reduce((sum, value) => sum + value, 0);
      let assigned = 0;
      days.forEach((day, index) => {
        const daySessions = index === days.length - 1 ? total - assigned : Math.round((total * weights[index]!) / weightSum);
        assigned += daySessions;
        const dayIndex = dayOf(day);
        const shares = [0.71 * rng.between(0.95, 1.05), 0.25 * rng.between(0.9, 1.1)];
        let left = daySessions;
        DEVICES.forEach((device: Device, deviceIndex) => {
          const sessions = deviceIndex === DEVICES.length - 1 ? left : Math.min(left, Math.round(daySessions * shares[deviceIndex]!));
          left -= sessions;
          if (dayIndex >= rawStart) {
            const users = Math.round(sessions * rng.between(0.78, 0.84));
            sessionRows.push({
              date: isoDate(day),
              channel,
              device,
              sessions,
              users,
              new_users: Math.round(users * rng.between(0.56, 0.68)),
              bounce_rate: ratio((device === "desktop" ? 0.39 : 0.52) * rng.between(0.9, 1.1)),
              avg_session_seconds: Math.round(rng.lognormal(device === "desktop" ? 150 : 96, 0.12)),
              signups: signupsByDay.get(`${dayIndex}|${channel}|${device}`) ?? 0,
            });
          }
        });
      });
      sessionsByMonth.set(`${month}|${channel}`, total);
    }
  }

  // Spend by campaign and channel.
  const spendByChannelMonth = new Map<string, number>();
  const spendByMonth = new Array<number>(timeline.months).fill(0);
  const adRows: Record<string, unknown>[] = [];
  const attributedByDay = new Map<string, number>();
  for (const account of accounts) {
    const campaignId = world.attribution.get(account.id);
    if (!campaignId) continue;
    const key = `${campaignId}|${dayOf(account.createdAt)}`;
    attributedByDay.set(key, (attributedByDay.get(key) ?? 0) + 1);
  }
  const campaignTotals = new Map<string, { spend: number; clicks: number; impressions: number }>();
  for (const campaign of campaigns) {
    const totals = { spend: 0, clicks: 0, impressions: 0 };
    for (const [day, cents] of [...campaign.dailySpend.entries()].sort((a, b) => a[0] - b[0])) {
      if (day < 0 || day >= totalDays || cents <= 0) continue;
      const date = addDays(timeline.start, day);
      const month = timeline.monthIndex(date);
      const key = `${month}|${campaign.channel}`;
      spendByChannelMonth.set(key, (spendByChannelMonth.get(key) ?? 0) + cents);
      spendByMonth[month]! += cents / 100;
      const clicks = Math.max(1, Math.round(cents / 100 / (campaign.cpc * rng.between(0.88, 1.12))));
      const impressions = Math.round(clicks / (campaign.ctr * rng.between(0.9, 1.1)));
      totals.spend += cents;
      totals.clicks += clicks;
      totals.impressions += impressions;
      if (day >= rawStart) {
        adRows.push({
          date: isoDate(date),
          campaign_id: campaign.id,
          campaign: campaign.name,
          channel: campaign.channel,
          impressions,
          clicks,
          spend_usd: dollars(cents),
          signups: attributedByDay.get(`${campaign.id}|${day}`) ?? 0,
        });
      }
    }
    campaignTotals.set(campaign.id, totals);
  }

  const channelRows = Array.from({ length: timeline.months }, (_, month) =>
    CHANNELS.map((channel) => {
      const key = `${month}|${channel}`;
      const spend = spendByChannelMonth.get(key) ?? 0;
      const customers = newCustomers.get(key) ?? { count: 0, mrr: 0 };
      return {
        month: monthLabel(timeline.monthStart(month)),
        month_start: isoDate(timeline.monthStart(month)),
        channel,
        spend_usd: dollars(spend),
        sessions: sessionsByMonth.get(key) ?? 0,
        signups: signups.get(key) ?? 0,
        new_customers: customers.count,
        new_mrr_usd: dollars(customers.mrr),
        cac_usd: spend > 0 && customers.count > 0 ? dollars(spend / customers.count) : null,
      };
    }),
  ).flat();

  const funnelRows = Array.from({ length: timeline.months }, (_, month) => {
    const cohort = accounts.filter((account) => account.createdMonth === month);
    const sessions = CHANNELS.reduce((sum, channel) => sum + (sessionsByMonth.get(`${month}|${channel}`) ?? 0), 0);
    const activated = cohort.filter((account) => account.activatedInTrial).length;
    const converted = cohort.filter((account) => account.subscriptions.length > 0).length;
    return {
      month: monthLabel(timeline.monthStart(month)),
      month_start: isoDate(timeline.monthStart(month)),
      sessions,
      signups: cohort.length,
      activated,
      converted,
      signup_rate: sessions ? ratio(cohort.length / sessions) : 0,
      activation_rate: cohort.length ? ratio(activated / cohort.length) : 0,
      conversion_rate: cohort.length ? ratio(converted / cohort.length) : 0,
    };
  });

  const campaignRows = campaigns.map((campaign) => {
    const totals = campaignTotals.get(campaign.id)!;
    const attributed = accounts.filter((account) => world.attribution.get(account.id) === campaign.id);
    const customers = attributed.filter((account) => account.subscriptions.length > 0).length;
    return {
      campaign_id: campaign.id,
      campaign: campaign.name,
      channel: campaign.channel,
      status: campaignStatus(campaign, timeline.months),
      start_date: isoDate(timeline.monthStart(campaign.startMonth)),
      end_date: campaign.endMonth === null ? null : isoDate(addDays(timeline.monthEnd(campaign.endMonth), -1)),
      spend_usd: dollars(totals.spend),
      impressions: totals.impressions,
      clicks: totals.clicks,
      ctr: totals.impressions ? ratio(totals.clicks / totals.impressions) : null,
      signups: attributed.length,
      new_customers: customers,
      cost_per_signup: totals.spend > 0 && attributed.length ? dollars(totals.spend / attributed.length) : null,
      cost_per_customer: totals.spend > 0 && customers ? dollars(totals.spend / customers) : null,
    };
  });

  const domain: SeedDomain = {
    key: "marketing",
    label: "Marketing analytics",
    description: "Campaigns, ad spend, web sessions, and the acquisition funnel.",
    tables: [
      {
        name: "channels",
        description: "Acquisition channels.",
        primaryKey: ["channel"],
        columns: [
          column("channel", "string", "Channel name."),
          column("channel_type", "string", "Paid, Organic, Owned, Partner, or Sales."),
          column("owner_team", "string", "Marketing team that owns the channel."),
          column("description", "string", "What the channel covers."),
        ],
        rows: CHANNELS.map((channel) => ({
          channel,
          channel_type: CHANNEL_INFO[channel].type,
          owner_team: CHANNEL_INFO[channel].owner,
          description: CHANNEL_INFO[channel].description,
        })),
      },
      {
        name: "campaigns",
        description: "Marketing campaigns and programs.",
        primaryKey: ["campaign_id"],
        columns: [
          column("campaign_id", "string", "Campaign id."),
          column("name", "string", "Campaign name."),
          column("channel", "string", "Acquisition channel."),
          column("objective", "string", "Campaign objective."),
          column("region", "string", "Target region."),
          column("status", "string", "active, paused, or completed."),
          column("start_date", "date", "First day of the campaign."),
          column("end_date", "date", "Last day of the campaign.", { nullable: true }),
          column("owner", "string", "Campaign owner."),
        ],
        rows: campaigns.map((campaign) => ({
          campaign_id: campaign.id,
          name: campaign.name,
          channel: campaign.channel,
          objective: campaign.objective,
          region: campaign.region,
          status: campaignStatus(campaign, timeline.months),
          start_date: isoDate(timeline.monthStart(campaign.startMonth)),
          end_date: campaign.endMonth === null ? null : isoDate(addDays(timeline.monthEnd(campaign.endMonth), -1)),
          owner: campaign.owner,
        })),
      },
      {
        name: "ad_spend_daily",
        description: `Daily spend, impressions, clicks, and attributed signups for each campaign. Trailing ${rawDays} days.`,
        primaryKey: ["date", "campaign_id"],
        indexes: [["date"]],
        columns: [
          column("date", "date", "Spend date."),
          column("campaign_id", "string", "Campaign id."),
          column("campaign", "string", "Campaign name."),
          column("channel", "string", "Acquisition channel."),
          column("impressions", "integer", "Ad impressions."),
          column("clicks", "integer", "Ad clicks, registrations, or booth scans."),
          column("spend_usd", "decimal", "Spend in USD."),
          column("signups", "integer", "Product signups attributed to the campaign."),
        ],
        rows: adRows,
      },
      {
        name: "web_sessions_daily",
        description: `Website sessions by day, channel, and device. Trailing ${rawDays} days.`,
        primaryKey: ["date", "channel", "device"],
        indexes: [["date"]],
        columns: [
          column("date", "date", "Session date."),
          column("channel", "string", "Acquisition channel."),
          column("device", "string", "desktop, mobile, or tablet."),
          column("sessions", "integer", "Sessions."),
          column("users", "integer", "Unique users."),
          column("new_users", "integer", "First-time users."),
          column("bounce_rate", "decimal", "Share of one-page sessions.", { scale: 4 }),
          column("avg_session_seconds", "integer", "Average session length in seconds."),
          column("signups", "integer", "Product signups."),
        ],
        rows: sessionRows,
      },
      {
        name: "mart_channel_performance_monthly",
        description: "Spend, sessions, signups, new customers, and paid CAC by channel and month.",
        primaryKey: ["month", "channel"],
        columns: [
          column("month", "string", "Month label, for example 2026-03."),
          column("month_start", "date", "First day of the month."),
          column("channel", "string", "Acquisition channel."),
          column("spend_usd", "decimal", "Program spend in USD."),
          column("sessions", "integer", "Website sessions."),
          column("signups", "integer", "Product signups."),
          column("new_customers", "integer", "Accounts from the channel that started paying in the month."),
          column("new_mrr_usd", "decimal", "Starting MRR of those new customers."),
          column("cac_usd", "decimal", "Program spend divided by new customers.", { nullable: true }),
        ],
        rows: channelRows,
      },
      {
        name: "mart_funnel_monthly",
        description: "Signup cohort funnel: sessions, signups, activation, and conversion to paid.",
        primaryKey: ["month"],
        columns: [
          column("month", "string", "Signup month label."),
          column("month_start", "date", "First day of the month."),
          column("sessions", "integer", "Website sessions."),
          column("signups", "integer", "Product signups."),
          column("activated", "integer", "Signups that ran a workflow during the trial."),
          column("converted", "integer", "Signups from the cohort that started paying."),
          column("signup_rate", "decimal", "Signups divided by sessions.", { scale: 4 }),
          column("activation_rate", "decimal", "Activated divided by signups.", { scale: 4 }),
          column("conversion_rate", "decimal", "Converted divided by signups.", { scale: 4 }),
        ],
        rows: funnelRows,
      },
      {
        name: "mart_campaign_performance",
        description: "Lifetime results for each campaign.",
        primaryKey: ["campaign_id"],
        columns: [
          column("campaign_id", "string", "Campaign id."),
          column("campaign", "string", "Campaign name."),
          column("channel", "string", "Acquisition channel."),
          column("status", "string", "active, paused, or completed."),
          column("start_date", "date", "First day of the campaign."),
          column("end_date", "date", "Last day of the campaign.", { nullable: true }),
          column("spend_usd", "decimal", "Lifetime spend in USD."),
          column("impressions", "integer", "Lifetime impressions."),
          column("clicks", "integer", "Lifetime clicks."),
          column("ctr", "decimal", "Clicks divided by impressions.", { nullable: true, scale: 4 }),
          column("signups", "integer", "Attributed signups."),
          column("new_customers", "integer", "Attributed signups that started paying."),
          column("cost_per_signup", "decimal", "Spend divided by signups.", { nullable: true }),
          column("cost_per_customer", "decimal", "Spend divided by new customers.", { nullable: true }),
        ],
        rows: campaignRows.sort((a, b) => b.spend_usd - a.spend_usd),
      },
    ],
  };
  return { domain, facts: { spendByMonth } };
}

function campaignStatus(campaign: Campaign, months: number): string {
  if (campaign.endMonth === null || campaign.endMonth >= months - 1) return "active";
  if (campaign.channel === "Events" || campaign.channel === "Partner" || campaign.channel === "Outbound") return "completed";
  return "paused";
}
