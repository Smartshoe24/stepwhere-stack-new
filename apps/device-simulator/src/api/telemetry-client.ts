import type {
  ApiErrorDto,
  ApiSuccessDto,
  ChildSummaryDto,
  LocationTelemetryInput,
} from "@stepwhere/types";

export class SimulatorApiError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "SimulatorApiError";
    this.status = status;
  }
}

export async function sendTelemetry(input: {
  apiUrl: string;
  ingestKey: string;
  payload: LocationTelemetryInput;
}): Promise<ChildSummaryDto> {
  if (!input.apiUrl.trim()) {
    throw new SimulatorApiError("API URL is required.");
  }

  if (!input.ingestKey.trim()) {
    throw new SimulatorApiError("Device ingest API key is required.");
  }

  let response: Response;
  const normalizedApiUrl = input.apiUrl.trim().replace(/\/+$/, "");
  const defaultApiUrl =
    import.meta.env.VITE_API_URL ?? "http://api.stepwhere.local";
  const deviceIngestProxyUrl =
    import.meta.env.VITE_DEVICE_INGEST_PROXY_URL ??
    "http://ingest.stepwhere.in";
  let requestUrl: string;

  if (normalizedApiUrl === deviceIngestProxyUrl.replace(/\/+$/, "")) {
    requestUrl = "/__device_simulator_ingest/location";
  } else if (normalizedApiUrl === defaultApiUrl.replace(/\/+$/, "")) {
    requestUrl = "/__device_simulator_api/v1/telemetry/location";
  } else {
    requestUrl = `${normalizedApiUrl}/v1/telemetry/location`;
  }

  try {
    response = await fetch(requestUrl, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-device-ingest-key": input.ingestKey.trim(),
      },
      body: JSON.stringify(input.payload),
    });
  } catch (error) {
    throw new SimulatorApiError(
      error instanceof Error
        ? error.message
        : "Failed to reach the telemetry server.",
      null,
    );
  }

  let payload: ApiSuccessDto<ChildSummaryDto> | ApiErrorDto | null = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message =
      payload && "message" in payload
        ? payload.message
        : `Telemetry request failed with status ${response.status}.`;

    throw new SimulatorApiError(message, response.status);
  }

  if (!payload || !("data" in payload)) {
    throw new SimulatorApiError(
      "Telemetry server returned invalid JSON.",
      response.status,
    );
  }

  return payload.data;
}
