import { DAY_MS, addDays, isWeekend, isoDate, monthLabel, quarterLabel, timeInDay } from "../calendar.ts";
import { COMPANY, COUNTRIES, STORYLINE, type Region } from "../company.ts";
import { emailFor, personName } from "../names.ts";
import { column, ratio, type SeedDomain } from "../table.ts";
import { accountMrr, accountPlan } from "./accounts.ts";
import { momentInMonth } from "./accounts.ts";
import type { Account, SupportAgent, World } from "./types.ts";

const CATEGORIES = [
  { value: "How-to", weight: 30 },
  { value: "Bug", weight: 16 },
  { value: "Billing", weight: 12 },
  { value: "Integrations", weight: 14 },
  { value: "Feature request", weight: 9 },
  { value: "Account access", weight: 11 },
  { value: "Performance", weight: 8 },
] as const;
type Category = (typeof CATEGORIES)[number]["value"];

const INTEGRATIONS = ["Salesforce", "Slack", "Microsoft Teams", "Google Sheets", "NetSuite", "Jira", "QuickBooks", "Okta", "HubSpot", "Zendesk"];
const AREAS = ["workflow", "approval chain", "form", "automation", "report", "dashboard export"];

const SUBJECTS: Record<Category, string[]> = {
  "How-to": [
    "How do I bulk-import users from a CSV?",
    "Can we route an {area} to a different team by region?",
    "How do I set up a recurring {area}?",
    "Best way to restrict who can edit a {area}?",
    "How do I copy a {area} to another workspace?",
    "Where can I see who approved a request?",
  ],
  Bug: [
    "{area} stuck in 'Pending' after the last step",
    "Conditional field not showing on the mobile app",
    "Duplicate notifications for each {area} update",
    "Date field shows the wrong time zone in exports",
    "Error 500 when we save a {area} with 40+ steps",
  ],
  Billing: [
    "Invoice shows the wrong seat count",
    "Please update the billing contact on our account",
    "Card payment failed, but the card is valid",
    "Can we switch from monthly to annual billing?",
    "Need a W-9 and the remit-to address for {company}",
    "VAT number missing from our invoice",
  ],
  Integrations: [
    "{integration} sync failing with a 401 error",
    "{integration} connection drops each night",
    "Field mapping to {integration} skips custom fields",
    "Webhook to {integration} times out",
    "How do I reconnect {integration} after a password change?",
  ],
  "Feature request": [
    "Feature request: conditional branches in Forms",
    "Feature request: export approvals history to PDF",
    "Request: SCIM provisioning for groups",
    "Can AI Assist write a {area} from a policy document?",
    "Request: more than 10 parallel approvers",
  ],
  "Account access": [
    "SSO login loop after we changed our identity provider",
    "User locked out after the MFA reset",
    "Please transfer workspace ownership to a new admin",
    "Invited user did not get the email",
    "Need to remove a former employee right away",
  ],
  Performance: [
    "Reports take more than a minute to load",
    "{area} runs are delayed by 20 minutes",
    "App very slow this morning for our whole team",
    "Search results are slow for large workspaces",
  ],
};

const CUSTOMER_LINES: Record<Category, string[]> = {
  "How-to": ["We are rolling Fernway out to two more teams and want to get this right.", "I looked in the help center but could not find the answer."],
  Bug: ["This started yesterday. Nothing changed on our side.", "Steps: open the item, press Submit, and the page shows a spinner that never stops."],
  Billing: ["Our finance team needs this before the end of the month.", "Please confirm what we will be charged on the next invoice."],
  Integrations: ["The error appears in the run log for each sync.", "We use a service account for the connection."],
  "Feature request": ["This would save our team a lot of manual work.", "Is this on the roadmap?"],
  "Account access": ["This is blocking several people on our team.", "We use Okta for SSO."],
  Performance: ["It affects everyone in our workspace.", "The issue is worse during our morning shift change."],
};

