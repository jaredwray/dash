import { addDays, isoDate, monthLabel } from "../calendar.ts";
import { DEPARTMENTS, SEGMENTS, STORYLINE, type Department } from "../company.ts";
import { column, dollars, money, ratio, type SeedDomain } from "../table.ts";
import { accountMrr } from "./accounts.ts";
import type { BillingFacts } from "./billing.ts";
import type { CrmFacts } from "./crm.ts";
import type { MarketingFacts } from "./marketing.ts";
import type { ProductFacts } from "./product.ts";
import type { SupportFacts } from "./support.ts";
import type { World } from "./types.ts";

export interface FinanceInputs {
  billing: BillingFacts;
  crm: CrmFacts;
  marketing: MarketingFacts;
  product: ProductFacts;
  support: SupportFacts;
}

/** Headcount at month 0 and at the last month, before scaling. */
const HEADCOUNT: Record<Department, [number, number]> = {
  Engineering: [36, 60],
  Product: [7, 13],
  Sales: [20, 40],
  Marketing: [9, 16],
  "Customer Success": [10, 22],
  Support: [0, 0],
  "G&A": [8, 14],
  People: [4, 7],
};

/** Monthly loaded cost for each person in USD, in the first year. */
const SALARY: Record<Department, number> = {
  Engineering: 15_800,
  Product: 15_200,
  Sales: 11_400,
  Marketing: 11_600,
  "Customer Success": 9_600,
  Support: 6_900,
  "G&A": 11_200,
  People: 10_300,
};

const MOVEMENTS = ["New", "Expansion", "Reactivation", "Contraction", "Churn"] as const;

interface Line {
  code: string;
  name: string;
  type: "Revenue" | "Cost of revenue" | "Operating expense";
  department: string;
  category: string;
  amount: number;
  memo: string;
}

