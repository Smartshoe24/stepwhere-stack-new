// import "dotenv/config";

import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1).optional(),
  BETTER_AUTH_SECRET: z.string().min(1),
  BETTER_AUTH_URL: z.string().url(),
  BETTER_AUTH_TRUSTED_ORIGINS: z.string().optional(),
  ADMIN_AUTH_ALLOWED_ORIGINS: z.string().optional(),
  API_CORS_ALLOWED_ORIGINS: z.string().optional(),
  QA_AGENT_SERVER_URL: z.string().url().optional(),
  QA_AGENT_DOWNLOAD_URL: z.string().url().optional(),
  /** Shared with GitHub Actions to upload QA firmware builds (POST /v1/qa/ci/firmware-uploads). 32+ random characters. */
  QA_CI_UPLOAD_TOKEN: z.string().min(32).optional(),
  PUBLIC_SHARE_APP_URL: z.string().url().default("http://127.0.0.1:5175"),
  SHARE_LINK_SIGNING_SECRET: z.string().min(32),
  AWS_REGION: z.string().min(1).default("ap-south-1"),
  // Optional: when unset, the AWS SDK's default credential chain is used
  // (the EC2 instance role in production).
  AWS_ACCESS_KEY_ID: z.string().min(1).optional(),
  AWS_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  AWS_S3_STORAGE_BUCKET: z.string().min(3),
  EXPO_ACCESS_TOKEN: z.string().min(1).optional(),
  DEVICE_INGEST_AUTH_DISABLED: z.enum(["true", "false"]).default("false"),
  DEVICE_INGEST_API_KEY: z.string().min(1).optional(),
  DEVICE_PROVISIONING_SECRET: z.string().min(1),
  REDIS_URL: z.string().url().optional(),
  GOOGLE_GEOCODING_API_KEY: z.string().min(1).optional(),
  GOOGLE_PLACES_API_KEY: z.string().min(1).optional(),
  GOOGLE_ROADS_API_KEY: z.string().min(1).optional(),
  GOOGLE_GEOLOCATION_API_KEY: z.string().min(1).optional(),
  CELL_GEOLOCATION_ENABLED: z.enum(["true", "false"]).default("false"),
  GOOGLE_OAUTH_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().min(1).optional(),
  TWILIO_ACCOUNT_SID: z.string().min(1).optional(),
  TWILIO_AUTH_TOKEN: z.string().min(1).optional(),
  TWILIO_MESSAGING_SERVICE_SID: z.string().min(1).optional(),
  DISABLE_TWILLIO_OTP: z.enum(["true", "false"]).default("false"),
  PREVIEW_MODE_ENABLED: z.enum(["true", "false"]).default("false"),
  PLAY_REVIEW_ENABLED: z.enum(["true", "false"]).default("false"),
  PLAY_REVIEW_PHONE_NUMBER: z.string().regex(/^\+[1-9][0-9]{7,14}$/).optional(),
  PLAY_REVIEW_OTP: z.string().regex(/^[0-9]{6}$/).optional(),
  PLAY_REVIEW_EMAIL: z.string().email().optional(),
  PLAY_REVIEW_HARDWARE_IDENTIFIER: z.string().min(1).optional(),
  TRAIL_ROAD_SNAPPING_ENABLED: z.enum(["true", "false"]).default("false"),
  HISTORY_ROAD_SNAPPING_ENABLED: z.enum(["true", "false"]).default("false"),
  ENABLE_API_REFERENCE: z.enum(["true", "false"]).default("false"),
  REALTIME_DEBUG: z.enum(["true", "false"]).default("false"),
  BILLING_PURCHASES_ENABLED: z.enum(["true", "false"]).default("false"),
  BILLING_EARLY_CREDIT_ENABLED: z.enum(["true", "false"]).default("false"),
  BILLING_ENFORCEMENT_ENABLED: z.enum(["true", "false"]).default("false"),
  BILLING_PILOT_ORGANIZATION_IDS: z.string().default(""),
  // Durable family ownership of a physical shoe (claim on bind, 409 for another
  // family). Independent of enforcement; "false" skips claims entirely.
  BILLING_DEVICE_OWNERSHIP_ENABLED: z.enum(["true", "false"]).default("true"),
  BILLING_STORE_ENVIRONMENT: z.enum(["SANDBOX", "PRODUCTION"]).default("SANDBOX"),
  SUPERWALL_API_KEY: z.string().min(1).optional(),
  SUPERWALL_PROJECT_ID: z.string().min(1).optional(),
  SUPERWALL_APPLICATION_IDS: z.string().optional(),
  SUPERWALL_WEBHOOK_SECRET: z.string().min(1).optional(),
  BILLING_OFFER_CODE_KEY: z.string().regex(/^[a-fA-F0-9]{64}$/).optional(),
  INITIAL_ADMIN_EMAIL: z.string().trim().toLowerCase().email().default("admin@stepwhere.in"),
  // One-time code for the first-run admin setup (plan section 11.2). Setup is
  // disabled while unset; an empty value counts as unset.
  ADMIN_SETUP_CODE: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().min(16, "Use at least 16 characters, e.g. `openssl rand -hex 16`.").optional(),
  ),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error(
    "Invalid server environment variables",
    parsedEnv.error.flatten().fieldErrors,
  );
  throw new Error("Invalid server environment variables");
}