const AGENT_LINES: Record<Category, string[]> = {
  "How-to": ["Thanks for the question. Here is a short guide with the steps, and a link to the template.", "You can do this from Settings > Routing. I added screenshots below."],
  Bug: ["Thanks for the details. I reproduced the issue and sent it to our engineering team.", "Our engineers released a fix. Please refresh the page and try again."],
  Billing: ["I updated the account and attached a corrected invoice.", "I confirmed the change. The next invoice will show the new amount."],
  Integrations: ["The token for this connection expired. Please reconnect it from the Integrations page.", "I see the failed calls on our side. Our team is working with the vendor."],
  "Feature request": ["Thanks for the feedback. I logged it with our product team.", "This is on our roadmap. I will update this ticket when it ships."],
  "Account access": ["I reset the session for this user. Please ask them to sign in again.", "Done. Ownership moved to the new admin."],
  Performance: ["We found a slow query in our reporting service and deployed a fix.", "This is related to an incident on our status page. We will post updates there."],
};

const CSAT_COMMENTS = {
  high: ["Fast and helpful, thank you!", "Great support as always.", "Solved in minutes.", "Very clear answer."],
  low: ["Took too long to get a response.", "Problem came back the next day.", "Had to explain the issue three times.", "Still not fixed."],
};

const NPS_COMMENTS = {
  Promoter: ["Fernway saves our ops team hours each week.", "AI Assist is a big time saver.", "Easy to roll out to new teams.", "Great support and fast product updates."],
  Passive: ["Good product, but reporting could be better.", "Works well, a bit expensive for our size.", "Mobile app needs work."],
  Detractor: ["The price increase was hard to justify.", "Too many sync issues with our CRM.", "Hard to train new users.", "Performance problems during peak hours."],
};

const INCIDENTS = [
  { month: 5, title: "Delayed email notifications", severity: "SEV3", minutes: 95, components: ["Notifications"] },
  { month: 12, title: "Integration sync errors for Salesforce connections", severity: "SEV2", minutes: 210, components: ["Integrations"] },
  { month: 19, title: "Slow report loading in EU region", severity: "SEV3", minutes: 140, components: ["Reports", "EU region"] },
  { month: 24, title: "Mobile app sign-in failures", severity: "SEV2", minutes: 75, components: ["Mobile App", "Authentication"] },
  { month: STORYLINE.outageMonth, title: "Workflow execution outage in us-east", severity: "SEV1", minutes: 260, components: ["Workflows", "Automations", "API"] },
  { month: 34, title: "AI Assist responses timing out", severity: "SEV3", minutes: 50, components: ["AI Assist"] },
];

const PRIORITY_FRT: Record<string, number> = { urgent: 9, high: 38, normal: 150, low: 420 };
const SLA_TARGET: Record<string, number> = { urgent: 30, high: 120, normal: 480, low: 1440 };
const RESOLUTION: Record<Category, number> = {
  "How-to": 3,
  Bug: 46,
  Billing: 8,
  Integrations: 20,
  "Feature request": 30,
  "Account access": 2,
  Performance: 10,
};

function fill(template: string, pick: <T>(items: readonly T[]) => T, account: Account): string {
  return template
    .replace("{area}", pick(AREAS))
    .replace("{integration}", pick(INTEGRATIONS))
    .replace("{company}", account.name);
}

export function buildAgents(world: World): SupportAgent[] {
  const { ctx } = world;
  const rng = ctx.rng.fork("agents");
  const plan: { team: string; region: Region; month: number }[] = [];
  const add = (team: string, region: Region, month: number, count: number) => {
    for (let index = 0; index < count; index += 1) plan.push({ team, region, month });
  };
  const scale = Math.max(0.35, ctx.scale);
  add("Tier 1", "North America", 0, Math.round(6 * scale));
  add("Tier 2", "North America", 0, Math.round(3 * scale));
  add("Billing", "North America", 0, 1);
  add("Technical Support", "North America", 0, Math.round(2 * scale));
  add("Enterprise Success", "North America", 4, Math.round(2 * scale));
  add("Tier 1", "North America", 9, Math.round(3 * scale));
  add("Tier 1", "EMEA", STORYLINE.emeaTeam, Math.round(3 * scale));
  add("Tier 2", "EMEA", STORYLINE.emeaTeam + 2, Math.round(1 * scale) || 1);
  add("Technical Support", "North America", 18, Math.round(2 * scale));
  add("Tier 1", "APAC", 22, Math.round(2 * scale));
  add("Billing", "EMEA", 24, 1);
  add("Tier 1", "North America", 27, Math.round(3 * scale));
  add("Enterprise Success", "EMEA", 29, 1);
  add("Tier 2", "North America", 32, Math.round(2 * scale));
  const us = COUNTRIES.find((country) => country.code === "US")!;
  const gb = COUNTRIES.find((country) => country.code === "GB")!;
  const au = COUNTRIES.find((country) => country.code === "AU")!;
  const agents = plan
    .filter((item) => item.month < ctx.timeline.months)
    .map((item, index) => {
      const person = personName(rng, item.region === "EMEA" ? gb : item.region === "APAC" ? au : us);
      return {
        id: `agt_${String(index + 1).padStart(3, "0")}`,
        fullName: person.fullName,
        email: emailFor(person, COMPANY.emailDomain, index),
        team: item.team,
        region: item.region,
        hiredAt: addDays(ctx.timeline.monthStart(item.month), rng.int(0, 20) - (item.month === 0 ? 300 : 0)),
        departedAt: null as Date | null,
      };
    });
  for (const agent of agents.filter((item) => item.team === "Tier 1").slice(0, 3)) {
    if (rng.chance(0.7)) agent.departedAt = addDays(ctx.timeline.monthStart(rng.int(12, Math.max(13, ctx.timeline.months - 3))), rng.int(0, 25));
  }
  return agents;
}