export function buildFinance(world: World, inputs: FinanceInputs): SeedDomain {
  const { ctx, accounts, subscriptions } = world;
  const rng = ctx.rng.fork("finance");
  const { timeline, scale } = ctx;
  const months = timeline.months;

  // MRR movements from subscription events. These reconcile with MRR.
  const movement = Array.from({ length: months }, () => ({
    New: { mrr: 0, customers: new Set<string>() },
    Expansion: { mrr: 0, customers: new Set<string>() },
    Reactivation: { mrr: 0, customers: new Set<string>() },
    Contraction: { mrr: 0, customers: new Set<string>() },
    Churn: { mrr: 0, customers: new Set<string>() },
  }));
  for (const sub of subscriptions) {
    for (const event of sub.events) {
      const bucket = movement[event.month];
      if (!bucket) continue;
      const delta = event.mrrAfter - event.mrrBefore;
      const type =
        event.type === "new"
          ? "New"
          : event.type === "reactivation"
            ? "Reactivation"
            : event.type === "churn"
              ? "Churn"
              : delta >= 0
                ? "Expansion"
                : "Contraction";
      bucket[type].mrr += delta;
      if (delta !== 0) bucket[type].customers.add(event.accountId);
    }
  }

  const mrr = Array.from({ length: months }, (_, month) => subscriptions.reduce((sum, sub) => sum + (sub.mrrByMonth[month] ?? 0), 0));
  const openingMrr = subscriptions.reduce((sum, sub) => sum + sub.openingMrr, 0);
  const mrrAt = (month: number) => (month < 0 ? openingMrr : mrr[month]!);
  const paying = Array.from({ length: months }, (_, month) => accounts.filter((account) => accountMrr(account, month) > 0).length);

  // Headcount by department.
  const headcount: Record<string, number[]> = {};
  const hires: Record<string, number[]> = {};
  const departures: Record<string, number[]> = {};
  for (const department of DEPARTMENTS) {
    const [start, end] = HEADCOUNT[department];
    const series = Array.from({ length: months }, (_, month) => {
      if (department === "Support") return inputs.support.agentsByMonth[month]! + Math.max(1, Math.round(2 * scale));
      const progress = month / Math.max(1, months - 1);
      // Hiring speeds up after the Series C.
      const curve = month < STORYLINE.seriesC ? progress * 0.7 : 0.7 * (STORYLINE.seriesC / (months - 1)) + (progress - STORYLINE.seriesC / (months - 1)) * 1.12;
      return Math.max(1, Math.round((start + (end - start) * Math.min(1, curve)) * Math.max(0.12, scale)));
    });
    headcount[department] = series;
    hires[department] = series.map((value, month) => {
      const leaving = month === 0 ? 0 : rng.chance(0.25 + value * 0.01) ? 1 : 0;
      departures[department] ??= [];
      departures[department]![month] = leaving;
      return Math.max(0, value - (series[month - 1] ?? value) + leaving);
    });
  }

  // P&L lines for each month.
  const lines: Line[][] = [];
  const revenue: number[] = [];
  const cogs: number[] = [];
  const opex: number[] = [];
  const salesAndMarketing: number[] = [];
  for (let month = 0; month < months; month += 1) {
    const label = monthLabel(timeline.monthStart(month));
    const raise = 1.04 ** Math.floor(month / 12);
    const monthLines: Line[] = [];
    // Revenue is the average of opening and closing MRR, split by segment.
    for (const segment of SEGMENTS) {
      const open = accounts.filter((account) => account.segment === segment).reduce((sum, account) => sum + accountMrr(account, month - 1), 0);
      const close = accounts.filter((account) => account.segment === segment).reduce((sum, account) => sum + accountMrr(account, month), 0);
      monthLines.push({ code: "4000", name: "Subscription revenue", type: "Revenue", department: segment, category: "Subscription revenue", amount: money((open + close) / 200), memo: `${label} subscription revenue, ${segment}` });
    }
    const monthRevenue = monthLines.reduce((sum, line) => sum + line.amount, 0);
    const hosting = money(monthRevenue * 0.085 + 60_000 * scale * rng.between(0.96, 1.04));
    const inference = money(inputs.product.aiActionsByMonth[month]! * 0.011);
    const fees = money(inputs.billing.cardCollectionsByMonth[month]! * 0.029);
    monthLines.push({ code: "5000", name: "Hosting and infrastructure", type: "Cost of revenue", department: "Cost of revenue", category: "Hosting and infrastructure", amount: hosting, memo: `${label} cloud invoice` });
    if (inference > 0) monthLines.push({ code: "5010", name: "Third-party AI APIs", type: "Cost of revenue", department: "Cost of revenue", category: "Third-party AI APIs", amount: inference, memo: `${label} AI inference usage` });
    monthLines.push({ code: "5020", name: "Payment processing fees", type: "Cost of revenue", department: "Cost of revenue", category: "Payment processing fees", amount: fees, memo: `${label} card processing fees` });

    for (const department of DEPARTMENTS) {
      const people = headcount[department]![month]!;
      const payroll = money(people * SALARY[department] * raise * rng.between(0.98, 1.02));
      const type: Line["type"] = department === "Support" ? "Cost of revenue" : "Operating expense";
      const costDepartment = department === "Support" ? "Support" : department;
      monthLines.push({ code: department === "Support" ? "5100" : "6000", name: department === "Support" ? "Support salaries" : "Salaries and wages", type, department: costDepartment, category: "Payroll", amount: payroll, memo: `${label} payroll, ${department}` });
      monthLines.push({ code: department === "Support" ? "5110" : "6010", name: "Benefits and payroll taxes", type, department: costDepartment, category: "Benefits and taxes", amount: money(payroll * 0.22), memo: `${label} benefits, ${department}` });
      monthLines.push({ code: "6300", name: "Software and subscriptions", type: "Operating expense", department, category: "Software", amount: money(people * (department === "Engineering" ? 700 : 420) * rng.between(0.95, 1.05)), memo: `${label} SaaS tools, ${department}` });
      monthLines.push({ code: "6500", name: "Rent and facilities", type: "Operating expense", department, category: "Facilities", amount: money(people * 760), memo: `${label} rent allocation, ${department}` });
      if (["Sales", "Customer Success", "Marketing"].includes(department)) {
        const eventMonth = (month % 12) === 10 ? 1.8 : 1;
        monthLines.push({ code: "6400", name: "Travel and entertainment", type: "Operating expense", department, category: "Travel", amount: money(people * 900 * eventMonth * rng.between(0.8, 1.2)), memo: `${label} travel, ${department}` });
      }
      if (["Engineering", "Marketing", "G&A"].includes(department) && rng.chance(0.75)) {
        monthLines.push({ code: "6600", name: "Contractors and consultants", type: "Operating expense", department, category: "Contractors", amount: money(people * rng.between(300, 900)), memo: `${label} contractors, ${department}` });
      }
    }
    monthLines.push({ code: "6100", name: "Sales commissions", type: "Operating expense", department: "Sales", category: "Commissions", amount: money(inputs.crm.bookingsByMonth[month]! * 0.09), memo: `${label} commissions on bookings` });
    monthLines.push({ code: "6200", name: "Marketing programs", type: "Operating expense", department: "Marketing", category: "Marketing programs", amount: money(inputs.marketing.spendByMonth[month]! + 25_000 * scale), memo: `${label} paid media, events, and content` });
    monthLines.push({ code: "6700", name: "Legal and accounting", type: "Operating expense", department: "G&A", category: "Professional fees", amount: money(32_000 * scale * rng.between(0.7, 1.4) * (month === STORYLINE.seriesC ? 3 : 1)), memo: `${label} legal and audit fees` });

    lines.push(monthLines);
    revenue.push(money(monthLines.filter((line) => line.type === "Revenue").reduce((sum, line) => sum + line.amount, 0)));
    cogs.push(money(monthLines.filter((line) => line.type === "Cost of revenue").reduce((sum, line) => sum + line.amount, 0)));
    opex.push(money(monthLines.filter((line) => line.type === "Operating expense").reduce((sum, line) => sum + line.amount, 0)));
    salesAndMarketing.push(money(monthLines.filter((line) => line.department === "Sales" || line.department === "Marketing").reduce((sum, line) => sum + line.amount, 0)));
  }

  // GL entries and the opex rollup come from the same lines.
  const glRows: Record<string, unknown>[] = [];
  const opexRows: Record<string, unknown>[] = [];
  lines.forEach((monthLines, month) => {
    const start = timeline.monthStart(month);
    const posted = addDays(timeline.monthEnd(month), 5);
    const period = monthLabel(start);
    monthLines.forEach((line, index) => {
      const entryId = `je_${period.replace("-", "")}_${String(index + 1).padStart(3, "0")}`;
      glRows.push({
        entry_id: entryId,
        period,
        posted_date: isoDate(posted),
        account_code: line.code,
        account_name: line.name,
        account_type: line.type,
        department: line.department,
        debit_usd: line.type === "Revenue" ? 0 : line.amount,
        credit_usd: line.type === "Revenue" ? line.amount : 0,
        memo: line.memo,
      });
    });
    const grouped = new Map<string, number>();
    for (const line of monthLines) {
      if (line.type === "Revenue") continue;
      const key = `${line.department}|${line.category}`;
      grouped.set(key, money((grouped.get(key) ?? 0) + line.amount));
    }
    for (const [key, amount] of grouped) {
      const [department, category] = key.split("|");
      opexRows.push({ month: period, month_start: isoDate(start), department, category, amount_usd: amount });
    }
  });

  // KPIs.
  let cash = 41_000_000 * scale;
  const kpiRows = Array.from({ length: months }, (_, month) => {
    const start = timeline.monthStart(month);
    const bucket = movement[month]!;
    const netNew = mrr[month]! - mrrAt(month - 1);
    const newCustomers = bucket.New.customers.size;
    const churned = bucket.Churn.customers.size;
    const costs = cogs[month]! + opex[month]!;
    const collections = inputs.billing.netCollectionsByMonth[month]!;
    if (month === STORYLINE.seriesC) cash += 55_000_000 * scale;
    cash += collections - costs;
    const burn = Math.max(0, costs - collections);
    // Net revenue retention against the accounts that paid 12 months ago.
    let nrr: number | null = null;
    let grr: number | null = null;
    if (month >= 12) {
      let then = 0;
      let now = 0;
      let kept = 0;
      for (const account of accounts) {
        const before = accountMrr(account, month - 12);
        if (before <= 0) continue;
        const after = accountMrr(account, month);
        then += before;
        now += after;
        kept += Math.min(before, after);
      }
      nrr = then ? ratio(now / then) : null;
      grr = then ? ratio(kept / then) : null;
    }
    const window = (series: number[], size: number) => series.slice(Math.max(0, month - size + 1), month + 1).reduce((sum, value) => sum + value, 0);
    const churnRates = Array.from({ length: Math.min(3, month + 1) }, (_, back) => {
      const index = month - back;
      const base = paying[index - 1] ?? 0;
      return base ? movement[index]!.Churn.customers.size / base : 0;
    });
    const logoChurn = churnRates.reduce((sum, value) => sum + value, 0) / churnRates.length;
    const arpa = paying[month] ? mrr[month]! / 100 / paying[month]! : 0;
    const grossMargin = revenue[month] ? (revenue[month]! - cogs[month]!) / revenue[month]! : 0;
    const ltv = logoChurn > 0 ? (arpa * grossMargin) / logoChurn : null;
    const cac = newCustomers ? salesAndMarketing[month]! / newCustomers : null;
    const netNewArr3 = ((mrr[month]! - mrrAt(month - 3)) * 12) / 100;
    const burn3 = window(cogs, 3) + window(opex, 3) - window(inputs.billing.netCollectionsByMonth, 3);
    const priorSalesMarketing = salesAndMarketing.slice(Math.max(0, month - 3), month).reduce((sum, value) => sum + value, 0);
    return {
      month: monthLabel(start),
      month_start: isoDate(start),
      mrr_usd: dollars(mrr[month]!),
      arr_usd: dollars(mrr[month]! * 12),
      new_mrr_usd: dollars(bucket.New.mrr),
      expansion_mrr_usd: dollars(bucket.Expansion.mrr),
      reactivation_mrr_usd: dollars(bucket.Reactivation.mrr),
      contraction_mrr_usd: dollars(bucket.Contraction.mrr),
      churned_mrr_usd: dollars(bucket.Churn.mrr),
      net_new_mrr_usd: dollars(netNew),
      paying_customers: paying[month]!,
      new_customers: newCustomers,
      churned_customers: churned,
      logo_churn_rate: ratio(logoChurn),
      nrr,
      grr,
      arpa_usd: money(arpa),
      revenue_usd: revenue[month]!,
      cogs_usd: cogs[month]!,
      gross_margin: ratio(grossMargin),
      opex_usd: opex[month]!,
      operating_income_usd: money(revenue[month]! - cogs[month]! - opex[month]!),
      net_burn_usd: money(burn),
      burn_multiple: month >= 2 && netNewArr3 > 0 && burn3 > 0 ? ratio(burn3 / netNewArr3, 2) : null,
      cac_usd: cac === null ? null : money(cac),
      ltv_usd: ltv === null ? null : money(ltv),
      ltv_to_cac: ltv !== null && cac ? ratio(ltv / cac, 2) : null,
      magic_number: month >= 3 && priorSalesMarketing > 0 ? ratio(netNewArr3 / priorSalesMarketing, 2) : null,
      cash_balance_usd: money(cash),
      headcount: DEPARTMENTS.reduce((sum, department) => sum + headcount[department]![month]!, 0),
    };
  });

  const movementRows = Array.from({ length: months }, (_, month) =>
    MOVEMENTS.map((type) => ({
      month: monthLabel(timeline.monthStart(month)),
      month_start: isoDate(timeline.monthStart(month)),
      movement: type,
      mrr_usd: dollars(movement[month]![type].mrr),
      customers: movement[month]![type].customers.size,
    })),
  ).flat();

  const segmentRows = Array.from({ length: months }, (_, month) =>
    SEGMENTS.map((segment) => {
      const members = accounts.filter((account) => account.segment === segment && accountMrr(account, month) > 0);
      return {
        month: monthLabel(timeline.monthStart(month)),
        month_start: isoDate(timeline.monthStart(month)),
        segment,
        arr_usd: dollars(members.reduce((sum, account) => sum + accountMrr(account, month), 0) * 12),
        customers: members.length,
      };
    }),
  ).flat();

  const headcountRows = Array.from({ length: months }, (_, month) =>
    DEPARTMENTS.map((department) => ({
      month: monthLabel(timeline.monthStart(month)),
      month_start: isoDate(timeline.monthStart(month)),
      department,
      headcount: headcount[department]![month]!,
      hires: hires[department]![month]!,
      departures: departures[department]![month] ?? 0,
    })),
  ).flat();

  return {
    key: "finance",
    label: "Finance warehouse",
    description: "General ledger, opex, headcount, MRR movements, and SaaS KPIs.",
    tables: [
      {
        name: "gl_entries",
        description: "Monthly journal lines for revenue, cost of revenue, and operating expense.",
        primaryKey: ["entry_id"],
        indexes: [["period"]],
        columns: [
          column("entry_id", "string", "Journal line id."),
          column("period", "string", "Accounting period, for example 2026-03."),
          column("posted_date", "date", "Posting date."),
          column("account_code", "string", "GL account code."),
          column("account_name", "string", "GL account name."),
          column("account_type", "string", "Revenue, Cost of revenue, or Operating expense."),
          column("department", "string", "Department, or segment for revenue lines."),
          column("debit_usd", "decimal", "Debit amount."),
          column("credit_usd", "decimal", "Credit amount."),
          column("memo", "string", "Line memo."),
        ],
        rows: glRows,
      },
      {
        name: "opex_monthly",
        description: "Cost of revenue and operating expense by department and category. A rollup of gl_entries.",
        primaryKey: ["month", "department", "category"],
        columns: [
          column("month", "string", "Month label, for example 2026-03."),
          column("month_start", "date", "First day of the month."),
          column("department", "string", "Department."),
          column("category", "string", "Expense category."),
          column("amount_usd", "decimal", "Amount in USD."),
        ],
        rows: opexRows,
      },
      {
        name: "headcount_monthly",
        description: "Headcount, hires, and departures by department at the end of each month.",
        primaryKey: ["month", "department"],
        columns: [
          column("month", "string", "Month label, for example 2026-03."),
          column("month_start", "date", "First day of the month."),
          column("department", "string", "Department."),
          column("headcount", "integer", "People at the end of the month."),
          column("hires", "integer", "People hired in the month."),
          column("departures", "integer", "People who left in the month."),
        ],
        rows: headcountRows,
      },
      {
        name: "kpi_monthly",
        description: "SaaS metrics by month. MRR reconciles with the billing subscriptions.",
        primaryKey: ["month"],
        columns: [
          column("month", "string", "Month label, for example 2026-03."),
          column("month_start", "date", "First day of the month."),
          column("mrr_usd", "decimal", "MRR at the end of the month."),
          column("arr_usd", "decimal", "MRR times 12."),
          column("new_mrr_usd", "decimal", "MRR from new customers."),
          column("expansion_mrr_usd", "decimal", "MRR from expansion, upgrades, and price changes."),
          column("reactivation_mrr_usd", "decimal", "MRR from returning customers."),
          column("contraction_mrr_usd", "decimal", "MRR lost to contraction and downgrades. Negative."),
          column("churned_mrr_usd", "decimal", "MRR lost to churn. Negative."),
          column("net_new_mrr_usd", "decimal", "Change in MRR from the month before."),
          column("paying_customers", "integer", "Paying accounts at the end of the month."),
          column("new_customers", "integer", "Accounts that started paying."),
          column("churned_customers", "integer", "Accounts that stopped paying."),
          column("logo_churn_rate", "decimal", "Average monthly logo churn for the last 3 months.", { scale: 4 }),
          column("nrr", "decimal", "Net revenue retention against 12 months before.", { nullable: true, scale: 4 }),
          column("grr", "decimal", "Gross revenue retention against 12 months before.", { nullable: true, scale: 4 }),
          column("arpa_usd", "decimal", "Average MRR for each paying account."),
          column("revenue_usd", "decimal", "Recognized revenue."),
          column("cogs_usd", "decimal", "Cost of revenue."),
          column("gross_margin", "decimal", "Revenue minus cost of revenue, divided by revenue.", { scale: 4 }),
          column("opex_usd", "decimal", "Operating expense."),
          column("operating_income_usd", "decimal", "Revenue minus all costs."),
          column("net_burn_usd", "decimal", "Costs minus net collections, when positive."),
          column("burn_multiple", "decimal", "Net burn divided by net new ARR, for the last 3 months.", { nullable: true }),
          column("cac_usd", "decimal", "Sales and marketing cost divided by new customers.", { nullable: true }),
          column("ltv_usd", "decimal", "ARPA times gross margin divided by logo churn.", { nullable: true }),
          column("ltv_to_cac", "decimal", "LTV divided by CAC.", { nullable: true }),
          column("magic_number", "decimal", "Net new ARR for 3 months divided by sales and marketing cost before it.", { nullable: true }),
          column("cash_balance_usd", "decimal", "Cash at the end of the month."),
          column("headcount", "integer", "People at the end of the month."),
        ],
        rows: kpiRows,
      },
      {
        name: "mrr_movements_monthly",
        description: "MRR change by movement type and month. Each month adds up to net new MRR.",
        primaryKey: ["month", "movement"],
        columns: [
          column("month", "string", "Month label, for example 2026-03."),
          column("month_start", "date", "First day of the month."),
          column("movement", "string", "New, Expansion, Reactivation, Contraction, or Churn."),
          column("mrr_usd", "decimal", "MRR change in USD."),
          column("customers", "integer", "Accounts with this movement."),
        ],
        rows: movementRows,
      },
      {
        name: "arr_by_segment_monthly",
        description: "ARR and paying customers by segment at the end of each month.",
        primaryKey: ["month", "segment"],
        columns: [
          column("month", "string", "Month label, for example 2026-03."),
          column("month_start", "date", "First day of the month."),
          column("segment", "string", "Segment."),
          column("arr_usd", "decimal", "ARR in USD."),
          column("customers", "integer", "Paying accounts."),
        ],
        rows: segmentRows,
      },
    ],
  };
}