if (
  parsedEnv.data.DEVICE_INGEST_AUTH_DISABLED !== "true"
  && !parsedEnv.data.DEVICE_INGEST_API_KEY
) {
  console.error("Invalid server environment variables", {
    DEVICE_INGEST_API_KEY: [
      "Required unless DEVICE_INGEST_AUTH_DISABLED=true",
    ],
  });
  throw new Error("Invalid server environment variables");
}

if (
  Boolean(parsedEnv.data.AWS_ACCESS_KEY_ID)
  !== Boolean(parsedEnv.data.AWS_SECRET_ACCESS_KEY)
) {
  console.error("Invalid server environment variables", {
    AWS_ACCESS_KEY_ID: [
      "Set both AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY, or neither to use the instance role.",
    ],
  });
  throw new Error("Invalid server environment variables");
}

if (parsedEnv.data.DEVICE_INGEST_AUTH_DISABLED === "true") {
  console.warn(
    "[env] DEVICE_INGEST_AUTH_DISABLED is enabled. Device telemetry ingestion is unauthenticated.",
  );
}

if (parsedEnv.data.PLAY_REVIEW_ENABLED === "true") {
  const missingReviewKeys = [
    "PLAY_REVIEW_PHONE_NUMBER",
    "PLAY_REVIEW_OTP",
    "PLAY_REVIEW_EMAIL",
    "PLAY_REVIEW_HARDWARE_IDENTIFIER",
  ].filter((key) => !parsedEnv.data[key as keyof typeof parsedEnv.data]);

  if (missingReviewKeys.length > 0) {
    console.error("Invalid server environment variables", Object.fromEntries(
      missingReviewKeys.map((key) => [key, ["Required when PLAY_REVIEW_ENABLED=true."]]),
    ));
    throw new Error("Invalid server environment variables");
  }
}

if (
  !parsedEnv.data.GOOGLE_PLACES_API_KEY &&
  parsedEnv.data.NODE_ENV !== "test"
) {
  console.warn(
    "[env] GOOGLE_PLACES_API_KEY is not set. School search will be unavailable.",
  );
}

if (
  parsedEnv.data.CELL_GEOLOCATION_ENABLED === "true"
  && !parsedEnv.data.GOOGLE_GEOLOCATION_API_KEY
) {
  console.error("Invalid server environment variables", {
    GOOGLE_GEOLOCATION_API_KEY: [
      "Required when CELL_GEOLOCATION_ENABLED=true",
    ],
  });
  throw new Error("Invalid server environment variables");
}