export interface SupportFacts {
  /** Active support agents for each month. */
  agentsByMonth: number[];
}

export function buildSupport(world: World): { domain: SeedDomain; facts: SupportFacts } {
  const { ctx, accounts, agents } = world;
  const rng = ctx.rng.fork("support");
  const { timeline } = ctx;
  const asOf = timeline.asOf;
  const months = timeline.months;
  const pick = <T,>(items: readonly T[]) => rng.pick(items);
  const outage = addDays(timeline.monthStart(STORYLINE.outageMonth), STORYLINE.outageDay - 1);

  const incidents = INCIDENTS.filter((item) => item.month < months).map((item, index) => {
    const day = item.month === STORYLINE.outageMonth ? outage : addDays(timeline.monthStart(item.month), rng.int(3, 24));
    const startedAt = new Date(day.getTime() + rng.int(13, 16) * 3_600_000 + rng.int(0, 59) * 60_000);
    return {
      incident_id: `inc_${String(index + 1).padStart(3, "0")}`,
      title: item.title,
      severity: item.severity,
      started_at: startedAt,
      resolved_at: new Date(startedAt.getTime() + item.minutes * 60_000),
      duration_minutes: item.minutes,
      components: item.components,
      customer_impact: item.severity === "SEV1" ? "Most workflow runs failed or were delayed." : "Some customers saw errors or delays.",
      postmortem_url: `${COMPANY.statusPage}/incidents/inc_${String(index + 1).padStart(3, "0")}`,
      related_tickets: 0,
    };
  });
  const outageIncident = incidents.find((item) => item.severity === "SEV1");

  const activeAgents = (at: Date, teams: string[]) =>
    agents.filter((agent) => agent.hiredAt.getTime() <= at.getTime() && (!agent.departedAt || agent.departedAt.getTime() > at.getTime()) && teams.includes(agent.team));

  type Ticket = Record<string, unknown> & { created_at: Date; solved_at: Date | null; status: string; priority: string; category: Category; first_response_minutes: number | null; csat_score: number | null; sla_breached: boolean; resolution_hours: number | null };
  const tickets: Ticket[] = [];

  const makeTicket = (account: Account, createdAt: Date, forced?: { category: Category; priority: string; incidentId: string }) => {
    const month = timeline.monthIndex(createdAt);
    const category: Category = forced?.category ?? rng.weighted(CATEGORIES.map((item) => ({ value: item.value as Category, weight: item.weight })));
    const priority =
      forced?.priority ??
      rng.weighted([
        { value: "low", weight: account.segment === "Enterprise" ? 12 : 24 },
        { value: "normal", weight: 55 },
        { value: "high", weight: account.segment === "Enterprise" ? 25 : 16 },
        { value: "urgent", weight: account.segment === "Enterprise" ? 8 : 4 },
      ]);
    const channel = rng.weighted([
      { value: "email", weight: 38 },
      { value: "chat", weight: 30 },
      { value: "web_form", weight: 22 },
      { value: "phone", weight: account.segment === "Enterprise" ? 14 : 5 },
      { value: "slack", weight: account.segment === "Enterprise" ? 10 : 0 },
    ]);
    const teams =
      category === "Billing"
        ? ["Billing"]
        : account.segment === "Enterprise" && rng.chance(0.5)
          ? ["Enterprise Success"]
          : ["Bug", "Integrations", "Performance"].includes(category)
            ? ["Technical Support", "Tier 2"]
            : ["Tier 1"];
    const pool = activeAgents(createdAt, teams);
    const fallback = activeAgents(createdAt, ["Tier 1", "Tier 2"]);
    const agent = pool.length ? rng.pick(pool) : fallback.length ? rng.pick(fallback) : agents[0];
    let frt = rng.lognormal(PRIORITY_FRT[priority]!, 0.7);
    if (channel === "chat") frt /= 3;
    if (isWeekend(createdAt)) frt *= 2.5;
    frt *= Math.max(0.75, 1.25 - 0.012 * month);
    if (forced) frt *= 3;
    frt = Math.max(1, Math.round(frt));
    const resolution = Math.max(0.2, rng.lognormal(RESOLUTION[category], forced ? 0.5 : 1.0));
    const firstResponseAt = new Date(createdAt.getTime() + frt * 60_000);
    const solvedCandidate = new Date(createdAt.getTime() + Math.max(frt / 60, resolution) * 3_600_000);
    const responded = firstResponseAt.getTime() < asOf.getTime();
    const solved = solvedCandidate.getTime() < asOf.getTime();
    const status = solved
      ? asOf.getTime() - solvedCandidate.getTime() < 4 * DAY_MS
        ? "solved"
        : "closed"
      : responded
        ? rng.chance(0.6)
          ? "open"
          : "pending"
        : "new";
    const breached = frt > SLA_TARGET[priority]!;
    let csat: { score: number; comment: string | null; rated_at: Date } | null = null;
    if (solved && rng.chance(0.34)) {
      let score = rng.weighted([
        { value: 5, weight: 62 },
        { value: 4, weight: 22 },
        { value: 3, weight: 7 },
        { value: 2, weight: 4 },
        { value: 1, weight: 5 },
      ]);
      if ((resolution > 72 || breached || category === "Bug") && rng.chance(0.35)) score = Math.max(1, score - rng.int(1, 2));
      const ratedAt = new Date(solvedCandidate.getTime() + rng.int(1, 48) * 3_600_000);
      csat = ratedAt.getTime() < asOf.getTime() ? { score, comment: rng.chance(0.4) ? pick(score >= 4 ? CSAT_COMMENTS.high : CSAT_COMMENTS.low) : null, rated_at: ratedAt } : null;
    }
    const requesterUser = account.users.length ? rng.pick(account.users) : null;
    const subject = forced ? "App very slow this morning for our whole team" : fill(rng.pick(SUBJECTS[category]), pick, account);
    const messages: Record<string, unknown>[] = [
      { author_type: "customer", author_name: requesterUser?.fullName ?? "Customer", sent_at: createdAt, body: `${subject}. ${pick(CUSTOMER_LINES[category])}` },
    ];
    if (responded && agent) {
      messages.push({ author_type: "agent", author_name: agent.fullName, sent_at: firstResponseAt, body: pick(AGENT_LINES[category]) });
    }
    if (solved && agent && rng.chance(0.6)) {
      messages.push({ author_type: "customer", author_name: requesterUser?.fullName ?? "Customer", sent_at: new Date((firstResponseAt.getTime() + solvedCandidate.getTime()) / 2), body: "Thanks, that worked." });
    }
    const plan = accountPlan(account, Math.max(0, Math.min(months - 1, month))) ?? "plan_free";
    tickets.push({
      ticket_id: "",
      subject,
      account_id: account.id,
      account_name: account.name,
      requester: requesterUser ? { name: requesterUser.fullName, email: requesterUser.email, title: requesterUser.title } : null,
      requester_email: requesterUser?.email ?? null,
      channel,
      category,
      priority,
      status,
      plan_id: plan,
      segment: account.segment,
      assignee_agent_id: agent?.id ?? null,
      team: agent?.team ?? "Tier 1",
      created_at: createdAt,
      first_response_at: responded ? firstResponseAt : null,
      solved_at: solved ? solvedCandidate : null,
      first_response_minutes: responded ? frt : null,
      resolution_hours: solved ? Math.round(resolution * 10) / 10 : null,
      sla_breached: breached && responded,
      reopened_count: rng.chance(0.06) ? (rng.chance(0.15) ? 2 : 1) : 0,
      csat_score: csat?.score ?? null,
      csat,
      tags: [category.toLowerCase().replace(/\s+/g, "_"), plan.replace("plan_", ""), ...(forced ? ["incident"] : []), ...(category === "Integrations" ? [pick(INTEGRATIONS).toLowerCase().replace(/\s+/g, "_")] : [])],
      sla: { policy: plan === "plan_enterprise" ? "Enterprise" : plan === "plan_business" ? "Business" : "Standard", first_response_target_minutes: SLA_TARGET[priority]!, breached: breached && responded },
      messages,
      incident_id: forced?.incidentId ?? null,
    });
  };

  for (const account of accounts) {
    for (let month = Math.max(0, account.createdMonth); month < months; month += 1) {
      const paying = accountMrr(account, month) > 0;
      let lambda = 0;
      if (paying) {
        lambda = account.segment === "Enterprise" ? 2.4 : account.segment === "Mid-Market" ? 0.8 : 0.2;
        const first = account.subscriptions[0]!;
        if (month - first.startMonth <= 1) lambda *= 1.8;
        if (account.subscriptions.some((sub) => sub.canceledAt && timeline.monthIndex(sub.canceledAt) - month >= 0 && timeline.monthIndex(sub.canceledAt) - month <= 1)) lambda *= 1.5;
      } else if (month === account.createdMonth) {
        lambda = 0.06;
      }
      const count = rng.poisson(lambda);
      for (let index = 0; index < count; index += 1) {
        const createdAt = momentInMonth(rng, timeline.monthStart(month));
        if (createdAt.getTime() < account.createdAt.getTime() || createdAt.getTime() >= asOf.getTime()) continue;
        makeTicket(account, createdAt);
      }
    }
    if (account.subscriptions.some((sub) => sub.involuntary) && rng.chance(0.6)) {
      const sub = account.subscriptions.find((item) => item.involuntary)!;
      const createdAt = new Date(sub.canceledAt!.getTime() - rng.int(2, 9) * DAY_MS);
      if (createdAt.getTime() > account.createdAt.getTime()) makeTicket(account, createdAt, { category: "Billing", priority: "normal", incidentId: "" });
    }
  }
  // The outage brings a spike of performance tickets.
  if (outageIncident && timeline.contains(outage)) {
    const month = timeline.monthIndex(outage);
    const paying = accounts.filter((account) => accountMrr(account, month) > 0);
    const count = Math.round(paying.length * 0.16);
    for (let index = 0; index < count; index += 1) {
      const account = rng.pick(paying);
      const createdAt = new Date((outageIncident.started_at as Date).getTime() + rng.int(5, 300) * 60_000);
      makeTicket(account, createdAt, { category: "Performance", priority: rng.chance(0.4) ? "urgent" : "high", incidentId: outageIncident.incident_id });
    }
    outageIncident.related_tickets = count;
  }
  for (const ticket of tickets) {
    if (ticket.incident_id === "") ticket.incident_id = null;
  }
  tickets.sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
  tickets.forEach((ticket, index) => {
    ticket.ticket_id = `TKT-${100001 + index}`;
  });

  // NPS: one relationship survey in the middle month of each quarter.
  const npsRows: Record<string, unknown>[] = [];
  for (const quarter of timeline.quarters()) {
    const month = timeline.monthIndex(quarter) + 1;
    if (month >= months) continue;
    const paying = accounts.filter((account) => accountMrr(account, month) > 0);
    for (const account of paying) {
      if (!rng.chance(0.14)) continue;
      const responders = Math.min(account.users.length, account.segment === "SMB" ? 1 : rng.int(1, 4));
      for (const user of rng.shuffle(account.users).slice(0, responders)) {
        let promoter = 0.48 + (account.segment === "Enterprise" ? 0.05 : 0) + (month >= STORYLINE.aiAssistLaunch ? Math.min(0.06, (month - STORYLINE.aiAssistLaunch) * 0.005) : 0);
        let detractor = 0.2;
        if (account.segment === "SMB" && month >= STORYLINE.priceIncrease && month <= STORYLINE.priceIncrease + 3) {
          detractor += 0.08;
          promoter -= 0.06;
        }
        const roll = rng.float();
        const category = roll < promoter ? "Promoter" : roll < promoter + (1 - promoter - detractor) ? "Passive" : "Detractor";
        const score = category === "Promoter" ? rng.int(9, 10) : category === "Passive" ? rng.int(7, 8) : rng.int(0, 6);
        npsRows.push({
          response_id: "",
          survey: `${quarterLabel(quarter)} Relationship NPS`,
          quarter: quarterLabel(quarter),
          account_id: account.id,
          user_id: user.id,
          segment: account.segment,
          region: account.region,
          plan_id: accountPlan(account, month),
          score,
          category,
          comment: rng.chance(0.45) ? rng.pick(NPS_COMMENTS[category as keyof typeof NPS_COMMENTS]) : null,
          responded_at: timeInDay(addDays(timeline.monthStart(month), rng.int(0, 20)), () => rng.float()),
        });
      }
    }
  }
  npsRows.sort((a, b) => (a.responded_at as Date).getTime() - (b.responded_at as Date).getTime());
  npsRows.forEach((row, index) => {
    row.response_id = `nps_${String(index + 1).padStart(6, "0")}`;
  });

  // Rollups.
  const median = (values: number[]) => {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
  };
  const weekRows = timeline.weeks().map((week) => {
    const end = addDays(week, 7);
    const created = tickets.filter((ticket) => ticket.created_at.getTime() >= week.getTime() && ticket.created_at.getTime() < end.getTime());
    const solved = tickets.filter((ticket) => ticket.solved_at && ticket.solved_at.getTime() >= week.getTime() && ticket.solved_at.getTime() < end.getTime());
    const backlog = tickets.filter((ticket) => ticket.created_at.getTime() < end.getTime() && (!ticket.solved_at || ticket.solved_at.getTime() >= end.getTime())).length;
    const frt = median(created.flatMap((ticket) => (ticket.first_response_minutes === null ? [] : [ticket.first_response_minutes])));
    return {
      week: isoDate(week),
      week_start: isoDate(week),
      created: created.length,
      solved: solved.length,
      backlog,
      median_first_response_minutes: frt === null ? null : Math.round(frt),
    };
  });
  const recent = tickets.filter((ticket) => ticket.created_at.getTime() >= addDays(asOf, -90).getTime());
  const categoryRows = CATEGORIES.map(({ value }) => {
    const rows = recent.filter((ticket) => ticket.category === value);
    const resolution = median(rows.flatMap((ticket) => (ticket.resolution_hours === null ? [] : [ticket.resolution_hours])));
    const rated = rows.filter((ticket) => ticket.csat_score !== null);
    return {
      category: value,
      tickets: rows.length,
      share: recent.length ? ratio(rows.length / recent.length) : 0,
      median_resolution_hours: resolution === null ? null : Math.round(resolution * 10) / 10,
      csat_avg: rated.length ? ratio(rated.reduce((sum, ticket) => sum + ticket.csat_score!, 0) / rated.length, 2) : null,
    };
  }).sort((a, b) => b.tickets - a.tickets);
  const priorityRows = ["urgent", "high", "normal", "low"].map((priority, index) => {
    const rows = recent.filter((ticket) => ticket.priority === priority && ticket.first_response_minutes !== null);
    const frt = median(rows.map((ticket) => ticket.first_response_minutes!));
    return {
      priority,
      priority_order: index + 1,
      tickets: rows.length,
      median_first_response_minutes: frt === null ? null : Math.round(frt),
      sla_target_minutes: SLA_TARGET[priority]!,
      sla_breach_rate: rows.length ? ratio(rows.filter((ticket) => ticket.sla_breached).length / rows.length) : 0,
    };
  });
  const csatRows = Array.from({ length: months }, (_, month) => {
    const start = timeline.monthStart(month);
    const end = timeline.monthEnd(month);
    const rated = tickets.filter((ticket) => {
      const csat = ticket.csat as { rated_at: Date } | null;
      return csat && csat.rated_at.getTime() >= start.getTime() && csat.rated_at.getTime() < end.getTime();
    });
    return {
      month: monthLabel(start),
      month_start: isoDate(start),
      responses: rated.length,
      csat_avg: rated.length ? ratio(rated.reduce((sum, ticket) => sum + ticket.csat_score!, 0) / rated.length, 2) : null,
      satisfied_rate: rated.length ? ratio(rated.filter((ticket) => ticket.csat_score! >= 4).length / rated.length) : null,
    };
  });
  const npsQuarterRows = timeline.quarters().flatMap((quarter) => {
    const label = quarterLabel(quarter);
    const rows = npsRows.filter((row) => row.quarter === label);
    if (rows.length === 0) return [];
    const promoters = rows.filter((row) => row.category === "Promoter").length;
    const detractors = rows.filter((row) => row.category === "Detractor").length;
    return [{
      quarter: label,
      quarter_start: isoDate(quarter),
      responses: rows.length,
      promoters,
      passives: rows.length - promoters - detractors,
      detractors,
      nps: Math.round(((promoters - detractors) / rows.length) * 100),
    }];
  });

  const agentsByMonth = Array.from({ length: months }, (_, month) => activeAgents(timeline.monthEnd(month), ["Tier 1", "Tier 2", "Billing", "Technical Support", "Enterprise Success"]).length);

  const domain: SeedDomain = {
    key: "support",
    label: "Customer support",
    description: "Support tickets with conversations, CSAT, NPS surveys, agents, and incidents.",
    tables: [
      {
        name: "agents",
        description: "Support agents.",
        primaryKey: ["agent_id"],
        columns: [
          column("agent_id", "string", "Agent id."),
          column("full_name", "string", "Full name."),
          column("email", "string", "Work email."),
          column("team", "string", "Support team."),
          column("region", "string", "Region."),
          column("hired_at", "date", "Start date."),
          column("departed_at", "date", "Last day, when the agent left.", { nullable: true }),
          column("is_active", "boolean", "True when the agent is still on the team."),
        ],
        rows: agents.map((agent) => ({
          agent_id: agent.id,
          full_name: agent.fullName,
          email: agent.email,
          team: agent.team,
          region: agent.region,
          hired_at: isoDate(agent.hiredAt),
          departed_at: agent.departedAt ? isoDate(agent.departedAt) : null,
          is_active: agent.departedAt === null,
        })),
      },
      {
        name: "tickets",
        description: "Support tickets. Nested fields hold the requester, SLA, CSAT, tags, and the conversation.",
        primaryKey: ["ticket_id"],
        indexes: [["created_at"], ["status"], ["account_id"]],
        columns: [
          column("ticket_id", "string", "Ticket number."),
          column("subject", "string", "Ticket subject."),
          column("account_id", "string", "Account id."),
          column("account_name", "string", "Account name."),
          column("requester", "json", "Name, email, and title of the requester.", { nullable: true }),
          column("requester_email", "string", "Requester email.", { nullable: true }),
          column("channel", "string", "email, chat, web_form, phone, or slack."),
          column("category", "string", "Ticket category."),
          column("priority", "string", "low, normal, high, or urgent."),
          column("status", "string", "new, open, pending, solved, or closed."),
          column("plan_id", "string", "Plan of the account when the ticket was created."),
          column("segment", "string", "Account segment."),
          column("assignee_agent_id", "string", "Assigned agent id.", { nullable: true }),
          column("team", "string", "Assigned team."),
          column("created_at", "timestamp", "When the ticket was created."),
          column("first_response_at", "timestamp", "First agent reply.", { nullable: true }),
          column("solved_at", "timestamp", "When the ticket was solved.", { nullable: true }),
          column("first_response_minutes", "integer", "Minutes to the first reply.", { nullable: true }),
          column("resolution_hours", "decimal", "Hours to resolution.", { nullable: true, scale: 1 }),
          column("sla_breached", "boolean", "True when the first reply missed the SLA target."),
          column("reopened_count", "integer", "Times the ticket was reopened."),
          column("csat_score", "integer", "CSAT score from 1 to 5.", { nullable: true }),
          column("csat", "json", "CSAT score, comment, and rating time.", { nullable: true }),
          column("tags", "json", "Ticket tags."),
          column("sla", "json", "SLA policy, target, and result."),
          column("messages", "json", "Conversation messages."),
          column("incident_id", "string", "Related incident id.", { nullable: true }),
        ],
        rows: tickets,
      },
      {
        name: "nps_responses",
        description: "Quarterly relationship NPS survey responses.",
        primaryKey: ["response_id"],
        indexes: [["quarter"]],
        columns: [
          column("response_id", "string", "Response id."),
          column("survey", "string", "Survey name."),
          column("quarter", "string", "Quarter label."),
          column("account_id", "string", "Account id."),
          column("user_id", "string", "User id."),
          column("segment", "string", "Account segment."),
          column("region", "string", "Account region."),
          column("plan_id", "string", "Account plan.", { nullable: true }),
          column("score", "integer", "Score from 0 to 10."),
          column("category", "string", "Promoter, Passive, or Detractor."),
          column("comment", "string", "Free-text comment.", { nullable: true }),
          column("responded_at", "timestamp", "Response time."),
        ],
        rows: npsRows,
      },
      {
        name: "incidents",
        description: "Service incidents from the status page.",
        primaryKey: ["incident_id"],
        columns: [
          column("incident_id", "string", "Incident id."),
          column("title", "string", "Incident title."),
          column("severity", "string", "SEV1, SEV2, or SEV3."),
          column("started_at", "timestamp", "Start time."),
          column("resolved_at", "timestamp", "Resolution time."),
          column("duration_minutes", "integer", "Duration in minutes."),
          column("components", "json", "Affected components."),
          column("customer_impact", "string", "Customer impact summary."),
          column("postmortem_url", "string", "Postmortem link."),
          column("related_tickets", "integer", "Support tickets linked to the incident."),
        ],
        rows: incidents,
      },
      {
        name: "mart_tickets_weekly",
        description: "Tickets created, solved, and open at the end of each week.",
        primaryKey: ["week"],
        columns: [
          column("week", "string", "Week label: the Monday, as YYYY-MM-DD."),
          column("week_start", "date", "Monday of the week."),
          column("created", "integer", "Tickets created."),
          column("solved", "integer", "Tickets solved."),
          column("backlog", "integer", "Unsolved tickets at the end of the week."),
          column("median_first_response_minutes", "integer", "Median minutes to the first reply.", { nullable: true }),
        ],
        rows: weekRows,
      },
      {
        name: "mart_tickets_by_category",
        description: "Tickets by category for the last 90 days.",
        primaryKey: ["category"],
        columns: [
          column("category", "string", "Ticket category."),
          column("tickets", "integer", "Tickets."),
          column("share", "decimal", "Share of tickets.", { scale: 4 }),
          column("median_resolution_hours", "decimal", "Median hours to resolution.", { nullable: true, scale: 1 }),
          column("csat_avg", "decimal", "Average CSAT score.", { nullable: true }),
        ],
        rows: categoryRows,
      },
      {
        name: "mart_first_response_by_priority",
        description: "First response time and SLA results by priority for the last 90 days.",
        primaryKey: ["priority"],
        columns: [
          column("priority", "string", "Ticket priority."),
          column("priority_order", "integer", "Sort order, urgent first."),
          column("tickets", "integer", "Tickets with a reply."),
          column("median_first_response_minutes", "integer", "Median minutes to the first reply.", { nullable: true }),
          column("sla_target_minutes", "integer", "SLA target in minutes."),
          column("sla_breach_rate", "decimal", "Share of tickets that missed the target.", { scale: 4 }),
        ],
        rows: priorityRows,
      },
      {
        name: "mart_csat_monthly",
        description: "CSAT by month of rating.",
        primaryKey: ["month"],
        columns: [
          column("month", "string", "Month label, for example 2026-03."),
          column("month_start", "date", "First day of the month."),
          column("responses", "integer", "CSAT ratings."),
          column("csat_avg", "decimal", "Average score from 1 to 5.", { nullable: true }),
          column("satisfied_rate", "decimal", "Share of 4 and 5 ratings.", { nullable: true, scale: 4 }),
        ],
        rows: csatRows,
      },
      {
        name: "mart_nps_quarterly",
        description: "Net Promoter Score by quarter.",
        primaryKey: ["quarter"],
        columns: [
          column("quarter", "string", "Quarter label."),
          column("quarter_start", "date", "First day of the quarter."),
          column("responses", "integer", "Responses."),
          column("promoters", "integer", "Scores of 9 and 10."),
          column("passives", "integer", "Scores of 7 and 8."),
          column("detractors", "integer", "Scores from 0 to 6."),
          column("nps", "integer", "Promoters minus detractors, as a percent of responses."),
        ],
        rows: npsQuarterRows,
      },
    ],
  };
  return { domain, facts: { agentsByMonth } };
}
