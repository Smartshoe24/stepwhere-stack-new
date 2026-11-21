import { describe, expect, it } from "vitest";
import { addMonths, earliestDueOn, financialYear, gstSplit, invoiceNumber, istDate, istMidnight, quoteAddShoes, quoteNewPlan } from "./billing-pricing";

// 10:00 IST on each date.
const at = (on: string) => new Date(`${on}T04:30:00Z`);

describe("billing dates", () => {
  it("adds calendar months and clamps to shorter months", () => {
    expect(addMonths(new Date("2026-11-26T04:30:00Z"), 6).toISOString()).toBe("2027-05-26T04:30:00.000Z");
    expect(addMonths(new Date("2027-01-31T00:00:00Z"), 1).toISOString()).toBe("2027-02-28T00:00:00.000Z");
    expect(addMonths(new Date("2027-08-31T00:00:00Z"), 6).toISOString()).toBe("2028-02-29T00:00:00.000Z");
  });

  it("uses India time for calendar dates", () => {
    expect(istDate(new Date("2026-11-25T18:29:00Z"))).toBe("2026-11-25");
    expect(istDate(new Date("2026-11-25T18:30:00Z"))).toBe("2026-11-26");
    expect(istMidnight("2026-11-26").toISOString()).toBe("2026-11-25T18:30:00.000Z");
    expect(earliestDueOn(new Date("2026-11-25T19:00:00Z"))).toBe("2026-11-27");
  });

  it("names financial years from April", () => {
    expect(financialYear(at("2026-11-26"))).toBe("26-27");
    expect(financialYear(at("2027-03-31"))).toBe("26-27");
    expect(financialYear(at("2027-04-01"))).toBe("27-28");
    expect(invoiceNumber("26-27", 42)).toBe("SW/26-27/00042");
  });
});

describe("quoteNewPlan", () => {
  it("starts on the first free month's end and credits other shoes' leftover days", () => {
    const quote = quoteNewPlan({
      now: at("2026-11-14"), perShoeMinor: 54_900, termMonths: 6,
      devices: [{ deviceId: "riya", trialEndsAt: at("2026-11-26") }, { deviceId: "arjun", trialEndsAt: at("2026-12-10") }],
    });
    expect(quote.startsAt.toISOString()).toBe(at("2026-11-26").toISOString());
    expect(quote.periodEndsAt.toISOString()).toBe(at("2027-05-26").toISOString());
    expect(quote.coverageStartsNow).toBe(false);
    expect(quote.credits).toEqual([{ deviceId: "arjun", days: 14, amountMinor: 4_200 }]);
    expect(quote.firstCharge).toEqual({ on: "2026-11-26", amountMinor: 105_600 });
    expect(quote.renewal).toEqual({ on: "2027-05-26", amountMinor: 109_800 });
  });

  it("starts now and charges tomorrow when a shoe has no free days left", () => {
    const now = at("2026-11-14");
    const quote = quoteNewPlan({
      now, perShoeMinor: 89_900, termMonths: 12,
      devices: [{ deviceId: "riya", trialEndsAt: at("2026-11-01") }, { deviceId: "arjun", trialEndsAt: null }],
    });
    expect(quote.coverageStartsNow).toBe(true);
    expect(quote.startsAt.toISOString()).toBe(now.toISOString());
    expect(quote.credits).toEqual([]);
    expect(quote.firstCharge).toEqual({ on: "2026-11-15", amountMinor: 179_800 });
    expect(quote.renewal.on).toBe("2027-11-14");
  });

  it("never schedules the first charge for today", () => {
    const quote = quoteNewPlan({ now: at("2026-11-26"), perShoeMinor: 39_700, termMonths: 3, devices: [{ deviceId: "riya", trialEndsAt: new Date("2026-11-26T12:00:00Z") }] });
    expect(quote.firstCharge.on).toBe("2026-11-27");
  });
});

describe("quoteAddShoes", () => {
  const period = { periodStartsAt: at("2026-11-26"), periodEndsAt: at("2027-05-26") };

  it("charges the rest of the period from when the shoe's free month ends", () => {
    const quote = quoteAddShoes({ now: at("2026-12-14"), perShoeMinor: 54_900, currentShoeCount: 2, ...period, devices: [{ deviceId: "kabir", trialEndsAt: at("2027-01-03") }] });
    expect(quote.coverageStartsNow).toBe(false);
    expect(quote.charge).toEqual({ on: "2027-01-03", amountMinor: 43_400 });
    expect(quote.renewal).toEqual({ on: "2027-05-26", amountMinor: 164_700 });
  });

  it("covers a shoe without free days straight away", () => {
    const quote = quoteAddShoes({ now: at("2026-12-14"), perShoeMinor: 54_900, currentShoeCount: 1, ...period, devices: [{ deviceId: "kabir", trialEndsAt: null }] });
    expect(quote.coverageStartsNow).toBe(true);
    expect(quote.charge?.on).toBe("2026-12-15");
    expect(quote.charge?.amountMinor).toBe(49_400); // ₹549 × 163 ÷ 181 days
  });

  it("charges nothing when the free month outlasts the period", () => {
    const quote = quoteAddShoes({ now: at("2027-05-10"), perShoeMinor: 54_900, currentShoeCount: 2, ...period, devices: [{ deviceId: "kabir", trialEndsAt: at("2027-06-01") }] });
    expect(quote.charge).toBeNull();
    expect(quote.renewal.amountMinor).toBe(164_700);
  });
});

describe("gstSplit", () => {
  it("splits an inclusive price into taxable value and GST", () => {
    expect(gstSplit(105_600)).toEqual({ taxableMinor: 89_492, cgstMinor: 8_054, sgstMinor: 8_054, igstMinor: 0 });
    expect(gstSplit(105_600, true)).toEqual({ taxableMinor: 89_492, cgstMinor: 0, sgstMinor: 0, igstMinor: 16_108 });
  });
});
