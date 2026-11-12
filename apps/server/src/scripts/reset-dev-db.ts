import "dotenv/config";

import postgres from "postgres";

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

async function main() {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

  if (!url) {
    throw new Error("DATABASE_URL is required.");
  }

  if (process.env.ALLOW_DB_RESET !== "true") {
    throw new Error("Set ALLOW_DB_RESET=true to reset the development database.");
  }

  const sql = postgres(url, { max: 1 });

  try {
    const [{ currentUser }] = await sql<{ currentUser: string }[]>`
      select current_user as "currentUser"
    `;

    await sql.unsafe("drop schema if exists drizzle cascade");
    await sql.unsafe("drop schema if exists public cascade");
    await sql.unsafe("create schema public");
    await sql.unsafe(`alter schema public owner to ${quoteIdentifier(currentUser)}`);
    await sql.unsafe(`grant all on schema public to ${quoteIdentifier(currentUser)}`);

    const optionalRoleGrants = [
      { role: "postgres", privileges: "all" },
      { role: "anon", privileges: "usage" },
      { role: "authenticated", privileges: "usage" },
      { role: "service_role", privileges: "all" },
    ] as const;

    for (const grant of optionalRoleGrants) {
      const [existingRole] = await sql<{ exists: boolean }[]>`
        select exists(
          select 1
          from pg_roles
          where rolname = ${grant.role}
        ) as "exists"
      `;

      if (existingRole?.exists) {
        await sql.unsafe(
          `grant ${grant.privileges} on schema public to ${quoteIdentifier(grant.role)}`,
        );
      }
    }
  } finally {
    await sql.end();
  }
}

void main();
