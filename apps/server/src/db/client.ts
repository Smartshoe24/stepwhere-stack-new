import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";

import { env } from "../config/env";
import * as schema from "./schema";

const globalForDatabase = globalThis as typeof globalThis & {
  __stepwhereSqlClient?: ReturnType<typeof postgres>;
};

// TLS comes from the URL: production uses `?sslmode=verify-full`, which
// postgres.js passes to Node's tls.connect with certificate and hostname
// verification. The RDS CA is trusted through NODE_EXTRA_CA_CERTS (set in the
// server Dockerfile).
const sql =
  globalForDatabase.__stepwhereSqlClient ??
  postgres(env.DATABASE_URL, {
    max: 60,
    idle_timeout: 20,
    connect_timeout: 10,
  });

if (env.NODE_ENV !== "production") {
  globalForDatabase.__stepwhereSqlClient = sql;
}

export { sql };

export const db = drizzle({
  client: sql,
  schema,
});

export type Database = typeof db;
