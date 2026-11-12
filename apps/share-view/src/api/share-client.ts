import type {
  ApiErrorDto,
  ApiSuccessDto,
  PublicFamilyInvitePreviewDto,
  PublicShareResponseDto,
} from "@stepwhere/types";

function getBasePath() {
  return "/__share_api";
}

async function parseJson<T>(response: Response): Promise<T | null> {
  const text = await response.text();

  if (!text) {
    return null;
  }

  return JSON.parse(text) as T;
}

export class ShareApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, payload?: ApiErrorDto | null) {
    super(payload?.message ?? `Request failed with status ${status}.`);
    this.name = "ShareApiError";
    this.status = status;
    this.code = payload?.code;
  }
}

export async function fetchPublicShareSnapshot(
  token: string,
): Promise<PublicShareResponseDto> {
  const response = await fetch(
    `${getBasePath()}/v1/share-links/${encodeURIComponent(token)}`,
    {
      headers: {
        accept: "application/json",
        "cache-control": "no-store",
        pragma: "no-cache",
      },
    },
  );

  if (!response.ok) {
    throw new ShareApiError(
      response.status,
      await parseJson<ApiErrorDto>(response),
    );
  }

  const payload =
    await parseJson<ApiSuccessDto<PublicShareResponseDto>>(response);

  if (!payload) {
    throw new Error("Server returned an empty response body.");
  }

  return payload.data;
}

export async function fetchPublicFamilyInvitePreview(
  token: string,
): Promise<PublicFamilyInvitePreviewDto> {
  const query = new URLSearchParams({ token });
  const response = await fetch(
    `${getBasePath()}/v1/public/family-invites/preview?${query.toString()}`,
    {
      headers: {
        accept: "application/json",
        "cache-control": "no-store",
        pragma: "no-cache",
      },
    },
  );

  if (!response.ok) {
    throw new ShareApiError(
      response.status,
      await parseJson<ApiErrorDto>(response),
    );
  }

  const payload =
    await parseJson<ApiSuccessDto<PublicFamilyInvitePreviewDto>>(response);

  if (!payload) {
    throw new Error("Server returned an empty response body.");
  }

  return payload.data;
}

export function getPublicShareSocketUrl(token: string) {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/__share_api/v1/share-links/${encodeURIComponent(token)}/ws`;
}