if (parsedEnv.data.NODE_ENV === "production") {
  const missingProviderKeys = [
    "GOOGLE_OAUTH_CLIENT_ID",
    "TWILIO_ACCOUNT_SID",
    "TWILIO_AUTH_TOKEN",
    "TWILIO_MESSAGING_SERVICE_SID",
  ].filter((key) => !parsedEnv.data[key as keyof typeof parsedEnv.data]);

  if (missingProviderKeys.length > 0) {
    console.error("Invalid server environment variables", Object.fromEntries(
      missingProviderKeys.map((key) => [key, ["Required in production."]]),
    ));
    throw new Error("Invalid server environment variables");
  }
}

if (parsedEnv.data.BILLING_PURCHASES_ENABLED === "true") {
  const missing = ["SUPERWALL_API_KEY", "SUPERWALL_PROJECT_ID", "SUPERWALL_APPLICATION_IDS", "SUPERWALL_WEBHOOK_SECRET"].filter((key) => !parsedEnv.data[key as keyof typeof parsedEnv.data]);
  if (missing.length) throw new Error(`Billing purchases require: ${missing.join(", ")}`);
}
if (parsedEnv.data.BILLING_EARLY_CREDIT_ENABLED === "true" && !parsedEnv.data.BILLING_OFFER_CODE_KEY) {
  throw new Error("Early billing credits require BILLING_OFFER_CODE_KEY.");
}

export const env = {
  ...parsedEnv.data,
  BILLING_PURCHASES_ENABLED: parsedEnv.data.BILLING_PURCHASES_ENABLED === "true",
  BILLING_EARLY_CREDIT_ENABLED: parsedEnv.data.BILLING_EARLY_CREDIT_ENABLED === "true",
  BILLING_ENFORCEMENT_ENABLED: parsedEnv.data.BILLING_ENFORCEMENT_ENABLED === "true",
  BILLING_DEVICE_OWNERSHIP_ENABLED: parsedEnv.data.BILLING_DEVICE_OWNERSHIP_ENABLED === "true",
  BILLING_PILOT_ORGANIZATION_IDS: parsedEnv.data.BILLING_PILOT_ORGANIZATION_IDS.split(",").map((id) => id.trim()).filter(Boolean),
  SUPERWALL_APPLICATION_IDS: parsedEnv.data.SUPERWALL_APPLICATION_IDS?.split(",").map((id) => id.trim()).filter(Boolean) ?? [],
  ENABLE_API_REFERENCE: parsedEnv.data.ENABLE_API_REFERENCE === "true",
  REALTIME_DEBUG: parsedEnv.data.REALTIME_DEBUG === "true",
  DISABLE_TWILLIO_OTP:
    parsedEnv.data.DISABLE_TWILLIO_OTP === "true",
  PREVIEW_MODE_ENABLED:
    parsedEnv.data.PREVIEW_MODE_ENABLED === "true",
  PLAY_REVIEW_ENABLED:
    parsedEnv.data.PLAY_REVIEW_ENABLED === "true",
  DEVICE_INGEST_AUTH_DISABLED:
    parsedEnv.data.DEVICE_INGEST_AUTH_DISABLED === "true",
  TRAIL_ROAD_SNAPPING_ENABLED:
    parsedEnv.data.TRAIL_ROAD_SNAPPING_ENABLED === "true",
  CELL_GEOLOCATION_ENABLED:
    parsedEnv.data.CELL_GEOLOCATION_ENABLED === "true",
  HISTORY_ROAD_SNAPPING_ENABLED:
    parsedEnv.data.HISTORY_ROAD_SNAPPING_ENABLED === "true",
  BETTER_AUTH_TRUSTED_ORIGINS:
    parsedEnv.data.BETTER_AUTH_TRUSTED_ORIGINS?.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean) ?? [],
  ADMIN_AUTH_ALLOWED_ORIGINS:
    parsedEnv.data.ADMIN_AUTH_ALLOWED_ORIGINS?.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean) ?? [],
  API_CORS_ALLOWED_ORIGINS:
    parsedEnv.data.API_CORS_ALLOWED_ORIGINS?.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean) ?? [],
};
