import type { RoutePreset, Waypoint } from "./simulator-state";

function point(id: string, latitude: number, longitude: number): Waypoint {
  return { id, latitude, longitude };
}

export const ROUTE_PRESETS: RoutePreset[] = [
  {
    id: "pune-home-school",
    label: "Pune: Home to School",
    waypoints: [
      point("home-1", 18.541651, 73.82917),
      point("home-2", 18.543646, 73.832863),
      point("home-3", 18.54692, 73.838264),
      point("home-4", 18.549511, 73.84346),
      point("school-1", 18.551287, 73.848652),
    ],
  },
  {
    id: "pune-school-activity",
    label: "Pune: School to Activity",
    waypoints: [
      point("school-2", 18.551287, 73.848652),
      point("school-3", 18.552681, 73.852969),
      point("school-4", 18.554803, 73.858041),
      point("activity-1", 18.557811, 73.864402),
      point("activity-2", 18.560073, 73.869237),
    ],
  },
  {
    id: "pune-short-local",
    label: "Short local test",
    waypoints: [
      point("local-1", 18.531491, 73.847458),
      point("local-2", 18.532473, 73.850811),
      point("local-3", 18.533866, 73.854467),
    ],
  },
];

export function getPresetById(id: string) {
  return ROUTE_PRESETS.find((preset) => preset.id === id) ?? ROUTE_PRESETS[0];
}
