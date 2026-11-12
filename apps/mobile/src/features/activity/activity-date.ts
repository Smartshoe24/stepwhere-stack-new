import { addDays, differenceInCalendarDays, endOfMonth, endOfYear, format, parseISO, startOfMonth, startOfYear, subDays } from "date-fns";

import type { ActivityPeriod } from "@stepwhere/types";

export type ActivityDateRange = {
  endDate: string;
  startDate: string;
};

function toDateKey(date: Date) {
  return format(date, "yyyy-MM-dd");
}

export function getTodayDateKey() {
  return toDateKey(new Date());
}

export function getDefaultActivityRange(period: ActivityPeriod): ActivityDateRange {
  const today = new Date();

  if (period === "day") {
    const dateKey = toDateKey(today);
    return {
      startDate: dateKey,
      endDate: dateKey,
    };
  }

  if (period === "week") {
    return {
      startDate: toDateKey(subDays(today, 6)),
      endDate: toDateKey(today),
    };
  }

  if (period === "month") {
    return {
      startDate: toDateKey(startOfMonth(today)),
      endDate: toDateKey(today),
    };
  }

  return {
    startDate: toDateKey(startOfYear(today)),
    endDate: toDateKey(today),
  };
}

export function getRangeDayCount(range: ActivityDateRange) {
  return differenceInCalendarDays(parseISO(range.endDate), parseISO(range.startDate)) + 1;
}

export function shiftActivityRange(range: ActivityDateRange, direction: "previous" | "next", todayDateKey = getTodayDateKey()) {
  const dayCount = getRangeDayCount(range);
  const offset = direction === "previous" ? -dayCount : dayCount;
  let nextStart = addDays(parseISO(range.startDate), offset);
  let nextEnd = addDays(parseISO(range.endDate), offset);
  const today = parseISO(todayDateKey);

  if (nextEnd > today) {
    nextEnd = today;
    nextStart = subDays(today, dayCount - 1);
  }

  return {
    startDate: toDateKey(nextStart),
    endDate: toDateKey(nextEnd),
  };
}

export function canShiftActivityRangeForward(range: ActivityDateRange, todayDateKey = getTodayDateKey()) {
  return parseISO(range.endDate) < parseISO(todayDateKey);
}

export function getRangeLabel(period: ActivityPeriod, range: ActivityDateRange) {
  const start = parseISO(range.startDate);
  const end = parseISO(range.endDate);

  if (period === "day") {
    return format(start, "EEEE, d MMMM");
  }

  if (period === "month") {
    if (toDateKey(start) === toDateKey(startOfMonth(start)) && toDateKey(end) === toDateKey(endOfMonth(start))) {
      return format(start, "MMMM yyyy");
    }
  }

  if (period === "year") {
    if (toDateKey(start) === toDateKey(startOfYear(start)) && toDateKey(end) === toDateKey(endOfYear(start))) {
      return format(start, "yyyy");
    }
  }

  return `${format(start, "d MMM")} - ${format(end, "d MMM")}`;
}
