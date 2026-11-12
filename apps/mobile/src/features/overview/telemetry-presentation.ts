import {
  TELEMETRY_OFFLINE_AFTER_MS,
  TELEMETRY_STALE_AFTER_MS,
  type ChildTelemetryState,
  type GpsConnectionState,
  type GsmConnectionState,
} from "@stepwhere/types";

import type { AppIconName } from "@/components/ui/app-icon";

export type TelemetryTone =
  | "positive"
  | "warning"
  | "danger"
  | "sleep"
  | "muted";

export type TelemetryStatusSymbol =
  | "check"
  | "cross"
  | "exclamation"
  | "moon";

export type TelemetryPresentation = {
  blinking?: boolean;
  icon?: AppIconName;
  label: string;
  statusSymbol?: TelemetryStatusSymbol;
  tone: TelemetryTone;
};

export function getEffectiveTelemetryState(
  child: Pick<{ lastSeenAt: string | null; telemetryState: ChildTelemetryState }, "lastSeenAt" | "telemetryState">,
  nowMs: number,
): ChildTelemetryState {
  if (child.telemetryState === "offline" || child.telemetryState === "sleep" || child.telemetryState === "connecting") {
    return child.telemetryState;
  }

  if (!child.lastSeenAt) {
    return "connecting";
  }

  const lastSeenAtMs = new Date(child.lastSeenAt).getTime();

  if (!Number.isFinite(lastSeenAtMs)) {
    return "connecting";
  }

  const ageMs = nowMs - lastSeenAtMs;

  if (ageMs > TELEMETRY_OFFLINE_AFTER_MS) {
    return "offline";
  }

  if (ageMs > TELEMETRY_STALE_AFTER_MS) {
    return "connecting";
  }

  return "active";
}

export function getBatteryPresentation(
  batteryPercent: number | null,
  telemetryState: ChildTelemetryState,
): TelemetryPresentation {
  const base = getBatteryBasePresentation(batteryPercent);

  if (telemetryState === "offline") {
    return { ...base, blinking: false, tone: "muted" };
  }

  return base;
}

export function getSignalPresentation(
  input: {
    gpsState: GpsConnectionState;
    gsmState: GsmConnectionState;
    satelliteCount: number | null;
    telemetryState: ChildTelemetryState;
  },
): TelemetryPresentation {
  if (input.gsmState !== "connected") {
    return {
      blinking: false,
      icon: "signal-none",
      label: "No signal",
      tone: input.telemetryState === "offline" ? "muted" : "danger",
    };
  }

  if (input.gpsState !== "connected") {
    return {
      blinking: false,
      icon: "signal-one",
      label: "Low signal",
      tone: "warning",
    };
  }

  return getSignalBasePresentation(input.satelliteCount);
}

export function getStatusPresentation(
  telemetryState: ChildTelemetryState,
): TelemetryPresentation {
  switch (telemetryState) {
    case "offline":
      return {
        label: "Offline",
        statusSymbol: "cross",
        tone: "danger",
      };
    case "sleep":
      return {
        label: "Sleep",
        statusSymbol: "moon",
        tone: "sleep",
      };
    case "connecting":
      return {
        label: "Connecting",
        statusSymbol: "exclamation",
        tone: "warning",
      };
    default:
      return {
        label: "Online",
        statusSymbol: "check",
        tone: "positive",
      };
  }
}

function getBatteryBasePresentation(batteryPercent: number | null): TelemetryPresentation {
  if (batteryPercent === null || batteryPercent === undefined) {
    return {
      blinking: false,
      icon: "battery-unknown",
      label: "No data",
      tone: "muted",
    };
  }

  if (batteryPercent <= 5) {
    return {
      blinking: false,
      icon: "battery-empty",
      label: `${batteryPercent}%`,
      tone: "danger",
    };
  }

  if (batteryPercent <= 19) {
    return {
      blinking: false,
      icon: "battery-low",
      label: `${batteryPercent}%`,
      tone: "danger",
    };
  }

  if (batteryPercent <= 39) {
    return {
      blinking: false,
      icon: "battery-medium",
      label: `${batteryPercent}%`,
      tone: "warning",
    };
  }

  if (batteryPercent <= 79) {
    return {
      blinking: false,
      icon: "battery-medium",
      label: `${batteryPercent}%`,
      tone: "positive",
    };
  }

  return {
    blinking: false,
    icon: "battery-full",
    label: `${batteryPercent}%`,
    tone: "positive",
  };
}

function getSignalBasePresentation(satelliteCount: number | null): TelemetryPresentation {
  if (satelliteCount === null || satelliteCount === undefined) {
    return {
      blinking: false,
      icon: "signal-none",
      label: "No data",
      tone: "muted",
    };
  }

  if (satelliteCount <= 0) {
    return {
      blinking: false,
      icon: "signal-none",
      label: "No signal",
      tone: "danger",
    };
  }

  if (satelliteCount <= 3) {
    return {
      blinking: true,
      icon: "signal-one",
      label: "Bad",
      tone: "danger",
    };
  }

  if (satelliteCount <= 5) {
    return {
      blinking: false,
      icon: "signal-two",
      label: "Good",
      tone: "positive",
    };
  }

  if (satelliteCount <= 7) {
    return {
      blinking: false,
      icon: "signal-three",
      label: "Good",
      tone: "positive",
    };
  }

  return {
    blinking: false,
    icon: "signal-three",
    label: "Excellent",
    tone: "positive",
  };
}
