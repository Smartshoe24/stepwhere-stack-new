import { env } from "../../config/env";

export type RoadsCoordinate = {
  latitude: number;
  longitude: number;
};

export type RoadsSnappedPoint = RoadsCoordinate & {
  originalIndex: number | null;
};

type RoadsApiResponse = {
  snappedPoints?: Array<{
    location?: {
      latitude?: number;
      longitude?: number;
    };
    originalIndex?: number;
    placeId?: string;
  }>;
};

const ROADS_BATCH_SIZE = 100;
const ROADS_BATCH_OVERLAP = 2;
const ROADS_REQUEST_TIMEOUT_MS = 2_500;

export class GoogleRoadsRequestError extends Error {
  constructor(message: string, readonly transient: boolean) {
    super(message);
    this.name = "GoogleRoadsRequestError";
  }
}

function buildBatchRanges(pointCount: number) {
  if (pointCount <= ROADS_BATCH_SIZE) {
    return [{ end: pointCount, start: 0 }];
  }

  const ranges: Array<{ start: number; end: number }> = [];
  let start = 0;

  while (start < pointCount) {
    const end = Math.min(pointCount, start + ROADS_BATCH_SIZE);
    ranges.push({ end, start });

    if (end >= pointCount) {
      break;
    }

    start = end - ROADS_BATCH_OVERLAP;
  }

  return ranges;
}

function buildPathParameter(points: RoadsCoordinate[]) {
  return points.map((point) => `${point.latitude},${point.longitude}`).join("|");
}

function sleep(durationMs: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

async function requestBatch(points: RoadsCoordinate[], attempt = 0): Promise<RoadsApiResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ROADS_REQUEST_TIMEOUT_MS);

  try {
    const url = new URL("https://roads.googleapis.com/v1/snapToRoads");
    url.searchParams.set("interpolate", "true");
    url.searchParams.set("key", env.GOOGLE_ROADS_API_KEY ?? "");
    url.searchParams.set("path", buildPathParameter(points));

    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
    });

    if (!response.ok) {
      if (attempt === 0 && (response.status === 429 || response.status >= 500)) {
        await sleep(150 + Math.floor(Math.random() * 250));
        return requestBatch(points, attempt + 1);
      }

      throw new GoogleRoadsRequestError(
        `Roads API request failed with status ${response.status}.`,
        response.status === 429 || response.status >= 500,
      );
    }

    return await response.json() as RoadsApiResponse;
  } catch (error) {
    if (error instanceof GoogleRoadsRequestError) {
      throw error;
    }

    throw new GoogleRoadsRequestError(
      error instanceof Error ? error.message : "Roads API request failed.",
      true,
    );
  } finally {
    clearTimeout(timeout);
  }
}

export class GoogleRoadsClient {
  async snapToRoads(points: RoadsCoordinate[], options?: { enabled?: boolean }): Promise<RoadsSnappedPoint[]> {
    const enabled = options?.enabled ?? env.TRAIL_ROAD_SNAPPING_ENABLED;

    if (points.length < 2 || !enabled || !env.GOOGLE_ROADS_API_KEY) {
      return [];
    }

    const snappedPoints: RoadsSnappedPoint[] = [];
    const ranges = buildBatchRanges(points.length);

    for (const range of ranges) {
      const batch = points.slice(range.start, range.end);
      const response = await requestBatch(batch);
      const mappedBatch = (response.snappedPoints ?? []).map<RoadsSnappedPoint | null>((point) => {
        const latitude = point.location?.latitude;
        const longitude = point.location?.longitude;

        if (latitude == null || longitude == null) {
          return null;
        }

        return {
          latitude,
          longitude,
          originalIndex: point.originalIndex == null ? null : point.originalIndex + range.start,
        };
      }).filter((point): point is RoadsSnappedPoint => point !== null);

      for (const point of mappedBatch) {
        const lastPoint = snappedPoints[snappedPoints.length - 1];

        if (
          lastPoint
          && lastPoint.latitude === point.latitude
          && lastPoint.longitude === point.longitude
          && lastPoint.originalIndex === point.originalIndex
        ) {
          continue;
        }

        snappedPoints.push(point);
      }
    }

    return snappedPoints;
  }
}

export const googleRoadsClient = new GoogleRoadsClient();
