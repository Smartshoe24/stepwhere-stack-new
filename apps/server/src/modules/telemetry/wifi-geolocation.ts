import type { WifiTelemetryInput } from "@stepwhere/types";

/** Google requires globally administered, unicast BSSIDs and RSSI -128..-10. */
export function getEligibleWifiAccessPoints(wifi: WifiTelemetryInput | null | undefined) {
  const strongest = new Map<string, NonNullable<WifiTelemetryInput>["accessPoints"][number]>();
  for (const point of wifi?.accessPoints ?? []) {
    const macAddress = point.macAddress.toUpperCase();
    if (!/^(?:[0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(macAddress)) continue;
    const firstOctet = Number.parseInt(macAddress.slice(0, 2), 16);
    if ((firstOctet & 3) !== 0
      || macAddress === "00:00:00:00:00:00"
      || macAddress === "FF:FF:FF:FF:FF:FF"
      || macAddress.startsWith("00:00:5E:")
      || !Number.isInteger(point.signalStrengthDbm)
      || point.signalStrengthDbm < -128 || point.signalStrengthDbm > -10) continue;
    const previous = strongest.get(macAddress);
    if (!previous || point.signalStrengthDbm > previous.signalStrengthDbm) {
      strongest.set(macAddress, { ...point, macAddress });
    }
  }
  return [...strongest.values()].sort((a, b) => b.signalStrengthDbm - a.signalStrengthDbm).slice(0, 16);
}
