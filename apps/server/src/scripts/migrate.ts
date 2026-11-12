/**
 * Applies the Drizzle SQL migrations in `apps/server/drizzle` and exits.
 *
 * Runs inside the production image (`node dist/scripts/migrate.js`, wrapped in
 * `infisical run` like the image's CMD), so it uses drizzle-orm's postgres-js
 * migrator instead of drizzle-kit. It records applied migrations in the same
 * `drizzle.__drizzle_migrations` table as `drizzle-kit migrate`, so the two are
 * interchangeable on any database.
 *
 * Only DATABASE_URL (or the optional DIRECT_URL override) is needed; the rest
 * of the server environment is not validated here.
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

// Same location relative to src/scripts (tsx) and dist/scripts (compiled).
const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));

// Arbitrary constant shared by every migration run, so two deploys can't
// apply migrations at the same time.
const MIGRATION_LOCK_KEY = 0x5374_6570_6d67; // "Stepmg"

async function main() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;

  if (!url) {
    throw new Error("DATABASE_URL (or DIRECT_URL) is required to run migrations.");
  }

  if (!existsSync(`${migrationsFolder}/meta/_journal.json`)) {
    throw new Error(`Drizzle migrations not found in ${migrationsFolder}.`);
  }

  // One connection, so the session-level advisory lock and the migrations
  // share it.
  const client = postgres(url, {
    max: 1,
    connect_timeout: 30,
    onnotice: () => {},
  });

  try {
    console.info("[migrate] waiting for migration lock");
    await client`select pg_advisory_lock(${MIGRATION_LOCK_KEY})`;

    try {
      console.info(`[migrate] applying migrations from ${migrationsFolder}`);
      const startedAt = Date.now();
      await migrate(drizzle({ client }), { migrationsFolder });
      console.info(`[migrate] done in ${Date.now() - startedAt} ms`);
    } finally {
      await client`select pg_advisory_unlock(${MIGRATION_LOCK_KEY})`;
    }
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => {
  console.error("[migrate] failed", error instanceof Error ? error.message : error);
  process.exit(1);
});
