import type {
  BillingDeviceDto,
  BillingQuoteDto,
  BillingScheduleLineDto,
} from '@stepwhere/types';

import {
  formatBillingDate,
  formatPlanTerm,
  formatRelativeBillingDate,
  formatRupees,
  formatShoeCount,
  formatTerm,
  joinNames,
  possessive,
  toBillingDateKey,
} from './billing-format';
import type { BillingNameLookup } from './billing-state';

// Copy built from a server quote. Nothing about money or dates is computed on
// the device: amounts, credits and dates all come from POST /billing/quotes.

/** Plain text with bold runs, rendered by BillingRichText. */
export type RichSegment = string | { bold: string };

type QuoteContext = {
  devices: BillingDeviceDto[];
  nameForDevice: BillingNameLookup;
  now?: Date;
};

export type ScheduleLineCopy = {
  key: string;
  when: string;
  title: string;
  subtitle: string;
  amount: string;
  highlighted: boolean;
};

function devicesWhoseTrialEndsOn(on: string, deviceIds: string[], context: QuoteContext) {
  const day = toBillingDateKey(on);
  return context.devices.filter(device => (
    deviceIds.includes(device.deviceId)
    && device.coverage === 'trial'
    && toBillingDateKey(device.trialEndsAt) === day
  ));
}

function creditSubtitle(line: BillingScheduleLineDto, quote: BillingQuoteDto, context: QuoteContext) {
  const credits = quote.credits.filter(credit => credit.amountMinor > 0);
  const names = credits.map(credit => context.nameForDevice(credit.deviceId));
  const days = credits.length === 1 ? credits[0]!.days : null;
  const freeDays = days === null ? 'extra free days' : `${days} extra free ${days === 1 ? 'day' : 'days'}`;
  return `${formatRupees(line.baseMinor)} minus ${formatRupees(line.creditMinor)} for ${possessive(joinNames(names))} ${freeDays}`;
}

/** Rows of the "When you'll pay" timeline on Review plan and Add shoes. */
export function describeSchedule(quote: BillingQuoteDto, context: QuoteContext): ScheduleLineCopy[] {
  return quote.schedule.map((line, index) => {
    const when = formatRelativeBillingDate(line.on, context.now);
    const base = {
      key: `${line.kind}:${line.on}:${index}`,
      when,
      amount: formatRupees(line.amountMinor),
      highlighted: when === 'Today',
    };
    const endingTrials = devicesWhoseTrialEndsOn(line.on, line.deviceIds, context);
    const endingNames = joinNames(endingTrials.map(device => context.nameForDevice(device.deviceId)));

    switch (line.kind) {
      case 'verify':
        return {
          ...base,
          title: 'Verify autopay',
          subtitle: line.refunded ? 'Refunded automatically' : 'To check the autopay works',
        };
      case 'first':
        return {
          ...base,
          title: endingNames && !quote.coverageStartsNow
            ? `${possessive(endingNames)} free month ends`
            : 'First charge',
          subtitle: line.creditMinor > 0
            ? creditSubtitle(line, quote, context)
            : `${formatPlanTerm(quote.termMonths)} for ${formatShoeCount(quote.shoeCount)}`,
        };
      case 'add_shoes': {
        const added = joinNames(line.deviceIds.map(context.nameForDevice));
        return {
          ...base,
          title: endingNames ? `${possessive(endingNames)} free month ends` : `${added} ${line.deviceIds.length === 1 ? 'joins' : 'join'} the plan`,
          subtitle: `Covers ${added} until ${formatBillingDate(quote.periodEndsAt, context.now)}, when your plan renews`,
        };
      }
      case 'renewal':
      default:
        return quote.kind === 'add_shoes'
          ? {
            ...base,
            title: `Plan renews for ${formatShoeCount(quote.shoeCount)}`,
            subtitle: `Then every ${formatTerm(quote.termMonths)}`,
          }
          : {
            ...base,
            title: 'Plan renews',
            subtitle: `Then every ${formatTerm(quote.termMonths)} until you cancel`,
          };
    }
  });
}

/** The first charge that actually takes money (the ₹1 check is refunded). */
export function getFirstCharge(quote: BillingQuoteDto) {
  return quote.schedule.find(line => line.kind === 'first' || line.kind === 'add_shoes') ?? null;
}

/** Fine print under Choose a plan's Continue button. */
export function describeFirstChargeFinePrint(quote: BillingQuoteDto, context: QuoteContext): RichSegment[] {
  const first = getFirstCharge(quote);

  if (!first) {
    return [];
  }

  const charge = { bold: `${formatRupees(first.amountMinor)} on ${formatBillingDate(first.on, context.now)}` };

  if (quote.coverageStartsNow) {
    return ['Tracking starts as soon as autopay is set up. First charge ', charge, '.'];
  }

  const ending = devicesWhoseTrialEndsOn(first.on, first.deviceIds, context);
  const segments: RichSegment[] = ['First charge ', charge];

  if (ending.length > 0) {
    segments.push(`, when ${possessive(joinNames(ending.map(device => context.nameForDevice(device.deviceId))))} free month ends.`);
  } else {
    segments.push('.');
  }

  const credited = quote.credits.filter(credit => credit.amountMinor > 0).map(credit => context.nameForDevice(credit.deviceId));

  if (credited.length > 0) {
    segments.push(` ${possessive(joinNames(credited))} extra free days come off it.`);
  }

  return segments;
}

/**
 * A comparable fingerprint of what the user agreed to. When an expired quote
 * is replaced, a different fingerprint means "Your plan details changed".
 */
export function getQuoteFingerprint(quote: BillingQuoteDto) {
  return JSON.stringify([
    quote.deviceIds,
    quote.termMonths,
    quote.renewalAmountMinor,
    quote.schedule.map(line => [line.kind, line.on, line.amountMinor]),
  ]);
}

export function isQuoteExpired(quote: BillingQuoteDto, now = Date.now()) {
  const expiresAt = new Date(quote.expiresAt).getTime();
  return Number.isNaN(expiresAt) || expiresAt <= now;
}
