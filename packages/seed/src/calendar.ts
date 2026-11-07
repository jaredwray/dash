/** Date helpers. All dates are UTC. */

export const DAY_MS = 86_400_000;

/** The number of months of history in the dataset. */
export const HISTORY_MONTHS = 36;

export function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export function addMonths(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, date.getUTCDate()));
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

export function startOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** The Monday of the week that holds the date. */
export function startOfWeek(date: Date): Date {
  const day = startOfDay(date);
  const offset = (day.getUTCDay() + 6) % 7;
  return addDays(day, -offset);
}

export function daysInMonth(date: Date): number {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
}

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function monthLabel(date: Date): string {
  return date.toISOString().slice(0, 7);
}

export function quarterLabel(date: Date): string {
  return `${date.getUTCFullYear()}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
}

export function quarterStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), Math.floor(date.getUTCMonth() / 3) * 3, 1));
}

/** Whole days from `from` to `to`. */
export function daysBetween(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY_MS);
}

export function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

/**
 * The time window of the dataset. Month 0 is the oldest month. The last
 * month ends the day before `asOf`.
 */
export class Timeline {
  readonly asOf: Date;
  readonly start: Date;
  readonly months: number;

  constructor(asOf: Date, months = HISTORY_MONTHS) {
    this.asOf = startOfMonth(asOf);
    this.months = months;
    this.start = addMonths(this.asOf, -months);
  }

  /** The last day with data. */
  get lastDay(): Date {
    return addDays(this.asOf, -1);
  }

  monthStart(index: number): Date {
    return addMonths(this.start, index);
  }

  monthEnd(index: number): Date {
    return addMonths(this.start, index + 1);
  }

  monthIndex(date: Date): number {
    return (date.getUTCFullYear() - this.start.getUTCFullYear()) * 12 + date.getUTCMonth() - this.start.getUTCMonth();
  }

  contains(date: Date): boolean {
    return date.getTime() >= this.start.getTime() && date.getTime() < this.asOf.getTime();
  }

  /** Each day from `from` up to the last day, both included. */
  *days(from: Date = this.start): Generator<Date> {
    for (let day = startOfDay(from); day.getTime() < this.asOf.getTime(); day = addDays(day, 1)) {
      yield day;
    }
  }

  /** The Monday of each week that starts inside the window. */
  weeks(): Date[] {
    const result: Date[] = [];
    let week = startOfWeek(this.start);
    if (week.getTime() < this.start.getTime()) week = addDays(week, 7);
    for (; week.getTime() < this.asOf.getTime(); week = addDays(week, 7)) {
      result.push(week);
    }
    return result;
  }

  /** The quarters that start inside the window. */
  quarters(): Date[] {
    const result: Date[] = [];
    let quarter = quarterStart(this.start);
    if (quarter.getTime() < this.start.getTime()) quarter = addMonths(quarter, 3);
    for (; quarter.getTime() < this.asOf.getTime(); quarter = addMonths(quarter, 3)) {
      result.push(quarter);
    }
    return result;
  }
}

/** Monthly signup seasonality, January first. August and December dip. */
const MONTH_SEASONALITY = [1.08, 1.02, 1.05, 1.0, 0.99, 0.96, 0.92, 0.82, 1.06, 1.04, 0.98, 0.78];

export function monthSeasonality(date: Date): number {
  return MONTH_SEASONALITY[date.getUTCMonth()]!;
}

/** Product usage by weekday, Sunday first. Monday peaks. */
const WEEKDAY_USAGE = [0.22, 1.12, 1.06, 1.03, 1.0, 0.88, 0.26];

export function weekdayUsage(date: Date): number {
  return WEEKDAY_USAGE[date.getUTCDay()]!;
}

/** A timestamp inside the day, with business hours more likely. */
export function timeInDay(day: Date, float: () => number): Date {
  const hourWeights = [1, 1, 1, 1, 1, 2, 3, 5, 8, 10, 10, 9, 8, 9, 10, 9, 8, 6, 4, 3, 2, 2, 1, 1];
  const total = hourWeights.reduce((sum, weight) => sum + weight, 0);
  let target = float() * total;
  let hour = 0;
  for (; hour < 23; hour += 1) {
    target -= hourWeights[hour]!;
    if (target < 0) break;
  }
  const seconds = Math.floor(float() * 3600);
  return new Date(day.getTime() + hour * 3_600_000 + seconds * 1000);
}
