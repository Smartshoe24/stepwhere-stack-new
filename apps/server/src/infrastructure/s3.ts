import { S3Client } from "@aws-sdk/client-s3";

import { env } from "../config/env";

/**
 * App user files live in one bucket (`stepwhere-storage` in production), split
 * by key prefix. Avatars sit under `avatars/`; other prefixes (`exports/`,
 * `firmware/`) are reserved for later.
 */
export const storageBucket = env.AWS_S3_STORAGE_BUCKET;

let s3Client: S3Client | null = null;

export function getS3Client() {
  if (!s3Client) {
    // No explicit credentials: the SDK's default provider chain reads
    // AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY when they are set (local dev)
    // and otherwise falls back to the EC2 instance role.
    s3Client = new S3Client({
      region: env.AWS_REGION,
      // Expo uploads the file body directly and does not calculate AWS checksum
      // headers. Only require checksums for operations where S3 mandates them.
      requestChecksumCalculation: "WHEN_REQUIRED",
    });
  }

  return s3Client;
}
