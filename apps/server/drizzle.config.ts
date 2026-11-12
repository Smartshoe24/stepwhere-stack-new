import "dotenv/config";

import { defineConfig } from "drizzle-kit";
import { z } from "zod";

const configEnv = z.object({
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1).optional(),
});

const env = configEnv.parse(process.env);

export default defineConfig({
  out: "./drizzle",
  schema: "./src/db/schema/index.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: env.DIRECT_URL ?? env.DATABASE_URL,
  },
  verbose: true,
  schemaFilter: ["public"],
});
