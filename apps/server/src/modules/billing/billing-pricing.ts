// Pure money and date maths for family billing. Everything that decides an
// amount or a charge date lives here so quotes and charges can never disagree.
import type { BillingTermMonths } from "@stepwhere/types";

export const DAY_MS = 86_400_000;
const IST_OFFSET_MS = 330 * 60_000;
export const GST_RATE_BPS = 1_800;

/** Calendar months in UTC, clamped to the end of shorter months (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(date: Date, months: number) {
  const result = new Date(date.getTime());
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

/** India has no daylight saving, so IST is always UTC+05:30. */
export function istDate(date: Date) {
  return new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export function istMidnight(on: string) {
  return new Date(Date.parse(`${on}T00:00:00Z`) - IST_OFFSET_MS);
}

export function addDays(on: string, days: number) {
  return new Date(Date.parse(`${on}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export const laterDate = (a: string, b: string) => (a > b ? a : b);

/** Autopay can't debit on the day a charge is raised, so the earliest due date is tomorrow. */
export function earliestDueOn(now: Date) {
  return addDays(istDate(now), 1);
}

export const roundRupees = (minor: number) => Math.round(minor / 100) * 100;

export type QuoteDevice = { deviceId: string; trialEndsAt: Date | null };
export type QuoteCredit = { deviceId: string; days: number; amountMinor: number };

export type NewPlanQuote = {
  startsAt: Date; periodEndsAt: Date; coverageStartsNow: boolean;
  baseMinor: number; credits: QuoteCredit[]; creditMinor: number;
  firstCharge: { on: string; amountMinor: number };
  renewal: { on: string; amountMinor: number };
};

/**
 * The plan starts when the first selected shoe's free month ends (or now, if a
 * shoe has none left). Shoes whose free month runs past that date get the
 * leftover days taken off the first charge, so nobody loses free time.
 */
export function quoteNewPlan(input: { now: Date; perShoeMinor: number; termMonths: BillingTermMonths; devices: QuoteDevice[] }): NewPlanQuote {
  const { now, perShoeMinor, termMonths, devices } = input;
  if (!devices.length) throw new Error("A plan needs at least one shoe.");
  const freeUntil = devices.map((device) => ({ deviceId: device.deviceId, until: device.trialEndsAt && device.trialEndsAt > now ? device.trialEndsAt : now }));
  const startsAt = new Date(Math.min(...freeUntil.map((device) => device.until.getTime())));
  const coverageStartsNow = startsAt.getTime() <= now.getTime();
  const periodEndsAt = addMonths(startsAt, termMonths);
  const periodMs = periodEndsAt.getTime() - startsAt.getTime();
  const credits = freeUntil
    .filter((device) => device.until > startsAt)
    .map((device) => {
      const leftoverMs = Math.min(device.until.getTime(), periodEndsAt.getTime()) - startsAt.getTime();
      return { deviceId: device.deviceId, days: Math.round(leftoverMs / DAY_MS), amountMinor: roundRupees((perShoeMinor * leftoverMs) / periodMs) };
    })
    .filter((credit) => credit.amountMinor > 0);
  const baseMinor = perShoeMinor * devices.length;
  const creditMinor = credits.reduce((sum, credit) => sum + credit.amountMinor, 0);
  return {
    startsAt, periodEndsAt, coverageStartsNow, baseMinor, credits, creditMinor,
    firstCharge: { on: laterDate(istDate(startsAt), earliestDueOn(now)), amountMinor: baseMinor - creditMinor },
    renewal: { on: istDate(periodEndsAt), amountMinor: baseMinor },
  };
}

export type AddShoesQuote = {
  startsAt: Date; coverageStartsNow: boolean;
  /** When each added shoe's paid coverage begins; at or after the period end means it simply joins at renewal. */
  deviceStarts: { deviceId: string; startsAt: Date }[];
  charge: { on: string; amountMinor: number } | null;
  renewal: { on: string; amountMinor: number };
};

/** Added shoes pay only for the part of the current period after their own free month ends. */
export function quoteAddShoes(input: { now: Date; perShoeMinor: number; currentShoeCount: number; periodStartsAt: Date; periodEndsAt: Date; devices: QuoteDevice[] }): AddShoesQuote {
  const { now, perShoeMinor, periodStartsAt, periodEndsAt, devices } = input;
  if (!devices.length) throw new Error("Pick at least one shoe to add.");
  const periodMs = periodEndsAt.getTime() - periodStartsAt.getTime();
  const deviceStarts = devices.map((device) => ({ deviceId: device.deviceId, startsAt: new Date(Math.max(now.getTime(), periodStartsAt.getTime(), device.trialEndsAt?.getTime() ?? 0)) }));
  const exactMinor = deviceStarts.reduce((sum, device) => sum + Math.max(0, perShoeMinor * (periodEndsAt.getTime() - device.startsAt.getTime()) / periodMs), 0);
  const amountMinor = roundRupees(exactMinor);
  const startsAt = new Date(Math.min(...deviceStarts.map((device) => device.startsAt.getTime())));
  return {
    startsAt,
    coverageStartsNow: deviceStarts.some((device) => device.startsAt.getTime() <= now.getTime()),
    deviceStarts,
    charge: amountMinor > 0 ? { on: laterDate(istDate(startsAt), earliestDueOn(now)), amountMinor } : null,
    renewal: { on: istDate(periodEndsAt), amountMinor: perShoeMinor * (input.currentShoeCount + devices.length) },
  };
}

/** Prices include GST; split it back out for the invoice. Intra-state supply by default. */
export function gstSplit(amountMinor: number, interState = false) {
  const taxableMinor = Math.round((amountMinor * 10_000) / (10_000 + GST_RATE_BPS));
  const taxMinor = amountMinor - taxableMinor;
  if (interState) return { taxableMinor, cgstMinor: 0, sgstMinor: 0, igstMinor: taxMinor };
  const cgstMinor = Math.floor(taxMinor / 2);
  return { taxableMinor, cgstMinor, sgstMinor: taxMinor - cgstMinor, igstMinor: 0 };
}

/** Indian financial year (April to March) in IST, e.g. "26-27". */
export function financialYear(date: Date) {
  const [year, month] = istDate(date).split("-").map(Number);
  const start = month >= 4 ? year : year - 1;
  return `${String(start % 100).padStart(2, "0")}-${String((start + 1) % 100).padStart(2, "0")}`;
}

export const invoiceNumber = (fy: string, sequence: number) => `SW/${fy}/${String(sequence).padStart(5, "0")}`;
