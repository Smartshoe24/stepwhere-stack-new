process.env.NODE_ENV ??= "test";
process.env.PORT ??= "3001";
process.env.DATABASE_URL ??=
  "postgresql://postgres:postgres@localhost:5432/postgres";
process.env.BETTER_AUTH_SECRET ??= "test-secret";
process.env.BETTER_AUTH_URL ??= "http://localhost:3001";
process.env.BETTER_AUTH_TRUSTED_ORIGINS ??= "https://panel.stepwhere.in";
process.env.ADMIN_AUTH_ALLOWED_ORIGINS ??= "https://panel.stepwhere.in,http://localhost:4800";
process.env.API_CORS_ALLOWED_ORIGINS ??= "http://127.0.0.1:5174,http://localhost:5174";
process.env.SHARE_LINK_SIGNING_SECRET ??= "test-share-link-signing-secret-at-least-32-bytes";
process.env.AWS_REGION ??= "ap-south-1";
process.env.AWS_ACCESS_KEY_ID ??= "test-access-key-id";
process.env.AWS_SECRET_ACCESS_KEY ??= "test-secret-access-key";
process.env.AWS_S3_STORAGE_BUCKET ??= "stepwhere-test-storage";
process.env.DEVICE_INGEST_API_KEY ??= "test-device-ingest-api-key";
process.env.DEVICE_PROVISIONING_SECRET ??= "test-provisioning-secret";
