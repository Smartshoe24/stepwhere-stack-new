import type { BillingPriceDto, BillingTermMonths } from '@stepwhere/types';

// Billing dates are India calendar dates. Server "on" fields are already
// YYYY-MM-DD in IST; timestamps are converted to IST before formatting so a
// late-evening UTC time never shows the wrong day.
const IST_OFFSET_MS = (5 * 60 + 30) * 60_000;
const DAY_MS = 86_400_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MINUS = '−';

/** Indian digit grouping: 1,23,456. */
function groupIndian(whole: number) {
  const digits = String(whole);

  if (digits.length <= 3) {
    return digits;
  }

  const lastThree = digits.slice(-3);
  const rest = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${rest},${lastThree}`;
}

/** ₹ from paise. Whole rupees drop the decimals: ₹1,098, ₹1,056.50. */
export function formatRupees(minor: number) {
  const sign = minor < 0 ? MINUS : '';
  const absolute = Math.abs(Math.round(minor));
  const whole = Math.floor(absolute / 100);
  const paise = absolute % 100;
  const decimals = paise === 0 ? '' : `.${String(paise).padStart(2, '0')}`;
  return `${sign}₹${groupIndian(whole)}${decimals}`;
}

/** Always two decimals, for invoice lines: ₹1,098.00. */
export function formatRupeesExact(minor: number) {
  const sign = minor < 0 ? MINUS : '';
  const absolute = Math.abs(Math.round(minor));
  return `${sign}₹${groupIndian(Math.floor(absolute / 100))}.${String(absolute % 100).padStart(2, '0')}`;
}

/** YYYY-MM-DD of the given instant in India time. */
export function toIstDateKey(date: Date) {
  return new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Accepts a YYYY-MM-DD calendar date or an ISO timestamp. */
export function toBillingDateKey(value: string) {
  if (DATE_KEY_PATTERN.test(value)) {
    return value;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : toIstDateKey(date);
}

function dateKeyToUtcMs(key: string) {
  const match = DATE_KEY_PATTERN.exec(key);
  return match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : Number.NaN;
}

/** Whole calendar days from `from` to `to` (both YYYY-MM-DD or ISO). */
export function daysBetween(from: string, to: string) {
  const fromKey = toBillingDateKey(from);
  const toKey = toBillingDateKey(to);

  if (!fromKey || !toKey) {
    return 0;
  }

  return Math.round((dateKeyToUtcMs(toKey) - dateKeyToUtcMs(fromKey)) / DAY_MS);
}

/** "26 Nov", or "26 May 2027" when the year isn't the current one. */
export function formatBillingDate(value: string, now = new Date()) {
  const key = toBillingDateKey(value);
  const match = key ? DATE_KEY_PATTERN.exec(key) : null;

  if (!match) {
    return '';
  }

  const label = `${Number(match[3])} ${MONTHS[Number(match[2]) - 1]}`;
  return match[1] === toIstDateKey(now).slice(0, 4) ? label : `${label} ${match[1]}`;
}

/** "Today", "Tomorrow", else the billing date. */
export function formatRelativeBillingDate(value: string, now = new Date()) {
  const days = daysBetween(toIstDateKey(now), value);

  if (days === 0) {
    return 'Today';
  }

  if (days === 1) {
    return 'Tomorrow';
  }

  return formatBillingDate(value, now);
}

/** "26 Nov 2026" — invoices always carry the year. */
export function formatBillingDateWithYear(value: string) {
  const key = toBillingDateKey(value);
  const match = key ? DATE_KEY_PATTERN.exec(key) : null;
  return match ? `${Number(match[3])} ${MONTHS[Number(match[2]) - 1]} ${match[1]}` : '';
}

/** Monthly equivalent, rounded to whole rupees: "₹183 a month". */
export function formatPerMonth(totalMinor: number, termMonths: BillingTermMonths) {
  const perMonthRupees = Math.round(totalMinor / termMonths / 100);
  return `${formatRupees(perMonthRupees * 100)} a month`;
}

export function formatTerm(termMonths: BillingTermMonths) {
  return `${termMonths} months`;
}

export function formatPlanTerm(termMonths: BillingTermMonths) {
  return `${termMonths}-month plan`;
}

export function formatShoeCount(count: number) {
  return count === 1 ? '1 shoe' : `${count} shoes`;
}

export function formatDayCount(count: number) {
  return count === 1 ? '1 day' : `${count} days`;
}

/** "Riya", "Riya and Arjun", "Riya, Arjun and Kabir". */
export function joinNames(names: string[]) {
  if (names.length <= 1) {
    return names[0] ?? '';
  }

  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export function possessive(name: string) {
  return `${name}’s`;
}

/**
 * Saving against the shortest term's monthly rate, as a whole percent.
 * Null for the shortest term itself or when there is nothing saved.
 */
export function getTermSavingPercent(prices: BillingPriceDto[], termMonths: BillingTermMonths) {
  const base = [...prices].sort((left, right) => left.termMonths - right.termMonths)[0];
  const price = prices.find(entry => entry.termMonths === termMonths);

  if (!base || !price || base.termMonths === termMonths) {
    return null;
  }

  const baseMonthly = base.perShoeMinor / base.termMonths;
  const monthly = price.perShoeMinor / price.termMonths;
  const percent = Math.round((1 - monthly / baseMonthly) * 100);
  return percent > 0 ? percent : null;
}
