export const bearerSecurity = [{ bearerAuth: [] }];
export const deviceSecurity = [{ deviceAuth: [] }];
export const deviceIngestSecurity = [{ deviceIngestKey: [] }];
export const provisioningSecurity = [{ provisioningSecret: [] }];

export const securitySchemes = {
  bearerAuth: {
    type: "http",
    scheme: "bearer",
    bearerFormat: "Bearer",
    description: "Session token from /v1/auth/verify-otp or /v1/auth/session.",
  },
  deviceAuth: {
    type: "apiKey",
    in: "header",
    name: "authorization",
    description: 'Use "Device <token>".',
  },
  deviceIngestKey: {
    type: "apiKey",
    in: "header",
    name: "x-device-ingest-key",
    description: "Shared API key used only for device telemetry ingestion.",
  },
  provisioningSecret: {
    type: "apiKey",
    in: "header",
    name: "x-provisioning-secret",
    description: "Provisioning secret required for device registration.",
  },
} as const;
